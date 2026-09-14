import { simulateTrajectoryPreview, type TrajectoryPreview } from '../ballistics/trajectoryPreview';
import type { GameCommand } from '../commands/GameCommand';
import type { GameConfig } from '../config/GameConfig';
import { defaultGameConfig, validateConfig } from '../config/defaultGameConfig';
import type { Vec2 } from '../math/Vec2';
import { createGameState, type GameState } from './GameState';
import { SimulationClock } from './SimulationClock';
import { stepSimulation } from './stepSimulation';

export class GameRuntime {
  private state: GameState;
  private config: GameConfig;
  private commands: GameCommand[] = [];
  private clock = new SimulationClock();
  private paused = false;
  private preview: { key: string; value: TrajectoryPreview } | null = null;
  private configRevision = 0;
  readonly collisionSamples: Vec2[] = [];
  recordCollisionSamples = false;

  constructor(config: GameConfig = defaultGameConfig, seed = 12345) {
    this.config = validateConfig(config);
    this.state = createGameState(this.config, seed);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }
  getConfig(): GameConfig {
    return this.config;
  }
  isPaused(): boolean {
    return this.paused;
  }
  get pendingCommands(): number {
    return this.commands.length;
  }
  getRequestedAim(): number {
    for (let index = this.commands.length - 1; index >= 0; index--) {
      const command = this.commands[index];
      if (command?.type === 'setAim' && command.cannonId === this.state.cannon.id)
        return command.angleRad;
    }
    return this.state.cannon.angleRad;
  }
  get interpolationAlpha(): number {
    return this.paused ? 1 : this.clock.getAlpha(this.config.simulation.tickRate);
  }

  enqueueCommand(command: GameCommand): void {
    const last = this.commands.at(-1);
    if (command.type === 'setAim' && last?.type === 'setAim' && last.cannonId === command.cannonId)
      this.commands[this.commands.length - 1] = { ...command };
    else this.commands.push({ ...command });
  }

  private tick = (): void => {
    this.collisionSamples.length = 0;
    stepSimulation(
      this.state,
      this.config,
      1 / this.config.simulation.tickRate,
      this.commands,
      this.recordCollisionSamples ? this.collisionSamples : undefined,
    );
    this.commands = [];
  };

  advance(frameDeltaMs: number): void {
    if (!this.paused)
      this.clock.advance(
        frameDeltaMs,
        this.config.simulation.tickRate,
        this.config.simulation.maxFrameDeltaMs,
        this.tick,
      );
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock.reset();
  }
  step(): void {
    if (this.paused) this.tick();
  }

  reset(seed = this.state.seed): void {
    this.state = createGameState(this.config, seed);
    this.commands = [];
    this.collisionSamples.length = 0;
    this.clock.reset();
    this.preview = null;
  }

  newTerrain(): void {
    this.reset((this.state.seed + 1) >>> 0);
  }

  updateConfig(next: GameConfig): GameConfig {
    const validated = validateConfig(next);
    const resize =
      validated.world.widthMeters !== this.config.world.widthMeters ||
      validated.world.heightMeters !== this.config.world.heightMeters ||
      validated.terrain.cellSizeMeters !== this.config.terrain.cellSizeMeters;
    if (validated.simulation.tickRate !== this.config.simulation.tickRate) this.clock.reset();
    this.config = validated;
    this.configRevision++;
    if (resize) this.reset();
    return this.config;
  }

  resetSettings(): GameConfig {
    return this.updateConfig(defaultGameConfig);
  }

  getTrajectoryPreview(): TrajectoryPreview {
    const key = `${this.configRevision}:${this.state.terrain.version}:${this.state.cannon.angleRad}`;
    if (this.preview?.key !== key)
      this.preview = {
        key,
        value: simulateTrajectoryPreview(this.state.cannon, this.state.terrain, this.config),
      };
    return this.preview.value;
  }
}
