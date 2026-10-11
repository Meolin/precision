import type {
  BuildingAnimationEasing,
  BuildingAnimationTransition,
  DissolveDirection,
} from './BuildingAnimationConfig';

// Shader IDs are explicit: exported JSON uses the stable string IDs, never this index.
export const buildingTransitionCatalog = [
  { id: 'cut', label: 'Cut', group: 'Смешивание', shader: 0, controls: '' },
  { id: 'crossfade', label: 'Crossfade', group: 'Смешивание', shader: 0, controls: '' },
  {
    id: 'fade-through-color',
    label: 'Fade through color',
    group: 'Смешивание',
    shader: 1,
    controls: 'color',
  },
  { id: 'flash', label: 'Flash', group: 'Смешивание', shader: 2, controls: 'color strength' },
  {
    id: 'reveal',
    label: 'Reveal',
    group: 'Маски',
    shader: 3,
    controls: 'direction softness reverse',
  },
  {
    id: 'linear-wipe',
    label: 'Linear wipe',
    group: 'Маски',
    shader: 3,
    controls: 'direction angle softness reverse',
  },
  {
    id: 'radial-wipe',
    label: 'Radial wipe / double fan',
    group: 'Маски',
    shader: 4,
    controls: 'center angle softness reverse',
  },
  {
    id: 'clock-wipe',
    label: 'Clock wipe',
    group: 'Маски',
    shader: 5,
    controls: 'center angle softness reverse',
  },
  {
    id: 'iris-circle',
    label: 'Iris / circle',
    group: 'Маски',
    shader: 6,
    controls: 'center softness reverse',
  },
  {
    id: 'iris-box',
    label: 'Iris / box',
    group: 'Маски',
    shader: 7,
    controls: 'center softness reverse',
  },
  {
    id: 'iris-diamond',
    label: 'Iris / diamond',
    group: 'Маски',
    shader: 8,
    controls: 'center softness reverse',
  },
  {
    id: 'blinds-horizontal',
    label: 'Blinds / horizontal',
    group: 'Маски',
    shader: 9,
    controls: 'segments softness reverse',
  },
  {
    id: 'blinds-vertical',
    label: 'Blinds / vertical',
    group: 'Маски',
    shader: 10,
    controls: 'segments softness reverse',
  },
  {
    id: 'checkerboard',
    label: 'Checkerboard',
    group: 'Маски',
    shader: 11,
    controls: 'segments softness reverse',
  },
  {
    id: 'diagonal-stripes',
    label: 'Diagonal stripes',
    group: 'Маски',
    shader: 12,
    controls: 'segments angle softness reverse',
  },
  {
    id: 'barn-door',
    label: 'Barn door',
    group: 'Маски',
    shader: 13,
    controls: 'direction center softness reverse',
  },
  {
    id: 'gradient-wipe',
    label: 'Gradient wipe',
    group: 'Растворение',
    shader: 14,
    controls: 'direction noise softness seed reverse',
  },
  {
    id: 'dissolve',
    label: 'Noise dissolve',
    group: 'Растворение',
    shader: 15,
    controls: 'direction noise softness edge seed reverse',
  },
  {
    id: 'random-blocks',
    label: 'Random blocks',
    group: 'Растворение',
    shader: 16,
    controls: 'segments direction softness seed reverse',
  },
  {
    id: 'pixel-dissolve',
    label: 'Pixel dissolve',
    group: 'Растворение',
    shader: 17,
    controls: 'segments seed reverse',
  },
  {
    id: 'luma-dissolve',
    label: 'Luma dissolve',
    group: 'Растворение',
    shader: 18,
    controls: 'softness reverse',
  },
  {
    id: 'ink-spread',
    label: 'Ink spread',
    group: 'Растворение',
    shader: 19,
    controls: 'center noise softness seed reverse',
  },
  {
    id: 'burn',
    label: 'Burn',
    group: 'Растворение',
    shader: 20,
    controls: 'direction noise softness edge seed reverse',
  },
  {
    id: 'scanline',
    label: 'Scanline',
    group: 'Маски',
    shader: 21,
    controls: 'direction segments softness edge reverse',
  },
  { id: 'slide', label: 'Slide', group: 'Движение', shader: 0, controls: 'direction reverse' },
  { id: 'push', label: 'Push', group: 'Движение', shader: 0, controls: 'direction reverse' },
  { id: 'zoom-in', label: 'Zoom in', group: 'Движение', shader: 0, controls: 'center strength' },
  { id: 'zoom-out', label: 'Zoom out', group: 'Движение', shader: 0, controls: 'center strength' },
  { id: 'rotate', label: 'Rotate', group: 'Движение', shader: 0, controls: 'center angle reverse' },
  {
    id: 'flip-horizontal',
    label: 'Flip / horizontal',
    group: 'Движение',
    shader: 0,
    controls: 'center',
  },
  {
    id: 'flip-vertical',
    label: 'Flip / vertical',
    group: 'Движение',
    shader: 0,
    controls: 'center',
  },
  {
    id: 'stretch',
    label: 'Stretch',
    group: 'Движение',
    shader: 0,
    controls: 'center direction strength',
  },
  { id: 'bounce', label: 'Bounce', group: 'Движение', shader: 0, controls: 'center strength' },
  { id: 'blur', label: 'Blur', group: 'Искажения', shader: 22, controls: 'strength' },
  {
    id: 'pixelate',
    label: 'Pixelate / mosaic',
    group: 'Искажения',
    shader: 23,
    controls: 'segments strength',
  },
  {
    id: 'glitch',
    label: 'Glitch',
    group: 'Искажения',
    shader: 24,
    controls: 'segments strength seed',
  },
  {
    id: 'wave',
    label: 'Wave',
    group: 'Искажения',
    shader: 25,
    controls: 'segments angle strength',
  },
  {
    id: 'ripple',
    label: 'Ripple',
    group: 'Искажения',
    shader: 26,
    controls: 'center segments strength',
  },
  {
    id: 'swirl',
    label: 'Swirl',
    group: 'Искажения',
    shader: 27,
    controls: 'center strength reverse',
  },
  {
    id: 'rgb-split',
    label: 'RGB split',
    group: 'Искажения',
    shader: 28,
    controls: 'angle strength',
  },
] as const;

