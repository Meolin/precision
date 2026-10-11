import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import type { GameRuntime } from '../../game/core/GameRuntime';
import type { RtsController } from '../../game/client/RtsController';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import type {
  BuildingAnimationConfig,
  BuildingAnimationStage,
  BuildingAnimationTrackProperty,
} from '../../game/buildings/BuildingAnimationConfig';
import { animationFilterCatalog } from '../../game/buildings/BuildingAnimationEffects';
import {
  animationResourceEnabled,
  effectOrigin,
  inverseAnimationPoint,
  resourceMatrix,
  transformAnimationPoint,
} from '../../game/buildings/BuildingAnimationTransform';
import { worldToScreen } from '../../game/rendering/viewport';
import { editAnimationValue, sampleAnimationStage } from './AnimationEditing';
interface Props {
  preview: BuildingAnimationPreview;
  runtime: GameRuntime;
  controls: RtsController;
  selectedId?: string;
  placing: boolean;
  visible: boolean;
  snap: boolean;
  autoKey: boolean;
  onSelect: (index: number) => void;
  onPause: () => void;
  onRemember: (config: BuildingAnimationConfig) => void;
  onConfig: (config: BuildingAnimationConfig) => void;
}
type Handle =
  | 'origin'
  | 'fxRadius'
  | 'fxEmitterRadius'
  | 'fxEmitterWidth'
  | 'fxEmitterHeight'
  | 'fxDirection'
  | 'fxSpread';
