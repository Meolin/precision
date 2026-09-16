# Step 7 — RTS Control Layer for Stationary Installations

## Результат и статус

Добавлены четыре установки игрока и четыре установки противника, выделение,
группы управления, огневые приказы, очередь, автоматический баллистический расчёт
и интерфейс управления батареями. Наземного перемещения у установок нет.
Исходный спрайт основания сохранён и используется для всех установок.

Исходное рабочее дерево, включая существующие изменения renderer и ресурс основания,
сохранено в baseline-коммите `409bc25` — `baseline: explosion and aoe combat`.
Реализация Step 7 оставлена в рабочем дереве.

По прямому указанию пользователя **не запускались**:

- тесты;
- typecheck и lint;
- production build и другие проверки;
- браузер, визуальные проверки, замеры производительности.

Ни прохождение regression-тестов, ни производительность не подтверждены запуском.
Добавление тестовых сценариев не означает, что они пройдены.

## Модель установок и размещение

`InstallationState` расширяет существующий `CannonState`/`UnitState`: ID, team,
отдельный `ownerPlayerId`, тип установки, доступные weapons, очередь, fire control,
состояние опоры. `kind: 'installation'`, `mobilityType: 'stationary'`.
Экземпляры установок не содержат `movement`, скорости, пути или цели перемещения.

`GameState.units` остаётся общей коллекцией боевых сущностей. `state.cannon` —
совместимый alias первой установки, а не источник истины для групповых команд.
Все команды разрешают сущности по ID через общую коллекцию.

По умолчанию обе стороны получают Cannon, Mortar, Mortar, Heavy Penetrator.
Количество задаётся в `GameConfig.rts.installationsPerPlayer` (1–5; default 4).
ID чередуются: игрок 1 получает 1/3/5/7, игрок 2 — 2/4/6/8.
Снаряды получают ID после всех стартовых сущностей.

Spawn выбирает фиксированные X, проверяет горизонтальное разделение хитбоксов,
находит поверхность и учитывает весь круг при размещении над ячейками.
Слишком тесная конфигурация карты отвергается, а не создаёт перекрывающиеся установки.
При изменении terrain корректируется только Y. Полностью лишённая опоры установка
остаётся у нижней границы и не стреляет. Строительство и конструкционная физика не добавлены.

## Клиентское выделение

```ts
interface SelectionState {
  selectedEntityIds: EntityId[];
  hoveredEntityId?: EntityId;
}
type ControlGroups = Partial<Record<number, EntityId[]>>;
type InputMode = 'default' | 'attackGround';
```

Эти данные живут в `RtsController`, созданном приложением, и передаются input,
renderer и React-панелям. Simulation их не импортирует и не сохраняет в snapshots.
Выделение — предпочтение клиента; authoritative simulation нужны только команды.

ЛКМ выбирает свою живую сущность, пустое место очищает выделение; Shift+ЛКМ
добавляет или убирает ID. Противник доступен для hover/осмотра, но не для управления.
Hover и выбранные ID независимы. После смерти или смены владельца ID фильтруются.

Рамка работает в CSS screen pixels с порогом drag 5 px. В момент отпускания мыши
центры хитбоксов проецируются через текущий viewport, включая letterbox offsets,
и сравниваются с прямоугольником. Направление drag не имеет значения. Shift объединяет
результат с текущим выделением. Pointer capture завершает drag и за пределами canvas;
blur, cancel и изменение размера во время drag отменяют рамку.

Ctrl+1…9 сохраняет независимую копию selection, 1…9 восстанавливает её.
Несуществующие, мёртвые и чужие ID очищаются как при синхронизации, так и при recall.
Есть экранные кнопки групп: Ctrl+клик сохраняет, обычный клик восстанавливает.
Сброс сцены очищает группы, hover, targeting и маркеры и выделяет первую свою установку.

## Команды и ownership

```ts
interface AttackGroundCommand {
  type: 'attackGround';
  playerId: PlayerId;
  entityIds: EntityId[];
  targetPosition: Vec2;
  queue: boolean;
}
interface AttackTargetCommand {
  type: 'attackTarget';
  playerId: PlayerId;
  entityIds: EntityId[];
  targetEntityId: EntityId;
  queue: boolean;
}
```

`StopCommand` содержит playerId, entityIds и необязательный queue;
`SetWeaponCommand` — playerId, entityIds, weaponId. Все payload — сериализуемые данные.
Runtime копирует массивы ID и координаты при постановке команды в очередь.

Simulation проверяет существование, alive/HP, владельца, тип установки, доступность
weapon, finite/bounds для точки и существование живой вражеской цели. ID очищаются
от дублей и обрабатываются по возрастанию. Несовместимая установка пропускается.
Legacy-команды ручного прицела/выстрела/смены оружия с `cannonId` сохранены;
отсутствующий playerId означает только локального игрока 1.

