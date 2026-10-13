# Архитектура Ballistics Lab

## Обзор

Проект разделён на детерминированное ядро симуляции и адаптеры представления. `GameRuntime` создаётся вне React и владеет `GameState`, конфигурацией, очередью команд и `SimulationClock`. React отображает UI; Pixi читает итоговое состояние; DOM-ввод преобразуется в команды.

```text
React UI / DOM input                  Pixi renderer
      │                                      ▲
      ├── GameCommand ──► GameRuntime ──► GameState
      │                       │                 │
      │                       ▼                 │
      │                 stepSimulation ─────────┘
      │                       │
      │        commands → orders → weapons → projectile physics
      │                       │
      └──────────────── collision → impacts / combat / explosions → terrain
```

## Слои и владение

| Слой           | Каталоги                                                              | Ответственность                                                          |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Application/UI | `app`, `ui`                                                           | React layout, настройки, HUD и телеметрия; не владеет миром.             |
| Runtime        | `game/core`                                                           | Часы, пауза/step/reset, очередь команд, fixed tick, snapshot.            |
| Gameplay       | `commands`, `orders`, `entities`, `weapons`, `ballistics`, `movement` | Модель установок, приказы, выбор оружия, solver и полёт.                 |
| Resolution     | `collision`, `impacts`, `combat`, `explosions`, `terrain`             | Геометрические факты, pure resolutions, damage/events и изменение сетки. |
| Adapters       | `client`, `input`, `rendering`, `effects`                             | Камера, client-only selection, DOM/Pixi и визуальные эффекты.            |

## Tick и события

`SimulationClock` накапливает длительность кадров и вызывает fixed tick. `stepSimulation` обрабатывает команды, обновляет приказы и установки, затем интегрирует физические тела, продвигает снаряды и применяет последствия в стабильном порядке. Контакты тел с CPU occupancy и друг с другом вычисляются отдельно от resolver импульсов. Пары обрабатываются по ID; быстрые тела проходят swept-проверку. После изменений terrain тела в затронутой области пробуждаются.

`state.events` содержит только данные текущего тика: spawn/impact/resolve/damage/explosion/terrain-damage события. В начале следующего тика он очищается. `lastImpact` и отладочный путь — отдельные каналы для HUD/debug, не журнал истории.

Активное пробитие продвигает снаряд по материалу не дальше первого swept-контакта с телом или
сущностью на текущем шаге. Контакт проходит через тот же resolver удара, что и обычный полёт;
канал разрушения ограничивается пройденным отрезком. Обновление конфигурации с пересозданием
мира сначала строит новое состояние и только после успеха заменяет конфигурацию и состояние.

```text
FireCommand → fireInstallation → ProjectileState → advanceProjectile
    → queryProjectileCollision → ImpactEvent / EntityImpactEvent
    → resolveImpact | resolveEntityDamage | resolveExplosion
    → TerrainDamageEvent / EntityDamageEvent → apply state mutation
```

Коллизия определяет первый контакт, нормаль и точку касания. Она не принимает gameplay-решение. `resolveImpact` выбирает `stop`, `penetrate` или `ricochet` и возвращает semantic terrain operation; только обработчик события изменяет `TerrainGrid`.

## Данные мира

- `GameConfig` хранит мир, генерацию, RTS-параметры и per-weapon runtime overrides. Неизменяемые registries definitions — источник defaults.
- Companion `*_density` выбранного Rock-материала (или `*_alpha`, если density отсутствует)
  выбирается общим helper для renderer и simulation и декодируется только на client boundary в числовой профиль
  `RockLayerMask`. Сериализуемый профиль входит в `GameConfig`; чистый `generateTerrain` применяет
  его к авторитетным material cells без импорта DOM, Pixi или файловой системы.
- `GameState` содержит установки, снаряды, физические тела, terrain, очередь текущих событий и краткую телеметрию.
- Companion `*_density` декодируется browser-адаптером в `RockDensityMask` (яркость 0–255,
  до 512×512 отсчётов, размеры плитки в метрах и ориентация). `GameConfig` передаёт её
  генератору; `TerrainGrid` хранит неизменяемую копию. Чистые damage/penetration helpers
  семплируют её в мировых координатах, меняя только прочность Rock. Preview и snapshot
  копируют маску. CPU и shader используют один integer hash случайных ориентаций.
