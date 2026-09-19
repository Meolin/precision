# Step 7 — RTS Control Layer for Stationary Installations

## 0. Контекст

Проект находится после Step 6.

Уже реализованы:

- React + TypeScript;
- PixiJS rendering;
- pure TypeScript simulation;
- fixed timestep;
- destructible TerrainGrid;
- terrain materials;
- Air / Soil / Rock;
- WeaponDefinition;
- ProjectileDefinition;
- Basic Cannon;
- Mortar;
- Heavy Penetrator;
- projectile physics;
- gravity;
- wind;
- drag;
- trajectory preview;
- surface normals;
- impact angle;
- penetration;
- ricochet;
- explosions;
- AoE damage;
- terrain occlusion;
- Unit / combat entity layer;
- Health;
- EntityDamageEvent;
- damage number popups;
- death;
- direct-hit damage;
- debug UI / telemetry;
- tests.

Архитектурное направление проекта изменено:

> Основные наземные боевые объекты не должны свободно перемещаться по карте.

Основная армия должна состоять из стационарных или развёртываемых:

```text
Installations
```

например:

- cannon;
- mortar;
- artillery;
- radar;
- anti-air;
- shield;
- generator;
- relay;
- drone bay;
- extractor;
- command core.

Обычные наземные moving units пока не планируются.

Будущий мобильный слой игры должен в основном состоять из дронов.

---

# 1. Главная цель Step 7

Перевести проект из режима:

```text
одна установка
+
одна цель
+
ручная стрельба
```

в режим:

```text
несколько установок
        ↓
RTS selection
        ↓
control groups
        ↓
group fire orders
        ↓
manual / coordinated bombardment
```

После Step 7 игрок должен уметь управлять несколькими стационарными боевыми установками как RTS-группой.

---

# 2. Главный принцип

На Step 7 НЕ добавлять наземное движение.

Не создавать:

```text
MoveCommand
pathfinding
formation movement
unit locomotion
ground navigation
vehicle physics
```

Основной RTS action layer строится вокруг:

```text
selection
targeting
aim
fire
weapon choice
group fire
order queues
```

---

# 3. Перед началом

Создать baseline:

```bash
git add .
git commit -m "baseline: explosion and aoe combat"
```

Опционально:

```bash
git tag explosion-combat-v1
```

Проверить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Все проверки должны проходить.

---

# 4. Термин Installation

Начать вводить понятие:

```ts
Installation;
```

как основную стационарную игровую сущность.

Не обязательно сразу удалять существующий:

```ts
UnitState;
```

Если текущая архитектура построена вокруг UnitState, безопаснее расширить её.

Например:

```ts
type EntityKind = 'installation' | 'drone';
```

или:

```ts
interface CombatEntityState {
  ...
  mobilityType: 'stationary' | 'air';
}
```

Но НЕ проводить масштабный refactor только ради переименования.

---

# 5. Architectural target

В долгосрочной перспективе наземный combat entity должен выглядеть примерно так:

```text
Installation
 ├── EntityId
 ├── OwnerPlayerId
 ├── Position
 ├── Health
 ├── Hitbox
 ├── Weapon
 ├── Aim
 ├── FireControl
 └── InstallationType
```

Но Step 7 должен использовать существующую модель максимально бережно.

---

# 6. Multiple Installations

Создать тестовую сцену минимум с:

```text
Player:
3–5 installations

Opponent:
3–5 installations
```

Например:

```text
PLAYER

Cannon
Mortar
Mortar
Penetrator


ENEMY

Target Cannon
Target Mortar
Target Structure
```

Enemy AI пока не нужен.

---

# 7. Installations placement

На Step 7 установки уже существуют при старте сцены.

Не добавлять строительство.

Spawn должен:

- выбрать world X;
- найти terrain surface;
- поставить installation корректно относительно hitbox;
- гарантировать отсутствие initial overlap.

Construction system будет отдельным следующим шагом.

---

# 8. Ownership

Начать отделять:

```text
team
```

от:

```text
player ownership
```

Если архитектура позволяет.

Например:

```ts
type PlayerId = number;

interface InstallationState {
  ...
  ownerPlayerId: PlayerId;
}
```

Для текущей локальной игры:

```text
Player 1
Player 2
```

достаточно.

---

# 9. Selection — client-side state

Selection НЕ должен быть частью authoritative simulation.