export type BuildingTransitionType = (typeof buildingTransitionCatalog)[number]['id'];
export const buildingTransitionDirections = [
  { id: 'uniform', label: 'Uniform / default' },
  { id: 'bottom-to-top', label: 'Bottom → top' },
  { id: 'top-to-bottom', label: 'Top → bottom' },
  { id: 'center-out', label: 'Center → outside' },
  { id: 'outside-in', label: 'Outside → center' },
  { id: 'left-to-right', label: 'Left → right' },
  { id: 'right-to-left', label: 'Right → left' },
  { id: 'top-left-to-bottom-right', label: 'Top left → bottom right' },
  { id: 'top-right-to-bottom-left', label: 'Top right → bottom left' },
  { id: 'bottom-left-to-top-right', label: 'Bottom left → top right' },
  { id: 'bottom-right-to-top-left', label: 'Bottom right → top left' },
] as const;

export const transitionParameterDefaults = {
  softness: 0.03,
  strength: 0.5,
  segments: 12,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  seed: 0,
  reverse: false,
};

export function createDefaultBuildingTransition(
  fromStageId: string,
  toStageId: string,
): BuildingAnimationTransition {
  return {
    fromStageId,
    toStageId,
    type: 'dissolve',
    direction: 'bottom-to-top',
    noiseScale: 8,
    directionStrength: 0.68,
    edgeWidth: 0.08,
    edgeIntensity: 1,
    edgeColor: '#85d7e8',
    easing: 'ease-out',
    blendMode: 'normal',
    ...transitionParameterDefaults,
  };
}

export function transitionDefinition(type: BuildingTransitionType) {
  return buildingTransitionCatalog.find((entry) => entry.id === type)!;
}

export function transitionHasControl(type: BuildingTransitionType, control: string): boolean {
  return transitionDefinition(type).controls.split(' ').includes(control);
}

export function easeTransition(progress: number, easing: BuildingAnimationEasing): number {
  const value = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (easing === 'ease-in') return value ** 3;
  if (easing === 'ease-out') return 1 - (1 - value) ** 3;
  if (easing === 'ease-in-out') return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  return value;
}

