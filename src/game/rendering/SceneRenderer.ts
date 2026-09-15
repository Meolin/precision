import { Container, Graphics, Text } from 'pixi.js';
import type { GameRuntime } from '../core/GameRuntime';
import { muzzlePosition } from '../entities/Cannon';
import { lerp } from '../math/Vec2';
import type { DebugOptions } from './DebugOptions';
import { TerrainLayer } from './TerrainLayer';
import { fitWorld } from './viewport';
import { hitboxCenter } from '../entities/Hitbox';
import { DamagePopupLayer } from './DamagePopupLayer';

const colors = {
  sky: 0x182328,
  grid: 0x2a393e,
  line: 0x566660,
  accent: 0xd5ec84,
  orange: 0xf5af73,
  metal: 0xa9b9b8,
};

/** Imperative frame updates; React owns only this adapter's lifetime. */
export class SceneRenderer {
  private world = new Container();
  private background = new Graphics();
  private terrain = new TerrainLayer();
  private trajectory = new Graphics();
  private cannon = new Graphics();
  private units = new Graphics();
  private projectiles = new Graphics();
  private debug = new Graphics();
  private labels = new Container();
  private damagePopups = new DamagePopupLayer();
  private staticKey = '';
  private previewKey: object | null = null;
  private previewVisible = false;

  constructor(private parent: Container) {
    parent.addChild(this.world);
    this.world.addChild(
      this.background,
      this.terrain.sprite,
      this.labels,
      this.trajectory,
      this.cannon,
      this.units,
      this.projectiles,
      this.debug,
      this.damagePopups.container,
    );
  }

