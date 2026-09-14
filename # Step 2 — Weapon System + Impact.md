# Step 2 — Weapon System + Impact Pipeline

## 0. Контекст

Существует рабочий MVP:

- React + TypeScript;
- PixiJS rendering;
- pure TypeScript simulation;
- fixed timestep;
- procedural destructible terrain;
- одно cannon;
- ballistic projectile;
- gravity;
- wind;
- air drag;
- trajectory preview;
- projectile ↔ terrain collision;
- crater based on kinetic energy;
- technical settings panel;
- serializable game commands.

Текущий MVP считается рабочим baseline.

Этот этап должен **расширить существующую архитектуру**, а не заменить её.

---

# 1. Главная цель этапа

Нужно отделить три понятия:

```text
Cannon
  ↓
Weapon
  ↓
Projectile
```

а обработку попаданий перевести с:

```text
Projectile
   ↓
direct terrain modification
```

на:

```text
Projectile
   ↓
ImpactEvent
   ↓
ImpactResolver
   ↓
TerrainDamageEvent
   ↓
Terrain
```

В результате должна появиться архитектура, позволяющая позже добавлять:

- разные типы оружия;
- penetration;
- ricochet;
- explosions;
- unit damage;
- building damage;
- armor;
- shields;
- effects;
- sound;
- replay;
- networking;

без переписывания projectile simulation.

---

# 2. Критическое правило

Текущая пушка после рефакторинга должна вести себя **максимально идентично текущему MVP**.

До добавления второго оружия необходимо добиться:

```text
old Basic Cannon
≈
new Basic Cannon
```

по:

- muzzle velocity;
- projectile mass;
- projectile radius;
- gravity;
- wind;
- drag;
- trajectory;
- impact energy;
- crater radius;
- trajectory preview.

Если текущая механика работает — не переписывать её без необходимости.

---

# 3. Перед началом изменений

Создать git baseline.

Например:

```bash
git status
git add .
git commit -m "baseline: ballistic terrain MVP"
```

Если используется git tag:

```bash
git tag ballistic-mvp-v1
```

Перед реализацией убедиться, что проходят существующие:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Не начинать большой рефакторинг при существующих ошибках.

---

# 4. Основные архитектурные правила

Сохранить существующее разделение:

```text
React UI
   ↓
Commands
   ↓
GameRuntime
   ↓
Simulation
   ↓
Events / State
   ↓
Pixi renderer
```

Новые gameplay-системы должны оставаться pure TypeScript.

Нельзя импортировать в Weapon / Projectile / Impact:

```text
react
pixi.js
DOM
window
document
```

---

# 5. Что должно появиться

Добавить четыре концепции:

```text
WeaponDefinition
ProjectileDefinition
ImpactEvent
ImpactResolver
```

Дополнительно:

```text
TerrainDamageEvent
```

если это хорошо ложится на текущую архитектуру.

---

# 6. WeaponDefinition

Создать data-driven описание оружия.

Ориентировочная структура:

```ts
export type WeaponId = string;

export interface WeaponDefinition {
  id: WeaponId;
  name: string;

  projectileDefinitionId: ProjectileDefinitionId;

  muzzleVelocity: number;

  cooldownSeconds: number;
}
```

Допускается расширение, если это необходимо существующему проекту.

Например:

```ts
muzzleOffset
shotsPerFire
spread
```

но не добавлять будущие параметры без реальной необходимости.

---

# 7. ProjectileDefinition

Физические характеристики projectile должны быть отделены от weapon.

Например:

```ts
export type ProjectileDefinitionId = string;

export interface ProjectileDefinition {
  id: ProjectileDefinitionId;

  massKg: number;
  radiusMeters: number;

  gravityScale: number;
  windInfluence: number;
  dragCoefficient: number;

  maxLifetimeSeconds: number;

  impactDefinitionId: ImpactDefinitionId;
}
```

Важно:

```text
Weapon
```

описывает способ запуска projectile.

```text
ProjectileDefinition
```

описывает сам projectile.

---

# 8. Почему Weapon и Projectile разделены

В будущем одно оружие сможет запускать:

```text
rocket
grenade
shell
cluster projectile
guided missile
```

А один projectile type потенциально сможет использоваться разными weapon.

Не связывать projectile напрямую с Cannon.

---

# 9. Definition Registry

Не создавать сложную dependency-injection систему.

Для текущего этапа достаточно простого registry.

Например:

```ts
const weaponDefinitions = {
  basicCannon: {...},
  mortar: {...},
};
```

и:

```ts
const projectileDefinitions = {
  basicShell: {...},
  mortarShell: {...},
};
```

