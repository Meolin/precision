import type { GameConfig } from '../config/GameConfig';
import { cameraFrame } from '../config/worldLayout';
import { clamp, type Vec2 } from '../math/Vec2';
import { cameraViewport } from '../rendering/viewport';

export const cameraZoom = { min: 1, max: 3, default: 1, step: 0.05 } as const;

/** Local presentation state; movement and zoom never change the simulation. */
export class CameraController {
  private center: Vec2;
  private zoom: number = cameraZoom.default;
  private direction: Vec2 = { x: 0, y: 0 };
  private listeners = new Set<() => void>();

  constructor(
    private world: GameConfig['world'],
    focus?: Vec2,
  ) {
    this.center = focus ? { ...focus } : { x: world.widthMeters / 2, y: world.heightMeters / 2 };
    this.clampCenter();
  }

  getZoom = (): number => this.zoom;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getViewport(width: number, height: number) {
    return cameraViewport(width, height, this.center, this.zoom);
  }

  reset(world: GameConfig['world'], focus?: Vec2): void {
    this.world = world;
    this.center = focus ? { ...focus } : { x: world.widthMeters / 2, y: world.heightMeters / 2 };
    this.direction = { x: 0, y: 0 };
    this.clampCenter();
    this.notify();
  }

  setZoom(value: number, anchor?: Vec2): void {
    if (!Number.isFinite(value)) return;
    const next = clamp(value, cameraZoom.min, cameraZoom.max);
    if (next === this.zoom) return;
    // Keep the point beneath the pointer stationary until a map edge is reached.
    if (anchor) {
      const ratio = this.zoom / next;
      this.center = {
        x: anchor.x + (this.center.x - anchor.x) * ratio,
        y: anchor.y + (this.center.y - anchor.y) * ratio,
      };
    }
    this.zoom = next;
    this.clampCenter();
    this.notify();
  }

  pan(x: number, y: number): void {
    this.moveTo({ x: this.center.x + x, y: this.center.y + y });
  }

  moveTo(position: Vec2): void {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const previous = this.center;
    this.center = { ...position };
    this.clampCenter();
    if (previous.x !== this.center.x || previous.y !== this.center.y) this.notify();
  }

  setDirection(x: number, y: number): void {
    this.direction = { x, y };
  }

  update(elapsedMs: number): void {
    const length = Math.hypot(this.direction.x, this.direction.y);
    if (!length || !Number.isFinite(elapsedMs)) return;
    // 0.8 camera widths per second at every resolution, including on pause.
    const distance =
      ((cameraFrame.widthMeters / this.zoom) * 0.8 * clamp(elapsedMs, 0, 100)) / 1000;
    this.pan((this.direction.x / length) * distance, (this.direction.y / length) * distance);
  }

  private clampCenter(): void {
    const halfWidth = cameraFrame.widthMeters / this.zoom / 2;
    const halfHeight = cameraFrame.heightMeters / this.zoom / 2;
    this.center.x =
      this.world.widthMeters <= halfWidth * 2
        ? this.world.widthMeters / 2
        : clamp(this.center.x, halfWidth, this.world.widthMeters - halfWidth);
    this.center.y =
      this.world.heightMeters <= halfHeight * 2
        ? this.world.heightMeters / 2
        : clamp(this.center.y, halfHeight, this.world.heightMeters - halfHeight);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