  draw(runtime: GameRuntime, options: DebugOptions, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const state = runtime.getState();
    const config = runtime.getConfig();
    const viewport = fitWorld(width, height, config.world);
    const ppm = viewport.pixelsPerMeter;
    const pixel = 1 / ppm;
    this.world.position.set(viewport.offsetX, viewport.offsetY);
    this.world.scale.set(ppm);
    this.terrain.update(state.terrain);
    this.damagePopups.update(runtime.getDamagePopups(), runtime.presentationTimeSeconds, pixel);
    const staticKey = `${width}:${height}:${config.world.widthMeters}:${config.world.heightMeters}:${options.grid}:${state.terrain.cellSizeMeters}`;
    if (this.staticKey !== staticKey) {
      this.staticKey = staticKey;
      this.drawBackground(
        config.world.widthMeters,
        config.world.heightMeters,
        pixel,
        options.grid ? state.terrain.cellSizeMeters : 10,
      );
      this.previewKey = null;
    }

    const preview = options.trajectory ? runtime.getTrajectoryPreview() : null;
    if (preview !== this.previewKey || options.trajectory !== this.previewVisible) {
      this.previewKey = preview;
      this.previewVisible = options.trajectory;
      this.trajectory.clear();
      if (preview) {
        for (const point of preview.points)
          this.trajectory
            .circle(point.x, point.y, 1.65 * pixel)
            .fill({ color: colors.accent, alpha: 0.65 });
        for (const point of preview.ricochets ?? [])
          this.trajectory.circle(point.x, point.y, 4 * pixel).fill(0x85d7e8);
        if (preview.impact) {
          const { x, y } = preview.impact;
          this.trajectory
            .circle(x, y, 5 * pixel)
            .stroke({ color: colors.accent, width: pixel, alpha: 0.8 });
          this.trajectory
            .moveTo(x - 8 * pixel, y)
            .lineTo(x + 8 * pixel, y)
            .moveTo(x, y - 8 * pixel)
            .lineTo(x, y + 8 * pixel)
            .stroke({ color: colors.accent, width: pixel, alpha: 0.65 });
        }
      }
    }

    const requestedCannon = runtime.getRequestedCannon();
    const { position, surfaceY } = requestedCannon;
    const muzzle = muzzlePosition(requestedCannon, config);
    this.cannon.clear();
    this.cannon.alpha = requestedCannon.alive ? 1 : 0.3;
    this.cannon
      .roundRect(position.x - 1.6, surfaceY - 0.65, 3.2, 0.7, 0.2)
      .fill(0x12191b)
      .stroke({ color: colors.metal, width: pixel });
    this.cannon
      .moveTo(position.x, position.y)
      .lineTo(muzzle.x, muzzle.y)
      .stroke({ color: 0x101719, width: 0.65, cap: 'round' });
    this.cannon
      .moveTo(position.x, position.y)
      .lineTo(muzzle.x, muzzle.y)
      .stroke({ color: colors.metal, width: 0.38, cap: 'round' });
    this.cannon
      .circle(position.x, position.y, 0.7)
      .fill(0x4f6262)
      .stroke({ color: colors.metal, width: pixel });
    this.cannon.circle(position.x, position.y, 0.22).fill(colors.accent);
    this.cannon.circle(position.x - 0.95, surfaceY - 0.24, 0.26).fill(0x5c6b64);
    this.cannon.circle(position.x + 0.95, surfaceY - 0.24, 0.26).fill(0x5c6b64);

    this.projectiles.clear();
    this.debug.clear();
    this.units.clear();
    const movementTarget = state.cannon.movement?.targetX;
    if (options.movementTarget && state.cannon.alive && movementTarget != null) {
      const targetY = state.terrain.findSurfaceY(movementTarget) ?? config.world.heightMeters;
      this.debug
        .moveTo(movementTarget, targetY)
        .lineTo(movementTarget, targetY - 2.5)
        .lineTo(movementTarget + 1.2, targetY - 2)
        .lineTo(movementTarget, targetY - 1.5)
        .stroke({ color: colors.accent, width: 1.5 * pixel });
    }
    for (const unit of state.units) {
      const center = hitboxCenter(unit.position, unit.hitbox);
      const radius = unit.hitbox.radiusMeters;
      const color = unit.teamId === 1 ? colors.accent : colors.orange;
      if (unit.id !== state.cannon.id) {
        this.units
          .circle(center.x, center.y, radius)
          .fill({ color: unit.alive ? 0x8a5740 : 0x343c3c, alpha: unit.alive ? 1 : 0.65 })
          .stroke({ color, width: pixel, alpha: unit.alive ? 1 : 0.25 });
        if (unit.alive)
          this.units.circle(center.x, center.y, radius * 0.4).stroke({ color, width: pixel });
      }
      if (unit.alive) {
        const barWidth = Math.max(3, 24 * pixel);
        const barY = center.y - radius - 0.7;
        this.units.rect(center.x - barWidth / 2, barY, barWidth, 3 * pixel).fill(0x0d1719);
        this.units
          .rect(
            center.x - barWidth / 2,
            barY,
            (barWidth * unit.health.current) / unit.health.max,
            3 * pixel,
          )
          .fill(color);
        if (options.entityHitboxes)
          this.debug
            .circle(center.x, center.y, radius)
            .stroke({ color: 0xed85ac, width: 1.5 * pixel });
      } else {
        this.units
          .moveTo(center.x - radius, center.y - radius)
          .lineTo(center.x + radius, center.y + radius)
          .moveTo(center.x - radius, center.y + radius)
          .lineTo(center.x + radius, center.y - radius)
          .stroke({ color: colors.orange, width: pixel, alpha: 0.65 });
      }
    }
    if (state.lastEntityImpact) {
      const { position: point, surfaceNormal: normal } = state.lastEntityImpact;
      if (options.impact)
        this.debug
          .circle(point.x, point.y, 4 * pixel)
          .stroke({ color: 0xed85ac, width: 1.5 * pixel });
      if (options.surfaceNormals)
        this.debug
          .moveTo(point.x, point.y)
          .lineTo(point.x + normal.x * 2, point.y + normal.y * 2)
          .stroke({ color: 0xed85ac, width: 1.5 * pixel });
    }
    for (const projectile of state.projectiles) {
      const point = lerp(
        projectile.previousPosition,
        projectile.position,
        runtime.interpolationAlpha,
      );
      const radius = Math.max(projectile.radius, 2.8 * pixel);
      this.projectiles
        .circle(point.x, point.y, radius + 3 * pixel)
        .fill({ color: colors.orange, alpha: 0.14 });
      this.projectiles.circle(point.x, point.y, radius).fill(0xffdfac);
      if (options.velocity) {
        const end = {
          x: point.x + projectile.velocity.x * 0.2,
          y: point.y + projectile.velocity.y * 0.2,
        };
        this.debug
          .moveTo(point.x, point.y)
          .lineTo(end.x, end.y)
          .stroke({ color: colors.orange, width: 1.5 * pixel });
        const direction = Math.atan2(end.y - point.y, end.x - point.x);
        for (const sign of [-1, 1])
          this.debug
            .moveTo(end.x, end.y)
            .lineTo(
              end.x - Math.cos(direction + sign * 0.5) * 6 * pixel,
              end.y - Math.sin(direction + sign * 0.5) * 6 * pixel,
            )
            .stroke({ color: colors.orange, width: 1.5 * pixel });
      }
    }
    if (options.impact && state.lastImpact) {
      const { craterRadiusMeters } = state.lastImpact;
      const impact =
        state.lastImpact.result === 'ricochet'
          ? state.lastImpact.contactPoint
          : state.lastImpact.position;
      this.debug
        .circle(impact.x, impact.y, craterRadiusMeters)
        .stroke({ color: colors.orange, width: pixel, alpha: 0.65 });
      this.debug.circle(impact.x, impact.y, 2 * pixel).fill(colors.orange);
    }
    if (options.surfaceNormals && state.lastImpact) {
      const { contactPoint: point, surfaceNormal: normal } = state.lastImpact;
      const length = 2;
      const end = { x: point.x + normal.x * length, y: point.y + normal.y * length };
      this.debug.circle(point.x, point.y, 3 * pixel).fill(0x85d7e8);
      this.debug
        .moveTo(point.x, point.y)
        .lineTo(end.x, end.y)
        .stroke({ color: 0x85d7e8, width: 1.5 * pixel });
      for (const sign of [-1, 1])
        this.debug
          .moveTo(end.x, end.y)
          .lineTo(
            end.x - normal.x * 6 * pixel + sign * normal.y * 3 * pixel,
            end.y - normal.y * 6 * pixel - sign * normal.x * 3 * pixel,
          )
          .stroke({ color: 0x85d7e8, width: 1.5 * pixel });
    }
    if (options.samples)
      for (const point of runtime.collisionSamples)
        this.debug.circle(point.x, point.y, 1.3 * pixel).fill({ color: 0xed85ac, alpha: 0.75 });
    if (options.penetration && runtime.penetrationPath) {
      const path = runtime.penetrationPath;
      for (const segment of path.traversedSegments) {
        this.debug
          .moveTo(segment.from.x, segment.from.y)
          .lineTo(segment.to.x, segment.to.y)
          .stroke({ color: 0x85d7e8, width: 1.5 * pixel, alpha: 0.8 });
        this.debug.circle(segment.to.x, segment.to.y, pixel).fill(0x85d7e8);
      }
      this.debug
        .circle(path.entryPosition.x, path.entryPosition.y, 4 * pixel)
        .stroke({ color: colors.orange, width: 1.5 * pixel });
      this.debug
        .circle(path.finalPosition.x, path.finalPosition.y, 4 * pixel)
        .stroke({ color: path.penetrated ? colors.accent : 0xed85ac, width: 1.5 * pixel });
    }
  }

