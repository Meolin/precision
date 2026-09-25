import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameRuntime } from '../core/GameRuntime';
import { muzzlePosition } from '../entities/Cannon';
import { lerp } from '../math/Vec2';
import type { DebugOptions } from './DebugOptions';
import { TerrainLayer } from './TerrainLayer';
import { hitboxCenter } from '../entities/Hitbox';
import { DamagePopupLayer } from './DamagePopupLayer';
import { isInstallation } from '../entities/InstallationState';
import type { RtsController } from '../client/RtsController';
import cannonBaseUrl from '../assets/example_base.png';
import { ScenePostProcessing } from './ScenePostProcessing';
import type { ShaderSettings } from './ShaderSettings';
import { MinimapRenderer } from './MinimapRenderer';
import type { TerrainSmoothingSettings } from './TerrainSmoothingSettings';
import type { TerrainTextureSettings } from './TerrainTextureSettings';
import { BuildingAnimationPlayer } from '../buildings/BuildingAnimationPlayer';
import type { BuildingAnimationPreview } from '../buildings/BuildingAnimationPreview';
import type { FallingTerrainCluster } from '../terrain/terrainSettling';
import { TerrainMaterialId } from '../terrain/TerrainMaterialId';
import { terrainMaterialVisuals } from './terrainMaterialVisuals';

