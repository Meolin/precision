import { clamp } from '../math/Vec2';

export class SimulationClock {
  private accumulatorSeconds = 0;
  getAlpha(tickRate: number): number {
    return clamp(this.accumulatorSeconds * tickRate, 0, 1);
  }
  reset(): void {
    this.accumulatorSeconds = 0;
  }

  advance(
    frameDeltaMs: number,
    tickRate: number,
    maxFrameDeltaMs: number,
    step: () => void,
  ): number {
    if (!Number.isFinite(frameDeltaMs)) return 0;
    this.accumulatorSeconds += clamp(frameDeltaMs, 0, maxFrameDeltaMs) / 1000;
    const dt = 1 / tickRate;
    let ticks = 0;
    while (this.accumulatorSeconds + 1e-10 >= dt) {
      step();
      this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds - dt);
      ticks++;
    }
    return ticks;
  }
}
