import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { AnimationEditorSession } from './AnimationEditorSession';
import {
  buildingAnimationTrackProperties,
  type BuildingAnimationConfig,
  type BuildingAnimationKeyframe,
  type BuildingAnimationStage,
  type BuildingAnimationTrackProperty,
  type BuildingKeyInterpolation,
} from '../../game/buildings/BuildingAnimationConfig';
import {
  defaultTrackValue,
  sampleBuildingTrack,
} from '../../game/buildings/BuildingAnimationKeyframes';
import { NumericInput } from './EditorInput';
import {
  animationKeyBezier,
  moveAnimationBezierHandle,
  moveAnimationGraphPoint,
  setAnimationKeyInterpolation,
} from './AnimationGraphEditing';
import {
  editAnimationValue,
  snapAnimationTime as snapTime,
  constrainAnimationValue as constrainValue,
  minimumAnimationDuration,
  resizeAnimationDuration,
} from './AnimationEditing';
import {
  animationEffectParameters,
  effectParameter,
  type AnimationEffectProperty,
  particleTailSeconds,
  animationLayerEntries,
  isImageStage,
  reorderAnimationLayer,
  stageTrackProperties,
  canRemoveAnimationLayers,
} from '../../game/buildings/BuildingAnimationEffects';
import { moveAnimationClip } from './AnimationEffectEditing';
import { AnimationLayerDeleteButton } from './AnimationLayerDeleteButton';

interface Props {
  session: AnimationEditorSession;
  animationId: string;
  zoom: number;
  onZoom: (zoom: number) => void;
  linkedScroll?: number;
  onScroll: (left: number) => void;
  config: BuildingAnimationConfig;
  stage: BuildingAnimationStage | undefined;
  progress: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  onConfig: (config: BuildingAnimationConfig, progress?: number) => void;
  onProgress: (progress: number) => void;
  onSelectStage: (index: number) => void;
  onRemoveLayer: (id: string) => void;
  onPlaying: (playing: boolean) => void;
  onLoop: (loop: boolean) => void;
  onSpeed: (speed: number) => void;
  snap: boolean;
  onSnap: (snap: boolean) => void;
  autoKey: boolean;
  onAutoKey: (autoKey: boolean) => void;
  onRemember: (config?: BuildingAnimationConfig) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type SelectedKey = { stageId: string; property: BuildingAnimationTrackProperty; id: string };
type ClipboardKey = Omit<BuildingAnimationKeyframe, 'id' | 'time'> & {
  stageId: string;
  property: BuildingAnimationTrackProperty;
  offset: number;
};
type KeyDrag = {
  pointerId: number;
  startX: number;
  width: number;
  config: BuildingAnimationConfig;
  selected: SelectedKey[];
  recorded: boolean;
};
type MarkerDrag = {
  pointerId: number;
  startX: number;
  width: number;
  config: BuildingAnimationConfig;
  index: number;
  recorded: boolean;
};
type LayerDrag = {
  pointerId: number;
  startX: number;
  width: number;
  stageId: string;
  mode: 'move' | 'trim' | 'trim-start';
  config: BuildingAnimationConfig;
  recorded: boolean;
};
type MarqueeDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  base: SelectedKey[];
};
type WorkDrag = {
  pointerId: number;
  side: 'start' | 'end';
  width: number;
  left: number;
  config: BuildingAnimationConfig;
  recorded: boolean;
};
type GraphDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  stageId: string;
  property: BuildingAnimationTrackProperty;
  keyId: string;
  min: number;
  range: number;
  config: BuildingAnimationConfig;
  recorded: boolean;
};
type HandleDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  min: number;
  range: number;
  stageId: string;
  property: BuildingAnimationTrackProperty;
  keyId: string;
  handle: 0 | 1;
  config: BuildingAnimationConfig;
  recorded: boolean;
};

const labelWidth = 340;
const propertyGroups: BuildingAnimationTrackProperty[][] = [
  ['x', 'y'],
  ['scaleX', 'scaleY'],
  ['rotation'],
  ['opacity'],
  ['skewX', 'skewY'],
  ['pivotX', 'pivotY'],
  ...Object.keys(animationEffectParameters).map((property) => [
    property as BuildingAnimationTrackProperty,
  ]),
];
const groupLabels = [
  'Position',
  'Scale',
  'Rotation',
  'Opacity',
  'Skew',
  'Anchor',
  ...Object.values(animationEffectParameters).map((parameter) => parameter.label),
];
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const propertyLabels: Record<BuildingAnimationTrackProperty, string> = {
  x: 'X Position',
  y: 'Y Position',
  scaleX: 'X Scale',
  scaleY: 'Y Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
  skewX: 'X Skew',
  skewY: 'Y Skew',
  pivotX: 'X Anchor',
  pivotY: 'Y Anchor',
  ...Object.fromEntries(
    Object.entries(animationEffectParameters).map(([property, parameter]) => [
      property,
      parameter.label,
    ]),
  ),
} as Record<BuildingAnimationTrackProperty, string>;
const interpolationLabels: Record<BuildingKeyInterpolation, string> = {
  step: 'Hold',
  linear: 'Linear',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Easy Ease',
  'cubic-bezier': 'Custom Bézier',
};
const defaultBezier: [number, number, number, number] = [0.4, 0, 0.2, 1];

function frameStep(config: BuildingAnimationConfig): number {
  return 1 / (config.timeline.durationSeconds * config.timeline.frameRate);
}

