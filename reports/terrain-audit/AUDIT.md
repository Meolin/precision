# Аудит разрушаемого рельефа Ballistics Lab

```text
CPU main thread
GameScene.frame → GameRuntime.advance → SimulationClock → stepSimulation
  ├─ refreshUnitGrounding (если изменился terrain.version)
  ├─ commands → updateInstallationOrders → solveBallisticAim → те же collision queries
  └─ projectiles по очереди
       ├─ stepProjectile → queryProjectileCollision
       │                    ├─ entity collision
       │                    └─ sweepTerrain → circle/cell tests → chunk.collision
       ├─ resolveImpact / resolveEntityDamage
       ├─ explosion → resolveExplosion
       │    ├─ queryEntitiesInRadius → isBlastPathOccluded → chunk.collision
       │    │    (до удаления грунта этим взрывом)
       │    └─ TerrainDamageEvent(circle)
       └─ applyTerrainDamage → TerrainGrid.destroyCircle / destroyCapsule
            ├─ cells: material IDs, Uint8Array
            ├─ chunks[].collision: packed Uint32Array
            └─ version + bounded changeHistory + dirty AABB
                 ├─ следующий projectile сразу видит изменённую сетку
                 ├─ конец тика: refreshUnitGrounding
                 ├─ preview: invalidation по глобальной version
                 └─ SceneRenderer → TerrainLayer.update
                      → dirty AABB + 5 cells → очередь затронутых chunks
                      → copy FULL chunk materials + halo/padding
                      → transfer ArrayBuffer
CPU Web Worker (один, один запрос в полёте)
  buildTerrainVisualField → FULL chunk RGBA coverage/rock/shade/occupancy
                      → transfer ArrayBuffer обратно
CPU main thread
  TerrainLayer.publish → BufferImageSource.resource + source.update
GPU WebGL
  FULL changed chunk texture upload → fixed quad mesh + material shader
                                      ├─ main world
                                      └─ minimap: отдельный mesh, общие textures

Отдельно: TerrainEffectMaps → маленькие Canvas light/heat maps → GPU filters.
Отдельного physics engine / terrain collider / physics mesh в этом пути нет.
Collision НЕ проходит через Rendering: обе ветки читают данные TerrainGrid.
```

## Область исследования и главный результат

Исследован рабочий каталог на 24 сентября 2026 года, включая существовавшие до аудита незакоммиченные изменения. Это принципиально: текущие исходники уже используют coverage fields, а исторические документы и имя `terrainContours.test.ts` могут создать неверное впечатление о polygon pipeline. Игровые исходники не изменялись. В эту папку добавлены только отчёт, воспроизводимые CPU-пробы и их результаты.

**Фундаментальная смена представления terrain не нужна.** Уже есть компактная материальная сетка, chunked bitmask, локальные разрушения, журнал изменений и независимый renderer. Нет растущего списка кратеров, полноэкранной триангуляции или collision по визуальным полигонам. Главные ограничения — крупная гранулярность визуальных обновлений, политика очереди Worker и многократное использование дорогих collision queries в синхронном solver/preview.

Подтверждены три отдельных дефекта/предельных поведения: пропуск касательного контакта sampled sweep, отсутствие публикаций при непрерывном устаревании Worker-результатов и удаление граничной ячейки кругом далеко за картой. Они не требуют замены bitmap-архитектуры.

Основание: чтение реализации и локальной установленной PixiJS, штатные тесты, отдельные Node CPU-замеры и воспроизведения. **Browser frame time, GPU duration, фактические draw calls, heap/GC timeline и задержка реального Worker не измерялись.** Ниже вычисленные объёмы и прогнозы не выдаются за GPU-профиль или за worst frame приложения.

## 1. Источник истины, материалы и жизненный цикл

Для вопроса «есть ли земля в `(x,y)`?» рабочий ответ: перевести метры в ячейку через `floor(x / cellSizeMeters)`, затем вызвать `TerrainGrid.isSolid`. Метод читает бит в `chunks[].collision`, а не texture, polygon или collider. Это O(1): индекс чанка, индекс слова, одна загрузка слова и битовый тест; дополнительно увеличивается диагностический счётчик. За границей мира возвращается air.

Рядом хранится **полная карта материалов `cells: Uint8Array`**. `0 = Air`, `1 = Soil`, `2 = Rock`; ненулевой материал означает solid. Получается намеренная избыточность: solid можно вывести и из материала. Renderer, snapshots и часть penetration читают материалы, а столкновения и grounding — битмаску. Единственный владелец записи — `TerrainGrid`, который синхронно обновляет обе структуры. Конструктор восстанавливает маску из материалов. Практически это один согласованный terrain state с двумя представлениями, а не два независимо редактируемых мира.

Точная оговорка к слову «authoritative»: для occupancy-query авторитетна маска; для восстановления из snapshot — material map. Если разрешить запись напрямую в массивы, разные потребители действительно дадут разные ответы. `readonly` запрещает замену ссылки, но не `cells[i] = ...` или `collision[i] = ...`. В просмотренных production call sites такой обход записи не обнаружен. Это риск API-инварианта, а не доказанная текущая рассинхронизация. Небольшое улучшение — скрыть mutable buffers за read/copy API и проверять `isSolid == material !== Air` тестами.

Источники: [TerrainGrid, constructor/query/mutation](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainGrid.ts:24), [TerrainChunk](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainChunk.ts:15), [materials](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainMaterialDefinition.ts:5).

Жизненный цикл:

1. `generateTerrain` строит seeded material array по колонкам; `TerrainGrid` копирует его и однократно создаёт маски. Это O(W×H), приемлемо при создании/reset. Временная исходная карта и копия одновременно занимают память.
2. Collision возвращает геометрию контакта. Resolvers создают semantic events. `resolveExplosion` сначала проверяет экранирование на ещё не вырезанном этим взрывом грунте, затем `applyExplosion` применяет damage и кратер.
3. Круг удаляется горизонтальными spans; материалы обнуляются через `fill`, occupancy — группами битов. Подсчёт удаляемых материалов всё ещё читает каждую ячейку span. Цена O((r/h)²), а не чистое O(area/32).
4. Capsule проверяет центр каждой ячейки своего bounding rectangle через расстояние до отрезка. Цена O(AABB/h²), иногда существенно выше фактической площади узкого диагонального канала.
5. При реальном изменении увеличивается `version`, обновляются affected chunk revisions и журнал. Повторное разрушение пустоты не публикует изменение, но всё равно сканирует локальную область.
6. Следующие снаряды тика видят новую occupancy. Grounding обновляется в конце тика. Визуальная ветка позже получает snapshot области и может отставать, не блокируя gameplay.
7. Reset заменяет terrain identity, очищает визуальные объекты и заказывает все chunks. `generation` отсекает ответы для старого мира; minimap очищается до освобождения общих texture resources.

