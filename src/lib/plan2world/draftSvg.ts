import { parsePlan2WorldDraft, type DraftDoor, type DraftWindow, type DraftPoint, type DraftWall } from './draft';
import { sourceBackgroundForRegistration, type SourceFloorPlanImage } from './sourceBackground';
import { planPointToSourcePixel } from './reconstructionTrace';
import { wallPathProfile } from '$lib/utils/wallPath';
import { floorBoundaryPolygon } from '$lib/utils/floorBoundary';

export interface DraftSvgOptions {
  floorId?: string;
  /** Optional original raster. Overlay requires accepted anchors, never bounds fitting. */
  source?: SourceFloorPlanImage;
  labels?: boolean;
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char]!));
const number = (n: number) => String(Math.round(n * 1000) / 1000);
const pair = (p: DraftPoint) => `${number(p.x)} ${number(p.y)}`;

/** Read-only 2D evidence rendering. No Project conversion, room inference or geometry repair. */
export function renderPlan2WorldDraftSvg(input: unknown, options: DraftSvgOptions = {}): string {
  const draft = parsePlan2WorldDraft(input);
  const floorId = options.floorId ?? draft.sourceRegistration?.floorId ?? draft.floors[0].id;
  const floor = draft.floors.find(item => item.id === floorId);
  if (!floor) throw new Error(`Unknown floor: ${floorId}`);
  const wallsById = new Map(floor.walls.map(wall => [wall.id,wall]));
  const source = options.source;
  if (source && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source.dataUrl)) {
    throw new Error('SVG overlay requires an embedded PNG, JPEG or WebP raster.');
  }
  const background = source && draft.sourceRegistration?.floorId === floor.id
    ? sourceBackgroundForRegistration(draft, source) : undefined;
  if (source && !background) throw new Error('Source overlay requires accepted sourceRegistration anchors for this floor; bounds fitting is not a source-alignment check.');
  const point = (p: DraftPoint): DraftPoint => source && background ? planPointToSourcePixel(p, source, background) : { ...p };
  const wallPath = (wall: DraftWall) => `M ${pair(point(wall.start))} ${wall.curvePoint ? `Q ${pair(point(wall.curvePoint))} ` : 'L '}${pair(point(wall.end))}`;
  const corners = (item: NonNullable<typeof floor.furniture>[number]) => {
    if (!item.width || !item.depth) throw new Error(`Furniture ${item.id} needs explicit width/depth for footprint review.`);
    const angle = (item.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => point({
      x: item.position.x + cos*x*item.width!/2 - sin*y*item.depth!/2,
      y: item.position.y + sin*x*item.width!/2 + cos*y*item.depth!/2,
    }));
  };
  const furniture = (floor.furniture ?? []).map(item => ({ item, points: corners(item) }));
  const floorAreas = (floor.floorAreas ?? []).map(area => ({area,points:floorBoundaryPolygon(area.boundary,floor.walls).map(point)}));
  const bounds = floor.walls.flatMap(wall => [point(wall.start),point(wall.end),...(wall.curvePoint ? [point(wall.curvePoint)] : [])]);
  bounds.push(...furniture.flatMap(entry => entry.points));
  bounds.push(...floorAreas.flatMap(entry => entry.points));
  const minX = Math.min(...bounds.map(p => p.x)), minY = Math.min(...bounds.map(p => p.y));
  const span = Math.max(Math.max(...bounds.map(p => p.x))-minX, Math.max(...bounds.map(p => p.y))-minY, 1);
  const margin = span * .03;
  const box = source ? [0,0,source.width,source.height] : [minX-margin,minY-margin,Math.max(...bounds.map(p=>p.x))-minX+2*margin,Math.max(...bounds.map(p=>p.y))-minY+2*margin];
  const width = source?.width ?? 1200, height = source?.height ?? Math.max(1,Math.round(width*box[3]/box[2]));
  const font = Math.max(box[2]/width,box[3]/height)*11;
  const labels: string[] = [];
  function label(id: string, p: DraftPoint, text = id) {
    if (options.labels === false) return;
    labels.push(`<text data-element-id="${escape(id)}" x="${number(p.x)}" y="${number(p.y-font*.5)}">${escape(text)}</text>`);
  }
  function group(name: string, children: string[], style: string) {
    return `<g id="${name}" inkscape:groupmode="layer" inkscape:label="${name}" ${style}>\n${children.join('\n')}\n</g>`;
  }
  const walls = floor.walls.map(wall => {
    const path = wallPathProfile(wall);
    label(wall.id,point(path.sample(path.length/2).point));
    return `<path data-element-id="${escape(wall.id)}" d="${wallPath(wall)}"/>`;
  });
  const furnitureShapes = furniture.map(({item,points}) => {
    label(item.id,point(item.position),`${item.id} ${item.sourceCategory ?? item.catalogId}`);
    return `<polygon data-element-id="${escape(item.id)}" points="${points.map(pair).join(' ')}"><title>${escape(item.sourceCategory ?? item.catalogId)}</title></polygon>`;
  });
  function openings(items: (DraftDoor | DraftWindow)[] | undefined) {
    return (items ?? []).map(item => {
      const wall = wallsById.get(item.wallId)!;
      const path = wallPathProfile(wall), center = path.distanceAt(item.position);
      const left = center-item.width/2, right = center+item.width/2;
      if (left < -.01 || right > path.length+.01) throw new Error(`Opening ${item.id} extends beyond host wall ${wall.id}; SVG does not repair its width.`);
      const distances = [left,...path.spans.map(span=>span.to).filter(d=>d>left&&d<right),right];
      const points = distances.map(d=>point(path.sample(d).point));
      label(item.id,point(path.sample(center).point));
      return `<path data-element-id="${escape(item.id)}" data-wall-id="${escape(item.wallId)}" d="${points.map((p,i)=>`${i?'L':'M'} ${pair(p)}`).join(' ')}"><title>${escape(item.id)}: ${number(item.width)} cm</title></path>`;
    });
  }
  const doors = openings(floor.doors), windows = openings(floor.windows);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${height}" viewBox="${box.map(number).join(' ')}" role="img">