Либо typed maps.

Пример:

```ts
export const weaponDefinitions: Record<WeaponId, WeaponDefinition>
```

Если string ID создают слишком слабую типизацию, можно использовать string literal union.

Главное:

- definitions являются data;
- simulation не зависит от React UI;
- definitions легко сериализовать.

---

# 10. Basic Cannon Migration

Текущее оружие превратить в:

```text
Basic Cannon
```

Например:

```ts
basicCannon
```

которое использует:

```ts
basicShell
```

Значения должны соответствовать текущему `GameConfig`.

На этом этапе не менять баланс.

---

# 11. Разделение GameConfig

Текущий config, вероятно, содержит:

```text
projectile.mass
projectile.velocity
projectile.radius
```

После Weapon System избегать двух источников истины.

Не должно существовать одновременно:

```text
GameConfig.projectile.mass
```

и:

```text
ProjectileDefinition.mass
```

с разными значениями.

Нужно выбрать единую ownership model.

Рекомендованный вариант:

### World config

Оставить в GameConfig:

```text
gravity
wind
global air settings
tick rate
terrain settings
```

### Weapon definitions

Хранить:

```text
muzzle velocity
cooldown
```

### Projectile definitions

Хранить:

```text
mass
radius
gravity scale
drag
wind influence
lifetime
```

---

# 12. Technical Panel

Текущая technical panel должна продолжать позволять изменять физику.

Для MVP допускается runtime override definitions.

Например:

```text
Definition defaults
       ↓
Runtime Weapon Settings
       ↓
Spawn Projectile
```

Не изменять immutable global definition прямо из UI, если это создаёт неудобную архитектуру.

Можно сделать:

```ts
interface WeaponRuntimeConfig {
  muzzleVelocityOverride?: number;
}
```

или более простой текущий вариант.

Главный принцип:

> definition задаёт defaults, а debug UI может временно override значения.

Не переусложнять систему конфигураций.

---

# 13. ProjectileState

Projectile instance должен хранить snapshot параметров, необходимых для симуляции.

Например:

```ts
interface ProjectileState {
  id: EntityId;

  projectileDefinitionId: ProjectileDefinitionId;

  position: Vec2;
  previousPosition: Vec2;

  velocity: Vec2;

  massKg: number;
  radiusMeters: number;

  gravityScale: number;
  windInfluence: number;
  dragCoefficient: number;

  lifetimeSeconds: number;

  alive: boolean;
}
```

Почему snapshot?

Чтобы изменение Technical Settings во время полёта не обязательно меняло уже существующий projectile.

Предпочтительное поведение:

```text
settings changed
     ↓
affect next projectile
```

а уже летящий projectile сохраняет параметры, с которыми был создан.

Для глобальных параметров вроде world gravity можно сохранить текущее поведение, если оно уже удобно.

Главное — принять одно понятное решение и задокументировать его.

---

# 14. Fire Flow

Текущий fire flow должен стать:

```text
FireCommand
    ↓
validate cannon
    ↓
resolve WeaponDefinition
    ↓
resolve ProjectileDefinition
    ↓
calculate muzzle transform
    ↓
create ProjectileState
    ↓
add projectile to simulation
```

Не позволять React создавать projectile напрямую.

---

# 15. CannonState

Cannon должен получить ссылку на weapon:

```ts
interface CannonState {
  ...
  weaponId: WeaponId;
}
```

Если позже cannon сможет иметь несколько weapons, текущая структура должна легко расширяться до:

```ts
weaponIds
activeWeaponId
```

Но сейчас достаточно:

```ts
weaponId
```

---

# 16. ImpactEvent

Создать отдельное событие попадания.

Ориентировочный интерфейс:

```ts
export interface ImpactEvent {
  type: 'projectileImpact';

  tick: number;

  projectileId: EntityId;
  projectileDefinitionId: ProjectileDefinitionId;

  position: Vec2;

  velocity: Vec2;

  speed: number;
  kineticEnergyJ: number;

  surfaceNormal?: Vec2;
}
```

На текущем этапе `surfaceNormal` допускается оставить optional.

Он понадобится позднее для ricochet.

---

# 17. Projectile Collision больше не разрушает Terrain напрямую

Нельзя оставлять такую связь:

```ts
projectileCollision.ts
  -> terrain.removeCircle(...)
```

После обнаружения collision projectile system должна:

1. вычислить impact point;
2. вычислить impact velocity;
3. вычислить kinetic energy;
4. создать `ImpactEvent`;
5. пометить projectile как destroyed;
6. передать event ImpactResolver.

---