export function AnimationOriginOverlay(props: Props) {
  const svg = useRef<SVGSVGElement>(null),
    current = useRef(props);
  current.current = props;
  const drag = useRef<{
    pointerId: number;
    stageId: string;
    handle: Handle;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    config: BuildingAnimationConfig;
    progress: number;
    recorded: boolean;
  } | null>(null);
  const project = useCallback(
    (config: BuildingAnimationConfig, point: { x: number; y: number }) => {
      const { preview, runtime, controls } = current.current,
        rect = svg.current!.getBoundingClientRect(),
        viewport = controls.camera.getViewport(rect.width, rect.height);
      const x = preview.position?.x ?? runtime.getConfig().world.widthMeters * 0.5,
        y = preview.position?.y ?? runtime.getState().terrain.findSurfaceY(x) ?? 0;
      return worldToScreen(
        {
          x:
            x +
            ((point.x - config.origin.x) * config.worldSize.widthMeters) / config.alphaBounds.width,
          y:
            y +
            ((point.y - config.origin.y) * config.worldSize.heightMeters) /
              config.alphaBounds.height,
        },
        viewport,
      );
    },
    [],
  );
  const unproject = (config: BuildingAnimationConfig, clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect(),
      a = project(config, { x: 0, y: 0 }),
      b = project(config, { x: 1, y: 1 });
    return {
      x: (clientX - rect.left - a.x) / (b.x - a.x),
      y: (clientY - rect.top - a.y) / (b.y - a.y),
    };
  };
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const root = svg.current;
      if (root) {
        const { preview, visible, selectedId } = current.current,
          config = preview.config;
        root.querySelectorAll<SVGGElement>('[data-origin-id]').forEach((element) => {
          const stage = config.stages.find((item) => item.id === element.dataset.originId),
            point = stage ? effectOrigin(config, stage, preview.progress) : config.origin,
            screen = project(config, point);
          element.setAttribute('transform', `translate(${screen.x} ${screen.y})`);
          element.style.visibility =
            visible && preview.visible && (!stage || !stage.hidden) ? 'visible' : 'hidden';
          if (!stage || stage.id !== selectedId) return;
          const sampled = sampleAnimationStage(config, stage.id, preview.progress)!,
            matrix = resourceMatrix(
              config,
              stage.kind === 'filter' ? stage.parentId! : stage.id,
              preview.progress,
            );
          const local = (p: { x: number; y: number }) =>
            stage.kind === 'filter' && stage.coordinateSpace !== 'local'
              ? { x: point.x + p.x, y: point.y + p.y }
              : stage.kind === 'filter'
                ? transformAnimationPoint(matrix, { x: sampled.x + p.x, y: sampled.y + p.y })
                : transformAnimationPoint(matrix, p);
          const delta = (p: { x: number; y: number }) => {
            const q = project(config, local(p));
            return { x: q.x - screen.x, y: q.y - screen.y };
          };
          const radius =
            stage.kind === 'particles' ? (sampled.fxEmitterRadius ?? 30) : (sampled.fxRadius ?? 80);
          const set = (handle: Handle, p: { x: number; y: number }) => {
            const circle = element.querySelector<SVGCircleElement>(`[data-handle="${handle}"]`),
              q = delta(p);
            circle?.setAttribute('cx', String(q.x));
            circle?.setAttribute('cy', String(q.y));
          };
          set(stage.kind === 'particles' ? 'fxEmitterRadius' : 'fxRadius', { x: radius, y: 0 });
          set('fxEmitterWidth', { x: (sampled.fxEmitterWidth ?? 100) / 2, y: 0 });
          set('fxEmitterHeight', { x: 0, y: (sampled.fxEmitterHeight ?? 60) / 2 });
          const angle = ((sampled.fxDirection ?? -90) * Math.PI) / 180,
            spread = ((sampled.fxSpread ?? 70) * Math.PI) / 360;
          const length = 70,
            dir = { x: Math.cos(angle) * length, y: Math.sin(angle) * length },
            edge = { x: Math.cos(angle + spread) * length, y: Math.sin(angle + spread) * length },
            edge2 = { x: Math.cos(angle - spread) * length, y: Math.sin(angle - spread) * length };
          set('fxDirection', dir);
          set('fxSpread', edge);
          const d = delta(dir),
            e = delta(edge),
            e2 = delta(edge2);
          element
            .querySelector('[data-direction]')
            ?.setAttribute('d', `M 0 0 L ${d.x} ${d.y} M ${e.x} ${e.y} L 0 0 L ${e2.x} ${e2.y}`);
          let points: { x: number; y: number }[] = [];
          if (stage.kind !== 'particles' || stage.emitterShape === 'circle')
            points = Array.from({ length: 49 }, (_, i) => ({
              x: Math.cos((i * Math.PI) / 24) * radius,
              y: Math.sin((i * Math.PI) / 24) * radius,
            }));
          if (stage.emitterShape === 'line')
            points = [
              { x: -(sampled.fxEmitterWidth ?? 100) / 2, y: 0 },
              { x: (sampled.fxEmitterWidth ?? 100) / 2, y: 0 },
            ];
          if (stage.emitterShape === 'rectangle') {
            const w = (sampled.fxEmitterWidth ?? 100) / 2,
              h = (sampled.fxEmitterHeight ?? 60) / 2;
            points = [
              { x: -w, y: -h },
              { x: w, y: -h },
              { x: w, y: h },
              { x: -w, y: h },
              { x: -w, y: -h },
            ];
          }
          element.querySelector('[data-shape]')?.setAttribute(
            'd',
            points
              .map((p, i) => {
                const q = delta(p);
                return `${i ? 'L' : 'M'} ${q.x} ${q.y}`;
              })
              .join(' '),
          );
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [project]);
  const start = (
    event: PointerEvent<SVGElement>,
    stage: BuildingAnimationStage,
    handle: Handle,
  ) => {
    if (event.button !== 0 || props.placing || stage.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const config = props.preview.config,
      sampled = sampleAnimationStage(config, stage.id, props.preview.progress)!;
    drag.current = {
      pointerId: event.pointerId,
      stageId: stage.id,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      x: sampled.x,
      y: sampled.y,
      config: structuredClone(config),
      progress: props.preview.progress,
      recorded: false,
    };
    props.onPause();
    props.onSelect(config.stages.findIndex((item) => item.id === stage.id));
    svg.current!.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (
      !active.recorded &&
      Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) < 2
    )
      return;
    const config = structuredClone(active.config),
      stage = config.stages.find((item) => item.id === active.stageId)!,
      origin = effectOrigin(config, stage, active.progress);
    const point = unproject(config, event.clientX, event.clientY),
      startPoint = unproject(config, active.clientX, active.clientY);
    const edit = (property: BuildingAnimationTrackProperty, value: number) =>
      editAnimationValue(
        config,
        stage.id,
        property,
        value,
        active.progress,
        props.snap,
        props.autoKey,
      );
    if (active.handle === 'origin') {
      let delta = { x: point.x - startPoint.x, y: point.y - startPoint.y };
      if (stage.kind === 'filter' && stage.coordinateSpace === 'local') {
        const matrix = resourceMatrix(config, stage.parentId!, active.progress),
          a = inverseAnimationPoint(matrix, startPoint),
          b = inverseAnimationPoint(matrix, point);
        delta = { x: b.x - a.x, y: b.y - a.y };
      }
      edit('x', active.x + delta.x);
      edit('y', active.y + delta.y);
    } else {
      let relative = { x: point.x - origin.x, y: point.y - origin.y };
      if (stage.kind !== 'filter' || stage.coordinateSpace === 'local') {
        const matrix = resourceMatrix(
            config,
            stage.kind === 'filter' ? stage.parentId! : stage.id,
            active.progress,
          ),
          a = inverseAnimationPoint(matrix, origin),
          b = inverseAnimationPoint(matrix, point);
        relative = { x: b.x - a.x, y: b.y - a.y };
      }
      if (active.handle === 'fxDirection')
        edit('fxDirection', (Math.atan2(relative.y, relative.x) * 180) / Math.PI);
      else if (active.handle === 'fxSpread') {
        const sampled = sampleAnimationStage(config, stage.id, active.progress)!,
          angle =
            (Math.atan2(relative.y, relative.x) * 180) / Math.PI - (sampled.fxDirection ?? -90);
        const wrapped = ((angle + 540) % 360) - 180;
        edit('fxSpread', Math.abs(wrapped) * 2);
      } else
        edit(
          active.handle,
          active.handle === 'fxEmitterWidth'
            ? Math.abs(relative.x) * 2
            : active.handle === 'fxEmitterHeight'
              ? Math.abs(relative.y) * 2
              : Math.hypot(relative.x, relative.y),
        );
    }
    if (!active.recorded) {
      props.onRemember(active.config);
      active.recorded = true;
    }
    props.onConfig(config);
  };
  const finish = () => {
    drag.current = null;
  };
  const stages = props.preview.config.stages
    .filter(
      (stage) =>
        stage.kind === 'particles' ||
        stage.kind === 'light' ||
        stage.kind === 'ring' ||
        (stage.kind === 'filter' && animationFilterCatalog[stage.filterType!]?.center),
    )
    .sort((a, b) => Number(a.id === props.selectedId) - Number(b.id === props.selectedId));
  return (
    <svg
      ref={svg}
      className={`animation-origin-overlay ${props.placing ? 'is-placing' : ''}`}
      aria-label="Animation emitter origins"
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      <g data-origin-id="" className="animation-composition-origin">
        <path d="M -8 0 H 8 M 0 -8 V 8" />
        <text x="12" y="-10">
          ORIGIN
        </text>
      </g>
      {stages.map((stage) => {
        const selected = stage.id === props.selectedId;
        const handles: Handle[] =
          stage.kind === 'particles'
            ? [
                'fxDirection',
                'fxSpread',
                ...(stage.emitterShape === 'circle'
                  ? ['fxEmitterRadius' as const]
                  : stage.emitterShape === 'line'
                    ? ['fxEmitterWidth' as const]
                    : stage.emitterShape === 'rectangle'
                      ? ['fxEmitterWidth' as const, 'fxEmitterHeight' as const]
                      : []),
              ]
            : ['fxRadius'];
        return (
          <g
            key={stage.id}
            data-origin-id={stage.id}
            className={`animation-emitter-handle ${selected ? 'is-selected' : ''} ${!animationResourceEnabled(props.preview.config, stage) || props.preview.progress < stage.inPoint || props.preview.progress > stage.outPoint ? 'is-inactive' : ''} ${stage.locked ? 'is-locked' : ''}`}
          >
            {selected ? (
              <>
                <path data-shape="" className="animation-emitter-shape" />
                <path
                  data-direction=""
                  className="animation-emitter-shape"
                  style={{ display: stage.kind === 'particles' ? '' : 'none' }}
                />
                {handles.map((handle) => (
                  <circle
                    key={handle}
                    data-handle={handle}
                    className="animation-parameter-handle"
                    r="6"
                    role="button"
                    tabIndex={stage.locked || !props.visible ? -1 : 0}
                    aria-label={`${stage.name} ${handle}`}
                    onPointerDown={(event) => start(event, stage, handle)}
                    onKeyDown={(event) => {
                      if (
                        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
                        stage.locked
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const config = structuredClone(props.preview.config),
                        sampled = sampleAnimationStage(config, stage.id, props.preview.progress)!,
                        value =
                          (sampled[handle as BuildingAnimationTrackProperty] ?? 0) +
                          (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) *
                            (event.shiftKey ? 10 : 1);
                      props.onPause();
                      props.onRemember(config);
                      editAnimationValue(
                        config,
                        stage.id,
                        handle as BuildingAnimationTrackProperty,
                        value,
                        props.preview.progress,
                        props.snap,
                        props.autoKey,
                      );
                      props.onConfig(config);
                    }}
                  >
                    <title>{handle} · drag / arrow keys</title>
                  </circle>
                ))}
              </>
            ) : null}
            <g
              role="button"
              tabIndex={
                props.placing || !props.visible || !props.preview.visible || stage.locked ? -1 : 0
              }
              aria-label={`Move ${stage.name} origin`}
              onPointerDown={(event) => start(event, stage, 'origin')}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
                  stage.locked
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                props.onPause();
                props.onSelect(
                  props.preview.config.stages.findIndex((item) => item.id === stage.id),
                );
                const config = structuredClone(props.preview.config),
                  sampled = sampleAnimationStage(config, stage.id, props.preview.progress)!,
                  property = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y',
                  delta =
                    (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) *
                    (event.shiftKey ? 10 : 1);
                props.onRemember(config);
                editAnimationValue(
                  config,
                  stage.id,
                  property,
                  sampled[property] + delta,
                  props.preview.progress,
                  props.snap,
                  props.autoKey,
                );
                props.onConfig(config);
              }}
            >
              <title>{stage.name} · drag origin · arrow keys</title>
              <circle className="animation-emitter-hit" r="15" />
              <circle r="7" />
              <path d="M -12 0 H 12 M 0 -12 V 12" />
              <text x="18" y="-12">
                {stage.kind === 'particles' ? 'EMITTER' : 'ORIGIN'} · {stage.name}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
