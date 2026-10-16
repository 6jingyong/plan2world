<script lang="ts">
  import { t } from '$lib/i18n';
  import { onDestroy } from 'svelte';
  import { hasOpenModal } from '$lib/utils/modalDialog';
  import { isEditingField } from '$lib/utils/shortcuts';
  /**
   * ElevationView — integrated face-on view + editor for a single wall.
   * Fills the canvas area (replaces the plan canvas while active — sidebars stay).
   * Shows the wall as a rectangle (length × height) with its doors and windows,
   * a heavier floor line and a light 0.5 m grid. Openings can be selected and
   * dragged: horizontally to move them along the wall, and windows vertically
   * to change their sill height.
   *
   * Selection is the app's global selection: clicking a door/window sets
   * selectedElementId (so the PropertiesPanel shows its properties); clicking
   * empty wall selects the wall itself. A slim header bar cycles through walls.
   * Escape (or the TopBar Plan/Elevation toggle) returns to the plan view.
   */
  import { selectSingleElement, activeFloor, elevationWallId, selectedElementId, selectedRoomId, updateDoor, updateWindow, beginUndoGroup, endUndoGroup } from '$lib/stores/project';
  import { projectSettings, formatLength } from '$lib/stores/settings';
  import type { Door, Window as Win } from '$lib/models/types';
  import { pathOpening, wallPathProfile } from '$lib/utils/wallProfiles';
  import { getWallStartHeight, getWallEndHeight } from '$lib/models/types';

  const DEFAULT_WALL_HEIGHT = 240; // cm — fallback when a wall has no height
  const DEFAULT_DOOR_HEIGHT = 210; // cm
  const DEFAULT_SILL = 90;         // cm
  const GRID_STEP = 50;            // cm (0.5 m)

  let units = $derived($projectSettings.units);

  let wall = $derived.by(() => {
    const id = $elevationWallId;
    const f = $activeFloor;
    if (!id || !f) return null;
    return f.walls.find((w) => w.id === id) ?? null;
  });

  let wallIndex = $derived.by(() => {
    const f = $activeFloor;
    if (!wall || !f) return -1;
    return f.walls.findIndex((w) => w.id === wall!.id);
  });
  let wallCount = $derived($activeFloor?.walls.length ?? 0);

  let doors = $derived.by(() => {
    const f = $activeFloor;
    if (!wall || !f) return [] as Door[];
    return f.doors.filter((d) => d.wallId === wall!.id);
  });

  let windows = $derived.by(() => {
    const f = $activeFloor;
    if (!wall || !f) return [] as Win[];
    return f.windows.filter((w) => w.wallId === wall!.id);
  });

  // Use the same physical path metric as plan correction and 3D apertures.
  let path = $derived.by(() => {
    const liveWall = $activeFloor?.walls.find(wall => wall.id === $elevationWallId);
    return liveWall ? wallPathProfile(liveWall) : null;
  });
  let wallLen = $derived(path?.length ?? 0);

  let startH = $derived(wall ? getWallStartHeight(wall) : DEFAULT_WALL_HEIGHT);
  let endH = $derived(wall ? getWallEndHeight(wall) : DEFAULT_WALL_HEIGHT);
  let maxH = $derived(Math.max(startH, endH, 1));

  /** Global selection, narrowed to an opening on this wall (drives highlight + dims) */
  let selectedOpeningId = $derived.by(() => {
    const id = $selectedElementId;
    if (!id) return null;
    return doors.some((d) => d.id === id) || windows.some((w) => w.id === id) ? id : null;
  });

  let hoverOpeningId = $state<string | null>(null);
  let dragging = $state(false);

  function selectElement(id: string | null) {
    selectSingleElement(id);
    selectedRoomId.set(null);
  }

  /** Show a different wall (cycling or fallback) and select it */
  function showWall(id: string) {
    hoverOpeningId = null;
    elevationWallId.set(id);
    selectElement(id);
  }

  function cycleWall(dir: 1 | -1) {
    const f = $activeFloor;
    if (!f || f.walls.length === 0) return;
    const i = f.walls.findIndex((w) => w.id === $elevationWallId);
    const next = f.walls[(((i < 0 ? 0 : i) + dir) % f.walls.length + f.walls.length) % f.walls.length];
    showWall(next.id);
  }

  // Track the shown wall's index so we can advance gracefully if it is deleted
  let lastWallIndex = 0;
  $effect(() => {
    if (wallIndex >= 0) lastWallIndex = wallIndex;
  });

  // If the shown wall disappears (deleted / undone): advance to the nearest
  // remaining wall, or drop back to the plan view when none are left.
  $effect(() => {
    const id = $elevationWallId;
    const f = $activeFloor;
    if (!id || !f) return;
    if (!f.walls.some((w) => w.id === id)) {
      if (f.walls.length > 0) {
        showWall(f.walls[Math.max(0, Math.min(lastWallIndex, f.walls.length - 1))].id);
      } else {
        elevationWallId.set(null);
      }
    }
  });

  function backToPlan() {
    elevationWallId.set(null);
  }

  // Escape returns to the plan view. Registered in the capture phase so the
  // plan canvas's own window-level Escape handling doesn't also fire.
  $effect(() => {
    if (!$elevationWallId) return;
    const onKey = (e: KeyboardEvent) => {
      if (hasOpenModal()) return;
      // Close the elevation group before the plan's bubbling history handler.
      // Text fields retain their own native Undo/Redo behavior.
      if (!isEditingField(e.target) && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
        endDrag();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        backToPlan();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ── Canvas + geometry ─────────────────────────────────────────────
  let canvas = $state<HTMLCanvasElement | null>(null);
  let cw = $state(0);
  let ch = $state(0);

  const PAD_L = 72, PAD_R = 64, PAD_T = 36, PAD_B = 64;

  /** Screen-space layout: cm → px mapping for the wall face */
  let geom = $derived.by(() => {
    if (!wall || wallLen <= 0 || cw < PAD_L + PAD_R + 40 || ch < PAD_T + PAD_B + 40) return null;
    const availW = cw - PAD_L - PAD_R;
    const availH = ch - PAD_T - PAD_B;
    const scale = Math.min(availW / wallLen, availH / maxH);
    const ox = PAD_L + (availW - wallLen * scale) / 2;
    const floorY = PAD_T + (availH - maxH * scale) / 2 + maxH * scale;
    return { scale, ox, floorY };
  });

  interface OpeningRect {
    id: string;
    kind: 'door' | 'window';
    /** left edge along wall, cm */ x: number;
    /** bottom above floor, cm */ y: number;
    w: number;
    h: number;
  }

  function openingRects(): OpeningRect[] {
    if (!wall || !path) return [];
    const rects: OpeningRect[] = [];
    for (const [kind, items] of [['door', doors], ['window', windows]] as const) {
      for (const item of items) {
        const bottom = kind === 'door' ? 0 : (item as Win).sillHeight ?? DEFAULT_SILL;
        const rect = pathOpening(path, path.distanceAt(item.position), item.width, bottom, item.height ?? DEFAULT_DOOR_HEIGHT);
        if (rect) rects.push({ id: item.id, kind, x: rect.left, y: rect.bottom, w: rect.right - rect.left, h: rect.top - rect.bottom });
      }
    }
    return rects;
  }

  /** Topmost opening under a point given in wall cm coordinates (x along wall, y up from floor) */
  function hitOpening(x: number, y: number): OpeningRect | null {
    const rects = openingRects();
    // Windows are drawn after doors, so test them first (topmost wins)
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  /** Clamp physical clearance while retaining the plan editor's parameter limits. */
  function clampPosition(distance: number, width: number): number {
    if (!path || path.length <= 0) return 0.5;
    let lo = Math.max(path.distanceAt(0.1), width / 2);
    let hi = Math.min(path.distanceAt(0.9), path.length - width / 2);
    if (lo > hi) lo = hi = path.length / 2;
    return path.positionAt(Math.max(lo, Math.min(hi, distance)));
  }

  // ── Drag state ────────────────────────────────────────────────────
  let drag: {
    id: string;
    kind: 'door' | 'window';
    startPx: number;
    startPy: number;
    startPos: number;   // position t at drag start
    startSill: number;  // window sill at drag start (cm)
    width: number;      // opening width (cm)
    winH: number;       // window height (cm)
    grouped: boolean;   // beginUndoGroup() called
  } | null = null;

  function toWallCoords(e: PointerEvent): { x: number; y: number } | null {
    if (!geom) return null;
    return { x: (e.offsetX - geom.ox) / geom.scale, y: (geom.floorY - e.offsetY) / geom.scale };
  }

  function onPointerDown(e: PointerEvent) {
    if (!wall || !path || !geom) return;
    e.preventDefault();
    const p = toWallCoords(e);
    if (!p) return;
    const hit = hitOpening(p.x, p.y);
    if (hit) {
      // Global selection: the PropertiesPanel now shows this opening
      selectElement(hit.id);
      const door = hit.kind === 'door' ? doors.find((d) => d.id === hit.id) : undefined;
      const win = hit.kind === 'window' ? windows.find((w) => w.id === hit.id) : undefined;
      drag = {
        id: hit.id,
        kind: hit.kind,
        startPx: e.offsetX,
        startPy: e.offsetY,
        startPos: (door?.position ?? win?.position) ?? 0.5,
        startSill: win?.sillHeight ?? DEFAULT_SILL,
        width: hit.w,
        winH: win?.height ?? 0,
        grouped: false,
      };
      dragging = true;
      canvas?.setPointerCapture(e.pointerId);
    } else {
      // Empty wall area — selection falls back to the wall itself
      selectElement(wall.id);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!wall || !path || !geom) return;
    if (drag) {
      const dxCm = (e.offsetX - drag.startPx) / geom.scale;
      const dyCm = (drag.startPy - e.offsetY) / geom.scale; // up is positive
      if (!drag.grouped) {
        // Ignore sub-2px jitter so a plain click never creates an undo entry
        if (Math.hypot(e.offsetX - drag.startPx, e.offsetY - drag.startPy) < 2) return;
        beginUndoGroup();
        drag.grouped = true;
      }
      const newPos = clampPosition(path.distanceAt(drag.startPos) + dxCm, drag.width);
      if (drag.kind === 'door') {
        updateDoor(drag.id, { position: newPos });
      } else {
        const center = path.distanceAt(newPos);
        const currentWallH = Math.min(path.sample(center - drag.width / 2).height, path.sample(center + drag.width / 2).height);
        const maxSill = Math.max(0, currentWallH - drag.winH);
        // Preserve the exact fractional clearance after snapping the requested height.
        const newSill = Math.max(0, Math.min(maxSill, Math.round(drag.startSill + dyCm)));
        updateWindow(drag.id, { position: newPos, sillHeight: newSill });
      }
      return;
    }
    const p = toWallCoords(e);
    hoverOpeningId = p ? (hitOpening(p.x, p.y)?.id ?? null) : null;
  }

  function endDrag(e?: PointerEvent) {
    if (drag) {
      if (drag.grouped) {
        endUndoGroup(drag.kind === 'door' ? 'Moved door (elevation)' : 'Moved window (elevation)');
      }
      drag = null;
      dragging = false;
      try { if (e) canvas?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
  }

  // Closing elevation can remove the canvas before pointerup is delivered.
  onDestroy(() => endDrag());

  let cursor = $derived(dragging ? 'grabbing' : hoverOpeningId ? 'move' : 'default');

  // ── Drawing ───────────────────────────────────────────────────────

  function drawDimH(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, label: string) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4);
    ctx.moveTo(x2, y - 4); ctx.lineTo(x2, y + 4);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const cx = (x1 + x2) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - tw / 2 - 3, y - 8, tw + 6, 16);
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, y);
  }

  function drawDimV(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, label: string) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y1); ctx.lineTo(x, y2);
    ctx.moveTo(x - 4, y1); ctx.lineTo(x + 4, y1);
    ctx.moveTo(x - 4, y2); ctx.lineTo(x + 4, y2);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    const cy = (y1 + y2) / 2;
    ctx.save();
    ctx.translate(x, cy);
    ctx.rotate(-Math.PI / 2);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-tw / 2 - 3, -8, tw + 6, 16);
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  $effect(() => {
    // Reactive dependencies: geometry, openings, selection, hover, units
    const c = canvas;
    const g = geom;
    const sel = selectedOpeningId;
    const hov = hoverOpeningId;
    const u = units;
    const rects = openingRects();
    if (!c) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    c.width = Math.max(1, Math.round(cw * dpr));
    c.height = Math.max(1, Math.round(ch * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const profile = path;
    if (!wall || !g || !profile) return;

    const { scale, ox, floorY } = g;
    const xAt = (cm: number) => ox + cm * scale;
    const yAt = (cmUp: number) => floorY - cmUp * scale;
    const wallRight = xAt(wallLen);
    const yStart = yAt(startH);
    const yEnd = yAt(endH);

    // Unfold the shared span heights along physical path distance.
    ctx.fillStyle = '#f8fafc';
    const traceWallFace = () => {
      ctx.beginPath();
      ctx.moveTo(ox, floorY);
      ctx.lineTo(wallRight, floorY);
      for (const span of [...profile.spans].reverse()) {
        ctx.lineTo(xAt(span.to), yAt(span.endHeight));
      }
      ctx.lineTo(ox, yStart);
      ctx.closePath();
    };
    traceWallFace();
    ctx.fill();

    // 0.5 m grid (light), clipped to the wall face polygon
    ctx.save();
    traceWallFace();
    ctx.clip();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = GRID_STEP; x < wallLen; x += GRID_STEP) {
      ctx.moveTo(xAt(x), floorY);
      ctx.lineTo(xAt(x), yAt(profile.sample(x).height));
    }
    for (let y = GRID_STEP; y < maxH; y += GRID_STEP) {
      ctx.moveTo(ox, yAt(y));
      ctx.lineTo(wallRight, yAt(y));
    }
    ctx.stroke();
    ctx.restore();

    // Openings (doors first, then windows on top — same order as hit testing)
    for (const r of rects) {
      const px = xAt(r.x);
      const py = yAt(r.y + r.h);
      const pw = r.w * scale;
      const ph = r.h * scale;
      if (r.kind === 'door') {
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pw, ph);
        // Door handle hint
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(px + pw - 8, py + ph / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#dbeafe';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pw, ph);
        // Window mullions (cross)
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + pw / 2, py); ctx.lineTo(px + pw / 2, py + ph);
        ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2);
        ctx.stroke();
      }
      if (r.id === hov && r.id !== sel) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
      }
    }

    // Wall outline + heavier floor line
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    traceWallFace();
    ctx.stroke();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(ox - 24, floorY);
    ctx.lineTo(wallRight + 24, floorY);
    ctx.stroke();

    // Overall wall dimensions
    drawDimH(ctx, ox, wallRight, floorY + 28, formatLength(wallLen, u));
    if (startH === endH) {
      drawDimV(ctx, ox - 28, yStart, floorY, formatLength(startH, u));
    } else {
      drawDimV(ctx, ox - 28, yStart, floorY, formatLength(startH, u));
      drawDimV(ctx, wallRight + 28, yEnd, floorY, formatLength(endH, u));
    }

    // Selected opening: highlight + width / height / sill dimensions
    const selRect = sel ? rects.find((r) => r.id === sel) : undefined;
    if (selRect) {
      const px = xAt(selRect.x);
      const py = yAt(selRect.y + selRect.h);
      const pw = selRect.w * scale;
      const ph = selRect.h * scale;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(px - 3, py - 3, pw + 6, ph + 6);
      ctx.setLineDash([]);
      // Width above the opening
      drawDimH(ctx, px, px + pw, py - 14, formatLength(selRect.w, u));
      // Height to the right of the opening
      drawDimV(ctx, px + pw + 14, py, py + ph, formatLength(selRect.h, u));
      // Sill height for windows (from floor up to the sill)
      if (selRect.kind === 'window' && selRect.y > 0) {
        drawDimV(ctx, px + pw + 38, py + ph, floorY, formatLength(selRect.y, u));
      }
    }
  });