Источники: [generation](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/generateTerrain.ts:18), [stepSimulation](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/core/stepSimulation.ts:24), [resolveExplosion](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/explosions/resolveExplosion.ts:42), [damage dispatch](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/damageTerrain.ts:6).

Материалы влияют на penetration/ricochet; `blastResistance` объявлен как резерв и круговое удаление не различает Soil/Rock. Не существует реализованных metal/resource/indestructible. RGB-текстуры не кодируют игровой материал. Дополнительная битмаска стоит примерно 12.5% к byte material map плюс выравнивание строк; заменять всё на один бит нельзя без потери материалов.

## 2. Chunking и dirty regions: что действительно локально

Default world — **360×64 m**, ячейка 0.2 m: **1800×320 = 576 000 cells**, chunks 256×256, сетка чанков 8×2 = 16. Правый и нижний края имеют неполные chunks. Это не старая карта 600×320 из части тестов. Валидатор ограничивает карту 4 млн ячеек.

Источники: [world layout](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/config/worldLayout.ts:1), [default config](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/config/defaultGameConfig.ts:6).

| Слой                   | Реальная гранулярность                                          | Требуются ли соседи                   |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Material map           | Глобальный flat array; записи локальные                         | Нет                                   |
| Occupancy              | Независимые packed chunks; запись spans/bits                    | Нет                                   |
| Change journal         | Global AABB + chunk-local AABBs, максимум 512 записей           | Нет                                   |
| Scheduling renderer    | Global dirty AABB расширяется на 5 cells, разбивается по чанкам | Да, если расширение пересекло границу |
| Main-thread подготовка | Весь чанк плюс 5 cells с каждой стороны                         | Читает материал соседей               |
| Worker computation     | Всё поле чанка с halo 1                                         | Дополнительный sample padding 4       |
| GPU upload             | Вся texture изменённого чанка                                   | Нет общей world texture               |
| Mesh                   | Постоянный quad; не перестраивается после кратера               | Нет                                   |
| Physics collider       | Отсутствует                                                     | —                                     |

Halo объясняется кодом: field halo = 1, kernel radius = 1, surface-depth dependency = 3; padding = 1+3 = 4, invalidation padding = 1+1+3 = 5. Для полного чанка вход **266×266 bytes = 70 756 B**, выход **258×258×4 = 266 256 B**. Минимум 337 012 B новых typed buffers на одну такую сборку без учёта metadata/старого поля.

`PendingRegion.rect` действительно объединяется, но **не передаётся в Worker protocol и не ограничивает loops в `requestNext`**. Сегодня dirty rectangle даёт chunk-locality, но не sub-chunk locality. Малая правка одной ячейки стоит целого поля. Несколько правок одного ожидающего чанка объединяются, что полезно.

Журнал ограничен 512 изменениями. `getChangesSince` фильтрует до 512 записей; при пропуске старой истории возвращает `fullChange` и renderer обновляет мир. Такой rebuild нужен как корректный recovery, но возможен spike после долгого отсутствия потребителя или большого числа изменений между обновлениями. Это не rebuild после каждого взрыва.

`chunk.dirtyRect` хранит union за всё время с создания и никогда не сбрасывается; `dirty` также остаётся true. Текущий renderer читает журнал, поэтому эта накопительная область **не расширяет текущие rebuilds**. Но её нельзя использовать как «dirty с последнего кадра». `lastChange` также остаётся последним реальным изменением при no-op разрушении.

Риск швов: нужный соседний контекст берётся из общей material map, а field tests сравнивают локальную сборку с полной. Collision не зависит от швов. Однако соседние textures публикуются по очереди: при изменении через границу возможен временный визуальный шов между разными revisions. Статическая математическая согласованность полей не является проверкой реального WebGL изображения; последняя здесь не выполнялась.

Источники: [dirty journal](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainGrid.ts:166), [publication](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainGrid.ts:398), [schedule and copies](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainLayer.ts:128), [Worker protocol](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/terrainRasterProtocol.ts:1), [halo and field builder](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/terrainVisualField.ts:3).

## 3. Rendering, Marching Squares, triangulation и physics

**В текущем runtime нет Marching Squares, contour extraction, contour simplification, polygon booleans, terrain triangulation или physics engine.** Файл `terrainContours.test.ts` содержит исторические regression fixtures для новой mask boundary; наличие имени не означает работающий contour pipeline.

`TerrainChunkMesh` создаёт ровно 4 вершины и 6 индексов — 2 треугольника на чанк. Это статическая геометрия прямоугольника, а не триангуляция кратеров. Поле RGBA хранит R=coverage, G=Rock fraction, B=shade, A=exact cell occupancy. Shader сэмплирует поле, применяет threshold/smoothstep и material texture в мировых координатах. Alpha field — производная копия CPU occupancy, она не используется gameplay.

Coverage — **не SDF**: значения не являются расстояниями в метрах/ячейках; `shadeAt` — локальная эвристика поверхности, не distance transform. Cell-centre threshold сохраняется; это не обещает идентичного круговым collision tests силуэта в каждой дробной координате.

Одна общая программа shader, но отдельные geometry/uniforms/mesh на чанк и отдельные instances миникарты. По установленной PixiJS `Mesh.batched` возвращает false при custom shader. Значит, batching terrain quads автоматически не происходит: основной вклад в команды рендера растёт с числом присутствующих chunks, а не с количеством кратеров. Для default map — 64 вершины / 32 triangles в мире и столько же в minimap, когда все 16 чанков готовы. Дополнительные UI/effect draws сюда не входят.

`TerrainLayer.update` обходит все готовые visuals каждый кадр и переписывает settings, даже неизменные. Minimap создаёт массив chunks и `Set` ключей, обходит все chunks, синхронизирует uniforms/rects. Явного culling/eviction пустых и невидимых terrain chunks нет. Все chunks, включая полностью пустое небо, собираются при старте. Screen clipping не устраняет CPU обход и отправку невидимого mesh. На GPU quad с air всё равно сэмплирует field, затем выходит из shader с нулевой alpha; rock sampling пропускается. Вне viewport rasterization ограничена экраном, поэтому нельзя приравнивать стоимость fragments к полной площади большой карты.

Texture objects и geometry переиспользуются. При следующем поле заменяется `BufferImageSource.resource`, вызывается `source.update()`. Установленный `glUploadBufferImageResource` действительно делает `texSubImage2D`, **но с offset 0,0 и width/height всей texture**. Поэтому «используется texSubImage2D» здесь не значит «загружается малый dirty rect». Нет `create canvas → new terrain texture` после каждого взрыва, нет terrain GPU→CPU readback.