Создать client-side структуру:

```ts
interface SelectionState {
  selectedEntityIds: EntityId[];
  hoveredEntityId?: EntityId;
}
```

Она может находиться:

- в React state;
- lightweight store;
- controller layer.

Но не внутри core simulation state.

---

# 10. Почему Selection не в simulation

Selection является пользовательским интерфейсом.

Будущая сеть должна видеть:

```text
FireCommand
AttackGroundCommand
AttackTargetCommand
```

а не:

```text
Player selected installation 4
```

Граница должна быть:

```text
CLIENT ONLY

Mouse
Selection
Control Groups
Hover
UI Panels


SIMULATION

Commands
Orders
Fire
Damage
Projectiles
```

---

# 11. Single Selection

ЛКМ по friendly installation:

```text
select entity
```

ЛКМ по пустому месту:

```text
clear selection
```

Shift + ЛКМ:

```text
add/remove entity
```

---

# 12. Enemy interaction

ЛКМ по enemy:

предпочтительно:

```text
inspect / set hovered target
```

но НЕ добавлять enemy в controllable selection.

Enemy может отображать:

- health;
- type;
- debug info;

если он видим.

Fog of war пока отсутствует.

---

# 13. Box Selection

Добавить drag selection:

```text
LMB down
      ↓
drag
      ↓
selection rectangle
      ↓
LMB up
```

Все friendly installations внутри rectangle добавляются в selection.

---

# 14. Selection rectangle

Selection rectangle является UI/rendering concept.

Использовать screen-space rectangle.

После mouse up:

1. определить installations;
2. project их world positions / selection bounds в screen;
3. проверить попадание;
4. сохранить EntityId.

---

# 15. Selection bounds

Не обязательно использовать точную gameplay hitbox.

Для RTS selection можно использовать:

```text
selection point
```

или:

```text
simple screen-space bounds
```

Главное — predictable UX.

---

# 16. Selection Visuals

Выбранная installation должна иметь:

- outline / ring / marker;
- health bar;
- active weapon indicator, если полезно.

Multiple selection должна быть легко читаемой.

Не хранить:

```ts
selected: true;
```

в simulation entity.

---

# 17. Hover

Добавить:

```ts
hoveredEntityId?: EntityId
```

Отдельно от selection.

Hover можно использовать для:

- tooltip;
- target highlighting;
- cursor state.

---

# 18. Selected Entity Cleanup

Если installation уничтожена:

```text
selectedEntityIds
```

должен автоматически фильтровать её.

Не оставлять dead IDs в активном selection.

---

# 19. Control Groups

Добавить стандартные:

```text
Ctrl + 1
Ctrl + 2
...
Ctrl + 9
```

для сохранения selection.

И:

```text
1
2
...
9
```

для восстановления.

---

# 20. ControlGroups State

Client-side:

```ts
type ControlGroups = Record<number, EntityId[]>;
```

Не хранить в simulation.

---

# 21. Control Group Recall

При recall:

- удалить nonexistent IDs;
- удалить destroyed entities;
- оставить только controllable entities текущего player.

---

# 22. Optional double-tap group

Можно подготовить extension point:

```text
double tap 1
→ focus camera on group
```

Но camera system пока не реализовывать, если её нет.

---

# 23. Fire Orders

Step 7 должен добавить полноценный group fire control.

Ключевые команды:

```text
AttackGroundCommand
AttackTargetCommand
StopCommand
SetWeaponCommand
```

---

# 24. AttackGroundCommand

Добавить serializable command:

```ts
interface AttackGroundCommand {
  type: 'attackGround';

  entityIds: EntityId[];

  targetPosition: Vec2;
}
```

Это основной приказ для artillery gameplay.

---

# 25. Attack Ground UX

Рекомендуемый input:

```text
A
```

или отдельный attack mode.

Например:

```text
press A
      ↓
cursor enters targeting mode
      ↓
LMB terrain
      ↓
AttackGroundCommand
```

Можно выбрать более удобный input, но не привязывать simulation к клавишам.

---

# 26. Right-click behavior

Поскольку наземного MoveCommand нет:

```text
RMB terrain
```

НЕ должен означать Move.

Можно использовать:

```text
RMB enemy
→ AttackTarget
```

а:

```text
RMB terrain
```

либо:

- ничего;
- Attack Ground;
- context command.

Для первой версии лучше не перегружать RMB.