- `BodyState` — сериализуемые круги и повёрнутые прямоугольники со статическим, динамическим или кинематическим режимом, массой, линейной и угловой скоростью, трением, упругостью и состоянием покоя. Момент инерции вычисляется из массы и формы. Устойчивые стопки пока не моделируются.
- Снаряды ищут первый контакт среди terrain, установок и физических тел. Попадание в тело передаёт импульс в точке контакта и создаёт `bodyImpact`; взрывное оружие сохраняет общий explosion pipeline. Preview использует тот же collision helper с копией текущих положений тел.
- `InstallationState` — стационарная управляемая сущность с ownership, здоровьем, оружием и очередью приказов.
- `TerrainGrid` хранит `Uint8Array` материалов `Air`/`Soil`/`Rock` и авторитетную occupancy-маску в chunks по 256×256 ячеек. Каждый chunk упаковывает 32 горизонтальные ячейки в слово `Uint32`; version и журнал dirty-изменений позволяют renderer и preview замечать локальные изменения.
- Снаряд копирует параметры, нужные для стабильного полёта, при spawn. Настройки оружия действуют на следующие выстрелы; изменения сил действуют со следующего тика.

## Рендеринг и клиентское состояние

`MaterialMapCache` однократно строит Height Map из albedo выбранного Rock-ассета и загружает
соседний PNG `_normal`, если он есть; при его отсутствии генерирует Normal Map из высот.
`TerrainLayer` держит эти renderer-only ресурсы и передаёт их chunk meshes. Геометрический
градиент берётся из worker-built поля текущего рельефа, включая разрушенные края;
`TerrainChunkMesh` объединяет его с нормалью материала и считает диффузный свет на GPU.
`SceneLighting` собирает свет под курсором, вспышки из `RecentExplosion`, Aura/Light через
`BuildingAnimationPlayer.getLightSources` и свечение снарядов. Источники заданы в мировых метрах;
chunk отбирает до 32 пересекающих его радиусом источников по вкладу и загружает uniform-массивы.
`BuildingAnimationLights` использует те же key sampling/матрицы, что видимые слои, и учитывает
Hidden/Solo, clip, pivot, масштаб и opacity сущности. `TerrainEffectMaps` хранит только фоновую
карту глубины и марево: вспышки не дублируются в постобработке.
Glow передаётся отдельно через `BuildingAnimationPlayer.getGlowSources`. `BuildingGlowMasks`
владеет копиями render nodes и переиспользуемыми RenderTexture; оригиналы не изменяются и
не переподчиняются. Захватывается исходная альфа изображений/генераторов, включая переходы
стадий, геометрию живых частиц/атласа/кольца и основную opacity, без визуальной opacity и
декоративных фильтров. Маска ограничена 1024 пикселями по длинной стороне. `TerrainChunkMesh`
получает до четырёх пересекающих chunk масок, world→UV и basis ореола; те же 48 выборок, что
Glow, задают интенсивность и направление света по контуру. Самостоятельный центральный
точечный источник Glow исключён. GPU readback отсутствует. Ресурсы освобождаются при удалении
источника/уничтожении player; offscreen render не подтверждает публикацию terrain на экран.
Источники, настройки и presentation time не входят в `GameState` и не влияют на collision или симуляцию.
`fxVisualOpacity` — опциональный числовой параметр/track процедурных слоёв и Glow в schema v9,
с default 1 для существующих документов. Player применяет его только к видимым генераторам
и alpha ореола внутри Glow shader, отдельно от общего Mix; `BuildingAnimationLights` не включает его в силу источника.
Промежуточные filter passes используют normal на пустой render texture, финальный pass
сохраняет blend mode ресурса, включая Add/Screen. Глобальные
`visualOpacity` у lightmap/glow/bloom управляют только вспышками и постобработкой свечения,
с default 1 при восстановлении прежних settings.json.