// The source image is a 1448 × 1086 PNG. Its visible chassis ends at roughly
// 78% of the image height, so this anchor places the tracks on the terrain.
const cannonBaseSourceWidth = 1448;
const cannonBaseWidthMeters = 4.6;
const cannonBaseGroundAnchor = 0.78;

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
  private frame = new Container();
  private frameMask = new Graphics();
  private frameKey = '';
  private world = new Container();
  private content = new Container();
  private postProcessing: ScenePostProcessing;
  private background = new Graphics();
  private terrain = new TerrainLayer();
  private fallingTerrain = new Graphics();
  private minimap = new MinimapRenderer();
  private trajectory = new Graphics();
  private cannonBases = new Container();
  private baseSprites = new Map<number, Sprite>();
  private baseTexture: Texture | null = null;
  private selection = new Graphics();
  private screenOverlay = new Graphics();
  private cannon = new Graphics();
  private units = new Graphics();
  private terrainDebug = new Graphics();
  private terrainDebugKey = '';
  private terrainMetrics = new Text({
    text: '',
    style: { fontFamily: 'Consolas, monospace', fontSize: 11, fill: 0xd5ec84 },
  });
  private debug = new Graphics();
  private labels = new Container();
  private damagePopups = new DamagePopupLayer();
  private buildingLayer = new Container();
  private buildingPlayer: BuildingAnimationPlayer | null = null;
  private buildingConfigIdentity: BuildingAnimationPreview['config'] | null = null;
  private buildingSourceRevision = -1;
  private staticKey = '';
  private terrainIdentity: object | null = null;
  private previewKey: object | null = null;
  private previewVisible = false;
  private cannonStateIdentity: object | null = null;
  private disposed = false;

  constructor(private parent: Container) {
    void Assets.load<Texture>(cannonBaseUrl).then((texture) => {
      if (!this.disposed) {
        this.baseTexture = texture;
        for (const sprite of this.baseSprites.values()) sprite.texture = texture;
      }
    });
    this.frame.addChild(this.world, this.screenOverlay);
    parent.addChild(this.frame, this.frameMask, this.minimap.container);
    this.frame.mask = this.frameMask;
    this.content.addChild(
      this.background,
      this.terrain.container,
      this.fallingTerrain,
      this.cannonBases,
      this.cannon,
    );
    this.postProcessing = new ScenePostProcessing({
      content: this.content,
      background: this.background,
      terrain: this.terrain.container,
      cannonBases: this.cannonBases,
    });
    this.world.addChild(
      this.content,
      this.labels,
      this.trajectory,
      this.buildingLayer,
      this.units,
      this.selection,
      this.terrainDebug,
      this.terrainMetrics,
      this.debug,
      this.damagePopups.container,
    );
  }

  draw(
    runtime: GameRuntime,
    controls: RtsController,
    options: DebugOptions,
    shaders: ShaderSettings,
    terrainSmoothing: TerrainSmoothingSettings,
    terrainTexture: TerrainTextureSettings,
    buildingPreview: BuildingAnimationPreview | undefined,
    width: number,
    height: number,
  ): void {
    if (width <= 0 || height <= 0) return;
    const state = runtime.getState();
    const config = runtime.getConfig();
    const viewport = controls.camera.getViewport(width, height);
    const ppm = viewport.pixelsPerMeter;
    const pixel = 1 / ppm;
    const frameKey = `${viewport.frameX}:${viewport.frameY}:${viewport.width}:${viewport.height}`;
    if (frameKey !== this.frameKey) {
      this.frameKey = frameKey;
      this.frameMask
        .clear()
        .rect(viewport.frameX, viewport.frameY, viewport.width, viewport.height)
        .fill(0xffffff);
    }
    this.world.position.set(viewport.offsetX, viewport.offsetY);
    this.world.scale.set(ppm);
    if (state.terrain !== this.terrainIdentity) this.minimap.clearTerrain();
    this.terrain.update(state.terrain, terrainSmoothing, terrainTexture, ppm);
    this.drawFallingTerrain(
      state.fallingTerrain,
      state.terrain.cellSizeMeters,
      runtime.isPaused() ? 0 : runtime.interpolationAlpha / config.simulation.tickRate,
    );
    this.terrainIdentity = state.terrain;
    this.terrain.container.visible = options.terrainVisual;
    this.fallingTerrain.visible = options.terrainVisual;
    this.minimap.draw(runtime, controls, this.terrain, width, height);
    this.damagePopups.update(runtime.getDamagePopups(), runtime.presentationTimeSeconds, pixel);
    this.drawBuildingPreview(
      buildingPreview,
      state.terrain.findSurfaceY.bind(state.terrain),
      config.world.widthMeters,
    );
    const staticKey = `${width}:${height}:${ppm}:${config.world.widthMeters}:${config.world.heightMeters}:${options.grid}:${state.terrain.cellSizeMeters}`;
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

    const single = controls.getSingleInstallation();
    const preview = options.trajectory && single ? runtime.getTrajectoryPreview(single.id) : null;
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

    this.cannon.clear();
    if (this.cannonStateIdentity !== state) {
      this.cannonStateIdentity = state;
      for (const sprite of this.baseSprites.values()) sprite.destroy();
      this.baseSprites.clear();
    }
    for (const installation of state.units.filter(isInstallation)) {
      const requested =
        installation.ownerPlayerId === controls.playerId
          ? runtime.getRequestedCannon(installation.id)
          : installation;
      const { position, surfaceY } = requested;
      const muzzle = muzzlePosition(requested, config);
      let sprite = this.baseSprites.get(installation.id);
      if (!sprite) {
        sprite = this.baseTexture ? new Sprite(this.baseTexture) : new Sprite();
        this.baseSprites.set(installation.id, sprite);
        this.cannonBases.addChild(sprite);
      }
      sprite.anchor.set(0.5, cannonBaseGroundAnchor);
      sprite.scale.set(cannonBaseWidthMeters / cannonBaseSourceWidth);
      sprite.position.set(position.x, surfaceY);
      sprite.alpha = requested.alive ? 1 : 0.3;
      sprite.tint = installation.ownerPlayerId === controls.playerId ? 0xffffff : 0xe4b49b;
      const alpha = requested.alive ? 1 : 0.3;
      this.cannon
        .moveTo(position.x, position.y)
        .lineTo(muzzle.x, muzzle.y)
        .stroke({ color: 0x101719, width: 0.65, cap: 'round', alpha });
      this.cannon
        .moveTo(position.x, position.y)
        .lineTo(muzzle.x, muzzle.y)
        .stroke({ color: colors.metal, width: 0.38, cap: 'round', alpha });
      this.cannon
        .circle(position.x, position.y, 0.7)
        .fill({ color: 0x4f6262, alpha })
        .stroke({ color: colors.metal, width: pixel, alpha });
      const weaponColor =
        requested.weaponId === 'mortar'
          ? 0x85d7e8
          : requested.weaponId === 'heavyPenetrator'
            ? 0xed85ac
            : colors.accent;
      this.cannon.circle(position.x, position.y, 0.22).fill({ color: weaponColor, alpha });
    }

    this.selection.clear();
    const selectedIds = controls.selection.selectedEntityIds;
    const targetMarker = (x: number, y: number, color: number, alpha = 1) => {
      const radius = 6 * pixel;
      this.selection.circle(x, y, radius).stroke({ color, width: pixel, alpha });
      this.selection
        .moveTo(x - radius, y - radius)
        .lineTo(x + radius, y + radius)
        .moveTo(x - radius, y + radius)
        .lineTo(x + radius, y - radius)
        .stroke({ color, width: pixel, alpha });
    };
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const selected = selectedIds.includes(unit.id);
      const hovered = controls.selection.hoveredEntityId === unit.id;
      const center = hitboxCenter(unit.position, unit.hitbox);
      if (selected || hovered)
        this.selection.circle(center.x, center.y, unit.hitbox.radiusMeters + 4 * pixel).stroke({
          color: selected ? colors.accent : colors.orange,
          width: (selected ? 2 : 1) * pixel,
        });
      if (!selected || !isInstallation(unit)) continue;
      let previous = center;
      for (const [index, order] of unit.orders.entries()) {
        const targetUnit =
          order.type === 'attackTarget'
            ? state.units.find((item) => item.id === order.targetEntityId && item.alive)
            : null;
        const point =
          order.type === 'attackGround'
            ? order.targetPosition
            : targetUnit
              ? hitboxCenter(targetUnit.position, targetUnit.hitbox)
              : null;
        if (!point) continue;
        const color = order.type === 'attackTarget' ? colors.orange : colors.accent;
        this.selection
          .moveTo(previous.x, previous.y)
          .lineTo(point.x, point.y)
          .stroke({ color, width: pixel, alpha: index === 0 ? 0.8 : 0.35 });
        targetMarker(point.x, point.y, color, index === 0 ? 1 : 0.45);
        previous = point;
      }
    }
    if (controls.lastTarget) {
      const liveTarget =
        controls.lastTarget.entityId === undefined
          ? null
          : state.units.find((unit) => unit.id === controls.lastTarget?.entityId);
      const point = liveTarget?.position ?? controls.lastTarget.position;
      targetMarker(point.x, point.y, colors.orange, 0.8);
    }
    if (controls.inputMode === 'attackGround') {
      const cursor = runtime.getCursorPosition();
      if (cursor) {
        const surface = state.terrain.findSurfaceY(cursor.x);
        targetMarker(
          cursor.x,
          surface !== null && cursor.y >= surface ? surface : cursor.y,
          colors.accent,
        );
      }
    }
    this.screenOverlay.clear();
    if (controls.rectangle) {
      const { start, current } = controls.rectangle;
      this.screenOverlay
        .rect(
          Math.min(start.x, current.x),
          Math.min(start.y, current.y),
          Math.abs(current.x - start.x),
          Math.abs(current.y - start.y),
        )
        .fill({ color: colors.accent, alpha: 0.1 })
        .stroke({ color: colors.accent, width: 1 });
    }

    this.postProcessing.update(runtime, shaders, viewport, this.baseSprites, selectedIds);
    const terrainDebugKey = `${state.terrain.version}:${viewport.worldX}:${viewport.worldY}:${viewport.worldWidth}:${viewport.worldHeight}:${options.collisionMask}:${options.terrainChunks}:${options.terrainDirtyRects}`;
    if (terrainDebugKey !== this.terrainDebugKey) {
      this.terrainDebugKey = terrainDebugKey;
      this.terrainDebug.clear();
      const terrain = state.terrain;
      const cell = terrain.cellSizeMeters;
      if (options.collisionMask) {
        const firstColumn = Math.max(0, Math.floor(viewport.worldX / cell));
        const lastColumn = Math.min(
          terrain.columns - 1,
          Math.floor((viewport.worldX + viewport.worldWidth) / cell),
        );
        const firstRow = Math.max(0, Math.floor(viewport.worldY / cell));
        const lastRow = Math.min(
          terrain.rows - 1,
          Math.floor((viewport.worldY + viewport.worldHeight) / cell),
        );
        for (let row = firstRow; row <= lastRow; row++) {
          let spanStart = -1;
          for (let column = firstColumn; column <= lastColumn + 1; column++) {
            const solid = column <= lastColumn && terrain.isSolid(column, row);
            if (solid && spanStart < 0) spanStart = column;
            else if (!solid && spanStart >= 0) {
              this.terrainDebug
                .rect(spanStart * cell, row * cell, (column - spanStart) * cell, cell)
                .fill({ color: 0x85d7e8, alpha: 0.28 });
              spanStart = -1;
            }
          }
        }
      }
      if (options.terrainChunks)
        for (const chunk of terrain.chunks)
          this.terrainDebug
            .rect(
              chunk.originX * cell,
              chunk.originY * cell,
              chunk.width * cell,
              chunk.height * cell,
            )
            .stroke({ color: 0xffd166, width: 1.5 * pixel, alpha: 0.9 });
      const dirty = terrain.lastChange.dirtyRect;
      if (options.terrainDirtyRects && dirty)
        this.terrainDebug
          .rect(
            dirty.minX * cell,
            dirty.minY * cell,
            (dirty.maxX - dirty.minX + 1) * cell,
            (dirty.maxY - dirty.minY + 1) * cell,
          )
          .fill({ color: 0xed85ac, alpha: 0.12 })
          .stroke({ color: 0xed85ac, width: 1.5 * pixel, alpha: 0.95 });
    }
    const showTerrainMetrics =
      options.collisionMask || options.terrainChunks || options.terrainDirtyRects;
    this.terrainMetrics.visible = showTerrainMetrics;
    if (showTerrainMetrics) {
      const change = state.terrain.lastChange;
      this.terrainMetrics.text = `terrain q=${state.terrain.collisionQueryCount} · changed=${change.modifiedPixels} px · chunks=${change.affectedChunks.length} · prep=${this.terrain.metrics.prepareUpdateMs.toFixed(2)} ms · worker=${this.terrain.metrics.workerUpdateMs.toFixed(2)} ms · publish=${this.terrain.metrics.publishUpdateMs.toFixed(2)} ms · round-trip=${this.terrain.metrics.workerRoundTripMs.toFixed(1)} ms · rendered=${this.terrain.metrics.visualLatencyMs.toFixed(1)} ms`;
      this.terrainMetrics.scale.set(pixel);
      this.terrainMetrics.position.set(viewport.worldX + 8 * pixel, viewport.worldY + 8 * pixel);
    }
    this.debug.clear();
    const lastExplosion = runtime.getLastExplosion();
    if (lastExplosion) {
      const { explosion, affectedEntities } = lastExplosion.resolution;
      const { x, y } = explosion.position;
      if (options.explosionRadius) {
        this.debug
          .circle(x, y, explosion.radiusMeters)
          .stroke({ color: colors.orange, width: 1.5 * pixel, alpha: 0.8 });
        this.debug
          .circle(x, y, explosion.innerRadiusMeters)
          .stroke({ color: colors.accent, width: pixel, alpha: 0.8 });
        this.debug
          .circle(x, y, explosion.terrainDamageRadiusMeters)
          .stroke({ color: colors.metal, width: pixel, alpha: 0.5 });
        this.debug.circle(x, y, 3 * pixel).fill(colors.orange);
      }
      if (options.explosionOcclusion) {
        for (const target of affectedEntities) {
          const color = target.occluded ? 0xed85ac : 0x85d7a2;
          this.debug
            .moveTo(x, y)
            .lineTo(target.targetPosition.x, target.targetPosition.y)
            .stroke({ color, width: 1.5 * pixel, alpha: 0.85 });
          this.debug
            .circle(target.targetPosition.x, target.targetPosition.y, 3 * pixel)
            .fill(color);
        }
      }
    }
    this.units.clear();
    for (const unit of state.units) {
      const center = hitboxCenter(unit.position, unit.hitbox);
      const radius = unit.hitbox.radiusMeters;
      const color = unit.ownerPlayerId === controls.playerId ? colors.accent : colors.orange;
      if (!isInstallation(unit)) {
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
      text: 'RTS / BATTERIES',
      style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0xa9b5aa, letterSpacing: 1 },
    });
    cannonLabel.scale.set(pixel);
    cannonLabel.position.set(3, height - 2.2);
    this.labels.addChild(cannonLabel);
  }

  private drawBuildingPreview(
    preview: BuildingAnimationPreview | undefined,
    findSurfaceY: (x: number) => number | null,
    worldWidth: number,
  ): void {
    if (!preview?.visible) {
      this.buildingLayer.visible = false;
      return;
    }
    this.buildingLayer.visible = true;
    this.buildingLayer.alpha = Math.min(1, Math.max(0, preview.opacity));
    const resolver = (assetId: string) => preview.sourceUrls[assetId] ?? assetId;
    if (!this.buildingPlayer) {
      this.buildingPlayer = new BuildingAnimationPlayer({
        config: preview.config,
        resolveTexture: resolver,
      });
      this.buildingLayer.addChild(this.buildingPlayer.container);
      this.buildingConfigIdentity = preview.config;
      this.buildingSourceRevision = preview.sourceRevision;
    } else if (
      this.buildingConfigIdentity !== preview.config ||
      this.buildingSourceRevision !== preview.sourceRevision
    ) {
      const reloadTextures = this.buildingSourceRevision !== preview.sourceRevision;
      this.buildingConfigIdentity = preview.config;
      this.buildingSourceRevision = preview.sourceRevision;
      void this.buildingPlayer.setConfig(preview.config, resolver, reloadTextures);
    }
    const x = preview.position?.x ?? worldWidth * 0.5;
    const y = preview.position?.y ?? findSurfaceY(x) ?? 0;
    this.buildingLayer.position.set(x, y);
    this.buildingLayer.scale.set(
      preview.config.worldSize.widthMeters / preview.config.alphaBounds.width,
      preview.config.worldSize.heightMeters / preview.config.alphaBounds.height,
    );
    this.buildingPlayer.setProgress(preview.progress);
    this.buildingPlayer.setOnionSkin(preview.onionSkinStageIndex);
    this.buildingPlayer.setHitboxVisible(preview.showHitbox);
  }

  private drawFallingTerrain(
    clusters: readonly FallingTerrainCluster[],
    cellSize: number,
    interpolationSeconds: number,
  ): void {
    this.fallingTerrain.clear();
    for (const material of [TerrainMaterialId.Soil, TerrainMaterialId.Rock] as const) {
      let drawn = false;
      for (const cluster of clusters) {
        const progress = Math.min(
          1,
          (cluster.elapsedSeconds + interpolationSeconds) / cluster.durationSeconds,
        );
        const horizontal = progress * progress * (3 - 2 * progress);
        const vertical = progress * progress;
        for (const cell of cluster.cells) {
          if (cell.material !== material) continue;
          this.fallingTerrain.rect(
            (cell.fromColumn + (cell.toColumn - cell.fromColumn) * horizontal) * cellSize,
            (cell.fromRow + (cell.toRow - cell.fromRow) * vertical) * cellSize,
            cellSize,
            cellSize,
          );
          drawn = true;
        }
      }
      if (drawn) {
        const [red, green, blue] = terrainMaterialVisuals[material].surface;
        this.fallingTerrain.fill((red << 16) | (green << 8) | blue);
      }
    }
  }

  markRendered(): void {
    this.terrain.markRendered();
  }

  destroy(): void {
    this.disposed = true;
    this.postProcessing.destroy();
    this.minimap.destroy();
    this.terrain.destroy();
    this.damagePopups.destroy();
    this.buildingPlayer?.destroy();
    this.buildingPlayer = null;
    this.frame.mask = null;
    this.parent.removeChild(this.frame, this.frameMask);
    this.frameMask.destroy();
    this.frame.destroy({ children: true });
  }
}
