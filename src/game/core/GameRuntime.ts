import { simulateTrajectoryPreview, type TrajectoryPreview } from '../ballistics/trajectoryPreview';
import type { GameCommand } from '../commands/GameCommand';
import { applyCannonCommand } from '../commands/executeCommand';
import type { GameConfig } from '../config/GameConfig';
import { defaultGameConfig, validateConfig } from '../config/defaultGameConfig';
import type { Vec2 } from '../math/Vec2';
import { createGameState, type GameState } from './GameState';
import { SimulationClock } from './SimulationClock';
import { stepSimulation } from './stepSimulation';
import type { PenetrationResult } from '../impacts/PenetrationResult';
import type { PenetrationSegment } from '../impacts/PenetrationResult';

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
  recordPenetrationPaths = false;
  penetrationPath: PenetrationResult | null = null;
  private cursorPosition: Vec2 | null = null;

  constructor(config: GameConfig = defaultGameConfig, seed = 12345) {
    this.config = validateConfig(config);
    this.state = createGameState(this.config, seed);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }
  /** Presentation-only cursor state; it never participates in simulation or snapshots. */
  setCursorPosition(position: Vec2 | null): void {
    this.cursorPosition = position ? { ...position } : null;
  }
  getCursorPosition(): Vec2 | null {
    return this.cursorPosition ? { ...this.cursorPosition } : null;
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
    return this.getRequestedCannon().angleRad;
  }
  getRequestedCannon() {
    const cannon = { ...this.state.cannon, position: { ...this.state.cannon.position } };
    for (const command of this.commands) applyCannonCommand(cannon, this.config, command);
    return cannon;
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
    if (!this.recordPenetrationPaths) this.penetrationPath = null;
    else {
      for (const event of this.state.events)
        if (event.type === 'impactResolved')
          this.penetrationPath = event.resolution.penetration ?? null;
      for (const event of this.state.events) {
        if (
          event.type !== 'terrainDamage' ||
          event.operation.type !== 'capsule' ||
          !this.penetrationPath
        )
          continue;
        const segment: PenetrationSegment = {
          materialId: this.state.lastImpact?.materialId ?? 0,
          from: { ...event.operation.from },
          to: { ...event.operation.to },
          distanceMeters: Math.hypot(
            event.operation.to.x - event.operation.from.x,
            event.operation.to.y - event.operation.from.y,
          ),
          energyLostJ: event.energyJ,
        };
        this.penetrationPath = {
          ...this.penetrationPath,
          finalPosition: { ...event.operation.to },
          remainingEnergyJ:
            this.state.lastImpact?.remainingEnergyJ ?? this.penetrationPath.remainingEnergyJ,
          penetrationDistanceMeters:
            this.state.lastImpact?.penetrationDistanceMeters ??
            this.penetrationPath.penetrationDistanceMeters,
          traversedSegments: [...this.penetrationPath.traversedSegments, segment],
        };
      }
    }
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
    this.penetrationPath = null;
    this.cursorPosition = null;
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
      validated.terrain.cellSizeMeters !== this.config.terrain.cellSizeMeters ||
      validated.terrain.rockDepthMeters !== this.config.terrain.rockDepthMeters ||
      validated.terrain.rockVariationMeters !== this.config.terrain.rockVariationMeters;
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
    const cannon = this.getRequestedCannon();
    const key = `${this.configRevision}:${this.state.terrain.version}:${cannon.weaponId}:${cannon.angleRad}`;
    if (this.preview?.key !== key)
      this.preview = {
        key,
        value: simulateTrajectoryPreview(cannon, this.state.terrain, this.config),
      };
    return this.preview.value;
  }
}