---

# 27. AttackTargetCommand

Добавить:

```ts
interface AttackTargetCommand {
  type: 'attackTarget';

  entityIds: EntityId[];

  targetEntityId: EntityId;
}
```

---

# 28. Commands содержат IDs

Нельзя передавать:

```ts
UnitState[]
```

или object references.

Только:

```ts
entityIds: number[]
```

Это важно для будущего network protocol.

---

# 29. Command validation

Simulation должна проверять:

- entity существует;
- entity alive;
- принадлежит player;
- weapon доступен;
- target существует;
- command разрешён.

Client UI не является security boundary.

---

# 30. Fire Orders vs Immediate Fire

Нужно различить:

```text
Command
```

и:

```text
Order
```

Command приходит от player.

Order сохраняется у installation.

Например:

```text
AttackTargetCommand
        ↓
AttackTargetOrder
```

---

# 31. Installation Orders

Добавить минимальный:

```ts
type InstallationOrder = AttackGroundOrder | AttackTargetOrder;
```

Можно добавить:

```ts
StopOrder;
```

если архитектурно удобно.

---

# 32. AttackGroundOrder

Пример:

```ts
interface AttackGroundOrder {
  type: 'attackGround';

  targetPosition: Vec2;
}
```

Installation пытается стрелять в эту точку согласно своим weapon capabilities.

---

# 33. AttackTargetOrder

```ts
interface AttackTargetOrder {
  type: 'attackTarget';

  targetEntityId: EntityId;
}
```

Installation использует актуальную позицию target.

---

# 34. StopCommand

Добавить:

```ts
interface StopEntitiesCommand {
  type: 'stop';

  entityIds: EntityId[];
}
```

Hotkey:

```text
S
```

Он:

- очищает current order;
- очищает queued orders, если Shift не используется;
- не уничтожает weapon state.

---

# 35. Order Queue

Добавить поддержку:

```text
Shift + command
```

для очереди приказов.

Пример:

```text
Mortar battery

Attack Ground A
        ↓
Attack Ground B
        ↓
Attack Ground C
```

Это очень полезно для barrage.

---

# 36. Queue storage

У installation:

```ts
orders: InstallationOrder[];
```

или существующий equivalent.

Safety limit:

```text
16–32 orders
```

---

# 37. Default order behavior

Без Shift:

```text
new command
→ replace current queue
```

С Shift:

```text
new command
→ append
```

---

# 38. Group Orders

Если selected:

```text
Mortar 1
Mortar 2
Mortar 3
```

и игрок выбирает одну точку:

```text
Attack Ground
```

не обязательно заставлять их стрелять точно в один pixel.

Это хороший момент добавить минимальный group targeting distribution.

---

# 39. Group Barrage Distribution

Для selected artillery можно распределять target positions вокруг выбранной точки.

Например:

```text
        x

   x    TARGET    x

        x
```

Но это должно быть deterministic.

---

# 40. Минимальная версия

На первом этапе допустимо:

```text
все стреляют в одну target position
```

И только если это выглядит плохо — добавить spread slots.

Не переусложнять раньше времени.

---

# 41. Group Fire Timing

Можно добавить небольшое deterministic fire staggering.

Например:

```text
Gun 1 fire
+0.1 sec
Gun 2 fire
+0.2 sec
Gun 3 fire
```

Но это optional.

Не добавлять random delay.

---

# 42. Manual Aim vs RTS Order

Это ключевое решение игры.

Не заменять ручную баллистику автоматическим RTS aim полностью.

Нужно сохранить два режима.

---

# 43. Manual Fire Mode

Для single selected installation:

```text
manual aim
+
trajectory preview
+
manual fire
```

Текущий ballistic sandbox behavior должен остаться.

---

# 44. Ordered Fire Mode

Для group order:

```text
Attack Ground / Attack Target
```

installation получает автоматическое ballistic решение.

Но автоматизация не должна быть идеальной.

---

# 45. Auto Ballistic Solver — Scope

Step 7 нужен минимальный solver.

Например:

```text
given:
weapon
position
target
gravity
wind
```

найти допустимый угол.

Пока можно:

- использовать numeric search;
- sampling angle range;
- выбирать trajectory с минимальной ошибкой.

---

# 46. Solver не должен обходить physics

Не писать:

```text
projectile teleports to target
```

или отдельную simplified projectile formula.

