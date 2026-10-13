import { Container, Graphics, Matrix, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { BuildingAnimationConfig } from './BuildingAnimationConfig';
import type { BuildingLightPlacement } from './BuildingAnimationLights';
import { animationStageSampler, animationStageVisible } from './BuildingAnimationParticles';
import { animationColor, animationResourceEnabled } from './BuildingAnimationTransform';
import type { TerrainGlowSource } from '../rendering/TerrainGlowSource';

interface Capture {
  copies: Map<Container, Container>;
  texture: RenderTexture | null;
  width: number;
  height: number;
}

/** Isolated alpha captures; never reparent or modify the visible resource. */
export class BuildingGlowMasks {
  private captures = new Map<string, Capture>();

  private sync(source: Container, capture: Capture, seen: Set<Container>): Container {
    seen.add(source);
    let copy = capture.copies.get(source);
    if (!copy) {
      copy =
        source instanceof Sprite
          ? new Sprite(source.texture)
          : source instanceof Graphics
            ? new Graphics(source.context)
            : new Container();
      capture.copies.set(source, copy);
    }
    if (source instanceof Sprite && copy instanceof Sprite) {
      copy.texture = source.texture;
      copy.anchor.copyFrom(source.anchor);
    } else if (source instanceof Graphics && copy instanceof Graphics)
      copy.context = source.context;
    copy.position.copyFrom(source.position);
    copy.scale.copyFrom(source.scale);
    copy.skew.copyFrom(source.skew);
    copy.pivot.copyFrom(source.pivot);
    copy.rotation = source.rotation;
    copy.alpha = source.alpha;
    copy.visible = source.visible;
    copy.blendMode = source.blendMode;
    // Stage-transition alpha masks are intrinsic to the image. Glow and other
    // decorative passes do not form part of the resource's source alpha.
    const intrinsic =
      source instanceof Sprite
        ? source.filters?.filter((filter) => filter.resources.transitionUniforms)
        : undefined;
    copy.filters = intrinsic?.length ? intrinsic : null;
    const children = source.children.map((child) => this.sync(child, capture, seen));
    if (
      copy.children.length !== children.length ||
      copy.children.some((child, i) => child !== children[i])
    ) {
      copy.removeChildren();
      for (const child of children) copy.addChild(child);
    }
    return copy;
  }

  collect(
    renderer: Renderer,
    config: BuildingAnimationConfig,
    progress: number,
    placement: BuildingLightPlacement,
    resourceFor: (id: string) => Container | undefined,
  ): TerrainGlowSource[] {
    const result: TerrainGlowSource[] = [];
    const active = new Set<string>();
    for (const stage of config.stages) {
      if (
        stage.kind !== 'filter' ||
        stage.filterType !== 'glow' ||
        !animationStageVisible(stage, progress) ||
        !animationResourceEnabled(config, stage)
      )
        continue;
      const source = config.stages.find((item) => item.id === stage.parentId);
      const resource = source ? resourceFor(source.id) : undefined;
      if (!source || !resource?.visible || !animationResourceEnabled(config, source)) continue;
      const sample = animationStageSampler(config, stage);
      const value = (property: Parameters<typeof sample>[0]) => sample(property, progress);
      const strength = value('fxStrength');
      const opacity = value('opacity') * placement.opacity;
      if (!(strength > 0 && opacity > 0)) continue;
      active.add(stage.id);
      let capture = this.captures.get(stage.id);
      if (!capture) {
        capture = { copies: new Map(), texture: null, width: 0, height: 0 };
        this.captures.set(stage.id, capture);
      }
      const seen = new Set<Container>();
      const copy = this.sync(resource, capture, seen);
      for (const [original, stale] of capture.copies)
        if (!seen.has(original)) {
          stale.destroy();
          capture.copies.delete(original);
        }
      // Root transforms belong in worldToMask, not in the captured local texture.
      copy.position.set(0, 0);
      copy.scale.set(1, 1);
      copy.skew.set(0, 0);
      copy.pivot.set(0, 0);
      copy.rotation = 0;
      if (!(resource instanceof Sprite)) {
        const sourceSample = animationStageSampler(config, source);
        copy.alpha = sourceSample('opacity', progress);
      }
      const frame = copy.getLocalBounds().rectangle.clone();
      if (!(frame.width > 0 && frame.height > 0 && copy.alpha > 0)) continue;
      const neededWidth = Math.ceil(frame.width),
        neededHeight = Math.ceil(frame.height);
      if (!capture.texture || neededWidth > capture.width || neededHeight > capture.height) {
        const width = Math.max(neededWidth, capture.width * 2),
          height = Math.max(neededHeight, capture.height * 2);
        capture.texture?.destroy(true);
        capture.texture = RenderTexture.create({
          width,
          height,
          resolution: Math.min(1, 1024 / Math.max(width, height)),
          antialias: false,
        });
        capture.width = width;
        capture.height = height;
      }
      const width = capture.width,
        height = capture.height;
      renderer.render({
        container: copy,
        target: capture.texture,
        transform: new Matrix().translate(-frame.x, -frame.y),
        clear: true,
        clearColor: [0, 0, 0, 0],
      });
      resource.updateLocalTransform();
      const local = resource.localTransform;
      const [sx, sy] = placement.scale;
      const world = new Matrix(
        local.a * sx,
        local.b * sy,
        local.c * sx,
        local.d * sy,
        placement.position[0] + local.tx * sx,
        placement.position[1] + local.ty * sy,
      );
      if (Math.abs(world.a * world.d - world.b * world.c) < 1e-10) continue;
      const inverse = world.clone().invert();
      const radius = value('fxRadius');
      const haloBasis: TerrainGlowSource['haloBasis'] =
        stage.coordinateSpace === 'local'
          ? [world.a * radius, world.b * radius, world.c * radius, world.d * radius]
          : [sx * radius, 0, 0, sy * radius];
      const corners = [
        world.apply({ x: frame.x, y: frame.y }),
        world.apply({ x: frame.x + neededWidth, y: frame.y }),
        world.apply({ x: frame.x, y: frame.y + neededHeight }),
        world.apply({ x: frame.x + neededWidth, y: frame.y + neededHeight }),
      ];
      const padX = Math.hypot(haloBasis[0], haloBasis[2]),
        padY = Math.hypot(haloBasis[1], haloBasis[3]);
      const x = Math.min(...corners.map((point) => point.x)) - padX;
      const y = Math.min(...corners.map((point) => point.y)) - padY;
      result.push({
        mask: capture.texture,
        worldToMask: [
          inverse.a / width,
          inverse.b / height,
          inverse.c / width,
          inverse.d / height,
          (inverse.tx - frame.x) / width,
          (inverse.ty - frame.y) / height,
        ],
        haloBasis,
        bounds: [
          x,
          y,
          Math.max(...corners.map((point) => point.x)) + padX - x,
          Math.max(...corners.map((point) => point.y)) + padY - y,
        ],
        strength,
        opacity,
        color: animationColor(value),
      });
    }
    for (const [id, capture] of this.captures)
      if (!active.has(id)) {
        this.destroyCapture(capture);
        this.captures.delete(id);
      }
    return result;
  }

  private destroyCapture(capture: Capture) {
    for (const copy of capture.copies.values()) if (!copy.destroyed) copy.destroy();
    capture.texture?.destroy(true);
  }

  destroy(): void {
    for (const capture of this.captures.values()) this.destroyCapture(capture);
    this.captures.clear();
  }
}