# 18. Kinetic Energy

Использовать:

```ts
E = 0.5 * m * v²
```

где velocity берётся именно на момент impact.

Создать общую функцию:

```ts
calculateKineticEnergy(
  massKg: number,
  velocity: Vec2
): number
```

Не дублировать формулу:

- в HUD;
- impact;
- debug;
- tests.

---

# 19. ImpactDefinition

Рекомендуется сразу вынести поведение impact в data definition.

Например:

```ts
export interface ImpactDefinition {
  id: ImpactDefinitionId;

  terrainDamage: {
    enabled: boolean;

    baseRadiusMeters: number;
    energyScale: number;
    maxRadiusMeters: number;
  };
}
```

На текущем этапе этого достаточно.

Не добавлять пока:

```text
penetration
ricochet
unit damage
armor damage
status effects
```

Но структура должна позволять добавить их позже.

---

# 20. ImpactResolver

Создать отдельную gameplay-систему:

```ts
resolveImpact(...)
```

Она принимает:

```text
ImpactEvent
ImpactDefinition
current world / terrain access
```

и создаёт последствия.

Сейчас единственное последствие:

```text
TerrainDamage
```

---

# 21. TerrainDamageEvent

Предпочтительно не модифицировать terrain непосредственно внутри ImpactResolver.

Использовать промежуточную semantic operation.

Например:

```ts
export interface TerrainDamageEvent {
  type: 'terrainDamage';

  tick: number;

  sourceProjectileId: EntityId;

  center: Vec2;

  radiusMeters: number;

  energyJ: number;
}
```

Flow:

```text
ImpactEvent
    ↓
ImpactResolver
    ↓
TerrainDamageEvent
    ↓
TerrainDamageSystem
    ↓
TerrainGrid.removeCircle()
```

---

# 22. Зачем нужен TerrainDamageEvent

Позже этот объект можно использовать для:

```text
network replication
replays
effects
sound
camera shake
statistics
debugging
```

Например сервер сможет отправлять:

```text
tick
center
radius
```

а клиент повторит destruction.

---

# 23. Event Queue

Не требуется полноценный event bus.

Для MVP достаточно простой transient queue внутри simulation.

Например:

```ts
interface SimulationEvents {
  impacts: ImpactEvent[];
  terrainDamage: TerrainDamageEvent[];
}
```

или:

```ts
GameEvent[]
```

Если общий union получается удобным:

```ts
type GameEvent =
  | ImpactEvent
  | TerrainDamageEvent;
```

Не создавать глобальный pub/sub framework.

---

# 24. Event Lifecycle

Events должны существовать только столько, сколько требуется.

Например:

```text
simulation tick begins

event queue cleared

projectile simulation
    ↓
ImpactEvent

impact processing
    ↓
TerrainDamageEvent

terrain damage processing
    ↓
Terrain mutation

simulation tick ends
```

Если renderer позже должен видеть events, можно сохранять отдельный:

```text
lastTickEvents
```

Но не превращать events в постоянный game state.

---

# 25. Projectile Lifecycle

После impact projectile:

```text
alive = false
```

или удаляется из collection после обработки tick.

Важно:

ImpactEvent должен быть создан **до удаления projectile data**, необходимых для impact.

---

# 26. Второй тип оружия

Только после того как Basic Cannon работает идентично baseline, добавить:

```text
Mortar
```

Минимальные отличия:

```text
lower muzzle velocity
higher projectile arc
larger projectile mass OR impact radius
different projectile definition
```

Не делать новую механику.

Mortar нужен только как proof:

> WeaponDefinition + ProjectileDefinition действительно поддерживают несколько оружий.

---

# 27. Weapon Selection

Добавить минимальное переключение:

```text
1 — Basic Cannon
2 — Mortar
```

или selector в Technical Panel.

Предпочтительно реализовать command:

```ts
type SetWeaponCommand = {
  type: 'setWeapon';
  cannonId: EntityId;
  weaponId: WeaponId;
};
```

Не менять CannonState напрямую из React.

---

# 28. UI Weapon Selector

В HUD / Technical Panel показывать:

```text
WEAPON

[ Basic Cannon ▼ ]

Projectile
Mass: ...
Muzzle velocity: ...
Muzzle energy: ...
```

При смене оружия trajectory preview должна сразу обновляться.

---

# 29. Trajectory Preview

Trajectory preview должна получать:

```text
active weapon
active projectile definition
world physics
```

и использовать ту же projectile physics, что и реальный projectile.

Не создавать:

```text
if mortar -> special trajectory formula
```

Использовать data-driven параметры.

---

# 30. Impact Debug Information