export function transitionVector(direction: DissolveDirection, reverse: boolean): [number, number] {
  const vectors: Record<DissolveDirection, [number, number]> = {
    uniform: [1, 0],
    'bottom-to-top': [0, -1],
    'top-to-bottom': [0, 1],
    'center-out': [1, 0],
    'outside-in': [-1, 0],
    'left-to-right': [1, 0],
    'right-to-left': [-1, 0],
    'top-left-to-bottom-right': [1, 1],
    'top-right-to-bottom-left': [-1, 1],
    'bottom-left-to-top-right': [1, -1],
    'bottom-right-to-top-left': [-1, -1],
  };
  const [x, y] = vectors[direction];
  return [x * (reverse ? -1 : 1), y * (reverse ? -1 : 1)];
}

export interface TransitionPose {
  opacity: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/** Offsets are fractions of canvas size; rotation is degrees. Pure and seekable. */
export function sampleBuildingTransition(
  transition: BuildingAnimationTransition,
  progress: number,
) {
  const amount = easeTransition(progress, transition.easing);
  const outgoing: TransitionPose = { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  const incoming = { ...outgoing };
  const { type, strength } = transition;
  const definition = transitionDefinition(type);
  // Masks replace pixels at full source opacity; fade/motion/distortion use crossfade.
  if (definition.shader < 3 || definition.shader > 21) {
    outgoing.opacity = 1 - amount;
    incoming.opacity = amount;
  }
  if (type === 'cut') {
    outgoing.opacity = amount < 1 ? 1 : 0;
    incoming.opacity = amount < 1 ? 0 : 1;
  } else if (type === 'fade-through-color') {
    outgoing.opacity = amount < 0.5 ? 1 : 0;
    incoming.opacity = amount >= 0.5 ? 1 : 0;
  } else if (type === 'slide' || type === 'push') {
    const [x, y] = transitionVector(transition.direction, transition.reverse);
    incoming.x = -x * (1 - amount);
    incoming.y = -y * (1 - amount);
    incoming.opacity = 1;
    outgoing.opacity = 1;
    if (type === 'push') {
      outgoing.x = x * amount;
      outgoing.y = y * amount;
    }
  } else if (type === 'zoom-in' || type === 'zoom-out') {
    const sign = type === 'zoom-in' ? -1 : 1;
    incoming.scaleX = incoming.scaleY = Math.max(0.001, 1 + sign * strength * (1 - amount));
    outgoing.scaleX = outgoing.scaleY = Math.max(0.001, 1 - sign * strength * amount);
  } else if (type === 'rotate') {
    const angle = transition.angle * (transition.reverse ? -1 : 1);
    incoming.rotation = -angle * (1 - amount) || 0;
    outgoing.rotation = angle * amount;
  } else if (type === 'flip-horizontal' || type === 'flip-vertical') {
    outgoing.opacity = amount < 0.5 ? 1 : 0;
    incoming.opacity = amount >= 0.5 ? 1 : 0;
    const axis = type === 'flip-horizontal' ? 'scaleX' : 'scaleY';
    outgoing[axis] = Math.max(0.001, 1 - 2 * amount);
    incoming[axis] = Math.max(0.001, 2 * amount - 1);
  } else if (type === 'stretch') {
    const [x, y] = transitionVector(transition.direction, false);
    incoming.scaleX = Math.max(0.001, 1 + (x ? 1 : -1) * strength * (1 - amount));
    incoming.scaleY = Math.max(0.001, 1 + (y ? 1 : -1) * strength * (1 - amount));
  } else if (type === 'bounce') {
    incoming.scaleX = incoming.scaleY = Math.max(
      0.001,
      1 - (1 - amount) ** 2 * Math.cos(amount * Math.PI * 4) * Math.min(1, strength),
    );
  }
  if (amount === 0) {
    outgoing.opacity = 1;
    incoming.opacity = 0;
  }
  if (amount === 1) {
    outgoing.opacity = 0;
    Object.assign(incoming, { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  }
  return { amount, outgoing, incoming, shader: definition.shader };
}