Источники: [quad/shader](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainChunkMesh.ts:169), [publish](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainLayer.ts:322), [minimap](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/MinimapRenderer.ts:33), [installed Pixi upload](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/node_modules/pixi.js/lib/rendering/renderers/gl/texture/uploaders/glUploadBufferImageResource.mjs:3), [installed Mesh batching](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/node_modules/pixi.js/lib/scene/mesh/shared/Mesh.mjs:90).

Отдельная ветка Canvas действительно существует: `TerrainEffectMaps` использует base/light/heat размером **240×128**. При изменении terrain lightmap пересчитывает затронутые x-колонки по всей высоте (depth зависит от предыдущих y); при этом `getImageData`/`putImageData` работают с полной маленькой картой. Light/heat textures загружаются целиком. Это примерно 120 KiB на RGBA map, а не полный world bitmap. Heat создаёт новый ImageData, эффекты обновляются с ключом 30 Hz во время активности. Recent explosions ограничены 32, shockwave passes — четырьмя; filterArea ограничен камерой. Это разумные ограничения, а не бесконечный исторический эффект. Стоимость post-processing зависит от экранного разрешения и включённых фильтров и может превысить собственно terrain.

Источники: [effect maps](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainEffectMaps.ts:8), [post-processing](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/ScenePostProcessing.ts:94), [recent explosions](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/core/GameRuntime.ts:122).

## 4. Collision queries и точность

Обозначения: h — размер ячейки; L — длина сегмента; r — радиус снаряда; H — число строк; U — число установок; S=ceil(2L/h)+1; K≈(ceil(2r/h)+2)² — верхняя оценка проверяемых ячеек диска. Ранний выход часто уменьшает фактическое число reads. Physics engine во всех строках отсутствует.

| Query                                     | Алгоритм / асимптотика                                            | Reads, allocations и частота                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `isSolid`                                 | Bit lookup, O(1)                                                  | Одно mask word + metadata чанка; нет allocation; hot primitive                                                           |
| `getMaterialAtCell`                       | Byte lookup, O(1)                                                 | Один material byte; world wrapper создаёт Vec2                                                                           |
| `findTerrainContactCell` / circle overlap | Circle vs solid cell AABBs, O(K)                                  | До K occupancy reads; временные min/max/worldToCell vectors и contact cell                                               |
| `sweepTerrain`                            | Samples каждые ≤h/2, circle overlap; 8 binary refinements при hit | O(S×K + 8K + 25); generator и объекты на sample, lerp vectors; один вызов на летящий projectile/tick плюс solver/preview |
| `raycastTerrain`                          | Тот же sweep с r=0                                                | O(L/h), но сохраняет circle-query overhead; отдельный production consumer этого convenience API не найден                |
| `isBlastPathOccluded`                     | Half-cell segment samples; source cell исключается                | O(L/h), Vec2/generator/worldToCell на sample; один ray на AoE candidate при включённом occlusion                         |
| `calculateSurfaceNormal`                  | 5×5 occupancy gradient                                            | Ровно 25 `isSolid`; O(1); без polygon/SDF                                                                                |
| `findSurfaceY`                            | Сверху вниз по колонке через chunks                               | O(H), до H word reads; scalar return, нет per-row vector; возвращает самую верхнюю землю                                 |
| `queryUnitGrounding`                      | Surface queries для центра и footprint                            | O((r_unit/h+1)×H); после новой global terrain version для всех живых units                                               |
| Penetration entry                         | Материал центра, при air — rim contact; bounded sampling          | До 4096 samples, O(samples×K) в худшем случае; material samples/traversed segments allocations                           |
| Active penetration                        | Прогресс по ранее сохранённым material samples                    | Ограничен distance/step и энергией; создаёт capsule damage каждый пройденный tick                                        |
| Ricochet separation                       | До 32 circle tests по нормали                                     | O(32K), короткоживущие vectors                                                                                           |

`queryProjectileCollision` после успешного sweep **повторно** вызывает `findTerrainContactCell`, хотя внутри sweep эта ячейка уже была найдена. Локальный возврат cell/material вместе с hit убрал бы повтор. Это небольшая оптимизация, не главная причина нагрузки.

Источники: [sweep and circle](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/terrainCollision.ts:20), [sampling](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/sampleTerrainSegment.ts:4), [normal](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/surfaceNormal.ts:8), [occlusion](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/explosions/isBlastPathOccluded.ts:6), [grounding](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/movement/terrainGrounding.ts:29), [penetration](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/impacts/resolvePenetration.ts:15), [candidate query](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/collision/queryProjectileCollision.ts:14).

Горячий API — `sweepTerrain → findTerrainContactCell → isSolid`. В живой симуляции P летящих снарядов дают примерно P sweeps/tick, при 60 Hz — до 60P/сек, не считая ранних смертей и active penetration. **Число за render frame непостоянно:** accumulator может выполнить несколько тиков, а solver в одном тике добавляет множество пробных траекторий. При default range 5–85°, шаге 2° — 41 исходный angle candidate и до 72 дополнительных после трёх refinements; каждый ограничен default 1200 ticks (20 s×60 Hz, также есть отдельный cap). Preview — ещё до 1200 ticks при cache miss. Это верхние границы, не фактические числа каждого кадра.

Fixed timestep устраняет прямую зависимость collision от render FPS. При одинаковой последовательности simulation ticks результат повторяем. Но sweep проверяет отрезок между позициями дискретного интегратора, а не непрерывную параболу; dt влияет на траекторию. После контакта остаток тика не интегрируется. Ограничение frame delta 250 ms также не гарантирует сохранение всего реального времени при длинной паузе main thread.

**Sampling не является точным CCD.** Даже шаг h/2 может не попасть в очень короткий интервал касания угла. Воспроизведено на h=0.2 m и штатном r=0.12 m: ячейка (1,1) solid; segment от `(0.0872471863, 0.1432471863)` к `(0.1432471863, 0.0872471863)`. В середине `circleTouchesTerrain=true`, но `sweepTerrain=null`. Binary search не помогает, поскольку он запускается только после найденного occupied sample. Отдельная point-ray проба также пропускает короткий проход через угол и даёт `occluded=false`.

**DDA подходит прежде всего для point rays/occlusion**: пройти действительно пересечённые cells, определив правила для corner ties и world bounds. Для projectile с радиусом простой DDA по центру недостаточен: нужен консервативный набор соседних cells и точный time-of-impact круга относительно cell rectangle (с округлёнными углами Minkowski boundary), либо другой корректный circle sweep. Проверка только expanded AABB может давать ложные corner contacts. Изменение локальное для collision module, однако требует regression-тестов для grazing, starts-inside, chunk seams и tie ordering.

