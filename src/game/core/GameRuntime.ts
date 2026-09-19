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
import { createDamagePopup, type DamagePopup } from '../effects/DamagePopup';
import { hitboxCenter } from '../entities/Hitbox';
import type { ExplosionResolvedEvent } from '../explosions/resolveExplosion';
import { isInstallation } from '../entities/InstallationState';
import { cloneUnit } from '../entities/UnitState';

export interface RecentExplosion {
  event: ExplosionResolvedEvent;
  timeSeconds: number;
}

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
  private damagePopups: DamagePopup[] = [];
  private presentationSeconds = 0;
  private lastExplosion: ExplosionResolvedEvent | null = null;
  private recentExplosions: RecentExplosion[] = [];

  constructor(config: GameConfig = defaultGameConfig, seed = 12345) {
    this.config = validateConfig(config);
    this.state = createGameState(this.config, seed);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }
  getDamagePopups(): readonly DamagePopup[] {
    return this.damagePopups;
  }
  getLastExplosion(): Readonly<ExplosionResolvedEvent> | null {
    return this.lastExplosion;
  }
  /** Retain every explosion across catch-up ticks for presentation effects. */
  getRecentExplosions(): readonly RecentExplosion[] {
    return this.recentExplosions;
  }
  /** Fractional simulation time for effects, frozen on pause and cleared on reset. */
  get presentationTimeSeconds(): number {
    return this.presentationSeconds;
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
  getRequestedAim(entityId = this.state.cannon.id): number {
    return this.getRequestedCannon(entityId).angleRad;
  }
  getRequestedCannon(entityId = this.state.cannon.id) {
    const unit = this.state.units.find((candidate) => candidate.id === entityId);
    const cannon = cloneUnit(unit && isInstallation(unit) ? unit : this.state.cannon);
    for (const command of this.commands) applyCannonCommand(cannon, this.config, command);
    return cannon;
  }
  get interpolationAlpha(): number {
    return this.paused ? 1 : this.clock.getAlpha(this.config.simulation.tickRate);
  }

  enqueueCommand(command: GameCommand): void {
    const last = this.commands.at(-1);
    if (
      command.type === 'setAim' &&
      last?.type === 'setAim' &&
      last.cannonId === command.cannonId &&
      last.playerId === command.playerId
    )
      this.commands[this.commands.length - 1] = { ...command };
    else
      this.commands.push({
        ...command,
        ...('entityIds' in command ? { entityIds: [...command.entityIds] } : {}),
        ...(command.type === 'attackGround'
          ? { targetPosition: { ...command.targetPosition } }
          : {}),
      });
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
    this.presentationSeconds = Math.max(this.presentationSeconds, this.state.elapsedSeconds);
    this.captureDamagePopups();
    this.recentExplosions = this.recentExplosions.filter(
      (item) => this.presentationSeconds - item.timeSeconds < 5,
    );
    for (const event of this.state.events) {
      if (event.type !== 'explosionResolved') continue;
      this.lastExplosion = event;
      this.recentExplosions.push({ event, timeSeconds: this.state.elapsedSeconds });
    }
    this.recentExplosions = this.recentExplosions.slice(-32);
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

  private captureDamagePopups(): void {
    this.damagePopups = this.damagePopups.filter(
      (popup) => popup.expiresAtSeconds > this.presentationSeconds,
    );
    // Capture every tick before the transient event queue is cleared by the next tick.
    for (const event of this.state.events) {
      if (event.type !== 'entityDamage' || !Number.isFinite(event.damage) || event.damage < 0)
        continue;
      const target = this.state.units.find((unit) => unit.id === event.targetEntityId);
      const position =
        event.position ?? (target ? hitboxCenter(target.position, target.hitbox) : null);
      if (!position) continue;
      this.damagePopups.push(
        createDamagePopup(
          {
            position,
            velocity: event.velocity ?? { x: 0, y: -1 },
            kineticEnergyJ: event.kineticEnergyJ,
          },
          event,
          this.state.elapsedSeconds,
          this.config.damagePopup,
        ),
      );
    }
  }

  advance(frameDeltaMs: number): void {
    if (this.paused) return;
    this.clock.advance(
      frameDeltaMs,
      this.config.simulation.tickRate,
      this.config.simulation.maxFrameDeltaMs,
      this.tick,
    );
    this.presentationSeconds = Math.max(
      this.presentationSeconds,
      this.state.elapsedSeconds +
        this.clock.getAlpha(this.config.simulation.tickRate) / this.config.simulation.tickRate,
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
    this.damagePopups = [];
    this.lastExplosion = null;
    this.recentExplosions = [];
    this.presentationSeconds = 0;
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
      validated.terrain.chunkSizeCells !== this.config.terrain.chunkSizeCells ||
      validated.terrain.rockDepthMeters !== this.config.terrain.rockDepthMeters ||
      validated.terrain.rockVariationMeters !== this.config.terrain.rockVariationMeters ||
      validated.rts.installationsPerPlayer !== this.config.rts.installationsPerPlayer;
    if (validated.simulation.tickRate !== this.config.simulation.tickRate) this.clock.reset();
    this.config = validated;
    this.configRevision++;
    if (resize) this.reset();
    return this.config;
  }

  resetSettings(): GameConfig {
    return this.updateConfig(defaultGameConfig);
  }

  getTrajectoryPreview(entityId = this.state.cannon.id): TrajectoryPreview {
    const cannon = this.getRequestedCannon(entityId);
    const unitsKey = this.state.units
      .map(
        (unit) =>
          `${unit.id}:${unit.alive}:${unit.position.x}:${unit.position.y}:${unit.hitbox.radiusMeters}:${unit.hitbox.offset?.x ?? 0}:${unit.hitbox.offset?.y ?? 0}`,
      )
      .join('|');
    const key = `${cannon.id}:${cannon.alive}:${this.configRevision}:${this.state.terrain.version}:${cannon.weaponId}:${cannon.angleRad}:${cannon.position.x}:${cannon.position.y}:${unitsKey}`;
    if (this.preview?.key !== key)
      this.preview = {
        key,
        value: simulateTrajectoryPreview(cannon, this.state.terrain, this.config, this.state.units),
      };
    return this.preview.value;
  }
}