После попадания Technical Panel / HUD должна показывать:

```text
LAST IMPACT

Weapon
Basic Cannon

Projectile
Basic Shell

Speed
31.27 m/s

Kinetic Energy
2444 J

Crater Radius
1.46 m

Position
x: ...
y: ...
```

Это полезно для настройки будущей физики.

---

# 31. Debug Impact Marker

Добавить необязательную debug visualization:

```text
X
```

в точке последнего ImpactEvent.

Можно показать:

- impact point;
- velocity vector;
- kinetic energy.

Не делать сложный VFX.

---

# 32. Surface Normal

Для текущего этапа полноценная accurate terrain normal не обязательна.

Но collision API желательно подготовить к возврату:

```ts
interface CollisionResult {
  hit: boolean;
  point: Vec2;
  normal?: Vec2;
}
```

Не тратить много времени на нормаль сейчас.

Она станет обязательной на этапе ricochet.

---

# 33. Suggested Folder Structure

Адаптировать к существующему проекту.

Не перемещать рабочие файлы просто ради красивой структуры.

Ориентир:

```text
game/

  weapons/
    WeaponDefinition.ts
    weaponDefinitions.ts

  projectiles/
    ProjectileDefinition.ts
    projectileDefinitions.ts
    ProjectileState.ts
    projectilePhysics.ts
    createProjectile.ts

  impacts/
    ImpactEvent.ts
    ImpactDefinition.ts
    impactDefinitions.ts
    resolveImpact.ts

  terrain/
    TerrainDamageEvent.ts
    applyTerrainDamage.ts

  commands/
    FireCommand.ts
    SetWeaponCommand.ts

  entities/
    Cannon.ts
```

Если текущая структура уже хорошая — расширить её минимально.

---

# 34. Не делать массовое перемещение файлов

Codex не должен одновременно:

```text
add Weapon system
+
rename 30 files
+
move directories
+
rewrite runtime
```

Это создаёт ненужный regression risk.

Работать incremental.

---

# 35. Implementation Phases

## Phase A — Baseline protection

Сначала:

- run tests;
- run typecheck;
- run build;
- добавить regression tests, если ключевая ballistic behavior ещё не покрыта.

Не менять gameplay.

---

## Phase B — Definitions

Добавить:

```text
WeaponDefinition
ProjectileDefinition
ImpactDefinition
```

Создать:

```text
Basic Cannon
Basic Shell
Basic Impact
```

Пока не менять старый runtime существенно.

---

## Phase C — Spawn migration

Перевести текущий fire logic:

```text
hardcoded projectile
```

на:

```text
WeaponDefinition
+
ProjectileDefinition
```

Проверить baseline.

---

## Phase D — ImpactEvent

Projectile collision теперь создаёт:

```text
ImpactEvent
```

но можно временно оставить старое terrain damage за ImpactResolver.

Проверить baseline.

---

## Phase E — ImpactResolver

Перенести crater calculation в:

```text
ImpactResolver
```

Проверить baseline.

---

## Phase F — TerrainDamageEvent

Перевести:

```text
ImpactResolver
```

на создание:

```text
TerrainDamageEvent
```

Terrain system применяет destruction.

Проверить baseline.

---

## Phase G — Mortar

Только теперь добавить второе weapon definition.

Добавить weapon selection.

Проверить:

```text
Basic Cannon
Mortar
```

---

## Phase H — Debug UI

Добавить:

```text
weapon selector
impact telemetry
weapon telemetry
```

---

## Phase I — Final validation

Запустить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

# 36. Regression Tests

Добавить тест:

## Basic weapon configuration

Basic Cannon должен создавать projectile с ожидаемыми:

```text
mass
velocity
radius
```

---

# 37. Spawn Test

При:

```text
angle = known value
muzzleVelocity = known value
```

initial projectile velocity должна соответствовать:

```text
vx
vy
```

---

# 38. Impact Energy Test

Для:

```text
mass = 2 kg
speed = 10 m/s
```

ожидается:

```text
100 J
```

---

# 39. Impact Event Test

Projectile collision должен создать:

```text
ImpactEvent
```

с корректными:

```text
projectileId
position
velocity
energy
tick
```

---

# 40. Terrain Damage Event Test

Known `ImpactEvent` должен создавать предсказуемый:

```text
TerrainDamageEvent
```

---

# 41. Baseline Crater Test

При параметрах текущего Basic Cannon размер crater должен соответствовать предыдущему поведению в разумной tolerance.

Это ключевой regression test.

---

# 42. Multiple Weapons Test

Basic Cannon и Mortar должны создавать projectiles с различными характеристиками.