Проверка команды не полагается на клиентское выделение. При будущей сети сервер
должен связывать playerId с аутентифицированной сессией: текущий локальный payload
сам по себе не является сетевой аутентификацией.

## Приказы, очередь и ручная стрельба

```ts
type InstallationOrder =
  | { type: 'attackGround'; targetPosition: Vec2 }
  | { type: 'attackTarget'; targetEntityId: EntityId };
```

Установка хранит `orders: InstallationOrder[]`; первый элемент активен.
Лимит по умолчанию 24, конфиг ограничивает его 1–32. Без Shift новый приказ заменяет
очередь; с Shift дополняет до лимита. Координаты копируются для каждой установки.
Stop очищает очередь, Shift+Stop убирает только активный приказ. Cooldown сохраняется.

Один приказ равен одному выстрелу. На каждом тике установки обрабатываются в порядке
EntityId, не более одного приказа на установку. Живой target разрешается заново перед
выстрелом. Уничтоженная/недоступная цель завершает приказ даже во время перезарядки.
Неудачный приказ удаляется; следующий рассматривается на следующем тике.

`fireInstallation` — общий путь spawn и cooldown для ручного и автоматического огня.
Новая команда, смена weapon или групповой приказ не сбрасывают время готовности.
У Basic Cannon остаётся прежний нулевой cooldown; обработка очереди всё равно ограничена
одним приказом на тик. Смена weapon проверяет `availableWeaponIds` каждой установки.

Для ровно одной выбранной установки доступны ручной mouse aim, стрелки, прогноз
и Space. Mouse aim не перезаписывает прицел активного приказа. Space явно отменяет
очередь, использует актуальный курсор, если он над картой, и пытается выстрелить
через общий cooldown. Прогноз сохраняет прежнее отображение рикошета/первого контакта.

## Автоматический расчёт

`solveBallisticAim` перебирает диапазон elevation с шагом 2° и выполняет три уточнения
четырёх лучших кандидатов, уменьшая шаг вчетверо. При равных результатах порядок
определяют время полёта и elevation. Для цели слева угол зеркально отражается;
ограничения 5–85° действуют относительно соответствующего направления горизонта.

Каждый кандидат создаётся через настоящий `createProjectile` и продвигается через
`advanceProjectile` с тем же fixed dt, что и simulation. Переиспользуются muzzle offset,
параметры оружия и снаряда, gravity/wind/drag, swept terrain/entity collision,
owner exclusion, время жизни и границы мира. Отдельной формулы полёта нет.

Поиск заканчивает кандидата на первом контакте и не запускает impact response.
Поэтому он не меняет terrain, HP, events или реальные projectiles и не рассчитывает
специальные рикошеты/пробитие. Для точки измеряется расстояние до каждого пройденного
отрезка до контакта; допустимая ошибка по умолчанию 1 m. Для entity требуется контакт
именно с её хитбоксом. Профили оружия используются как данные, без ветвления по weapon ID.

Лимит прогноза кандидата — 20 s, lifetime снаряда и максимум 4800 ticks, выбирается
минимальное ограничение. Значения вынесены в `GameConfig.rts` и ограничены валидацией.
На cooldown solver не вызывается. Результаты между приказами не кешируются: следующий
выстрел учитывает актуальный terrain, target position, weapon overrides и физику.

Если решения нет, приказ удаляется без выстрела, fire control получает
`lastFailure: 'noBallisticSolution'`, UI показывает `NO BALLISTIC SOLUTION`.
Потеря цели и опоры имеют отдельные причины. Это ограниченный численный поиск:
отказ не является математическим доказательством недостижимости.

## Интерфейс и боевые эффекты

Сохранён исходный PNG основания; каждый экземпляр имеет свой sprite и ствол.
Цвет корпуса различает владельца, центр башни — weapon. Выделение и hover рисуются
независимыми кольцами. Health bars видны у живых установок.
Линии показывают активные и queued цели; последний назначенный target остаётся маркером.
Рамка рисуется отдельным screen-space слоем.

Панель показывает число выбранных, состав по типам, weapon/Mixed, HP, cooldown,
текущий приказ, очередь, последнее решение и failure. Для группы можно менять оружие,
выбирать точку и очищать очередь; manual fire доступен только для одиночного выделения.
React получает телеметрию через прежний интервал 100 ms и не управляет game loop.

Projectile collision, penetration, ricochet, direct damage, explosions, occlusion,
AoE и terrain damage используют прежний pipeline. Очереди выполняются перед полётом;
последующие снаряды тика видят HP и terrain после предыдущих попаданий.
Damage popups по-прежнему создаются из каждого `EntityDamageEvent`.