Pixi получает состояние от runtime через `GameCanvas`/`GameScene`. `TerrainLayer` читает журнал dirty-прямоугольников, объединяет изменения по chunk и передаёт Web Worker material-область с halo. Worker строит компактное поле signed-distance/material/shade, а один прямоугольный mesh каждого затронутого chunk обновляет его независимо. Канал R кодирует приближённое знаковое расстояние в пределах четырёх клеток от границы; локальный фильтр сглаживает лестницу, сохраняя знак в центрах клеток и исходные расстояния около тонких элементов. Все texel поля непрозрачны, чтобы premultiplied-alpha upload не стирал расстояния в Air; для точной маски shader читает знак R в центре ячейки. Билинейное восстановление не создаёт новых экстремумов между соседними ячейками; padding исходных материалов и dirty-инвалидация учитывают радиус расстояния и фильтра. Shader восстанавливает контур, применяет экранное AA и семплирует исходную material texture в мировых координатах. Миникарта использует отдельные mesh-инстансы с теми же полями и material texture. CPU occupancy остаётся единственным источником collision, GPU readback отсутствует. Preview использует те же helpers полёта и impact, но делает временную копию terrain для скола. React получает только компактную телеметрию с ограниченной частотой, а не обновляет дерево на каждый игровой кадр.

Сгенерированная карта дополнительно хранит неизменяемый `initialSurfaceMeters`, скопированный
при создании `TerrainGrid`. Snapshot копирует его в обычный массив. `TerrainLayer` передаёт
worker локальные дробные высоты (`surfaceRows`) вместе с material-областью. Для исходной
поверхности worker вычисляет поле непосредственно из этих высот; удалённые клетки вычитаются,
добавленные объединяются с исходной формой. Это убирает округление начального визуального
контура до целой строки. Для карт без профиля сохраняется восстановление из occupancy.
Физика продолжает читать только актуальную бинарную маску.

`stepSimulation` откладывает оседание только для изменённых областей terrain. После 50 мс
симуляционного времени `terrainSettling` находит локальные тонкие вертикальные сечения с Air
сверху и снизу, собирает близкие клетки и убирает их из collision mask. Следующие 240 мс
`fallingTerrain` хранит материал, исходные и целевые клетки, а Pixi рисует его движение вниз.
По завершении `TerrainGrid.applyMaterialChanges` публикует насыпь; количество материала
сохраняется между сеткой и падающими клетками. Renderer не меняет состояние симуляции.

Анимация строительства проходит отдельной presentation-цепочкой:

```text
Animation Sandbox UI → BuildingAnimationConfig → BuildingAnimationPlayer → SceneRenderer / PixiJS
                                                    ↑
                                      production buildProgress 0..1
```