Сетка уже пригодна для такого обхода; менять storage или вводить physics engine не требуется. DDA улучшает константы point-query и точность посещения ячеек, но не превращает длинный ray в O(1). Для крупных пустых областей позже полезна coarse empty/occupied hierarchy. Базовый принцип обхода границ grid изложен в [PBRT, DDA iterator](https://www.pbr-book.org/4ed/Volume_Scattering/Media); его применение к 2D здесь — предлагаемое направление, а не реализация из проекта.

## 5. CPU / Worker / GPU и крупные копирования

| Исполнитель                               | Работа                                                                     | Возможный предел                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Main thread                               | Fixed ticks, damage, collision, solver, preview, grounding                 | Синхронный solver и repeated sampled queries; full clone при preview ricochet        |
| Main thread                               | Dirty scheduling, материал copy, texture publication, обход meshes/minimap | O(chunks) каждый кадр, bursts публикаций, много typed-array views                    |
| Единственный Worker                       | Coverage/material/shade convolution всего chunk field                      | Пропускная способность и latency очереди; работа в Worker не блокирует main напрямую |
| GPU WebGL                                 | Chunk texture upload, quads, material sampling, filters                    | Upload bytes, draw submissions, screen fill/filter passes                            |
| GPU compute                               | Нет                                                                        | —                                                                                    |
| Отдельная physics thread / physics engine | Нет                                                                        | —                                                                                    |

Путь данных и копий:

- Generation: временный W×H material array → `cells.slice()` → отдельная mask reconstruction.
- Main→Worker: выделяется входной material buffer, строки копируются из основного массива; на строку создаётся `subarray` view. Transfer list передаёт владение buffer, не выполняет ещё одно требуемое полное копирование в JS.
- Worker→main: новый RGBA buffer передаётся transfer list; `new Uint8Array(result.field)` создаёт view, не копирует содержимое.
- Main→GPU: обновляется всё field texture затронутого чанка; старый CPU field становится кандидатом на GC. Конкретное число внутренних driver copies не установлено.
- Preview bounce: `new TerrainGrid(...terrain.cells...)` копирует **весь** material array и заново строит **все** masks. Только один такой clone на пересчёт preview, не на каждом его tick.
- Snapshot: `Array.from(cells)` разворачивает byte map в JS number array; JSON создаёт ещё строку. Это дорогая on-demand операция, не frame hot path.
- Light/heat maps: полные маленькие ImageData/Canvas copies, отдельно от terrain fields. `toDataURL` в terrain pipeline отсутствует.

Transfer владения ArrayBuffer подтверждается [MDN Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects). Это не отменяет первую копию из authoritative storage и GPU upload.

Allocation hotspots: sample generator + Vec2 на каждый sample; Map/rect/spans при damage; особенно rect unions на каждую удалённую capsule cell; input/output field buffers и views; settings object copies для каждого main/minimap mesh каждый кадр; preview full copy; snapshot number arrays. Нет JS-объекта на каждую постоянную terrain cell. Scratch buffers/пулы следует вводить по heap-профилю; для transferred buffers потребуется явный возврат владения, нельзя продолжать использовать detached input.

Перенос в Worker уже выполнен для самой очевидной visual convolution. Следующий Worker «на всякий случай» не нужен. Сначала уменьшить объём field jobs и измерить queue/service time. Перенос authoritative simulation или solver требует согласования версии входа, порядка команд и детерминизма; это отдельное решение, не бесплатная оптимизация.

## 6. Измерения и долгосрочная деградация

Среда: Windows, Node **v22.22.2**, **AMD Ryzen 9 8945HX**. Замеры выполнены отдельно от параллельного запуска проверок. Используются реальные функции проекта; loader только транспилирует TypeScript в ES modules. Браузер/Worker IPC/GPU здесь не участвуют.

Файлы: [benchmark](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/reports/terrain-audit/bench.mjs), [raw measurements](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/reports/terrain-audit/measurements.json), [reproductions](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/reports/terrain-audit/reproductions.mjs), [reproduction results](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/reports/terrain-audit/reproductions.json).

Повторный запуск из корня проекта:

```powershell
node --loader ./reports/terrain-audit/loader.mjs ./reports/terrain-audit/bench.mjs
node --loader ./reports/terrain-audit/loader.mjs ./reports/terrain-audit/reproductions.mjs
```

Сценарий истории: default 1800×320, generation seed=42, deterministic destruction stream seed=912, radius=1.6 m, координаты x=5..355 m, y=43..61 m. Срезы 0/10/100/500/1000 **вызовов разрушения**, не обязательно 1000 непустых кратеров. Geometry по мере истории меняется, повторные попадания могут ничего не удалить.

Чтобы сравнение mutation не подменялось дешёвым попаданием в пустоту, на каждом срезе берётся отдельная копия карты и восстанавливается небольшой probe fixture вне таймера; измеряемый кратер всегда удаляет 208 cells. Пробы не изменяют исходную историю. Restore нагревает и насыщает bounded journal копии; эти числа проверяют локальность mutation при изменившейся карте, но **не** моделируют историю журнала ровно из 0/10/... записей. Field benchmark берёт один и тот же chunk (3,1), размер 256×64. Sweep идёт 100 m в гарантированно пустом небе, r=0.1 m. По 100 измерений; sweep batches по 10, surface batches по 100, поэтому их p95/max относятся к среднему внутри batch, не к одиночному запросу.

Значения ниже — **mean / p95 / max, миллисекунды на операцию**, округлены:

| Предыдущие разрушения | Controlled circle update    | Field build 256×64    | Empty sweep 100 m        |
| --------------------- | --------------------------- | --------------------- | ------------------------ |
| 0                     | 0.00552 / 0.00660 / 0.14310 | 0.995 / 1.010 / 1.014 | 0.0643 / 0.0672 / 0.0748 |
| 10                    | 0.00385 / 0.00500 / 0.01600 | 1.095 / 1.114 / 1.274 | 0.0659 / 0.0690 / 0.0817 |
| 100                   | 0.00426 / 0.00610 / 0.02170 | 1.058 / 1.071 / 1.237 | 0.0662 / 0.0710 / 0.1017 |
| 500                   | 0.00203 / 0.00350 / 0.01190 | 0.886 / 0.901 / 0.983 | 0.0654 / 0.0688 / 0.1003 |
| 1000                  | 0.00153 / 0.00190 / 0.00240 | 0.805 / 0.816 / 0.883 | 0.0675 / 0.0697 / 0.2327 |

Нет монотонного ухудшения от истории. Более дешёвое поле после большого числа разрушений объяснимо большим количеством air и ранними `continue` в kernel; JIT/cache/order тоже влияют. Уменьшение microsecond mutation time нельзя трактовать как доказанное ускорение от кратеров. Пиковый sample без GC trace нельзя объявить GC pause.

Во всех пяти срезах: **648 960 bytes** material+occupancy storage, **16 chunks**, **3918 occupancy reads** на тестовый sweep. Для renderer по коду: 64 main vertices, 0 terrain contours/polygon lists, 0 colliders; число meshes/vertices не зависит от разрушений. GPU upload на полное поле этого 256×64 edge chunk — 258×66×4 = **68 112 B**, полного 256×256 — **266 256 B**. Это вычисленные payload sizes, не измеренный transfer bandwidth.

Дополнительные замеры:

| Операция                            | Mean ms | p95 ms | Max ms | Смысл                                                 |
| ----------------------------------- | ------- | ------ | ------ | ----------------------------------------------------- |
| Full solid field 256×256            | 4.254   | 4.294  | 4.765  | CPU builder, выполняющийся в игре в Worker            |
| Clone+mask rebuild 1800×320         | 1.201   | 1.240  | 1.413  | Часть preview bounce, без самой траектории            |
| Clone+mask rebuild 2400×1280        | 6.213   | 6.388  | 6.496  | Линейный рост с числом ячеек                          |
| Clone+mask rebuild 3600×1080        | 7.787   | 7.948  | 8.037  | 3.888 млн cells, ещё в budget валидатора              |
| Grounding всех восьми default units | 0.0318  | 0.0330 | 0.0477 | Сейчас дешёво; не первичный bottleneck                |
| Один ballistic solver               | 17.776  | 18.485 | 18.710 | Default runtime/cannon, target x=200 m на поверхности |

Solver — 30 замеров после 20 warm-ups. Это синхронная функция; уже этот конкретный CPU-сценарий сравним с бюджетом кадра 16.67 ms при 60 FPS. Это **не** измеренное время игрового кадра и не универсальная стоимость любого приказа. До восьми calls в tick могут складываться, но экстраполяция 8× не заменяет залповый integration benchmark.

Full field 4.254 ms означает около 235 таких CPU jobs/s как оптимистическую арифметическую service ceiling без IPC, main-thread preparation, публикации и discard. Это полезная оценка риска очереди, не обещанная производительность Web Worker. Всплеск с несколькими затронутыми чанками может дать заметную visual latency, даже если simulation остаётся быстрой.

Память не растёт с историей отверстий: material+mask фиксированы; journal ограничен; transient explosions ограничены. После загрузки всех default field textures их RGBA payload суммарно **2 353 536 B** на CPU и примерно столько же GPU texel storage; с material+mask это около **5.11 MiB**, без JS objects, material image/mipmaps, Canvas maps, framebuffer/filter targets и driver overhead. Near 4 млн cells ориентир — 4.5 MB material+mask и около 16 MB fields на каждой стороне CPU/GPU плюс halo. Мemory leak не подтверждён; длительный heap/GPU resource profile не выполнялся.

Длительный матч всё же способен стать дороже **из-за геометрии и пути запросов**, не из-за журнала кратеров: удаление верхнего грунта удлиняет `findSurfaceY`; исчезновение раннего препятствия удлиняет sweep/occlusion/solver flight; раздробленный силуэт увеличивает число spans debug `Graphics`. Каждая такая стоимость ограничена размерами карты/пути, а не числом записей «взрыв №N». GPU geometry остаётся постоянной.

## 7. Сильные стороны текущей архитектуры

- Compact material+bitmask storage уже обслуживает O(1) occupancy; нет cell objects, polygon searches или GPU readbacks в simulation.
- Круговое разрушение локально, упакованные слова очищаются spans; live gameplay не ждёт Worker/renderer.
- Chunking, versions и независимые cursors потребителей уже созданы. Renderer не подтверждает/сбрасывает simulation dirtiness.
- Нет накопления исторических кратеров, роста mesh vertices и повторного CSG на запросах. Topology может содержать holes, overhangs и islands без отдельного polygon management.
- Geometry и textures переиспользуются; minimap делит field/material textures с миром. Настройки smoothing/material orientation не запускают field rebuild.
- Worker получает compact material snapshot через transferable buffer. Смена terrain generation не публикует старый мир.
- Fixed timestep, semantic terrain operations, последовательное применение projectile effects и общие ballistics helpers — хорошая основа для проверяемого поведения.
- Полные scans сосредоточены в construction/reset, clone/snapshot и recovery; нет обязательного whole-world rebuild после нормального одиночного взрыва.
- Поверхностные эффекты имеют небольшие фиксированные карты, recent-history limits и ограниченные filter passes.

Эти части стоит сохранить. Добавление marching squares, SDF или physics engine ради соответствия схеме не улучшит их автоматически.

## 8. Критические слабые места и наиболее важные ограничения

Здесь «критическое» означает наибольший риск для требуемой точности/масштабирования. Не каждое ограничение уже создаёт видимый spike на текущей сцене.

### K1. Полный field build и upload на малую правку

**Подход:** dirty rect лишь выбирает chunk; Worker строит весь field, GPU получает всю его texture. **Цена:** CPU Worker, main copies, memory/GC, GPU upload; O(A×C²), где A — число затронутых chunks, C — chunk size, независимо от площади маленькой дырки внутри каждого. На текущих пробах builder полного solid chunk ~4.25 ms, локальная mutation — единицы микросекунд.

**Причина:** rect исчезает на границе `TerrainRasterRequest`; нет persistent partial-field patch pipeline. **Направление:** передавать rect с dependency halo, собирать только выходной patch, применять его в постоянное field storage, обновлять соответствующий GPU subrectangle. При большой доле dirty area оставлять full rebuild. Просто вызвать `source.update()` после patch в CPU всё ещё отправит полную texture в установленной PixiJS. Нужна поддержка subregion в адаптере загрузки, согласованная с ownership/context restore Pixi, либо измеренное уменьшение размера visual chunks.

**Масштаб изменения:** renderer/worker protocol/upload adapter, среднее локальное архитектурное изменение; simulation/storage не затрагиваются. WebGL предоставляет subrectangle upload через [texSubImage2D](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texSubImage2D), но текущий проект этот диапазон не использует.

### K2. Непрерывные правки могут бесконечно отодвигать публикацию

**Подход:** в `worker.onmessage`, если для этого ключа уже есть pending region, готовое поле не публикуется, регион объединяется и отправляется заново. **Цена:** wasted Worker CPU/buffers; растущая visual latency. Стоимость определяется частотой новых edits относительно service time, а не историческим числом кратеров.

**Подтверждение:** FakeWorker завершил 20 запросов, перед каждым завершением чанк менялся; отправлен 21 запрос, опубликовано **0 chunks**. Это проверка политики очереди без GPU. Для уже показанного чанка останется старая картинка; при начальной загрузке он может вообще не появиться до затишья. Occupancy при этом правильная.

**Направление:** гарантировать ограниченный срок публикации, например публиковать монотонные завершённые revisions и отдельно догонять свежую, либо применять ordered local patches. Удаления можно отражать быстрым occupancy patch, а декоративное поле догонять. Если нужна строгая картинка только самой свежей версии — задать явный latency budget и стратегию перегрузки, а не ждать затишья без ограничения.

**Масштаб:** небольшое изменение visual scheduler с tests для sustained edits/reset/neighbour dependencies; не новая terrain model. Источник: [onmessage](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainLayer.ts:99).

### K3. Sampled sweep не гарантирует контакт с тонкими/касательными препятствиями

**Подход:** half-cell samples + circle overlap + refinement. **Цена:** correctness в grazing, CPU/GC на длинных путях; O(L/h×K). **Подтверждение:** штатный r=0.12 m может коснуться occupied cell между samples и дать null; воспроизведение приведено выше.

**Направление:** точный grid traversal для rays; консервативный candidate traversal + корректный circle TOI для снарядов. Просто уменьшить шаг даёт больше CPU и не является доказательством отсутствия любых касательных пропусков. **Масштаб:** локальная замена query algorithm и regression coverage. Storage, renderer и материалам изменение не требуется.

### K4. Синхронный solver многократно проигрывает дорогой collision pipeline

**Подход:** перед готовым к стрельбе приказом `updateInstallationOrders` синхронно перебирает углы и траектории. **Цена:** main CPU и allocations; O(orders_ready×candidates×ticks×S×K), плюс entity candidates. Число прошлых кратеров влияет только через актуальные препятствия и длину полёта. Один проверенный вызов ~17.8 ms.

**Причина:** отсутствие cache/budget у потребителя terrain queries; битмаска сама по себе дешёвая, но вызывается много раз. **Направление:** сначала оптимизировать traversal, измерить реальные candidate/tick counts; затем deterministic solution cache по релевантным входам/terrain revisions либо фиксированный work budget с явно определённой семантикой приказа. Не использовать wall-clock cutoffs в simulation. Worker solver потребует version validation и согласованного момента применения результата.

**Масштаб:** collision + order/aim solver, от локального cache до среднего изменения scheduling. Это наиболее убедительный найденный кандидат на **main-thread frame spike уже сейчас**, хотя он расположен вокруг terrain, а не в `destroyCircle`. Источники: [solver](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/ballistics/solveBallisticAim.ts:27), [orders](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/orders/updateInstallationOrders.ts:8).

## 9. Средние проблемы

| Проблема / текущий подход                                  | Цена и рост                                                                                                    | Причина / направление / масштаб                                                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview global invalidation + full clone при bounce        | Main CPU, memory, GC; O(W×H) clone плюс траектория после любого изменившего terrain взрыва при видимом preview | Global version в cache key; для большой карты chunk copy-on-write/overlay preview, затем dependency-aware invalidation. Среднее локальное изменение preview adapter; сохранить shared helpers |
| Grounding всех units после global version                  | Main CPU O(U×footprint columns×H); цена растёт с глубиной поверхности и пустыми колонками                      | Проверять пересечение dirty x/footprint, кэшировать top surface по колонке и обновлять затронутые columns. Локальный derived cache. Сейчас восемь units ~0.032 ms, поэтому ниже приоритетом   |
| Full-world visual residency и per-frame обход main/minimap | CPU O(chunks/frame), separate draw calls, memory O(W×H), startup build всего мира                              | Видимые-chunk priorities, проверка settings revisions, пустые chunks без mesh, отдельная low-res minimap cache. Среднее renderer изменение; culling оценивать профилем                        |
| Capsule AABB scan + rect objects на ячейку                 | CPU/GC O(AABB area/h²); длинный диагональный узкий канал может обходить почти квадрат                          | Row spans/scan conversion capsule, aggregation bounds без per-cell objects. Локальное изменение mutation algorithm; для коротких per-tick channels риск меньше                                |
| Journal cursor старше 512 changes                          | FullChange allocation O(chunks), затем whole-map fields                                                        | Корректный recovery, но нужна метрика причины; при реальной перегрузке — per-consumer/chunk revision recovery, а не бесконечный журнал. Локальное/среднее                                     |
| Failed Worker после трёх попыток                           | Stale visuals без дальнейшего retry до новой правки; latency неограничен                                       | `retryOrReport` только пишет console.error, scheduled version уже продвинута. Нужна видимая fault state и controlled resync/restart. Локальное                                                |
| Writable materials/masks с двойной occupancy-информацией   | Риск correctness/network divergence при будущей обходной записи, не доказанный текущий баг                     | Encapsulation и invariant tests. Локальное; две compact representations сами по себе нормальны                                                                                                |
| Circle за границей мира удаляет край                       | Correctness: круг (-100,1.5), r=0.1 на 3×3/h=1 удалил (0,1)                                                    | Независимый clamp обоих концов пустого span превращает его в border cell. Пересечение с world bounds и проверка пустого interval до clamp; локальный fix, здесь только воспроизведён          |

Источники: [preview clone](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/ballistics/trajectoryPreview.ts:64), [preview cache](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/core/GameRuntime.ts:257), [grounding invalidation](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/movement/terrainGrounding.ts:57), [circle bounds](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainGrid.ts:184), [capsule](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/terrain/TerrainGrid.ts:216), [retry](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/rendering/TerrainLayer.ts:309).

У queue freshness есть дополнительное окно: `isCurrent` проверяет generation, а pending содержит только изменения, уже замеченные `TerrainLayer.update`. Мутация после предыдущего update, но до обработки response может кратко опубликовать старую revision; следующий update догонит. Это не повреждает authoritative terrain, но «никогда не публикуем промежуточный чанк» не является строгой гарантией.

Penetration хранит `materialSamples` при входе и использует их в следующих тиках, чтобы собственное вырезание канала не обнуляло сопротивление задним числом. Это осмысленный gameplay cache. Но внешний взрыв во время пробития не обновляет эти samples: воздействие уже активного penetrator может продолжить учитывать старый материал. Следует явно определить эту семантику и добавить сценарий другого разрушителя; это не общий render/collision desync и не повод удалить cache без замены.

## 10. Низкоприоритетные улучшения и необязательные подсистемы

**Coarse hierarchy.** Сейчас нет empty/partial/full summaries, solid counts, mip occupancy или word-level skip в ray traversal. Chunking — размещение и invalidation, не полноценный acceleration hierarchy. Для нынешних 576 тыс. cells сначала полезнее убрать repeated sample overhead; для больших карт/дальних rays можно добавить chunk/block solid counts и затем проходить coarse grid с refinement. Обновлять counts на spans, не сканировать мир после взрыва. Цена дополнительного update/cache должна окупаться реальными query counts.

**SDF и narrow band.** SDF отсутствует и не нужен для решения найденных главных bottlenecks. Normal сейчас всего 25 bit queries, distance-to-ground — top-surface scan. Возможные будущие задачи: contact correction, more stable normals, distance-based shading. Оставить occupancy авторитетной, SDF — optional derived cache. Для band B=32 cells инвалидировать blast AABB+B с дополнительным контекстом алгоритма distance transform; clamp вне диапазона. Текущие dirty chunks позволяют это организовать. Exact global nearest-surface distances после удаления единственной ближайшей границы могут менять большую область; ограниченный band как раз ограничивает требуемую актуальность. Нельзя обещать корректный local SDF, имея только текущий visual halo=5.

Float32 distance field стоит ещё ~4N bytes; signed 16-bit вариант требует определения масштаба/погрешности и saturation. Нормали из асинхронного SDF нельзя использовать authoritative collision до готовности без occupancy fallback/version checking. Не хранить SDF как base-minus-1000-explosions: в проекте такой CSG history сейчас нет, и добавлять её не стоит.

**Contours/physics.** При будущей потребности в rigid bodies можно извлекать contours лишь в dirty chunks, упрощать с ограниченной ошибкой и проверять topology/стыки; никакого текущего RDP/Visvalingam/angle simplifier нет. Это отдельный продуктовый этап. Для существующих стационарных установок и снарядов полноценный physics engine не обоснован.

**Disconnected islands.** Изолированные cells/области остаются static terrain, не падают, не удаляются, не становятся bodies. Connected-component detection отсутствует, что соответствует MVP. Bitmap подходит для flood fill O(component size), но отделение большого острова узким разрезом нельзя в общем случае доказать только по маленькому dirty rect. Для будущей задачи потребуются labels/connectivity или ограниченные обходы; автоматически добавлять физическое осыпание не нужно. `findSurfaceY` ищет верхний грунт независимо от высоты объекта, поэтому grounding не является универсальным поиском опоры в туннеле под потолком. Storage поддерживает туннели, нынешняя placement/grounding семантика — верхнюю поверхность.

**Малые allocation/инструментальные улучшения.** Вернуть contact cell/material из sweep; не создавать settings copies при неизменных settings; заменить history `shift` кольцевым буфером, только если это станет заметно (сейчас максимум 512); не путать накопительный `chunk.dirtyRect` с кадровым; отключать debug mask при performance baseline. Debug Graphics перерисовывает occupied runs видимой области при каждом изменении version или камеры; сложность раздробленной поверхности может увеличить его стоимость, но это не основной terrain renderer.

Pixi рекомендует профилировать culling и фильтры по контексту: culling не всегда улучшает CPU-bound сцену, а filters имеют собственную стоимость. Поэтому предложенные visibility/cache изменения следует проверять отдельно от post-processing: [официальные PixiJS performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips).

## 11. Network determinism, persistence и replay

Сейчас terrain operations — компактные circle/capsule параметры в метрах; есть tick и source IDs в events. При одинаковых исходных cells, параметрах и порядке применения CPU mutation воспроизводима и не зависит от GPU rasterization/contours. Можно передавать semantic operations вместо всего bitmap на каждое разрушение. Для replay только входных fire commands нужны также неизменные definitions/config, исходный seed, порядок commands и одинаковая simulation implementation.

Это **основа**, а не готовый сетевой протокол. Геометрия разрушения использует floating-point (sqrt для circle spans, division/clamp для capsule); генерация — sin, движение — exp/hypot. Межплатформенная побитовая идентичность на пограничных значениях не доказана. Для будущего lockstep определить integer/quantized cell-operation contract или правила округления, версионировать algorithm/config и сверять chunk hashes. Renderer-поле может различаться локально, пока оно не участвует в gameplay.

`createGameSnapshot` сохраняет detached JSON-serializable material cells, dimensions, cell size и version; маска восстанавливается конструктором. Это хороший путь к terrain snapshot, но restore API и законченной save/replay системы нет. Constructor начинает version с нуля, snapshot не сохраняет chunk size/config целиком: импорт потребует явной политики metadata и invalidation, а не простого присваивания объекта. JS number array — не компактный wire/storage format. Для будущих large snapshots разумны binary material chunks + compression + checkpoint metadata.

Журнал dirty regions не является журналом разрушений: не хранит полный набор circle/capsule inputs, ограничен 512, содержит AABBs. `state.events` очищается каждый tick; replay историю сейчас восстановить из него нельзя. Нужны отдельный command/event log и периодические checkpoints с bounded tail, чтобы не проигрывать тысячи разрушений при загрузке. Это оценка расширяемости; сеть/replay в рамках аудита не добавлялись.

Источник: [GameSnapshot](C:/Users/oevka/OneDrive/Desktop/Transfer/RTS/src/game/core/GameSnapshot.ts:5).

## 12. Что измеряет существующая телеметрия и чего не хватает

Уже есть `collisionQueryCount`, `totalModifiedPixels`, last change, affected chunks; TerrainLayer измеряет `prepareUpdateMs`, `workerUpdateMs`, `publishUpdateMs`, `workerRoundTripMs`, `visualLatencyMs`. `GameCanvas` показывает FPS по отдельному requestAnimationFrame с усреднением за 500 ms.

Ограничения текущих метрик:

- `collisionQueryCount` накопительный: `resetInstrumentation` есть, но production call sites для reset не найдено. Он смешивает live simulation, solver, preview, grounding, debug и effect map queries. Это не «queries/frame»; preview-copy считает свои reads на другой grid.
- Visual metrics — последние значения, не сумма за frame и не histogram. `updatedChunkCount=1` — одно publish, не число реально обновлённых чанков за кадр.
- `updatedPixelCount=chunkWidth×chunkHeight` включает весь chunk, не число изменённых cells и даже не halo texels, реально загружаемые в texture.
- `publishUpdateMs` измеряет CPU resource/update вызов, **не GPU upload duration**. Upload выполняется renderer позднее.
- `workerRoundTripMs` считается от первого queue timestamp и включает ожидание/повторные попытки; это не чистый IPC round-trip.
- `markRendered` берёт последний timestamp из накопленных публикаций; это не max latency всех chunk updates. Post-render hook подтверждает проход CPU renderer, а не завершение GPU и вывод кадра на дисплей.
- Нет latency результата, который непрерывно discard-ится: при starvation метрика последней публикации может выглядеть старой/благополучной.

Минимальный следующий performance experiment, без изменения gameplay:

| Точка                                     | Метрики                                                                             | Разрезы                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `applyTerrainDamage` / circle / capsule   | mean/p95/max, cells visited/changed, affected chunks                                | radius, channel length/angle, hit/no-op            |
| `sweepTerrain`, occlusion, penetration    | time, traversed samples/cells, early exits, allocations                             | live vs solver vs preview, radius, path length     |
| `solveBallisticAim` / preview / grounding | время вызова и сумма за tick/frame                                                  | число готовых orders, preview on/off, terrain size |
| Visual enqueue/request/build/publish      | queue depth, oldest dirty age, discarded jobs, service time, published revision lag | один chunk, seams, burst, sustained edits          |
| Actual upload/render                      | bytes/frame, uploads/frame, draw calls, CPU submit + GPU timer при поддержке        | minimap on/off, filters on/off, camera             |
| Memory / GC                               | live heap, ArrayBuffer bytes, GPU resource count, GC pauses                         | после warm-up и после 1000/10000 edits + reset     |

Сценарии: default map и 3–4 млн cells; 0/10/100/500/1000 разрушений; одинаковая fresh probe и реальный destructive stream; частые правки одного чанка, одновременно разных чанков, на границе четырёх; fixed active projectile counts; mass-order tick отдельно от mutation. Warm-up, несколько повторов, аппаратная/браузерная версия и quality settings обязательны для сравнения результатов.

Contour/triangulation/physics rebuild timings сейчас **N/A**, а не «0 ms измерено». Не нужно добавлять instrumentation несуществующих стадий. При добавлении SDF или physics caches эти стадии получают собственные counters и budgets.

## 13. Сопоставление с 12 архитектурными критериями

| Критерий                                              | Оценка текущего кода                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Простое authoritative representation                  | Да; compact material+bitmask, инвариант записи стоит усилить                              |
| Дешёвый `isSolid`                                     | Да, O(1)                                                                                  |
| Mutation зависит от размера разрушения                | Да; capsule платит за AABB, circle имеет boundary bug                                     |
| Локальный взрыв даёт локальное обновление             | Частично: mutation локальна, renderer целыми затронутыми chunks; grounding/preview global |
| Rendering не определяет gameplay                      | Да                                                                                        |
| Physics mesh не определяет gameplay                   | Да, mesh отсутствует                                                                      |
| Marching Squares — не обязательный query              | Да, вообще отсутствует                                                                    |
| Нет full-world rebuild после каждого взрыва           | Да для terrain/render; исключения clone/recovery, глобальные consumers                    |
| Нет full-world texture upload после малой правки      | Да; но есть full changed-chunk upload и полные маленькие effect maps                      |
| История взрывов не увеличивает каждый следующий query | Да по storage/алгоритмам; текущая topology влияет на ранний выход                         |
| Collision работает до visual/physics rebuild          | Да                                                                                        |
| Производные представления независимы                  | В основном да; global version и visual queue требуют улучшения locality/freshness         |

Красные флаги из задания, которые **не обнаружены**: full-world marching squares, динамическая terrain triangulation, physics broadphase rebuild, polygon-authoritative terrain, mesh collision, GPU-authoritative state, один объект на cell, исторический CSG на каждый query. **Обнаружены в ограниченной форме:** крупные temporary field arrays, полная загрузка изменённого chunk, main-thread повторные collision calculations/full preview clone, два согласуемых compact CPU представления с открытыми массивами. Называть их всех «полным rebuild terrain» было бы неточно.

## 14. Проверки и границы уверенности

Свежие проверки: **typecheck, lint, test, build и format:check прошли**; **32 test files, 226 tests passed**. Отдельные reproduction assertions прошли, подтверждая описанное текущее поведение, а не исправляя его. Build выдал предупреждение о JS bundle больше 500 kB; это не ошибка сборки и не измерение terrain performance. Первый lint выявил отсутствующие Node imports только в новых audit scripts; после добавления imports повторный lint прошёл. Исторические отчёты не использовались как доказательство прохождения.

Benchmark/helper files не подключены к игре, не меняют simulation semantics и не добавляют зависимостей. Тесты проекта и пользовательские изменения не удалялись. Не выполнялись live browser stress run, GPU capture, реальная Worker fault injection, длительный memory-leak test или cross-browser determinism test. Для этих вопросов дан проверяемый план измерений, а не выдуманные цифры.

## 15. Ответы на три итоговых вопроса

**Что первым станет bottleneck при росте карты и числа разрушений?** Для собственно цепочки «разрушение → новый вид terrain» — **одиночный Worker, пересчитывающий полный visual field каждого dirty chunk, и очередь публикаций**. Это следует из O(A×C²), измеренных ~4.25 ms на полный solid chunk и доказанной возможности бесконечного discard при частых edits. Первое проявление — отставание картинки, не обязательно падение FPS. С ростом числа chunks добавляются CPU submissions/minimap и объём resident textures. Исторические отверстия не создают растущую mesh complexity.

Для **игрового main-thread кадра при массовых приказах** раньше может ограничить **синхронный ballistic solver**, уже занявший ~17.8 ms в одной CPU-пробе; при большом мире и включённом рикошетном preview — также full terrain clone. Нельзя честно объявить GPU первым пределом без browser profile: текущие факты сильнее указывают на CPU/очередь. Если увеличивать только число прошлых взрывов при неизменной частоте новых, линейной деградации по истории не ожидается и пробы её не показали.

**Какое минимальное архитектурное изменение даст наибольший выигрыш без переписывания terrain system?** Для частых мелких разрушений — **довести существующий dirty rect до конца visual pipeline: partial field job → persistent chunk field → subregion GPU upload**, одновременно обеспечить ограниченную задержку публикации. Это снимает полный-chunk cost, сохраняя `TerrainGrid`, материалы, команды, collision и quad renderer. Самое маленькое самостоятельное исправление — policy публикации без starvation; оно улучшает отзывчивость, но не уменьшает стоимость builder. Для текущих frame spikes от стрельбы отдельно приоритетны solver/query measurements и traversal optimization: visual patch pipeline не ускорит синхронный aim solver.

**Нужна ли фундаментальная смена terrain representation?** **Нет.** Существующую архитектуру можно эволюционно довести до хорошего состояния: сохранить material grid + packed occupancy, убрать точечные correctness bugs, улучшить collision traversal, partial visual updates и locality зависимых caches. SDF, polygon physics и connected-component simulation оставлять необязательными подсистемами под будущие требования. Доказательств, что главная проблема находится в самом bitmap/grid representation, исследование не дало.