Auto solver должен использовать существующий trajectory simulation.

Например:

```text
sample candidate angle
      ↓
simulate trajectory
      ↓
calculate miss distance
```

---

# 47. Solver Accuracy

Auto fire не обязан попадать идеально.

Можно ввести:

```text
acceptable error
```

Например:

```text
within X meters
```

---

# 48. Manual Skill Advantage

Архитектурно оставить возможность:

```text
manual aim
```

быть лучше автоматического.

Например auto solver:

- использует только direct arc;
- не ищет intentional ricochet;
- не ищет complex penetration shot;
- не ищет extreme wind solution.

Manual player сможет использовать:

- ricochet;
- narrow gaps;
- penetration;
- terrain exploitation.

Это важный будущий skill ceiling.

---

# 49. AttackTarget Behavior

Для stationary target:

```text
solve target current position
→ fire
```

Для будущих drones:

```text
target position changes
```

AttackTargetOrder должен каждый fire cycle обновлять target position.

Но drones пока не реализовывать.

---

# 50. Target Destroyed

Если targetEntityId:

```text
dead / missing
```

AttackTargetOrder завершается.

Следующий queued order становится active.

---

# 51. AttackGround Completion

Нужно определить completion semantics.

Рекомендуемый вариант:

```text
1 AttackGroundOrder
=
1 shot
```

То есть:

```text
Attack Ground A
Attack Ground B
Attack Ground C
```

даёт три выстрела.

Это отлично подходит для artillery barrage queue.

---

# 52. Optional sustained fire

Не добавлять пока:

```text
fire indefinitely at position
```

Если понадобится, можно позже создать:

```text
BombardOrder
```

Отдельно.

---

# 53. Weapon Cooldown

Orders должны уважать существующий:

```text
weapon cooldown
```

Не позволять group command обходить reload/cooldown.

---

# 54. Weapon Compatibility

AttackGround может поддерживаться:

```text
Basic Cannon
Mortar
Heavy Penetrator
```

но ballistic solver может вести себя по-разному из-за их definitions.

Не hardcode по ID.

---

# 55. Weapon Selection для группы

Если selected installations поддерживают одинаковые weapons:

```text
SetWeaponCommand
```

может применяться ко всей группе.

Если нет:

- incompatible entities игнорируются;
- UI показывает mixed state.

---

# 56. Mixed Selection

Selection может содержать:

```text
Cannon
Mortar
Penetrator
```

UI должен поддерживать:

```text
Selected: 3
Weapon: Mixed
```

Не пытаться сделать сложную StarCraft-style command card пока.

---

# 57. Selection Panel — React

Для одного объекта:

```text
INSTALLATION

Type
Mortar

HP
72 / 100

Weapon
Mortar Shell

Order
Attack Ground

Cooldown
1.2 s
```

---

# 58. Multi Selection Panel

Для нескольких:

```text
SELECTED: 4

2 × Mortar
1 × Cannon
1 × Penetrator
```

Можно использовать простые mini-cards.

---

# 59. Health Bars

Selected installations должны показывать health bar.

Enemy health bars можно показывать:

- всегда;
- при hover;
- после damage.

На текущем этапе UX choice не критичен.

---

# 60. Order Indicators

Renderer должен уметь показывать:

```text
AttackGround target
AttackTarget link
queued targets
```

Например:

```text
Mortar
  \
   \
    X target
```

---

# 61. Queue Indicators

При Shift queue:

```text
Gun → X1 → X2 → X3
```

можно показывать только в debug mode.

Не делать сложную polished UI.

---

# 62. Attack Ground Marker

Последняя выбранная target position должна быть визуально читаемой.

Это renderer-only state / feedback.

Не хранить Pixi references в simulation.

---

# 63. Hotkeys

Рекомендуемый базовый layout:

```text
LMB
select

Shift + LMB
add/remove selection

LMB drag
box selection

A
Attack Ground targeting mode

RMB enemy
Attack Target

S
Stop

Shift + A / Shift + target
queue order

Ctrl + 1..9
save control group

1..9
recall control group

Space
manual fire for single selected installation

Q / W / E
future weapon/ability layer
```

Точные клавиши можно адаптировать.

---

# 64. Manual Fire eligibility

Если selected:

```text
exactly 1 installation
```

Space может использовать текущий manual fire.

Если selected несколько:

```text
Space
```