`BuildingAnimationConfig` schema v9 сериализуем и хранит только стабильные `assetId`; Object URL
загруженных локально PNG/аудио остаются в React preview-state. Помимо стадий и переходов конфиг содержит
alpha-content bounds, размер sprite в world units, редактируемый hitbox, blend mode перехода и
настройки texture sampling/mipmaps/anisotropy. `BuildingAnimationPlayer` не импортирует React и не
владеет таймером: `setProgress(0..1)` вычисляет stage/transition из глобального progress. Временное
тестовое здание живёт в слое `SceneRenderer`, использует текущие camera/terrain/world units и не
изменяет `GameState`. Все 40 переходов используют один player как в sandbox,
так и в production-вызове; VFX и звуковые клипы отделены от transition schema.
`stages.kind` различает image (также legacy без kind), particles, light, ring и filter.
Изображение может ссылаться на отдельную карту нормалей через `normalMapAssetId`.
Общий перечень texture assets включает обе текстуры, в том числе для сохранённых пресетов;
Blob хранится в существующем draft/source registry. `BuildingAnimationPlayer` владеет
`BuildingNormalMapFilter`, освобождает его при перезагрузке ресурсов и destroy.
Фильтр применяется перед переходом и дочерними эффектами, получает point lights из
`SceneRenderer` в мировых метрах и учитывает текущую матрицу изображения. Simulation не участвует.
Глобальный `normalGlow` передаётся через `createSceneLighting`. `BuildingNormalMapFilter`
извлекает маску только из прямого normal-map освещения с учётом альфы исходного изображения,
размывает её на GPU и объединяет с освещённым изображением перед переходами и дочерними
эффектами. Padding соответствует размитию в экранных пикселях; только финальный проход
использует blend mode ресурса. Временные render textures возвращаются в `TexturePool`
после каждого кадра, внутренние фильтры освобождаются вместе с normal-map фильтром.
Дочерний фильтр ссылается
на ресурс через `parentId`; цепочки filter → filter и dangling references не допускаются.
Изображения сохраняют собственную последовательность milestones/переходов; VFX участвуют только
в стеке слоёв, интервалах видимости и ключах. `BuildingAnimationEffects` задаёт параметры,
диапазоны и правила группировки; `BuildingAnimationParticles` чисто вычисляет ограниченный набор
частиц по времени/seed, с admission budget на момент рождения. `BuildingAnimationTransform`
задаёт общие преобразования для renderer/манипуляторов и рождения частиц в Composition/Local.
`BuildingAnimationEffectRenderer` владеет пулом Sprite, Graphics, радиальными/atlas Texture и Filter и освобождает
их при удалении, замене типа и уничтожении player. Фильтры применяются после перехода к своему
ресурсу, в порядке дочерних слоёв. Перемещение эмиттера — изменение сериализуемого документа
через общие helpers редактирования ключей и историю; `AnimationOriginOverlay` остаётся локальным
UI, проецирует координаты через camera/world scale и не меняет `GameState`.
Планы рождения и матрицы кешируются в presentation player; seek не зависит от истории кадров.
`BuildingAnimationEffectShader` смешивает исходное и обработанное изображение по Mix и переводит
авторский центр в фактический input frame Pixi, включая padding/clip. `AnimationEffectEditing`
в UI переносит клипы вместе с tracks/зависимостями, сохраняет фазу при trim, управляет пресетами.
Удвоение инспектора, focus, selection и манипуляторы — локальное React/CSS-состояние.
`BuildingAnimationTransitions` содержит стабильный каталог, defaults и чистый sampling easing/
трансформаций; `BuildingTransitionShader` выполняет маски и искажения с premultiplied alpha.
У входящего и исходящего sprite отдельные UniformGroup; при каждом seek заново применяются
ключи, сбрасываются фильтры и вычисляется переход. Движение компонуется с authored transforms
вокруг выбранной точки canvas. Фильтр учитывает действительный frame Pixi render texture;
vertex/fragment явно используют одинаковую highp precision. Процедурные эффекты зависят
только от progress и сериализуемого seed, не от времени renderer. Импорт v2–v6 добавляет новые defaults.

`BuildingAnimationLibrary` объединяет именованные construction/idle/destruction/custom композиции
одной сущности. Каждая имеет отдельный `BuildingAnimationConfig`; PNG/аудио разрешаются общей
картой ресурсов. Single-image конфиги допустимы для idle и keyed opacity destruction.
React-хук `useAnimationDocument` в App владеет библиотекой, выбранной композицией, общей историей inspector/timeline
и presentation-таймером. Переключение режима не прерывает анимацию. История сохраняет конфигурацию
и привязки локальных ресурсов; blob URL освобождаются после исключения из документа и истории.
IndexedDB хранит последний черновик со всеми композициями и Blob-изображениями/аудио; старый
single-config record мигрирует в библиотеку. Undo/redo восстанавливает выбранную вкладку и ресурсы.
`useAnimationAudio` принадлежит этому же клиентскому документу: Web Audio декодирует файлы,
разрешает mute/solo/fades и запускает голоса по presentation progress. Пауза, перемотка назад,
цикл, скорость, смена вкладки и unmount останавливают или пересоздают голоса. Звук не импортируется
в simulation, не зависит от её часов и не меняет `GameState`. Markers — данные редактора, не gameplay events.
Inspector и timeline используют общие sampling, frame snap и правила Auto-key; редактирование
числа подтверждается Enter/blur, Escape отменяет ввод. Player сообщает загрузку/ошибки ассетов
отдельно от валидации конфига; onion skin — независимый ghost-sprite.

`SelectionState` и `RtsController` — client-side: selection, hover, рамка выделения и control groups. Они переводят намерение игрока в `GameCommand`; `GameState` остаётся пригодным для server/replay.

## Границы расширения

Чистое ядро и serializable commands/snapshots оставляют путь к сети и replay, но сами эти системы отсутствуют. Новые виды оружия расширяются definitions и resolver-профилями; новые entity/hitbox типы — collision candidate/query, без смешивания с terrain impacts.