<title>${escape(draft.name)} — ${escape(floor.name)}</title>
<desc>JSON review: black wall centrelines, purple furniture footprints, orange doors, blue windows, cyan explicit ground boundaries. No inferred rooms, wall thickness, styles or geometry repairs. ${source ? 'Original raster overlay; anchors accepted, source accuracy still needs visual review.' : `Plan coordinates in cm. Scale: ${escape(draft.scale.mode)}.`}</desc>
<rect x="${number(box[0])}" y="${number(box[1])}" width="${number(box[2])}" height="${number(box[3])}" fill="white"/>
${source ? group('source',[`<image width="${source.width}" height="${source.height}" href="${escape(source.dataUrl)}" opacity="0.65"/>`],'') : ''}
${group('floor-areas',floorAreas.map(({area,points})=>`<polygon data-element-id="${escape(area.id)}" points="${points.map(pair).join(' ')}"><title>${escape(area.name)}</title></polygon>`),'fill="none" stroke="#0891b2" stroke-width="1.5" stroke-dasharray="5 4"')}
${group('furniture',furnitureShapes,'fill="#a855f7" fill-opacity="0.12" stroke="#9333ea" stroke-width="1.5"')}
${group('walls',walls,'fill="none" stroke="#111827" stroke-width="2"')}
${group('doors',doors,'fill="none" stroke="#ea580c" stroke-width="5"')}
${group('windows',windows,'fill="none" stroke="#0284c7" stroke-width="5"')}
${group('labels',labels,`fill="#111827" stroke="white" stroke-width="${number(font*.2)}" paint-order="stroke" font-family="sans-serif" font-size="${number(font)}" text-anchor="middle"`)}
<style>path,polygon{vector-effect:non-scaling-stroke}</style>
</svg>\n`;
}