можно либо:

- fire all using current aim;
- ничего;
- group fire current target.

Для Step 7 лучше:

> manual aim доступен только при single selection.

---

# 65. Input Context

Добавить понятие client input mode:

```ts
type InputMode = 'default' | 'attackGround';
```

Не помещать InputMode в simulation.

---

# 66. Cancel targeting

```text
Esc
```

или RMB:

```text
cancel Attack Ground mode
```

---

# 67. Player Command Boundary

Input должен создавать intent:

```text
screen click
      ↓
world target
      ↓
selected IDs
      ↓
GameCommand
```

Нельзя передавать mouse events в simulation.

---

# 68. Serializable Commands

Все команды должны быть plain serializable data.

Например:

```ts
{
  type: 'attackGround',
  entityIds: [1, 4, 5],
  targetPosition: {
    x: 42.4,
    y: 13.2
  },
  queue: false
}
```

---

# 69. Future Networking

Это важный результат Step 7.

В будущем client сможет отправить:

```text
AttackGroundCommand
```

authoritative server.

Server:

```text
validates ownership
validates entities
assigns orders
runs ballistics
```

Selection вообще не требуется серверу.

---

# 70. Future Replay

Replay сможет хранить:

```text
tick 1200
AttackGroundCommand

tick 1450
StopCommand
```

а не mouse coordinates / UI events.

---

# 71. No Ground Movement

Step 7 не должен случайно возвращать movement system.

У installation нет:

```text
movement target
move speed
path
formation slot
```

Ground entities являются stationary.

---

# 72. Terrain Interaction

Стационарность должна оставаться частью gameplay.

Например:

```text
terrain destroyed under installation
```

может использовать существующую grounding/correction behavior, если оно осталось после Step 5.

Но установка не должна самостоятельно менять горизонтальную позицию.

---

# 73. Falling / support

Если destruction terrain приводит к тому, что установка теряет опору:

для Step 7 можно использовать текущую simple grounding logic.

Например:

```text
drop vertically to next surface
```

или:

```text
destroy / disable if unsupported
```

Не вводить complex structural physics сейчас.

---

# 74. Existing Damage Popups

Damage numbers должны продолжать работать без изменений.

Group fire и AoE автоматически должны использовать существующий feedback layer.

---

# 75. Multiple Simultaneous Projectiles

Step 7 впервые создаст сценарии:

```text
5 installations
fire together
```

Проверить, что simulation корректно поддерживает много projectiles одновременно.

Не менять projectile architecture, если проблем нет.

---

# 76. Basic Performance Target

Для текущего prototype проверить минимум:

```text
10 installations
20–50 simultaneous projectiles
```

без заметных проблем.

Это не production benchmark.

---

# 77. Multiple Explosion Events

Mortar battery может создавать несколько explosions почти одновременно.

Проверить:

- AoE event ordering;
- damage popups;
- terrain mutations;
- dead entity handling.

---

# 78. Deterministic command execution

Group command должен выполнять installations в deterministic order.

Например сортировать:

```text
EntityId ascending
```

если order matters.

Это полезно для:

- replay;
- future authoritative server;
- debugging.

---

# 79. Tests — Single Selection

Проверить client selection logic:

```text
click friendly
→ selected
```

---

# 80. Tests — Shift Selection

```text
shift click
→ add

shift click selected
→ remove
```

---

# 81. Tests — Box Selection

Friendly installations внутри rectangle выбираются.

Outside — нет.

Enemy — нет.

---

# 82. Tests — Dead Entity Selection

Destroyed installation не должна оставаться selected.

---

# 83. Tests — Control Groups

Save:

```text
Ctrl+1
```

Recall:

```text
1
```

возвращает ожидаемые IDs.

---

# 84. Tests — Invalid Group IDs

Destroyed / missing IDs фильтруются при recall.

---

# 85. Tests — AttackGround Command

Command назначает `AttackGroundOrder` правильным entities.

---

# 86. Tests — Ownership Validation

Нельзя назначить order enemy installation.

---

# 87. Tests — AttackTarget Command

Command назначает:

```text
targetEntityId
```

и не принимает nonexistent target.

---

# 88. Tests — Stop

Stop очищает active order.

---

# 89. Tests — Replace Queue

Command без Shift:

```text
replaces old queue
```

---

# 90. Tests — Append Queue

Command с Shift:

