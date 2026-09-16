export type ShaderId =
  | 'color'
  | 'noise'
  | 'blur'
  | 'bevel'
  | 'lightmap'
  | 'shadow'
  | 'outline'
  | 'glow'
  | 'bloom'
  | 'shockwave'
  | 'heat'
  | 'motion';

export interface ShaderControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit?: string;
  color?: boolean;
}

export interface ShaderDefinition {
  id: ShaderId;
  title: string;
  description: string;
  enabled: boolean;
  controls: ShaderControl[];
}

const number = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  unit = '',
): ShaderControl => ({ key, label, min, max, step, initial, unit });
const color = (key: string, label: string, initial: number): ShaderControl => ({
  key,
  label,
  min: 0,
  max: 0xffffff,
  step: 1,
  initial,
  color: true,
});

export const shaderDefinitions: readonly ShaderDefinition[] = [
  {
    id: 'bevel',
    title: 'Объём краёв',
    enabled: true,
    description: 'Свет и тень вдоль склонов и краёв воронок.',
    controls: [
      number('thickness', 'Толщина', 0.5, 6, 0.5, 1.5, 'px'),
      number('rotation', 'Направление света', 0, 360, 5, 45, '°'),
      number('light', 'Сила света', 0, 1, 0.01, 0.22),
      number('shadow', 'Сила тени', 0, 1, 0.05, 0.3),
    ],
  },
  {
    id: 'lightmap',
    title: 'Освещение рельефа',
    enabled: true,
    description:
      'Затемнение в глубине грунта и свет от взрывов. Карта обновляется после разрушений.',
    controls: [
      number('ambient', 'Общий свет', 0.1, 1, 0.05, 0.65),
      number('depth', 'Глубина затемнения', 1, 30, 1, 12, 'm'),
      number('flash', 'Свет от взрывов', 0, 2, 0.1, 0.8),
      number('radius', 'Радиус света', 2, 25, 1, 10, 'm'),
    ],
  },
  {
    id: 'color',
    title: 'Цветокоррекция',
    enabled: true,
    description: 'Палитра игровой сцены.',
    controls: [
      number('brightness', 'Яркость', 0.3, 2, 0.01, 1.08),
      number('contrast', 'Контраст', -0.5, 0.5, 0.05, 0.05),
      number('saturation', 'Насыщенность', -1, 1, 0.05, 0.05),
      number('hue', 'Оттенок', -180, 180, 5, 0, '°'),
    ],
  },
  {
    id: 'shadow',
    title: 'Тени установок',
    enabled: true,
    description: 'Мягкая тень под силуэтом корпуса.',
    controls: [
      number('alpha', 'Непрозрачность', 0, 1, 0.05, 0.35),
      number('blur', 'Мягкость', 0, 8, 0.5, 2),
      number('offsetX', 'Смещение X', -10, 10, 1, 2, 'px'),
      number('offsetY', 'Смещение Y', -10, 10, 1, 3, 'px'),
    ],
  },
  {
    id: 'outline',
    title: 'Обводка выделения',
    enabled: true,
    description: 'Контур корпуса выбранной установки.',
    controls: [
      number('thickness', 'Толщина', 1, 5, 0.5, 1.5, 'px'),
      color('color', 'Цвет контура', 0xd5ec84),
    ],
  },
  {
    id: 'glow',
    title: 'Свечение снарядов',
    enabled: true,
    description: 'Цветной ореол снарядов и вспышек.',
    controls: [
      number('strength', 'Сила свечения', 0, 4, 0.1, 0.8),
      color('color', 'Цвет свечения', 0xffb866),
    ],
  },
  {
    id: 'bloom',
    title: 'Bloom / яркие вспышки',
    enabled: true,
    description: 'Мягкое сияние ярких снарядов и взрывов.',
    controls: [
      number('threshold', 'Порог яркости', 0, 1, 0.05, 0.65),
      number('strength', 'Сила сияния', 0, 2, 0.1, 0.5),
      number('blur', 'Радиус размытия', 1, 12, 0.5, 4, 'px'),
    ],
  },
  {
    id: 'shockwave',
    title: 'Ударная волна',
    enabled: true,
    description: 'Кольцо искажения расходится от каждого взрыва.',
    controls: [
      number('amplitude', 'Искажение', 0, 20, 0.5, 4, 'px'),
      number('speed', 'Скорость', 5, 60, 1, 24, 'm/s'),
      number('width', 'Ширина кольца', 0.5, 8, 0.5, 2, 'm'),
      number('duration', 'Длительность', 0.2, 2, 0.1, 0.7, 's'),
    ],
  },
  {
    id: 'heat',
    title: 'Марево после взрыва',
    enabled: false,
    description: 'Локальное колебание воздуха в области взрыва.',
    controls: [
      number('strength', 'Искажение', 0, 12, 0.5, 3, 'px'),
      number('radius', 'Радиус', 2, 15, 1, 6, 'm'),
      number('speed', 'Скорость колебаний', 0.5, 8, 0.5, 3),
      number('duration', 'Длительность', 0.2, 4, 0.1, 1.5, 's'),
    ],
  },
  {
    id: 'motion',
    title: 'Размытие движения',
    enabled: false,
    description: 'Шлейф каждого снаряда направлен вдоль его скорости.',
    controls: [
      number('shutter', 'Выдержка', 1, 50, 1, 12, 'ms'),
      number('maxLength', 'Максимальный шлейф', 2, 32, 1, 16, 'px'),
    ],
  },
  {
    id: 'noise',
    title: 'Зернистость',
    enabled: false,
    description: 'Лёгкое зерно поверх игровой сцены.',
    controls: [number('strength', 'Интенсивность', 0, 0.2, 0.005, 0.025)],
  },
  {
    id: 'blur',
    title: 'Размытие фона',
    enabled: false,
    description: 'Смягчает фон и его сетку.',
    controls: [number('strength', 'Радиус размытия', 0, 8, 0.5, 1.5, 'px')],
  },
];

export interface ShaderSettings {
  enabled: boolean;
  effects: Record<ShaderId, { enabled: boolean; values: Record<string, number> }>;
}

export function createShaderSettings(): ShaderSettings {
  return {
    enabled: true,
    effects: Object.fromEntries(
      shaderDefinitions.map((effect) => [
        effect.id,
        {
          enabled: effect.enabled,
          values: Object.fromEntries(
            effect.controls.map((control) => [control.key, control.initial]),
          ),
        },
      ]),
    ) as ShaderSettings['effects'],
  };
}

export function withShaderValue(
  settings: ShaderSettings,
  id: ShaderId,
  key: string,
  value: number,
): ShaderSettings {
  const control = shaderDefinitions
    .find((effect) => effect.id === id)
    ?.controls.find((item) => item.key === key);
  if (!control || !Number.isFinite(value)) return settings;
  const bounded = Math.min(control.max, Math.max(control.min, value));
  return {
    ...settings,
    effects: {
      ...settings.effects,
      [id]: {
        ...settings.effects[id],
        values: {
          ...settings.effects[id].values,
          [key]: control.color ? Math.round(bounded) : bounded,
        },
      },
    },
  };
}

export function shaderValue(settings: ShaderSettings, id: ShaderId, key: string): number {
  return settings.effects[id].values[key] ?? 0;
}