</script>

{#if wall}
  <!-- Integrated view: fills the canvas area over the plan canvas; right padding
       leaves room for the fixed PropertiesPanel (w-64) that stays visible on md+ -->
  <div class="absolute inset-0 z-30 bg-white flex flex-col md:pr-64">
    <!-- Slim header: wall index, cycling, dimensions -->
    <div class="flex items-center gap-2 px-3 h-10 border-b border-gray-200 bg-slate-50 shrink-0">
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:pointer-events-none text-lg leading-none"
        onclick={() => cycleWall(-1)}
        disabled={wallCount < 2}
        title={$t('elevationView.previous')}
        aria-label={$t('elevationView.previous')}
      >‹</button>
      <span class="text-sm font-semibold text-slate-700 tabular-nums">{$t('elevationView.wall', { index: wallIndex + 1, count: wallCount })}</span>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:pointer-events-none text-lg leading-none"
        onclick={() => cycleWall(1)}
        disabled={wallCount < 2}
        title={$t('elevationView.next')}
        aria-label={$t('elevationView.next')}
      >›</button>
      <span class="text-xs text-gray-400 ml-1">{formatLength(wallLen, units)} × {startH === endH ? formatLength(startH, units) : `${formatLength(startH, units)} → ${formatLength(endH, units)}`}</span>
      <div class="flex-1"></div>
      <span class="text-[11px] text-gray-400 max-lg:hidden">{$t('elevationView.help')}</span>
    </div>

    <!-- Elevation canvas -->
    <div class="flex-1 min-h-0 relative" bind:clientWidth={cw} bind:clientHeight={ch}>
      <canvas
        aria-label={$t('elevationView.canvas')}
        bind:this={canvas}
        class="absolute inset-0 w-full h-full touch-none select-none"
        style="cursor: {cursor}"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      ></canvas>
    </div>
  </div>
{/if}