```text
appends order
```

---

# 91. Tests — Queue Completion

После одного AttackGround shot:

```text
first order completes
```

и следующий становится active.

---

# 92. Tests — Destroyed Target

AttackTargetOrder должен завершиться при death target.

---

# 93. Tests — Cooldown

Order не позволяет weapon стрелять чаще существующего cooldown.

---

# 94. Tests — Auto Solver

Для простого flat scenario:

```text
installation
target
known gravity
zero wind
```

solver должен находить приемлемый trajectory.

---

# 95. Solver Failure

Если target unreachable:

```text
no valid solution
```

order не должен создавать некорректный projectile.

Installation должна:

- сохранить order;
- либо отметить failure;
- либо завершить order.

Выбрать одно deterministic поведение.

---

# 96. Recommended Auto-Solver Failure Behavior

Для Step 7:

```text
attempt solution
       ↓
no solution
       ↓
order fails
       ↓
next queued order
```

Debug UI показывает:

```text
NO BALLISTIC SOLUTION
```

---

# 97. Tests — Existing Physics Regression

Не должны ломаться:

```text
penetration
ricochet
explosion
direct hit
AoE
terrain damage
damage popups
```

---

# 98. Recommended Implementation Phases

## Phase A — Baseline

Запустить:

```text
typecheck
lint
tests
build
```

---

## Phase B — Multiple Installations

Создать:

```text
3–5 player
3–5 opponent
```

без selection.

Проверить simulation.

---

## Phase C — Client Selection State

Добавить:

```text
single selection
shift selection
hover
```

---

## Phase D — Box Selection

Добавить drag rectangle.

---

## Phase E — Control Groups

Добавить:

```text
Ctrl+1..9
1..9
```

---

## Phase F — Order Model

Добавить:

```text
InstallationOrder
AttackGroundOrder
AttackTargetOrder
```

Пока без auto-fire.

---

## Phase G — Commands

Добавить:

```text
AttackGroundCommand
AttackTargetCommand
StopCommand
```

---

## Phase H — Queue

Добавить:

```text
replace
append with Shift
```

---

## Phase I — Auto Ballistic Solver

Создать isolated solver поверх существующей trajectory simulation.

---

## Phase J — AttackGround Execution

Order:

```text
solve
fire
complete
```

---

## Phase K — AttackTarget Execution

Order:

```text
resolve entity
solve
fire
complete / continue according to chosen semantics
```

Для Step 7 предпочтительно:

```text
one order = one shot
```

---

## Phase L — UI / Indicators

Добавить:

```text
selection visuals
group panel
target markers
queue debug
```

---

## Phase M — Control Group UX

Проверить recall / dead filtering.

---

## Phase N — Full Combat Test

Проверить:

```text
3–5 installations
vs
3–5 installations
```

---

## Phase O — Final Validation

Запустить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

# 99. Definition of Done

Step 7 считается завершённым, если:

1. На карте одновременно существуют несколько player installations.

2. Существуют несколько opponent installations.

3. Ground installations не имеют обычного movement.

4. Single selection работает.

5. Shift selection работает.

6. Box selection работает.

7. Enemy нельзя выбрать как controllable entity.

8. Hover работает отдельно от selection.

9. Selection client-only.

10. Control groups работают.

11. Destroyed IDs корректно очищаются.

12. Существует AttackGroundCommand.

13. Существует AttackTargetCommand.

14. Существует StopCommand.

15. Commands используют EntityId.

16. Commands serializable.

17. Ownership проверяется simulation.

18. Существует InstallationOrder layer.

19. AttackGroundOrder работает.

20. AttackTargetOrder работает.

21. Order queue работает.

22. Shift добавляет order в queue.

23. Command без Shift заменяет queue.

24. Stop очищает queue.

25. Реализован auto ballistic solver.

26. Solver использует существующую projectile simulation.

27. Solver не использует отдельную fake physics model.

28. Attack Ground способен выполнить реальный ballistic shot.

29. Attack Target способен выполнить реальный ballistic shot.

30. Weapon cooldown соблюдается.

31. Недостижимая цель обрабатывается безопасно.

32. Multiple installations могут стрелять одновременно.

33. Multiple projectiles работают корректно.

34. Multiple explosion events работают.

35. Damage popup system продолжает работать.

36. Penetration regression проходит.

37. Ricochet regression проходит.

