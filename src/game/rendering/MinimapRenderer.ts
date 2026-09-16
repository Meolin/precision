import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { RtsController } from '../client/RtsController';
import type { GameRuntime } from '../core/GameRuntime';
import { hitboxCenter } from '../entities/Hitbox';
import { clamp } from '../math/Vec2';
import { minimapLayout } from './minimapViewport';
import { worldToScreen } from './viewport';

/** Screen-space overlay sharing the terrain texture, without a second terrain render. */
export class MinimapRenderer {
  readonly container = new Container();
  private background = new Graphics();
  private terrain = new Sprite();
  private units = new Graphics();
  private camera = new Graphics();
  private title = new Text({
    text: 'КАРТА',
    style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0xa9b9b8, letterSpacing: 1 },
  });
  private layoutKey = '';

  constructor() {
    this.container.eventMode = 'none';
    this.container.addChild(this.background, this.terrain, this.units, this.camera, this.title);
  }

  draw(
    runtime: GameRuntime,
    controls: RtsController,
    texture: Texture,
    width: number,
    height: number,
  ): void {
    const world = runtime.getConfig().world;
    const layout = minimapLayout(width, height, world);
    this.container.visible = layout !== null;
    if (!layout) return;
    const { panel, viewport } = layout;
    const key = `${width}:${height}:${world.widthMeters}:${world.heightMeters}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.background
        .clear()
        .roundRect(panel.x, panel.y, panel.width, panel.height, 5)
        .fill({ color: 0x101719, alpha: 0.96 })
        .stroke({ color: 0x566660, width: 1 })
        .rect(viewport.offsetX, viewport.offsetY, viewport.width, viewport.height)
        .fill(0x223037);
      this.title.position.set(panel.x + 8, panel.y + 6);
    }
    // TerrainLayer owns this texture and updates it after every terrain edit.
    this.terrain.texture = texture;
    this.terrain.position.set(viewport.offsetX, viewport.offsetY);
    this.terrain.width = viewport.width;
    this.terrain.height = viewport.height;

    this.units.clear();
    for (const unit of runtime.getState().units) {
      if (!unit.alive || unit.health.current <= 0) continue;
      const center = hitboxCenter(unit.position, unit.hitbox);
      if (
        center.x < 0 ||
        center.x > world.widthMeters ||
        center.y < 0 ||
        center.y > world.heightMeters
      )
        continue;
      const point = worldToScreen(center, viewport);
      this.units
        .circle(point.x, point.y, 2.5)
        .fill(unit.ownerPlayerId === controls.playerId ? 0xd5ec84 : 0xf5af73);
    }

    const camera = controls.camera.getViewport(width, height);
    const x = clamp(camera.worldX, 0, world.widthMeters);
    const y = clamp(camera.worldY, 0, world.heightMeters);
    const right = clamp(camera.worldX + camera.worldWidth, 0, world.widthMeters);
    const bottom = clamp(camera.worldY + camera.worldHeight, 0, world.heightMeters);
    const origin = worldToScreen({ x, y }, viewport);
    this.camera
      .clear()
      .rect(
        origin.x,
        origin.y,
        (right - x) * viewport.pixelsPerMeter,
        (bottom - y) * viewport.pixelsPerMeter,
      )
      .fill({ color: 0xd5ec84, alpha: 0.1 })
      .stroke({ color: 0xd5ec84, width: 1.5 });
  }

  destroy(): void {
    // Do not destroy the terrain texture: the main scene still owns it.
    this.container.destroy({ children: true });
  }
}
