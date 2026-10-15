import { Euler, type Camera } from 'three';
import {
  DEFAULT_WALKTHROUGH_PLAYER_RADIUS,
  resolveWalkthroughMove,
  type WalkthroughCollisionWorld,
} from './walkthroughCollision';

const keys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight']);

export interface WalkthroughSettings {
  moveSpeed: number;
  sprintSpeed: number;
  eyeHeight: number;
  floorElevation: number;
  collisionWorld?: WalkthroughCollisionWorld | null;
  playerRadius?: number;
}

/** Local walkthrough input and motion; independent of rendering and pointer lock. */
export class WalkthroughMotion {
  private held = new Set<string>();
  private previous: number | null = null;
  private waitingForFirstFrame = false;
  private rightVelocity = 0;
  private forwardVelocity = 0;
  private rotation = new Euler(0, 0, 0, 'YXZ');

  private anyHeld(...codes: string[]) {
    return codes.some(code => this.held.has(code));
  }

  private movementAxes() {
    // WASD is the primary game-style control scheme. Arrow keys remain aliases
    // for older users, but pressing both aliases for one direction must not
    // double the requested speed.
    const right = Number(this.anyHeld('KeyD', 'ArrowRight')) - Number(this.anyHeld('KeyA', 'ArrowLeft'));
    const forward = Number(this.anyHeld('KeyW', 'ArrowUp')) - Number(this.anyHeld('KeyS', 'ArrowDown'));
    return { right, forward };
  }

  get active() {
    const { right, forward } = this.movementAxes();
    return Boolean(this.rightVelocity || this.forwardVelocity || right || forward);
  }

  /** Wake from the input event's clock, without counting the preceding idle time. */
  startClock(timestamp: number) {
    if (this.previous === null && Number.isFinite(timestamp)) {
      this.previous = timestamp;
      this.waitingForFirstFrame = true;
    }
  }

  stopClock() { this.previous = null; this.waitingForFirstFrame = false; }

  setKey(code: string, down: boolean, repeat = false) {
    if (!keys.has(code)) return false;
    // An OS repeat after returning to the page must not revive a key that blur
    // cleared. Accept movement again on a fresh press after release.
    if (down && repeat && !this.held.has(code)) return true;
    if (down) this.held.add(code);
    else this.held.delete(code);
    return true;
  }

  reset() {
    this.held.clear();
    this.stopClock();
    this.rightVelocity = this.forwardVelocity = 0;
  }

  advance(timestamp: number, camera: Camera, settings: WalkthroughSettings) {
    camera.position.y = settings.floorElevation + settings.eyeHeight;
    if (!Number.isFinite(timestamp)) { this.reset(); return; }
    if (this.previous === null) { this.previous = timestamp; return; }
    if (timestamp <= this.previous) {
      // RAF's shared frame timestamp can precede an input handler within that
      // frame. Keep its keys and wait for a frame after the wakeup time.
      if (timestamp < this.previous && !this.waitingForFirstFrame) this.reset();
      return;
    }
    this.waitingForFirstFrame = false;
    // A delayed frame must not teleport through the plan. Blur/visibility resets
    // separately discard all held input, momentum and elapsed background time.
    const delta = Math.min((timestamp - this.previous) / 1000, 0.25);
    this.previous = timestamp;
    const speed = this.held.has('ShiftLeft') || this.held.has('ShiftRight')
      ? settings.sprintSpeed : settings.moveSpeed;
    const { right, forward } = this.movementAxes();
    const length = Math.hypot(right, forward) || 1;
    if (!right && !forward && !this.rightVelocity && !this.forwardVelocity) return;

    const collisionWorld = settings.collisionWorld;
    const playerRadius = settings.playerRadius ?? DEFAULT_WALKTHROUGH_PLAYER_RADIUS;
    const movePlan = (dx: number, dz: number) => {
      if (!collisionWorld) {
        camera.position.x += dx;
        camera.position.z += dz;
        return;
      }
      const next = resolveWalkthroughMove(
        { x: camera.position.x, y: camera.position.z },
        { x: dx, y: dz },
        collisionWorld,
        playerRadius,
      );
      camera.position.x = next.x;
      camera.position.z = next.y;
    };

    // Preserve the established slider's acceleration/drag balance (800 gives
    // 80 cm/s once settled). Integrate dv/dt = acceleration - 10v analytically,
    // so acceleration, coasting and sprint changes do not depend on frame cadence.
    const targetRight = right / length * speed / 10;
    const targetForward = forward / length * speed / 10;
    // Mouse/pointer-lock owns camera look. Read its current yaw every frame and
    // never write the quaternion here, so movement cannot fight mouse rotation.
    this.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = this.rotation.y;
    // Short substeps keep collision and acceleration stable. They update only
    // the camera position; the scene is still drawn once per RAF.
    const steps = Math.max(1, Math.ceil(delta * 120 - 1e-8));
    const step = delta / steps;
    const decay = Math.exp(-10 * step);
    const integral = -Math.expm1(-10 * step) / 10;
    for (let i = 0; i < steps; i++) {
      const rightDistance = targetRight * step + (this.rightVelocity - targetRight) * integral;
      const forwardDistance = targetForward * step + (this.forwardVelocity - targetForward) * integral;
      this.rightVelocity = targetRight + (this.rightVelocity - targetRight) * decay;
      this.forwardVelocity = targetForward + (this.forwardVelocity - targetForward) * decay;
      movePlan(
        Math.cos(yaw) * rightDistance - Math.sin(yaw) * forwardDistance,
        -(Math.sin(yaw) * rightDistance + Math.cos(yaw) * forwardDistance),
      );
    }
    // Finish the sub-pixel coasting tail rather than drawing forever as the
    // exponential approaches zero. Remaining travel is at most 0.001 cm.
    if (!right && !forward && Math.hypot(this.rightVelocity, this.forwardVelocity) < 0.01) {
      movePlan(
        (Math.cos(yaw) * this.rightVelocity - Math.sin(yaw) * this.forwardVelocity) / 10,
        -(Math.sin(yaw) * this.rightVelocity + Math.cos(yaw) * this.forwardVelocity) / 10,
      );
      this.rightVelocity = this.forwardVelocity = 0;
    }
  }
}