38. Explosion regression проходит.

39. AoE regression проходит.

40. Terrain destruction regression проходит.

41. React UI показывает single selection.

42. React UI показывает multi selection.

43. Order indicators отображаются.

44. Manual fire сохраняется для single selected installation.

45. RTS auto-fire не удаляет возможность manual aim.

46. Нет ground pathfinding.

47. Нет formation movement.

48. Нет наземного MoveCommand.

49. Typecheck проходит.

50. Lint проходит.

51. Tests проходят.

52. Production build проходит.

---

# 100. Итоговая архитектура

После Step 7:

```text
CLIENT
────────────────────────────

Mouse / Keyboard
      ↓
SelectionState
      ↓
Control Groups
      ↓
Command Intent
      ↓

SIMULATION
────────────────────────────

GameCommand
      ↓
InstallationOrder
      ↓
Ballistic Solver
      ↓
Weapon
      ↓
Projectile
      ↓
Collision
      ↓
Impact
      ↓
Damage / Explosion / Terrain
```

---

# 101. Основная gameplay-модель после Step 7

Игрок теперь управляет не движущейся армией, а:

```text
network of firing positions
```

Основные действия:

```text
select battery
      ↓
choose target
      ↓
fire
      ↓
observe impact
      ↓
correct target / weapon / trajectory
```

Это должно начать ощущаться как:

```text
RTS artillery command
```

а не как набор отдельных Worms-пушек.

---

# 102. Что НЕ делать на Step 7

Не реализовывать:

```text
ground movement
pathfinding
formation movement
vehicle physics
infantry

construction
resources
economy
production

drones

AI

fog of war

radar

power network

supply network

build placement

armor
shields

networking
backend
matchmaking
```

---

# 103. Не делать полноценный Combat AI

Auto Ballistic Solver не является AI.

Он только отвечает:

```text
может ли выбранное оружие попасть в заданную точку?
```

Не добавлять:

```text
automatic target selection
threat evaluation
optimal weapon choice
counter-battery AI
```

---

# 104. Не делать идеальный solver

Auto solver не должен искать:

```text
multi-ricochet
clever penetration route
perfect terrain tunneling
```

Для Step 7 достаточно стандартной ballistic solution.

Manual fire остаётся advanced mode.

---

# 105. Future Extension — Batteries

После Step 7 должно быть легко добавить semantic concept:

```text
Battery
```

как client-side grouping или gameplay grouping нескольких installations.

Но отдельную Battery entity пока не создавать.

Control groups уже выполняют эту функцию.

---

# 106. Future Extension — Drones

Step 7 должен оставить возможность позже добавить:

```text
Drone
```

к той же selection system.

То есть SelectionState работает с:

```text
EntityId
```

а не только:

```text
InstallationId
```

Чтобы в будущем box selection мог выбирать:

```text
installations
+
drones
```

по правилам ownership.

---

# 107. Future Extension — Economy

Следующий большой слой должен использовать stationary gameplay model.

Рекомендуемый Step 8:

```text
Construction + Resource + Infrastructure Foundation
```

с:

```text
Command Core
Resource Node
Extractor
Generator
Relay
Build Placement
Construction
```

---

# 108. Future Core Loop

Step 7 должен подготовить переход к:

```text
economy
   ↓
construction
   ↓
new firing position
   ↓
selection
   ↓
fire orders
   ↓
terrain destruction
   ↓
enemy infrastructure destruction
```

---

# 109. Финальный отчёт Codex

После выполнения показать:

1. какие существующие файлы изменены;
2. какие новые файлы добавлены;
3. как устроен SelectionState;
4. почему selection находится вне simulation;
5. как работает box selection;
6. как работают control groups;
7. структуру AttackGroundCommand;
8. структуру AttackTargetCommand;
9. структуру InstallationOrder;
10. как работает order queue;
11. как работает auto ballistic solver;
12. как solver переиспользует реальную projectile physics;
13. как обрабатывается недостижимая цель;
14. как manual fire сосуществует с RTS orders;
15. как реализована ownership validation;
16. какие regression tests добавлены;
17. результаты typecheck/lint/test/build;
18. известные ограничения Step 7;
19. какие extension points готовы для Step 8;
20. какие extension points готовы для будущих drones.

После завершения Step 7 остановиться.

Не реализовывать строительство, экономику, drones, AI или multiplayer самостоятельно.