Например:

```text
Basic Cannon:
velocity = X

Mortar:
velocity = Y
```

---

# 43. Preview Consistency Test

Если возможно без чрезмерной сложности:

trajectory preview и реальный projectile при одинаковых условиях должны проходить через близкие позиции simulation.

---

# 44. Definition of Done

Этап завершён, если:

1. Existing MVP всё ещё работает.

2. Basic Cannon существует как `WeaponDefinition`.

3. Basic Shell существует как `ProjectileDefinition`.

4. Cannon содержит `weaponId`.

5. FireCommand создаёт projectile через weapon definition.

6. Projectile collision больше не управляет crater logic напрямую.

7. Collision создаёт `ImpactEvent`.

8. Kinetic energy вычисляется централизованно.

9. ImpactResolver обрабатывает ImpactEvent.

10. Terrain destruction происходит через semantic terrain damage operation/event.

11. Basic Cannon визуально и физически ведёт себя как старый cannon.

12. Добавлен Mortar.

13. Оружие можно переключить.

14. Trajectory preview корректно работает для обоих weapons.

15. Technical Panel показывает active weapon.

16. HUD показывает характеристики active weapon.

17. HUD показывает telemetry последнего impact.

18. Existing tests проходят.

19. New tests проходят.

20. Typecheck проходит.

21. Lint проходит.

22. Production build проходит.

---

# 45. Что НЕ делать на этом этапе

Не реализовывать:

```text
penetration
ricochet
armor
unit health
unit damage
explosion damage to units
multiple cannons
movement
AI
enemy
economy
buildings
fog of war
networking
WebSocket
server
ECS
inventory
ammo system
reload animation
particles architecture
complex VFX
audio architecture
```

---

# 46. Особо важное ограничение для Codex

Не переписывать работающие системы «для чистоты».

Перед изменением существующего модуля задать вопрос:

> Можно ли добавить новый слой вокруг существующего поведения вместо его полной замены?

Предпочитать:

```text
existing projectile physics
        ↓
wrapped by definitions
```

вместо:

```text
delete projectile physics
        ↓
write new generic engine
```

---

# 47. Migration Rule

Каждый промежуточный этап должен оставлять проект в compilable состоянии.

Не создавать рефакторинг, где десятки файлов одновременно находятся в временно сломанном состоянии.

Предпочтительный цикл:

```text
small change
    ↓
typecheck
    ↓
tests
    ↓
next change
```

---

# 48. Не создавать преждевременный Generic Weapon Framework

Не нужны:

```text
WeaponComponentFactory
ProjectileStrategyFactory
GenericDamagePipelineManager
EventBusService
DependencyContainer
```

и подобные абстракции.

На текущем этапе архитектура должна оставаться простой:

```text
definitions
+
pure functions
+
plain data
+
small systems
```

---

# 49. Архитектурная цель после Step 2

После завершения flow должен выглядеть так:

```text
Input
  ↓
FireCommand
  ↓
Cannon
  ↓
WeaponDefinition
  ↓
ProjectileDefinition
  ↓
ProjectileState
  ↓
ProjectilePhysics
  ↓
TerrainCollision
  ↓
ImpactEvent
  ↓
ImpactResolver
  ↓
TerrainDamageEvent
  ↓
TerrainGrid
```

Rendering находится сбоку:

```text
GameState
   ↓
Pixi Renderer
```

и не участвует в gameplay decisions.

---

# 50. Что должно стать проще после этого этапа

После Step 2 следующие механики должны добавляться **без переписывания базовой цепочки**.

### Penetration

```text
ImpactResolver
    ↓
penetrate?
```

### Ricochet

```text
ImpactResolver
    ↓
ricochet?
```

### Unit Damage

```text
ImpactEvent
    ↓
DamageEvent
```

### Explosive Shell

```text
ImpactDefinition
    ↓
ExplosionEvent
```

### Network

```text
FireCommand
    ↓
server
```

и:

```text
ImpactEvent / TerrainDamageEvent
    ↓
replication / replay
```

---

# 51. Финальный отчёт Codex

После выполнения задачи показать:

1. какие существующие файлы были изменены;
2. какие новые файлы появились;
3. итоговый fire pipeline;
4. итоговый impact pipeline;
5. как устроены WeaponDefinition и ProjectileDefinition;
6. где находится Basic Cannon;
7. где находится Mortar;
8. какие regression tests добавлены;
9. результаты typecheck/lint/tests/build;
10. какие extension points готовы для penetration и ricochet.

Не переходить самостоятельно к Step 3.

После выполнения Step 2 остановиться.