function timecode(progress: number, config: BuildingAnimationConfig): string {
  const frame = Math.round(progress * config.timeline.durationSeconds * config.timeline.frameRate);
  const fps = config.timeline.frameRate;
  const seconds = Math.floor(frame / fps);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}:${two(frame % fps)}`;
}

function sameKey(left: SelectedKey, right: SelectedKey): boolean {
  return left.stageId === right.stageId && left.property === right.property && left.id === right.id;
}

export function KeyframeTimeline(props: Props) {
  const view = props.session.view(props.animationId);
  const [property, setProperty] = useState<BuildingAnimationTrackProperty>(view.property);
  const [selectedKeys, setSelectedKeys] = useState<SelectedKey[]>(view.selectedKeys);
  const [expanded, setExpanded] = useState<string[]>(view.expanded);
  const [animatedOnly, setAnimatedOnly] = useState(view.animatedOnly);
  const [graphMode, setGraphMode] = useState(view.graphMode);
  const [graphViewport, setGraphViewport] = useState<{
    stageId: string;
    property: BuildingAnimationTrackProperty;
    min: number;
    range: number;
  } | null>(null);
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null);
  const [stageNameDraft, setStageNameDraft] = useState('');
  const renameCancelled = useRef(false);
  const { zoom, onZoom: setZoom } = props;
  const snap = props.snap;
  const [trackWidth, setTrackWidth] = useState(480);
  const [clipboard, setClipboardState] = useState<ClipboardKey[]>(props.session.clipboard);
  const setClipboard = (keys: ClipboardKey[]) => {
    props.session.clipboard = keys;
    setClipboardState(keys);
  };
  const authoredConfig = useRef<BuildingAnimationConfig | null>(null);
  const keyDrag = useRef<KeyDrag | null>(null);
  const markerDrag = useRef<MarkerDrag | null>(null);
  const layerDrag = useRef<LayerDrag | null>(null);
  const marqueeDrag = useRef<MarqueeDrag | null>(null);
  const draggedLayerId = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const workDrag = useRef<WorkDrag | null>(null);
  const graphDrag = useRef<GraphDrag | null>(null);
  const handleDrag = useRef<HandleDrag | null>(null);
  const rulerPointer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element?.clientWidth || trackWidth !== Math.max(160, element.clientWidth - labelWidth))
      return;
    if (!restoredScroll.current) {
      element.scrollTop = view.scrollTop;
      element.scrollLeft = props.linkedScroll ?? view.scrollLeft;
      restoredScroll.current = true;
    }
    if (
      element &&
      props.linkedScroll !== undefined &&
      Math.abs(element.scrollLeft - props.linkedScroll) > 1
    )
      element.scrollLeft = props.linkedScroll;
  }, [props.linkedScroll, trackWidth, view]);
  useEffect(() => {
    Object.assign(view, { property, selectedKeys, expanded, animatedOnly, graphMode, zoom });
  }, [view, property, selectedKeys, expanded, animatedOnly, graphMode, zoom]);
  const lastConfig = useRef(props.config);
  const activeStage = props.stage ?? props.config.stages[0];
  const activeStageId = activeStage?.id;
  useEffect(() => {
    if (activeStage && !stageTrackProperties(activeStage).includes(property))
      setProperty(stageTrackProperties(activeStage)[0]!);
  }, [activeStage, property]);
  useEffect(() => {
    if (lastConfig.current === props.config) return;
    lastConfig.current = props.config;
    if (authoredConfig.current === props.config) {
      authoredConfig.current = null;
      return;
    }
    setSelectedKeys([]);
    graphDrag.current = null;
    handleDrag.current = null;
    setGraphViewport(null);
  }, [props.config]);
  const duration = props.config.timeline.durationSeconds;
  const fps = props.config.timeline.frameRate;
  const sheetWidth = labelWidth + trackWidth * zoom;
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const resize = () => {
      if (element.clientWidth) setTrackWidth(Math.max(160, element.clientWidth - labelWidth));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const trackFor = (stageId: string, item: BuildingAnimationTrackProperty) =>
    props.config.tracks.find((track) => track.stageId === stageId && track.property === item);
  const selectedLast = selectedKeys.at(-1);
  const selectedTrack = selectedLast
    ? trackFor(selectedLast.stageId, selectedLast.property)
    : undefined;
  const selectedKey = selectedTrack?.keys.find((key) => key.id === selectedLast?.id);

  const remember = (config = props.config) => {
    props.onRemember(config);
  };
  const emitConfig = (config: BuildingAnimationConfig, progress?: number) => {
    authoredConfig.current = config;
    props.onConfig(config, progress);
  };
  const commit = (config: BuildingAnimationConfig, progress?: number) => {
    finishGraphDrag();
    remember();
    emitConfig(config, progress);
  };
  const undo = () => {
    finishGraphDrag();
    setSelectedKeys([]);
    props.onUndo();
  };
  const redo = () => {
    finishGraphDrag();
    setSelectedKeys([]);
    props.onRedo();
  };

  const selectStage = (index: number) => {
    if (index < 0) return;
    props.onSelectStage(index);
  };
  const toggleExpanded = (stageId: string) =>
    setExpanded((current) =>
      current.includes(stageId) ? current.filter((id) => id !== stageId) : [...current, stageId],
    );
  const renameStage = (stageId: string) => {
    const name = stageNameDraft.trim();
    setRenamingStageId(null);
    if (renameCancelled.current) return;
    if (!name || name === props.config.stages.find((stage) => stage.id === stageId)?.name) return;
    const config = structuredClone(props.config);
    const stage = config.stages.find((candidate) => candidate.id === stageId);
    if (!stage || stage.locked) return;
    stage.name = name;
    commit(config);
  };

  const addKey = (stageId: string, item: BuildingAnimationTrackProperty, at = props.progress) => {
    const stage = props.config.stages.find((candidate) => candidate.id === stageId);
    if (!stage || stage.locked || !stageTrackProperties(stage).includes(item)) return;
    const time = snapTime(at, props.config, snap);
    const existing = trackFor(stageId, item)?.keys.find(
      (key) => Math.abs(key.time - time) < 0.00001,
    );
    if (existing) {
      setSelectedKeys([{ stageId, property: item, id: existing.id }]);
      return;
    }
    const config = structuredClone(props.config);
    let track = config.tracks.find(
      (candidate) => candidate.stageId === stageId && candidate.property === item,
    );
    if (!track) {
      track = { stageId, property: item, keys: [] };
      config.tracks.push(track);
    }
    const key: BuildingAnimationKeyframe = {
      id: `key-${crypto.randomUUID()}`,
      time,
      value: sampleBuildingTrack(trackFor(stageId, item), time, defaultTrackValue(stage, item)),
      interpolation: 'linear',
      bezier: [...defaultBezier],
    };
    track.keys.push(key);
    track.keys.sort((left, right) => left.time - right.time);
    setProperty(item);
    setSelectedKeys([{ stageId, property: item, id: key.id }]);
    commit(config);
  };

  const toggleKey = (stageId: string, item: BuildingAnimationTrackProperty) => {
    if (props.config.stages.find((stage) => stage.id === stageId)?.locked) return;
    const track = trackFor(stageId, item);
    const at = snapTime(props.progress, props.config, snap);
    const existing = track?.keys.find((key) => Math.abs(key.time - at) < 0.00001);
    if (!existing) return addKey(stageId, item);
    const config = structuredClone(props.config);
    const target = config.tracks.find(
      (candidate) => candidate.stageId === stageId && candidate.property === item,
    )!;
    target.keys = target.keys.filter((key) => key.id !== existing.id);
    config.tracks = config.tracks.filter((candidate) => candidate.keys.length > 0);
    setSelectedKeys((current) => current.filter((key) => key.id !== existing.id));
    commit(config);
  };

  const toggleAnimation = (stageId: string, item: BuildingAnimationTrackProperty) => {
    const stage = props.config.stages.find((candidate) => candidate.id === stageId);
    if (!stage || stage.locked) return;
    const track = trackFor(stageId, item);
    if (!track) return addKey(stageId, item);
    const config = structuredClone(props.config);
    const target = config.stages.find((candidate) => candidate.id === stageId)!;
    target[item] = constrainValue(
      item,
      sampleBuildingTrack(track, props.progress, defaultTrackValue(stage, item)),
      stage,
    );
    config.tracks = config.tracks.filter(
      (candidate) => candidate.stageId !== stageId || candidate.property !== item,
    );
    setSelectedKeys((current) =>
      current.filter((key) => key.stageId !== stageId || key.property !== item),
    );
    commit(config);
  };

  const editProperty = (stageId: string, item: BuildingAnimationTrackProperty, value: number) => {
    if (!Number.isFinite(value)) return;
    const config = structuredClone(props.config);
    editAnimationValue(config, stageId, item, value, props.progress, snap, props.autoKey);
    const time = snapTime(props.progress, props.config, snap);
    const key = config.tracks
      .find((track) => track.stageId === stageId && track.property === item)
      ?.keys.find((candidate) => Math.abs(candidate.time - time) < 0.00001);
    setSelectedKeys(key ? [{ stageId, property: item, id: key.id }] : []);
    commit(config);
  };

  const deleteKeys = () => {
    if (!selectedKeys.length) return;
    if (
      selectedKeys.some(
        (key) => props.config.stages.find((stage) => stage.id === key.stageId)?.locked,
      )
    )
      return;
    const config = structuredClone(props.config);
    for (const track of config.tracks)
      track.keys = track.keys.filter(
        (key) =>
          !selectedKeys.some((selected) =>
            sameKey(selected, { stageId: track.stageId, property: track.property, id: key.id }),
          ),
      );
    config.tracks = config.tracks.filter((track) => track.keys.length > 0);
    setSelectedKeys([]);
    commit(config);
  };

  const changeSelected = (
    update: (key: BuildingAnimationKeyframe, item: BuildingAnimationTrackProperty) => void,
  ) => {
    if (!selectedKeys.length) return;
    if (
      selectedKeys.some(
        (key) => props.config.stages.find((stage) => stage.id === key.stageId)?.locked,
      )
    )
      return;
    const config = structuredClone(props.config);
    for (const track of config.tracks) {
      for (const key of track.keys)
        if (
          selectedKeys.some((selected) =>
            sameKey(selected, { stageId: track.stageId, property: track.property, id: key.id }),
          )
        )
          update(key, track.property);
      track.keys.sort((left, right) => left.time - right.time);
    }
    commit(config);
  };
  const changeSelectedTime = (seconds: number) => {
    if (!selectedKey || !selectedLast || selectedKeys.length !== 1) return;
    const time = snapTime(seconds / duration, props.config, snap);
    if (
      selectedTrack?.keys.some(
        (key) => key.id !== selectedKey.id && Math.abs(key.time - time) < 0.00001,
      )
    )
      return;
    changeSelected((key) => (key.time = time));
  };

  const jumpProperty = (
    stageId: string,
    item: BuildingAnimationTrackProperty,
    direction: -1 | 1,
  ) => {
    const keys = trackFor(stageId, item)?.keys ?? [];
    const next =
      direction < 0
        ? keys.filter((key) => key.time < props.progress - 0.00001).at(-1)
        : keys.find((key) => key.time > props.progress + 0.00001);
    if (!next) return;
    selectStage(props.config.stages.findIndex((stage) => stage.id === stageId));
    setProperty(item);
    setSelectedKeys([{ stageId, property: item, id: next.id }]);
    props.onProgress(next.time);
  };
  const jumpAll = (direction: -1 | 1) => {
    const times = [
      ...new Set([
        props.config.timeline.workAreaStart,
        props.config.timeline.workAreaEnd,
        ...props.config.stages.map((stage) => stage.milestone),
        ...props.config.markers.map((marker) => marker.time),
        ...props.config.tracks.flatMap((track) => track.keys.map((key) => key.time)),
      ]),
    ].sort((left, right) => left - right);
    const next =
      direction < 0
        ? times.filter((time) => time < props.progress - 0.00001).at(-1)
        : times.find((time) => time > props.progress + 0.00001);
    if (next !== undefined) props.onProgress(next);
  };

  const copyKeys = () => {
    const found = selectedKeys.flatMap((selected) => {
      const key = trackFor(selected.stageId, selected.property)?.keys.find(
        (candidate) => candidate.id === selected.id,
      );
      return key ? [{ ...selected, key }] : [];
    });
    if (!found.length) return;
    const earliest = Math.min(...found.map((item) => item.key.time));
    setClipboard(
      found.map(({ stageId, property: item, key }) => ({
        stageId,
        property: item,
        offset: key.time - earliest,
        value: key.value,
        interpolation: key.interpolation,
        bezier: [...key.bezier],
      })),
    );
  };
  const cutKeys = () => {
    if (!selectedKeys.length) return;
    copyKeys();
    deleteKeys();
  };
  const pasteKeys = () => {
    if (!clipboard.length) return;
    const config = structuredClone(props.config);
    const singleSource = new Set(clipboard.map((item) => item.stageId)).size === 1;
    const pasted: SelectedKey[] = [];
    for (const item of clipboard) {
      const stageId = singleSource ? (activeStageId ?? item.stageId) : item.stageId;
      if (
        !config.stages.some(
          (stage) =>
            stage.id === stageId &&
            !stage.locked &&
            stageTrackProperties(stage).includes(item.property),
        )
      )
        continue;
      const time = snapTime(props.progress + item.offset, config, snap);
      let track = config.tracks.find(
        (candidate) => candidate.stageId === stageId && candidate.property === item.property,
      );
      if (!track) {
        track = { stageId, property: item.property, keys: [] };
        config.tracks.push(track);
      }
      let key = track.keys.find((candidate) => Math.abs(candidate.time - time) < 0.00001);
      if (!key) {
        key = {
          id: `key-${crypto.randomUUID()}`,
          time,
          value: constrainValue(
            item.property,
            item.value,
            config.stages.find((stage) => stage.id === stageId),
          ),
          interpolation: item.interpolation,
          bezier: [...item.bezier],
        };
        track.keys.push(key);
      } else
        Object.assign(key, {
          value: constrainValue(
            item.property,
            item.value,
            config.stages.find((stage) => stage.id === stageId),
          ),
          interpolation: item.interpolation,
          bezier: [...item.bezier],
        });
      pasted.push({ stageId, property: item.property, id: key.id });
      track.keys.sort((left, right) => left.time - right.time);
    }
    if (!pasted.length) return;
    setSelectedKeys(pasted);
    commit(config);
  };

  const layerEntries = animationLayerEntries(props.config);
  const visibleKeys = layerEntries
    .map(({ stage }) => stage)
    .filter((stage) => expanded.includes(stage.id))
    .flatMap((stage) =>
      buildingAnimationTrackProperties.flatMap((item) => {
        const track = trackFor(stage.id, item);
        if (animatedOnly && !track) return [];
        return (track?.keys ?? []).map((key) => ({
          stageId: stage.id,
          property: item,
          id: key.id,
        }));
      }),
    );
  const selectKey = (event: PointerEvent<HTMLButtonElement>, key: SelectedKey, time: number) => {
    event.preventDefault();
    event.stopPropagation();
    rootRef.current?.focus();
    const previous = selectedKeys.at(-1);
    let next: SelectedKey[];
    if (event.shiftKey && previous) {
      const first = visibleKeys.findIndex((candidate) => sameKey(candidate, previous));
      const last = visibleKeys.findIndex((candidate) => sameKey(candidate, key));
      next =
        first < 0 || last < 0
          ? [key]
          : visibleKeys.slice(Math.min(first, last), Math.max(first, last) + 1);
    } else if (event.ctrlKey || event.metaKey) {
      next = selectedKeys.some((candidate) => sameKey(candidate, key))
        ? selectedKeys.filter((candidate) => !sameKey(candidate, key))
        : [...selectedKeys, key];
    } else next = selectedKeys.some((candidate) => sameKey(candidate, key)) ? selectedKeys : [key];
    setSelectedKeys(next);
    setProperty(key.property);
    selectStage(props.config.stages.findIndex((stage) => stage.id === key.stageId));
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) props.onProgress(time);
    if (!next.some((candidate) => sameKey(candidate, key))) return;
    if (next.some((key) => props.config.stages.find((stage) => stage.id === key.stageId)?.locked))
      return;
    keyDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: event.currentTarget.parentElement?.clientWidth ?? 1,
      config: structuredClone(props.config),
      selected: next,
      recorded: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveKeys = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = keyDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const raw = (event.clientX - drag.startX) / Math.max(1, drag.width);
    let delta = snap ? Math.round(raw / frameStep(drag.config)) * frameStep(drag.config) : raw;
    let minimum = -1;
    let maximum = 1;
    for (const track of drag.config.tracks)
      for (const [index, key] of track.keys.entries()) {
        const identity = { stageId: track.stageId, property: track.property, id: key.id };
        if (!drag.selected.some((selected) => sameKey(selected, identity))) continue;
        minimum = Math.max(minimum, -key.time);
        maximum = Math.min(maximum, 1 - key.time);
        const other = (candidate: BuildingAnimationKeyframe) =>
          !drag.selected.some((selected) => sameKey(selected, { ...identity, id: candidate.id }));
        const before = [...track.keys.slice(0, index)].reverse().find(other);
        const after = track.keys.slice(index + 1).find(other);
        if (before) minimum = Math.max(minimum, before.time + 0.0001 - key.time);
        if (after) maximum = Math.min(maximum, after.time - 0.0001 - key.time);
      }
    delta = Math.min(maximum, Math.max(minimum, delta));
    if (Math.abs(delta) < 0.00001 && !drag.recorded) return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    const config = structuredClone(drag.config);
    for (const track of config.tracks) {
      for (const key of track.keys)
        if (
          drag.selected.some((selected) =>
            sameKey(selected, { stageId: track.stageId, property: track.property, id: key.id }),
          )
        )
          key.time = clamp01(Math.round((key.time + delta) * 10000) / 10000);
      track.keys.sort((left, right) => left.time - right.time);
    }
    emitConfig(config);
  };
  const moveMarker = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = markerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.index === 0) return;
    const stage = drag.config.stages[drag.index]!;
    if (stage.locked) return;
    const images = drag.config.stages.filter(isImageStage);
    const imageIndex = images.findIndex((item) => item.id === stage.id);
    if (imageIndex <= 0) return;
    const before = images[imageIndex - 1]!.milestone;
    const after = images[imageIndex + 1]?.milestone ?? 1.001;
    const raw = stage.milestone + (event.clientX - drag.startX) / Math.max(1, drag.width);
    const next = Math.max(
      before + 0.0001,
      Math.min(after - 0.0001, snapTime(raw, drag.config, snap)),
    );
    if (Math.abs(next - props.config.stages[drag.index]!.milestone) < 0.00001) return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    const config = structuredClone(drag.config);
    config.stages[drag.index]!.milestone = next;
    emitConfig(config);
  };
  const moveLayer = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = layerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const original = drag.config.stages.find((stage) => stage.id === drag.stageId);
    if (!original || original.locked) return;
    const delta = (event.clientX - drag.startX) / Math.max(1, drag.width);
    const config = structuredClone(drag.config);
    const stage = config.stages.find((item) => item.id === drag.stageId)!;
    if (drag.mode === 'move') {
      moveAnimationClip(
        config,
        stage.id,
        snapTime(original.inPoint + delta, config, snap) - original.inPoint,
      );
    } else if (drag.mode === 'trim-start') {
      if (!isImageStage(stage) && stage.emissionStart === undefined)
        stage.emissionStart = original.inPoint;
      stage.inPoint = Math.min(
        original.outPoint - Math.min(frameStep(config), original.outPoint - original.inPoint),
        snapTime(original.inPoint + delta, config, snap),
      );
    } else {
      stage.outPoint = Math.max(
        original.inPoint + frameStep(config),
        snapTime(original.outPoint + delta, config, snap),
      );
      stage.outPoint = Math.min(1, stage.outPoint);
    }
    const current = props.config.stages.find((item) => item.id === drag.stageId);
    if (
      current &&
      Math.abs(stage.inPoint - current.inPoint) < 0.00001 &&
      Math.abs(stage.outPoint - current.outPoint) < 0.00001
    )
      return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    emitConfig(config);
  };
  const reorderLayer = (sourceId: string, targetId: string) => {
    if (props.config.stages.find((stage) => stage.id === sourceId)?.locked) return;
    if (sourceId === targetId) return;
    const config = structuredClone(props.config);
    reorderAnimationLayer(config, sourceId, targetId);
    commit(config);
  };
  const moveLayerOrder = (stageId: string, offset: number) => {
    const source = props.config.stages.find((stage) => stage.id === stageId)!;
    const order = layerEntries
      .filter(({ stage }) =>
        source.kind === 'filter'
          ? stage.kind === 'filter' && stage.parentId === source.parentId
          : stage.kind !== 'filter',
      )
      .map(({ stage }) => stage.id);
    const index = order.indexOf(stageId);
    const target = order[index + offset];
    if (target) reorderLayer(stageId, target);
  };
  const moveMarquee = (event: PointerEvent<HTMLDivElement>) => {
    const drag = marqueeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x1 = Math.min(drag.startX, event.clientX);
    const x2 = Math.max(drag.startX, event.clientX);
    const y1 = Math.min(drag.startY, event.clientY);
    const y2 = Math.max(drag.startY, event.clientY);
    setMarquee({ x1, x2, y1, y2 });
    const found: SelectedKey[] = [...drag.base];
    rootRef.current?.querySelectorAll<HTMLButtonElement>('.keyframe-diamond').forEach((node) => {
      const bounds = node.getBoundingClientRect();
      if (bounds.right < x1 || bounds.left > x2 || bounds.bottom < y1 || bounds.top > y2) return;
      const identity = {
        stageId: node.dataset.stageId!,
        property: node.dataset.property as BuildingAnimationTrackProperty,
        id: node.dataset.keyId!,
      };
      if (!found.some((key) => sameKey(key, identity))) found.push(identity);
    });
    setSelectedKeys(found);
  };
  const moveWorkHandle = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = workDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = snapTime((event.clientX - drag.left) / Math.max(1, drag.width), drag.config, snap);
    const config = structuredClone(drag.config);
    if (drag.side === 'start')
      config.timeline.workAreaStart = Math.min(
        next,
        config.timeline.workAreaEnd - frameStep(config),
      );
    else
      config.timeline.workAreaEnd = Math.max(
        next,
        config.timeline.workAreaStart + frameStep(config),
      );
    if (
      Math.abs(config.timeline.workAreaStart - props.config.timeline.workAreaStart) < 0.00001 &&
      Math.abs(config.timeline.workAreaEnd - props.config.timeline.workAreaEnd) < 0.00001
    )
      return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    emitConfig(config);
  };
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    let time = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    if (event.shiftKey) {
      const points = [
        0,
        1,
        props.config.timeline.workAreaStart,
        props.config.timeline.workAreaEnd,
        ...props.config.stages.map((stage) => stage.milestone),
        ...props.config.tracks.flatMap((track) => track.keys.map((key) => key.time)),
      ];
      const closest = points.reduce(
        (best, point) => (Math.abs(point - time) < Math.abs(best - time) ? point : best),
        points[0]!,
      );
      if (Math.abs(closest - time) * bounds.width < 10) time = closest;
    }
    props.onProgress(snapTime(time, props.config, snap));
  };
  useEffect(() => {
    const element = scrollRef.current;
    const area = rootRef.current;
    if (!element || !area) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      if (event.shiftKey && !event.altKey) {
        event.preventDefault();
        element.scrollLeft += event.deltaY;
        return;
      }
      if (!event.altKey) return;
      event.preventDefault();
      const levels = [1, 2, 4, 8];
      const index = levels.indexOf(zoom);
      const next =
        levels[Math.max(0, Math.min(levels.length - 1, index + (event.deltaY < 0 ? 1 : -1)))]!;
      if (next === zoom) return;
      const pointerX = event.clientX - element.getBoundingClientRect().left;
      const relative = clamp01((element.scrollLeft + pointerX - labelWidth) / (trackWidth * zoom));
      setZoom(next);
      requestAnimationFrame(() => {
        element.scrollLeft = Math.max(0, labelWidth + relative * trackWidth * next - pointerX);
      });
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [zoom, trackWidth, setZoom]);
  const togglePlayback = () => {
    if (
      !props.playing &&
      (props.progress < props.config.timeline.workAreaStart ||
        props.progress >= props.config.timeline.workAreaEnd)
    )
      props.onProgress(props.config.timeline.workAreaStart);
    props.onPlaying(!props.playing);
  };
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest('input,select,textarea')) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (command && event.code === 'KeyY') {
      event.preventDefault();
      redo();
    } else if (command && event.code === 'KeyC') {
      event.preventDefault();
      copyKeys();
    } else if (command && event.code === 'KeyX') {
      event.preventDefault();
      cutKeys();
    } else if (command && event.code === 'KeyV') {
      event.preventDefault();
      pasteKeys();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      deleteKeys();
    } else if (
      event.code === 'Space' &&
      !command &&
      !event.altKey &&
      !event.repeat &&
      !target.closest('button')
    ) {
      event.preventDefault();
      togglePlayback();
    } else if (event.code === 'KeyJ') {
      event.preventDefault();
      jumpAll(-1);
    } else if (event.code === 'KeyK') {
      event.preventDefault();
      jumpAll(1);
    } else if (event.code === 'PageUp' || event.code === 'PageDown') {
      event.preventDefault();
      const amount =
        (event.shiftKey ? 10 : 1) * frameStep(props.config) * (event.code === 'PageUp' ? -1 : 1);
      props.onProgress(snapTime(props.progress + amount, props.config, true));
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      const amount =
        (event.shiftKey ? 10 : 1) * frameStep(props.config) * (event.code === 'ArrowLeft' ? -1 : 1);
      props.onProgress(snapTime(props.progress + amount, props.config, true));
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
      const index = layerEntries.findIndex(({ stage }) => stage.id === activeStageId);
      const next =
        layerEntries[
          Math.max(
            0,
            Math.min(layerEntries.length - 1, index + (event.code === 'ArrowUp' ? -1 : 1)),
          )
        ];
      if (next) selectStage(next.index);
    } else if (event.code === 'Home') {
      event.preventDefault();
      props.onProgress(props.config.timeline.workAreaStart);
    } else if (event.code === 'End') {
      event.preventDefault();
      props.onProgress(props.config.timeline.workAreaEnd);
    } else if (event.code === 'F9') {
      event.preventDefault();
      changeSelected((key) => (key.interpolation = 'ease-in-out'));
    } else if (event.code === 'KeyU') {
      event.preventDefault();
      setAnimatedOnly((current) => !current);
    }
  };

  const graphStage = activeStage;
  const graphTrack = graphStage ? trackFor(graphStage.id, property) : undefined;
  const graphFallback = graphStage ? defaultTrackValue(graphStage, property) : 0;
  const graphTimes = graphTrack?.keys.length
    ? [
        ...new Set([
          0,
          1,
          ...graphTrack.keys.flatMap((key, index) => {
            const next = graphTrack.keys[index + 1];
            if (!next) return [key.time];
            return Array.from(
              { length: 33 },
              (_, sample) => key.time + ((next.time - key.time) * sample) / 32,
            );
          }),
        ]),
      ].sort((left, right) => left - right)
    : [0, 1];
  const graphValues = graphTimes.map((time) =>
    sampleBuildingTrack(graphTrack, time, graphFallback),
  );
  const graphRawMin = Math.min(...graphValues);
  const graphRawMax = Math.max(...graphValues);
  const minimumRange =
    property === 'opacity'
      ? 1
      : property === 'scaleX' || property === 'scaleY'
        ? 2
        : property === 'rotation' || property === 'skewX' || property === 'skewY'
          ? 90
          : 100;
  const fixedGraphViewport =
    graphViewport?.stageId === graphStage?.id && graphViewport?.property === property
      ? graphViewport
      : null;
  const graphRange =
    fixedGraphViewport?.range ?? Math.max(minimumRange, (graphRawMax - graphRawMin) * 1.2);
  const graphMin = fixedGraphViewport?.min ?? (graphRawMin + graphRawMax - graphRange) / 2;
  const graphMax = graphMin + graphRange;
  const graphY = (value: number) => 122 - ((value - graphMin) / graphRange) * 100;
  const graphPath = graphValues
    .map((value, index) => `${index ? 'L' : 'M'} ${graphTimes[index]! * 1000} ${graphY(value)}`)
    .join(' ');
  const selectedGraphIndex = graphTrack?.keys.findIndex((key) => key.id === selectedKey?.id) ?? -1;
  const graphSegmentStart =
    selectedLast && selectedLast.stageId === graphStage?.id && selectedLast.property === property
      ? graphTrack?.keys[selectedGraphIndex]
      : undefined;
  const graphSegmentEnd =
    selectedGraphIndex >= 0 ? graphTrack?.keys[selectedGraphIndex + 1] : undefined;
  const graphBezier = graphSegmentStart ? animationKeyBezier(graphSegmentStart) : undefined;
  const tickStep = duration <= 8 ? 1 : duration <= 20 ? 2 : duration <= 60 ? 5 : 10;
  const ticks = Array.from(
    { length: Math.floor(duration / tickStep) + 1 },
    (_, index) => index * tickStep,
  );
  const minimumDuration = minimumAnimationDuration(props.config);
  const changeDuration = (seconds: number) => {
    if (seconds < minimumDuration || seconds > 600 || seconds === duration) return;
    const config = resizeAnimationDuration(props.config, seconds);
    const ratio = duration / seconds;
    commit(config, clamp01(props.progress * ratio));
  };
  const moveGraphPoint = (event: PointerEvent<SVGCircleElement>) => {
    const drag = graphDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.config.stages.find((stage) => stage.id === drag.stageId)?.locked) return;
    if (!drag.recorded && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 2)
      return;
    const track = drag.config.tracks.find(
      (candidate) => candidate.stageId === drag.stageId && candidate.property === drag.property,
    );
    const index = track?.keys.findIndex((candidate) => candidate.id === drag.keyId) ?? -1;
    if (!track || index < 0) return;
    const point = moveAnimationGraphPoint(
      drag,
      track.keys[index]!,
      { x: drag.startX, y: drag.startY },
      { x: event.clientX, y: event.clientY },
    );
    const before = track.keys[index - 1]?.time ?? -0.0001;
    const after = track.keys[index + 1]?.time ?? 1.0001;
    const time = Math.max(
      before + 0.0001,
      Math.min(after - 0.0001, snapTime(point.time, drag.config, snap)),
    );
    const value = constrainValue(
      drag.property,
      Math.round(point.value * 1000) / 1000,
      drag.config.stages.find((stage) => stage.id === drag.stageId),
    );
    const current = props.config.tracks
      .find(
        (candidate) => candidate.stageId === drag.stageId && candidate.property === drag.property,
      )
      ?.keys.find((candidate) => candidate.id === drag.keyId);
    if (
      current &&
      Math.abs(current.time - time) < 0.00001 &&
      Math.abs(current.value - value) < 0.00001
    )
      return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    const config = structuredClone(drag.config);
    const target = config.tracks.find(
      (candidate) => candidate.stageId === drag.stageId && candidate.property === drag.property,
    )!.keys[index]!;
    target.time = time;
    target.value = value;
    config.tracks
      .find(
        (candidate) => candidate.stageId === drag.stageId && candidate.property === drag.property,
      )!
      .keys.sort((left, right) => left.time - right.time);
    emitConfig(config);
  };
  const moveBezierHandle = (event: PointerEvent<SVGCircleElement>) => {
    const drag = handleDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.config.stages.find((stage) => stage.id === drag.stageId)?.locked) return;
    if (!drag.recorded && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 2)
      return;
    const track = drag.config.tracks.find(
      (item) => item.stageId === drag.stageId && item.property === drag.property,
    );
    const index = track?.keys.findIndex((key) => key.id === drag.keyId) ?? -1;
    const start = track?.keys[index];
    const end = track?.keys[index + 1];
    if (!start || !end) return;
    const initialBezier = animationKeyBezier(start);
    const bezier = moveAnimationBezierHandle(
      start,
      end,
      initialBezier,
      drag.handle,
      drag,
      { x: drag.startX, y: drag.startY },
      { x: event.clientX, y: event.clientY },
    );
    if (!drag.recorded && bezier.every((value, index) => value === initialBezier[index])) return;
    const config = structuredClone(props.config);
    const target = config.tracks
      .find((item) => item.stageId === drag.stageId && item.property === drag.property)
      ?.keys.find((key) => key.id === drag.keyId);
    if (!target) return;
    if (
      target.interpolation === 'cubic-bezier' &&
      bezier.every((value, index) => Math.abs(value - target.bezier[index]!) < 0.000001)
    )
      return;
    if (!drag.recorded) {
      remember(drag.config);
      drag.recorded = true;
    }
    target.interpolation = 'cubic-bezier';
    target.bezier = bezier;
    emitConfig(config);
  };
  const finishGraphDrag = () => {
    graphDrag.current = null;
    handleDrag.current = null;
    setGraphViewport(null);
  };

  return (
    <div className="ae-timeline" ref={rootRef} tabIndex={0} onKeyDown={onTimelineKeyDown}>
      <div className="keyframe-toolbar">
        <div className="keyframe-toolbar-group">
          <strong>COMPOSITION</strong>
          <button
            onClick={togglePlayback}
            aria-label={props.playing ? 'Pause animation' : 'Play animation'}
            title="Play / pause · Space"
          >
            {props.playing ? 'Ⅱ' : '▶'}
          </button>
          <button
            aria-label="Previous key or marker"
            onClick={() => jumpAll(-1)}
            title="Previous key or marker · J"
          >
            ‹
          </button>
          <button
            aria-label="Next key or marker"
            onClick={() => jumpAll(1)}
            title="Next key or marker · K"
          >
            ›
          </button>
          <output className="ae-timecode" title="Current time in minutes:seconds:frames">
            {timecode(props.progress, props.config)}
          </output>
          <label className="ae-compact-field">
            TIME
            <NumericInput
              label="TIME s"
              value={Number((props.progress * duration).toFixed(3))}
              min={0}
              max={duration}
              step={1 / fps}
              onCommit={(seconds) =>
                props.onProgress(snapTime(seconds / duration, props.config, snap))
              }
            />{' '}
            s
          </label>
          <label className="ae-compact-field">
            DURATION
            <NumericInput
              label="DURATION s"
              value={duration}
              min={Math.ceil(minimumDuration * 1000) / 1000}
              max={600}
              step={0.1}
              onCommit={changeDuration}
            />{' '}
            s
          </label>
        </div>
        <div className="keyframe-toolbar-group">
          <button aria-label="Undo" onClick={undo} disabled={!props.canUndo} title="Undo · Ctrl+Z">
            ↶
          </button>
          <button aria-label="Redo" onClick={redo} disabled={!props.canRedo} title="Redo · Ctrl+Y">
            ↷
          </button>
          <button onClick={copyKeys} disabled={!selectedKeys.length} title="Copy keys · Ctrl+C">
            COPY
          </button>
          <button onClick={cutKeys} disabled={!selectedKeys.length} title="Cut keys · Ctrl+X">
            CUT
          </button>
          <button
            onClick={pasteKeys}
            disabled={!clipboard.length}
            title="Paste keys at current time · Ctrl+V"
          >
            PASTE
          </button>
          <button onClick={deleteKeys} disabled={!selectedKeys.length} title="Delete selected keys">
            DELETE
          </button>
          <button
            aria-pressed={graphMode}
            className={graphMode ? 'is-active' : ''}
            onClick={() => {
              finishGraphDrag();
              setGraphMode(!graphMode);
            }}
          >
            GRAPH
          </button>
          <button
            aria-pressed={animatedOnly}
            className={animatedOnly ? 'is-active' : ''}
            onClick={() => setAnimatedOnly(!animatedOnly)}
            title="Reveal animated properties · U"
          >
            U
          </button>
          <label>
            <input
              type="checkbox"
              checked={snap}
              onChange={(event) => props.onSnap(event.target.checked)}
            />{' '}
            FRAME SNAP
          </label>
          <label>
            <input
              type="checkbox"
              checked={props.autoKey}
              onChange={(event) => props.onAutoKey(event.target.checked)}
            />{' '}
            AUTO-KEY
          </label>
          <label>
            FPS{' '}
            <NumericInput
              label="Timeline frame rate"
              value={fps}
              min={1}
              max={120}
              step={1}
              onFocus={() => props.onPlaying(false)}
              onCommit={(value) => {
                const config = structuredClone(props.config);
                config.timeline.frameRate = Math.round(value);
                commit(config);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={props.loop}
              onChange={(event) => props.onLoop(event.target.checked)}
            />{' '}
            LOOP
          </label>
          <button
            title="Fit the full duration"
            onClick={() => {
              setZoom(1);
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }}
          >
            FIT
          </button>
          <select
            aria-label="Playback speed"
            value={props.speed}
            onChange={(event) => props.onSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 1.5, 2, 4].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
          <label>
            ZOOM{' '}
            <select
              aria-label="Timeline zoom"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              {[1, 2, 4, 8].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="keyframe-body">
        <div
          className="keyframe-tracks-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            if (!restoredScroll.current) return;
            if (props.linkedScroll !== undefined) props.onScroll(event.currentTarget.scrollLeft);
            view.scrollLeft = event.currentTarget.scrollLeft;
            view.scrollTop = event.currentTarget.scrollTop;
          }}
        >
          <div
            className={`keyframe-sheet ${graphMode ? 'is-graph-mode' : ''}`}
            style={{ minWidth: sheetWidth, gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
          >
            <div className="keyframe-label keyframe-ruler-label">
              TIME RULER · {duration.toFixed(1)} s
            </div>
            <div
              className="keyframe-ruler keyframe-canvas"
              onPointerDown={(event) => {
                rulerPointer.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                scrub(event);
              }}
              onPointerMove={(event) => {
                if (rulerPointer.current === event.pointerId) scrub(event);
              }}
              onPointerUp={() => (rulerPointer.current = null)}
              onLostPointerCapture={() => (rulerPointer.current = null)}
            >
              {ticks.map((second) => (
                <span
                  className="keyframe-ruler-tick"
                  key={second}
                  style={{ left: `${(second / duration) * 100}%` }}
                >
                  {second}s
                </span>
              ))}
              <span className="ae-cti" style={{ left: `${props.progress * 100}%` }} />
            </div>
            <div className="keyframe-label ae-work-label">WORK AREA</div>
            <div className="ae-work-lane keyframe-canvas">
              <div
                className="ae-work-range"
                style={{
                  left: `${props.config.timeline.workAreaStart * 100}%`,
                  width: `${(props.config.timeline.workAreaEnd - props.config.timeline.workAreaStart) * 100}%`,
                }}
              />
              {(['start', 'end'] as const).map((side) => (
                <button
                  key={side}
                  className={`ae-work-handle ${side}`}
                  style={{
                    left: `${props.config.timeline[side === 'start' ? 'workAreaStart' : 'workAreaEnd'] * 100}%`,
                  }}
                  title={`Work area ${side}`}
                  onPointerDown={(event) => {
                    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                    workDrag.current = {
                      pointerId: event.pointerId,
                      side,
                      width: bounds.width,
                      left: bounds.left,
                      config: structuredClone(props.config),
                      recorded: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={moveWorkHandle}
                  onPointerUp={() => (workDrag.current = null)}
                  onLostPointerCapture={() => (workDrag.current = null)}
                />
              ))}
            </div>
            {layerEntries
              .filter(({ stage }) => !graphMode || stage.id === activeStageId)
              .map(({ stage, index }) => {
                const isExpanded = expanded.includes(stage.id);
                const isSelected = stage.id === activeStageId;
                const relationshipClass = `${stage.kind === 'filter' ? 'is-dependent' : ''} ${stage.id === activeStage?.parentId || stage.parentId === activeStageId ? 'is-related' : ''}`;
                return [
                  <div
                    key={`${stage.id}-label`}
                    className={`keyframe-label ae-layer-label ${isSelected ? 'is-selected' : ''} ${relationshipClass}`}
                    draggable={renamingStageId !== stage.id}
                    onDragStart={(event) => {
                      draggedLayerId.current = stage.id;
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => (draggedLayerId.current = null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedLayerId.current) reorderLayer(draggedLayerId.current, stage.id);
                      draggedLayerId.current = null;
                    }}
                  >
                    <button
                      className="ae-twirl"
                      onClick={() => toggleExpanded(stage.id)}
                      title={isExpanded ? 'Collapse layer' : 'Expand layer'}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} layer ${stage.name}`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                    {renamingStageId === stage.id ? (
                      <input
                        className="ae-layer-rename"
                        autoFocus
                        aria-label={`Rename layer ${stage.name}`}
                        value={stageNameDraft}
                        onChange={(event) => setStageNameDraft(event.target.value)}
                        onBlur={() => renameStage(stage.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            renameCancelled.current = true;
                            setRenamingStageId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        className="ae-layer-name"
                        onClick={() => selectStage(index)}
                        onDoubleClick={() => {
                          renameCancelled.current = false;
                          setStageNameDraft(stage.name);
                          setRenamingStageId(stage.id);
                        }}
                        title={
                          stage.kind === 'filter'
                            ? `Attached to ${props.config.stages.find((parent) => parent.id === stage.parentId)?.name} · drag to reorder sibling effects`
                            : 'Drag to reorder resource with its effects · double-click to rename'
                        }
                      >
                        <b>
                          {stage.kind === 'filter'
                            ? '↳ ƒx'
                            : stage.kind === 'particles'
                              ? '✦'
                              : String(stage.layerOrder + 1).padStart(2, '0')}
                        </b>{' '}
                        {stage.name}
                        {stage.kind === 'filter' ? (
                          <small className="ae-effect-parent">
                            {
                              props.config.stages.find((parent) => parent.id === stage.parentId)
                                ?.name
                            }
                          </small>
                        ) : null}
                      </button>
                    )}
                    <button
                      className="ae-layer-order"
                      disabled={stage.locked || stage.layerOrder === 0}
                      onClick={() => moveLayerOrder(stage.id, -1)}
                      title="Move layer forward"
                      aria-label={`Move ${stage.name} forward`}
                    >
                      ↑
                    </button>
                    <button
                      className="ae-layer-order"
                      disabled={stage.locked || stage.layerOrder === layerEntries.length - 1}
                      onClick={() => moveLayerOrder(stage.id, 1)}
                      title="Move layer backward"
                      aria-label={`Move ${stage.name} backward`}
                    >
                      ↓
                    </button>
                    {(['hidden', 'solo', 'locked'] as const).map((flag) => (
                      <button
                        key={flag}
                        className="ae-layer-visibility"
                        title={flag}
                        aria-label={`${stage.name} ${flag}`}
                        aria-pressed={stage[flag] === true}
                        onClick={() => {
                          const config = structuredClone(props.config);
                          config.stages.find((item) => item.id === stage.id)![flag] = !stage[flag];
                          commit(config);
                        }}
                      >
                        {flag === 'hidden' ? '◉' : flag === 'solo' ? 'S' : 'L'}
                      </button>
                    ))}
                    <AnimationLayerDeleteButton
                      name={stage.name}
                      disabled={!canRemoveAnimationLayers(props.config, [stage.id])}
                      onDelete={() => props.onRemoveLayer(stage.id)}
                    />
                  </div>,
                  <div
                    key={`${stage.id}-lane`}
                    className={`ae-layer-lane keyframe-canvas ${isSelected ? 'is-selected' : ''} ${relationshipClass}`}
                  >
                    {particleTailSeconds(props.config, stage) > 0 ? (
                      <div
                        className="ae-layer-tail"
                        style={{
                          left: `${stage.outPoint * 100}%`,
                          width: `${Math.max(0, Math.min(1 - stage.outPoint, particleTailSeconds(props.config, stage) / duration)) * 100}%`,
                        }}
                        title={`Particle tail / ${particleTailSeconds(props.config, stage).toFixed(2)} s`}
                      />
                    ) : null}
                    <button
                      className="ae-layer-trim is-start"
                      disabled={stage.locked}
                      style={{ left: `${stage.inPoint * 100}%` }}
                      title={`Trim ${stage.name} start / retain emission phase`}
                      aria-label={`Trim ${stage.name} start`}
                      onPointerDown={(event) => {
                        selectStage(index);
                        layerDrag.current = {
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          width: event.currentTarget.parentElement?.clientWidth ?? 1,
                          stageId: stage.id,
                          mode: 'trim-start',
                          config: structuredClone(props.config),
                          recorded: false,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={moveLayer}
                      onPointerUp={() => (layerDrag.current = null)}
                      onLostPointerCapture={() => (layerDrag.current = null)}
                    />
                    <button
                      className="ae-layer-bar"
                      disabled={stage.locked}
                      type="button"
                      aria-label={`Select layer ${stage.name}`}
                      style={{
                        left: `${stage.inPoint * 100}%`,
                        width: `${(stage.outPoint - stage.inPoint) * 100}%`,
                      }}
                      title={`${stage.name} visible ${(stage.inPoint * duration).toFixed(2)}–${(stage.outPoint * duration).toFixed(2)} s · drag to move`}
                      onPointerDown={(event) => {
                        selectStage(index);
                        layerDrag.current = {
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          width: event.currentTarget.parentElement?.clientWidth ?? 1,
                          stageId: stage.id,
                          mode: 'move',
                          config: structuredClone(props.config),
                          recorded: false,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={moveLayer}
                      onPointerUp={() => (layerDrag.current = null)}
                      onLostPointerCapture={() => (layerDrag.current = null)}
                    />
                    <button
                      className="ae-layer-trim"
                      disabled={stage.locked}
                      style={{ left: `${stage.outPoint * 100}%` }}
                      title={`Trim ${stage.name} end · ${(stage.outPoint * duration).toFixed(2)} s`}
                      aria-label={`Trim ${stage.name} end`}
                      onPointerDown={(event) => {
                        selectStage(index);
                        layerDrag.current = {
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          width: event.currentTarget.parentElement?.clientWidth ?? 1,
                          stageId: stage.id,
                          mode: 'trim',
                          config: structuredClone(props.config),
                          recorded: false,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={moveLayer}
                      onPointerUp={() => (layerDrag.current = null)}
                      onLostPointerCapture={() => (layerDrag.current = null)}
                    />
                    {isImageStage(stage) ? (
                      <button
                        className={`keyframe-stage-marker ${isSelected ? 'is-selected' : ''}`}
                        disabled={stage.locked}
                        style={{ left: `${stage.milestone * 100}%` }}
                        title={`${stage.name} transition marker ${(stage.milestone * duration).toFixed(2)} s · drag to retime transition`}
                        onPointerDown={(event) => {
                          selectStage(index);
                          props.onProgress(stage.milestone);
                          markerDrag.current = {
                            pointerId: event.pointerId,
                            startX: event.clientX,
                            width: event.currentTarget.parentElement?.clientWidth ?? 1,
                            config: structuredClone(props.config),
                            index,
                            recorded: false,
                          };
                          event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={moveMarker}
                        onPointerUp={() => (markerDrag.current = null)}
                        onLostPointerCapture={() => (markerDrag.current = null)}
                      >
                        {index + 1}
                      </button>
                    ) : null}
                  </div>,
                  ...(isExpanded || graphMode
                    ? propertyGroups.flatMap((items, groupIndex) => {
                        if (!items.every((item) => stageTrackProperties(stage).includes(item)))
                          return [];
                        if (graphMode && !items.includes(property)) return [];
                        if (
                          !graphMode &&
                          animatedOnly &&
                          !items.some((item) => trackFor(stage.id, item))
                        )
                          return [];
                        const item = items[0]!;
                        const displayedItems = graphMode ? [property] : items;
                        return [
                          <div
                            className={`keyframe-label ae-property-label ${isSelected && items.includes(property) ? 'is-selected' : ''}`}
                            key={`${stage.id}-${item}-label`}
                          >
                            <button
                              className="ae-property-name"
                              onClick={() => {
                                selectStage(index);
                                setProperty(item);
                              }}
                            >
                              {item in animationEffectParameters
                                ? effectParameter(stage, item as AnimationEffectProperty).label
                                : item === 'opacity' && stage.kind === 'filter'
                                  ? 'Mix'
                                  : groupLabels[groupIndex]}
                            </button>
                            <span className="ae-paired-values">
                              {displayedItems.map((axis, axisIndex) => {
                                const axisTrack = trackFor(stage.id, axis);
                                const value = sampleBuildingTrack(
                                  axisTrack,
                                  props.progress,
                                  defaultTrackValue(stage, axis),
                                );
                                const atCurrent =
                                  axisTrack?.keys.some(
                                    (key) =>
                                      Math.abs(
                                        key.time - snapTime(props.progress, props.config, snap),
                                      ) < 0.00001,
                                  ) ?? false;
                                return (
                                  <span className="ae-axis-value" key={axis}>
                                    {axisIndex > 0 ? (
                                      <span className="ae-pair-comma">,</span>
                                    ) : null}
                                    <button
                                      className={`ae-stopwatch ${axisTrack ? 'is-on' : ''}`}
                                      disabled={stage.locked}
                                      title={`${propertyLabels[axis]} animation`}
                                      aria-label={`Animate ${stage.name} ${propertyLabels[axis]}`}
                                      aria-pressed={!!axisTrack}
                                      onClick={() => toggleAnimation(stage.id, axis)}
                                    >
                                      ◷
                                    </button>
                                    <NumericInput
                                      label={`${stage.name} ${propertyLabels[axis]} value`}
                                      step={0.01}
                                      value={Number(value.toFixed(3))}
                                      disabled={stage.locked}
                                      min={
                                        axis in animationEffectParameters
                                          ? effectParameter(stage, axis as AnimationEffectProperty)
                                              .min
                                          : undefined
                                      }
                                      max={
                                        axis in animationEffectParameters
                                          ? effectParameter(stage, axis as AnimationEffectProperty)
                                              .max
                                          : undefined
                                      }
                                      onFocus={() => {
                                        props.onPlaying(false);
                                        setProperty(axis);
                                      }}
                                      onCommit={(next) => editProperty(stage.id, axis, next)}
                                    />
                                    <button
                                      className={`ae-key-toggle ${atCurrent ? 'has-key' : ''}`}
                                      disabled={stage.locked}
                                      title={`${propertyLabels[axis]} key at current time`}
                                      aria-label={`Key ${stage.name} ${propertyLabels[axis]} at current time`}
                                      aria-pressed={atCurrent}
                                      onClick={() => toggleKey(stage.id, axis)}
                                    >
                                      ◆
                                    </button>
                                  </span>
                                );
                              })}
                            </span>
                            <button
                              className="ae-key-nav"
                              title="Previous key"
                              aria-label={`Previous ${stage.name} ${propertyLabels[item]} key`}
                              onClick={() =>
                                jumpProperty(
                                  stage.id,
                                  items.includes(property) ? property : item,
                                  -1,
                                )
                              }
                            >
                              ‹
                            </button>
                            <button
                              className="ae-key-nav"
                              title="Next key"
                              aria-label={`Next ${stage.name} ${propertyLabels[item]} key`}
                              onClick={() =>
                                jumpProperty(
                                  stage.id,
                                  items.includes(property) ? property : item,
                                  1,
                                )
                              }
                            >
                              ›
                            </button>
                          </div>,
                          <div
                            className={`keyframe-property-lane keyframe-canvas ${isSelected && items.includes(property) ? 'is-selected' : ''}`}
                            key={`${stage.id}-${item}-lane`}
                            onPointerDown={(event) => {
                              if (event.target !== event.currentTarget) return;
                              rootRef.current?.focus();
                              marqueeDrag.current = {
                                pointerId: event.pointerId,
                                startX: event.clientX,
                                startY: event.clientY,
                                base:
                                  event.ctrlKey || event.metaKey || event.shiftKey
                                    ? selectedKeys
                                    : [],
                              };
                              if (!(event.ctrlKey || event.metaKey || event.shiftKey))
                                setSelectedKeys([]);
                              event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={moveMarquee}
                            onPointerUp={() => {
                              marqueeDrag.current = null;
                              setMarquee(null);
                            }}
                            onLostPointerCapture={() => {
                              marqueeDrag.current = null;
                              setMarquee(null);
                            }}
                            onDoubleClick={(event) => {
                              if (event.target !== event.currentTarget) return;
                              const bounds = event.currentTarget.getBoundingClientRect();
                              addKey(
                                stage.id,
                                items.includes(property) ? property : item,
                                (event.clientX - bounds.left) / Math.max(1, bounds.width),
                              );
                            }}
                          >
                            {displayedItems.flatMap((axis, axisIndex) =>
                              (trackFor(stage.id, axis)?.keys ?? []).map((key) => {
                                const identity = { stageId: stage.id, property: axis, id: key.id };
                                return (
                                  <button
                                    key={`${axis}-${key.id}`}
                                    className={`keyframe-diamond ${selectedKeys.some((selected) => sameKey(selected, identity)) ? 'is-selected' : ''} ${key.interpolation === 'step' ? 'is-hold' : ''}`}
                                    data-stage-id={stage.id}
                                    data-property={axis}
                                    data-key-id={key.id}
                                    style={{
                                      left: `${key.time * 100}%`,
                                      top:
                                        displayedItems.length === 1
                                          ? '50%'
                                          : axisIndex === 0
                                            ? '30%'
                                            : '70%',
                                    }}
                                    title={`${propertyLabels[axis]} · ${(key.time * duration).toFixed(2)} s · ${key.value}`}
                                    aria-label={`${stage.name} ${propertyLabels[axis]} key at ${(key.time * duration).toFixed(2)} seconds`}
                                    onPointerDown={(event) => selectKey(event, identity, key.time)}
                                    onPointerMove={moveKeys}
                                    onPointerUp={() => (keyDrag.current = null)}
                                    onLostPointerCapture={() => (keyDrag.current = null)}
                                  />
                                );
                              }),
                            )}
                          </div>,
                        ];
                      })
                    : []),
                ];
              })}
            {graphMode && graphStage
              ? [
                  <div className="keyframe-label ae-graph-label" key="graph-label">
                    GRAPH · {graphStage.name}
                    <br />
                    {propertyLabels[property]}
                  </div>,
                  <div
                    className="ae-graph-canvas keyframe-canvas"
                    key="graph-canvas"
                    onPointerDown={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      props.onProgress(
                        snapTime(
                          (event.clientX - bounds.left) / Math.max(1, bounds.width),
                          props.config,
                          snap,
                        ),
                      );
                    }}
                  >
                    <svg
                      viewBox="0 0 1000 145"
                      preserveAspectRatio="none"
                      aria-label={`${propertyLabels[property]} value graph`}
                    >
                      <path
                        d={graphPath}
                        fill="none"
                        stroke="#d5ec84"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                      {graphTrack?.keys.map((key) => (
                        <circle
                          key={key.id}
                          cx={key.time * 1000}
                          cy={graphY(key.value)}
                          r="5"
                          fill="#85d7e8"
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            event.stopPropagation();
                            rootRef.current?.focus();
                            props.onPlaying(false);
                            setSelectedKeys([{ stageId: graphStage.id, property, id: key.id }]);
                            props.onProgress(key.time);
                            const bounds =
                              event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                            graphDrag.current = {
                              pointerId: event.pointerId,
                              startX: event.clientX,
                              startY: event.clientY,
                              left: bounds.left,
                              top: bounds.top,
                              width: bounds.width,
                              height: bounds.height,
                              stageId: graphStage.id,
                              property,
                              keyId: key.id,
                              min: graphMin,
                              range: graphRange,
                              config: structuredClone(props.config),
                              recorded: false,
                            };
                            setGraphViewport({
                              stageId: graphStage.id,
                              property,
                              min: graphMin,
                              range: graphRange,
                            });
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={moveGraphPoint}
                          onPointerUp={finishGraphDrag}
                          onPointerCancel={finishGraphDrag}
                          onLostPointerCapture={finishGraphDrag}
                        />
                      ))}
                      {graphSegmentStart &&
                      graphSegmentEnd &&
                      graphBezier &&
                      graphSegmentStart.interpolation !== 'step' &&
                      graphSegmentStart.interpolation !== 'ease-in-out' ? (
                        <>
                          {([0, 1] as const).map((handle) => {
                            const fractionX = graphBezier[handle * 2]!;
                            const fractionY = graphBezier[handle * 2 + 1]!;
                            const handleTime =
                              graphSegmentStart.time +
                              (graphSegmentEnd.time - graphSegmentStart.time) * fractionX;
                            const handleValue =
                              graphSegmentStart.value +
                              (graphSegmentEnd.value - graphSegmentStart.value) * fractionY;
                            const anchor = handle === 0 ? graphSegmentStart : graphSegmentEnd;
                            const onKey = graphTrack?.keys.some(
                              (key) =>
                                Math.abs(key.time - handleTime) < 0.000001 &&
                                Math.abs(key.value - handleValue) < 0.000001,
                            );
                            return (
                              <g key={handle}>
                                <line
                                  className="ae-bezier-guide"
                                  x1={anchor.time * 1000}
                                  y1={graphY(anchor.value)}
                                  x2={handleTime * 1000}
                                  y2={graphY(handleValue)}
                                />
                                <circle
                                  className={`ae-bezier-handle${onKey ? ' is-on-key' : ''}`}
                                  cx={handleTime * 1000}
                                  cy={graphY(handleValue)}
                                  r={onKey ? 8 : 5}
                                  aria-label={`Bézier ${handle === 0 ? 'outgoing' : 'incoming'} handle`}
                                  onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    rootRef.current?.focus();
                                    props.onPlaying(false);
                                    const bounds =
                                      event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                                    handleDrag.current = {
                                      pointerId: event.pointerId,
                                      startX: event.clientX,
                                      startY: event.clientY,
                                      left: bounds.left,
                                      top: bounds.top,
                                      width: bounds.width,
                                      height: bounds.height,
                                      min: graphMin,
                                      range: graphRange,
                                      stageId: graphStage.id,
                                      property,
                                      keyId: graphSegmentStart.id,
                                      handle,
                                      config: structuredClone(props.config),
                                      recorded: false,
                                    };
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                  }}
                                  onPointerMove={moveBezierHandle}
                                  onPointerUp={finishGraphDrag}
                                  onPointerCancel={finishGraphDrag}
                                  onLostPointerCapture={finishGraphDrag}
                                />
                              </g>
                            );
                          })}
                        </>
                      ) : null}
                    </svg>
                    <span className="ae-graph-max">{graphMax.toFixed(2)}</span>
                    <span className="ae-graph-min">{graphMin.toFixed(2)}</span>
                  </div>,
                ]
              : null}
            <div
              className="keyframe-playhead"
              style={{
                left: `calc(${labelWidth * (1 - props.progress)}px + ${props.progress * 100}%)`,
              }}
            />
          </div>
        </div>
        <div className={`keyframe-inspector ${selectedKey ? 'has-selected-key' : ''}`}>
          <span>KEYFRAME CONTROLS</span>
          {selectedKey && selectedLast ? (
            <>
              <strong>
                {props.config.stages.find((stage) => stage.id === selectedLast.stageId)?.name} ·{' '}
                {propertyLabels[selectedLast.property]}
              </strong>
              <small>
                {selectedKeys.length} selected · {timecode(selectedKey.time, props.config)}
              </small>
              <label>
                TIME · SECONDS{' '}
                <NumericInput
                  value={Number((selectedKey.time * duration).toFixed(3))}
                  min={0}
                  max={duration}
                  step={1 / fps}
                  disabled={selectedKeys.length !== 1}
                  onCommit={changeSelectedTime}
                />
              </label>
              <label>
                VALUE{' '}
                <NumericInput
                  value={selectedKey.value}
                  step={0.01}
                  disabled={selectedKeys.length !== 1}
                  onCommit={(next) =>
                    changeSelected(
                      (key, item) =>
                        (key.value = constrainValue(
                          item,
                          next,
                          props.config.stages.find((stage) => stage.id === selectedLast.stageId),
                        )),
                    )
                  }
                />
              </label>
              <label>
                OUTGOING INTERPOLATION{' '}
                <select
                  value={selectedKey.interpolation}
                  onChange={(event) =>
                    changeSelected((key) =>
                      setAnimationKeyInterpolation(
                        key,
                        event.target.value as BuildingKeyInterpolation,
                      ),
                    )
                  }
                >
                  {Object.entries(interpolationLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ae-ease-actions">
                <button onClick={() => changeSelected((key) => (key.interpolation = 'step'))}>
                  HOLD
                </button>
                <button
                  onClick={() => changeSelected((key) => (key.interpolation = 'ease-in-out'))}
                >
                  EASY EASE · F9
                </button>
              </div>
              {selectedKey.interpolation === 'ease-in-out' ? (
                <button
                  title="Convert Easy Ease to an editable cubic approximation"
                  onClick={() =>
                    changeSelected((key) => setAnimationKeyInterpolation(key, 'cubic-bezier'))
                  }
                >
                  EDIT BÉZIER
                </button>
              ) : null}
              {selectedKey.interpolation === 'cubic-bezier' ? (
                <div className="keyframe-bezier">
                  <span>BÉZIER [X1, Y1, X2, Y2]</span>
                  {selectedKey.bezier.map((value, index) => (
                    <NumericInput
                      key={index}
                      value={value}
                      min={0}
                      max={1}
                      step={0.05}
                      label={`Bezier point ${index + 1}`}
                      onCommit={(next) =>
                        changeSelected((key) => {
                          key.bezier[index] = clamp01(next);
                        })
                      }
                    />
                  ))}
                </div>
              ) : null}
              <button className="keyframe-delete" onClick={deleteKeys}>
                DELETE SELECTED KEYS
              </button>
            </>
          ) : (
            <p>
              Секундомер включает анимацию свойства. При выключенном AUTO-KEY неанимируемое свойство
              меняет базовое значение; существующий track редактируется на текущем времени.
            </p>
          )}
          <small className="keyframe-export-note">
            J/K · PREV/NEXT&nbsp; PAGE ↑/↓ · FRAME&nbsp; U · ANIMATED&nbsp; F9 · EASE
          </small>
        </div>
      </div>
      {marquee ? (
        <div
          className="ae-key-marquee"
          style={{
            left: marquee.x1,
            top: marquee.y1,
            width: marquee.x2 - marquee.x1,
            height: marquee.y2 - marquee.y1,
          }}
        />
      ) : null}
    </div>
  );
}