  private drawBackground(width: number, height: number, pixel: number, gridStep: number): void {
    const graphics = this.background.clear();
    graphics.rect(0, 0, width, height).fill(colors.sky);
    for (let x = gridStep; x < width; x += gridStep) graphics.moveTo(x, 0).lineTo(x, height);
    for (let y = gridStep; y < height; y += gridStep) graphics.moveTo(0, y).lineTo(width, y);
    graphics.stroke({ color: colors.grid, width: pixel * 0.7, alpha: gridStep < 1 ? 0.7 : 0.8 });
    graphics.rect(0, 0, width, height).stroke({ color: colors.line, width: pixel, alpha: 0.25 });
    for (const child of this.labels.removeChildren()) child.destroy();
    for (let x = 20; x < width; x += 20) {
      const label = new Text({
        text: `${x} m`,
        style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0x87958f },
      });
      label.scale.set(pixel);
      label.position.set(x + 0.4, height - 2.2);
      this.labels.addChild(label);
    }
    const cannonLabel = new Text({
      text: '01 / CANNON',
      style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0xa9b5aa, letterSpacing: 1 },
    });
    cannonLabel.scale.set(pixel);
    cannonLabel.position.set(3, height - 2.2);
    this.labels.addChild(cannonLabel);
  }

  destroy(): void {
    this.terrain.destroy();
    this.damagePopups.destroy();
    this.parent.removeChild(this.world);
    this.world.destroy({ children: true });
  }
}