## Тестовые сценарии, добавленные без запуска

- `client/selection.test.ts`: single/Shift, enemy/hover, screen-space box selection,
  отделение от snapshots, независимые группы, death/missing/ownership cleanup, reset,
  single-only manual fire и преобразование ground intent.
- `orders/orders.test.ts`: ownership/life/weapon/target validation, replace/append/limit,
  snapshot detachment, Stop/Shift+Stop, cooldown, failure progression, deterministic group
  fire, копирование pending payload, AttackTarget через реальный damage pipeline,
  10 установок и 50 одновременных снарядов без повторного использования ID.
- `ballistics/solver.test.ts`: известная траектория, ветер/drag, детерминизм, отсутствие
  мутаций, реальные live points, выстрел влево, недостижимая/закрытая цель.
- `movement/stationary.test.ts`: состав 4×4, отсутствие overlap/movement, неизменность X,
  кратеры, отсутствие опоры, offset-хитбоксы и обновление terrain version.

Сценарии старого наземного движения заменены сценариями стационарности.
В existing combat/explosion fixtures изолирован прежний состав целей, в baseline fixture —
исходная поза и одна пушка; сохранённые численные ballistic snapshots не переписывались.
Ожидания стартового количества entities/ID и двустороннего угла обновлены.
Прежние тесты penetration, ricochet, terrain destruction, explosions и damage feedback
оставлены для последующего regression-прогона. Их прохождение не заявляется.

## Файлы

Добавлены:

- `src/game/entities/InstallationState.ts`, `spawnInstallations.ts`;
- `src/game/orders/InstallationOrder.ts`, `updateInstallationOrders.ts`, `orders.test.ts`;
- `src/game/weapons/fireInstallation.ts`;
- `src/game/ballistics/solveBallisticAim.ts`, `solver.test.ts`;
- `src/game/client/SelectionState.ts`, `RtsController.ts`, `selection.test.ts`;
- `src/game/movement/stationary.test.ts`;
- `src/ui/SelectionPanel/SelectionPanel.tsx`, `SelectionPanel.css`;
- `STEP7_REPORT.md`.

Изменены:

- `src/game/entities/Cannon.ts`, `UnitState.ts`;
- `src/game/config/GameConfig.ts`, `defaultGameConfig.ts`;
- `src/game/commands/GameCommand.ts`, `executeCommand.ts`;
- `src/game/core/GameState.ts`, `GameRuntime.ts`, `stepSimulation.ts`, `baseline.test.ts`, `runtime.test.ts`;
- `src/game/movement/terrainGrounding.ts`, `updateUnitMovement.ts`;
- `src/game/input/useGameInput.ts`;
- `src/game/rendering/GameCanvas.tsx`, `GameScene.tsx`, `SceneRenderer.ts`, `viewport.ts`, `DebugOptions.ts`;
- `src/ui/useTelemetry.ts`, `HUD/HUD.tsx`, `TechnicalPanel/TechnicalPanel.tsx`;
- `src/app/App.tsx`;
- `src/game/combat/combat.test.ts`, `src/game/explosions/explosionIntegration.test.ts`, `src/game/weapons/weapons.test.ts`;
- `eslint.config.js`, `tsconfig.simulation.json`, `README.md`.

Удалены из активной реализации `src/game/movement/MoveUnitCommand.ts` и старый
`src/game/movement/movement.test.ts`; они доступны в baseline-коммите `409bc25`.
Изолированные legacy movement helpers/config оставлены для совместимости;
simulation не вызывает locomotion, а helper дополнительно отвергает stationary entities.

## Ограничения и расширения

- Нет AI противника, движения, camera focus, formation, drones, экономики, строительства или сети.
- Все установки по умолчанию поддерживают три существующих weapons; capability list допускает будущие ограничения.
- Группы стреляют в одну точку, без spread/stagger; очередь одноразовая, sustained bombardment отсутствует.
- Solver синхронный, ограниченный и без кеша; производительность при залпе и максимальном tick rate не измерялась.
- Изменение terrain или параметров физики уже после выстрела может изменить исход попадания.
- Для entity solver требует прямого контакта; взрыв рядом и укрытие не используются для оптимизации решения.
- Только circle hitboxes, простой support correction и screen-space center selection.
- Инспектор редактирует общий профиль оружия, а не индивидуальные параметры каждой установки.

Для Step 8 готовы ID, отдельное владение, stationary entity, support, capabilities,
сериализуемые команды и очередь. Spawn можно заменить строительством без переноса selection
в simulation. Для будущих drones selection/control groups уже работают с общими EntityId
и ownership, а AttackTarget разрешает актуальную позицию перед выстрелом. Отдельная
мобильность и перехват движущихся целей должны быть реализованы следующим шагом.

Работа ограничена Step 7.
