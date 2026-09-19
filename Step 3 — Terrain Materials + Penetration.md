# Step 3 — Terrain Materials + Penetration

## 0. Контекст

Существует рабочий проект после Step 2.

Уже реализовано:

- React + TypeScript;
- PixiJS rendering;
- pure TypeScript simulation;
- fixed timestep;
- procedural destructible terrain;
- Cannon;
- WeaponDefinition;
- ProjectileDefinition;
- Basic Cannon;
- Mortar;
- FireCommand;
- projectile physics;
- gravity;
- wind;
- air drag;
- trajectory preview;
- projectile ↔ terrain collision;
- ImpactEvent;
- ImpactResolver;
- TerrainDamageEvent / semantic terrain damage operation;
- crater based on kinetic energy;
- weapon switching;
- Technical Settings Panel;
- impact telemetry;
- regression tests.

Step 2 считается рабочим baseline.

Главное правило Step 3:

> Расширить существующую impact architecture через terrain materials и penetration. Не переписывать projectile physics и существующий weapon pipeline без необходимости.

---

# 1. Главная цель

После этого этапа terrain перестаёт быть бинарным:

```text
air / solid
```

и становится material-based:

```text
Air
Soil
Rock
```

Projectile при столкновении больше не обязан всегда останавливаться.

Flow должен стать:

```text
Projectile
    ↓
Terrain collision
    ↓
ImpactEvent
    ↓
read TerrainMaterial
    ↓
PenetrationResolver
    ↓

enough energy?
 ┌───────────────┐
 ↓               ↓
YES              NO
 ↓                ↓
penetrate        stop
 ↓
lose energy
 ↓
damage terrain
 ↓
continue flight
```

---

# 2. Критическое ограничение

Не ломать текущий Basic Cannon / Mortar behavior.

До добавления penetration необходимо сначала выполнить migration terrain:

```text
binary terrain
      ↓
material terrain
```

при этом обычный Soil должен вести себя максимально близко к старому solid terrain.

Только после прохождения regression tests добавлять penetration.

---

# 3. Перед началом

Создать baseline commit.

Например:

```bash
git add .
git commit -m "baseline: weapon and impact pipeline"
```

Опционально:

```bash
git tag weapon-impact-v1
```

Проверить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Все существующие проверки должны проходить до начала Step 3.

---

# 4. Архитектурный принцип

Сохранить:

```text
Input
 ↓
Commands
 ↓
Simulation
 ↓
Weapon
 ↓
Projectile
 ↓
Impact
 ↓
Terrain Damage
```

Step 3 добавляет внутрь:

```text
Impact
 ↓
Terrain Material
 ↓
Penetration
```

Не переносить эту логику:

- в React;
- в Pixi renderer;
- в UI;
- в Cannon;
- непосредственно в TerrainGrid.

---

# 5. TerrainGrid migration

Текущий TerrainGrid, вероятно, хранит:

```text
0 = air
1 = solid
```

Расширить его до material IDs.

Например:

```ts
export enum TerrainMaterialId {
  Air = 0,
  Soil = 1,
  Rock = 2,
}
```

TerrainGrid всё ещё должен использовать компактное хранение.

Предпочтительно:

```ts
Uint8Array;
```

Не создавать object для каждой terrain cell.

---

# 6. TerrainGrid responsibility

TerrainGrid должен знать только:

```text
какой material ID находится в cell
```

Он не должен хранить:

```text
hardness
density
blast resistance
penetration formulas
```

Пример API:

```ts
terrain.getMaterialAtCell(x, y)

terrain.getMaterialAtWorldPosition(position)

terrain.setMaterial(...)

terrain.isSolid(...)

terrain.removeCircle(...)

terrain.applyDamageOperation(...)
```

`isSolid()` можно сохранить как compatibility helper:

```ts
material !== TerrainMaterialId.Air;
```

---

# 7. TerrainMaterialDefinition

Добавить data-driven definitions.

Например:

```ts
export interface TerrainMaterialDefinition {
  id: TerrainMaterialId;

  name: string;

  density: number;

  hardness: number;

  penetrationResistance: number;

  blastResistance: number;
}
```

Не обязательно использовать все параметры сразу.

Главный параметр Step 3:

```text
penetrationResistance
```

`blastResistance` можно уже использовать для crater size, если это не ломает текущую систему.

---

# 8. Material Registry

Создать простой registry.

Например:

```ts
export const terrainMaterialDefinitions: Record<TerrainMaterialId, TerrainMaterialDefinition>;
```

или аналогичную strongly typed структуру.

Не делать dependency injection framework.

---

# 9. Initial Materials

Реализовать минимум:

```text
Air
Soil
Rock
```

### Air

```text
not solid
zero penetration resistance
no terrain rendering
```

### Soil

```text
low penetration resistance
low/medium hardness
low blast resistance
```

### Rock

```text
high penetration resistance
high hardness
high blast resistance
```

Не пытаться использовать реалистичные физические значения.

Это gameplay tuning parameters.

---

# 10. Existing Terrain Migration

Текущий процедурный terrain должен по умолчанию генерироваться как:

```text
Soil
```

То есть после migration визуально и физически сцена должна остаться максимально похожей.

Это отдельный промежуточный milestone.

На этом этапе penetration ещё не добавлять.

---

# 11. Procedural Rock

После успешной migration добавить Rock regions.

Минимальный вариант:

```text
surface:
Soil

deeper layer:
Rock
```

Например:

```text
          air

       /~~~~~~~~\
______/~~~~~~~~~~\____
      SOIL
~~~~~~~~~~~~~~~~~~~~~~

██████████████████████
████████ ROCK ████████
██████████████████████
```

Допускается использовать:

- depth threshold;
- несколько seeded blobs;
- эллиптические regions.

Не делать geological simulation.

---

# 12. Seeded generation

Rock generation должна быть deterministic для одного seed.

Нельзя использовать:

```ts
Math.random();
```

Использовать существующий seeded random.

Один seed должен давать одинаковое распределение материалов.

---

# 13. Rendering Materials

Renderer должен отображать material ID разными визуальными стилями.

Например:

```text
Soil
dark muted brown

Rock
dark gray
```

Не передавать renderer:

```text
hardness
penetration resistance
density
```

Renderer работает только с visual mapping:

```text
TerrainMaterialId -> visual
```

---

# 14. Preserve Renderer Architecture

Не создавать:

```text
<TerrainCell />
<TerrainCell />
...
```

Renderer должен продолжать использовать текущий efficient terrain texture approach.

При обновлении terrain texture цвет cell зависит от material ID.

---

# 15. ImpactEvent extension

Расширить ImpactEvent только если это необходимо.

Он должен содержать минимум:

```ts
interface ImpactEvent {
  type: 'projectileImpact';

  tick: number;

  projectileId: EntityId;
  projectileDefinitionId: ProjectileDefinitionId;

  position: Vec2;
  velocity: Vec2;

  speed: number;
  kineticEnergyJ: number;
}
```

При необходимости добавить:

```ts
terrainMaterialId?: TerrainMaterialId;
```

Но предпочтительно material запрашивать внутри ImpactResolver / PenetrationResolver по позиции.

Избегать дублирования source of truth.

---

# 16. Collision system responsibility

Collision system отвечает только на вопрос:

> Где projectile впервые пересёк solid terrain?

Он не должен решать:

- остановился ли projectile;
- пробил ли материал;
- сколько энергии потеряно;
- какой crater создать.

Это responsibility impact / penetration systems.

---

# 17. Projectile должен перестать автоматически умирать

Если сейчас logic выглядит как:

```ts
if (collision) {
  projectile.alive = false;
}
```

это необходимо изменить.

Collision должен создать ImpactEvent.

Дальше судьбу projectile определяет ImpactResolver.

---

# 18. ImpactResolution

Добавить явный результат обработки impact.

Например:

```ts
export type ImpactResolution =
  | {
      type: 'stop';

      finalPosition: Vec2;
    }
  | {
      type: 'penetrate';

      exitPosition: Vec2;

      remainingVelocity: Vec2;

      remainingEnergyJ: number;

      penetrationDistanceMeters: number;
    };
```

Можно адаптировать структуру под текущий код.

Главное:

```text
ImpactResolver
```

должен явно сообщать результат.

---

# 19. PenetrationDefinition

Расширить ProjectileDefinition.

Пример:

```ts
interface ProjectilePenetrationDefinition {
  enabled: boolean;

  penetrationPower: number;

  penetrationRadiusMeters: number;

  maxPenetrationDistanceMeters: number;

  minimumExitEnergyJ: number;
}
```

И:

```ts
interface ProjectileDefinition {
  ...

  penetration?: ProjectilePenetrationDefinition;
}
```

Не добавлять слишком много параметров.

---

# 20. PenetrationPower

`penetrationPower` является gameplay modifier.

Базовая модель сопротивления может выглядеть:

```ts
effectiveResistance = material.penetrationResistance / projectile.penetrationPower;
```

или:

```ts
energyCost = (material.penetrationResistance * distance) / penetrationPower;
```

Выбрать одну простую модель.

Главное:

- больше projectile penetrationPower → легче пробивать;
- выше material resistance → тяжелее пробивать;
- большая толщина материала → больше energy loss.

---

# 21. Не моделировать настоящую терминальную баллистику

Не реализовывать:

- сложную деформацию projectile;
- fracture mechanics;
- hydrodynamic penetration;
- real-world armor equations;
- fragmentation physics.

Нужна игровая предсказуемая модель.

---

# 22. Penetration traversal

После initial impact нужно пройти внутрь terrain вдоль направления projectile.

Пример:

```text
entry point
    ↓

------>██████████████---->
       ↑            ↑
      entry         exit
```

Использовать sampling.

Например:

```ts
stepSize <= terrain.cellSize / 2;
```

На каждом шаге:

1. определить текущий material;
2. определить длину шага;
3. вычислить energy cost;
4. уменьшить remaining energy;
5. проверить max penetration distance;
6. проверить, вышел ли projectile обратно в Air.

---

# 23. Traversal inputs

PenetrationResolver должен получать примерно:

```text
entry position
direction
initial kinetic energy
projectile mass
penetration definition
terrain
material definitions
```

Не брать зависимости из React или глобального UI state.

---

# 24. Direction

На Step 3 направление projectile после penetration не меняется.

Использовать:

```ts
direction = normalize(impactVelocity);
```

Не реализовывать deviation.

Это появится позже вместе с ricochet / deflection.

---

# 25. Energy loss

На каждом traversal step:

```ts
remainingEnergyJ -= energyCost;
```

Energy никогда не должна стать отрицательной.

Использовать:

```ts
Math.max(0, remainingEnergyJ);
```

---

# 26. Stop conditions

Projectile останавливается, если:

```text
remainingEnergy <= minimumExitEnergy
```

или:

```text
penetrationDistance >= maxPenetrationDistance
```

или:

```text
другой explicit safety limit достигнут
```

---

# 27. Successful penetration

Penetration успешна, если projectile:

```text
entered solid terrain
```

и затем:

```text
reached Air again
```

при:

```text
remainingEnergy > minimumExitEnergy
```

Тогда projectile продолжает полёт.

---

# 28. Remaining velocity

После penetration восстановить speed из energy:

```text
E = 0.5 * m * v²
```

следовательно:

```ts
newSpeed = Math.sqrt((2 * remainingEnergyJ) / projectile.massKg);
```

Направление сохранить:

```ts
newVelocity = direction * newSpeed;
```

---

# 29. Exit position

Projectile должен продолжить движение немного после границы terrain.

Избегать ситуации:

```text
exit position всё ещё считается solid
```

и projectile сталкивается снова на следующем tick с той же поверхностью.

Допустимо использовать небольшой epsilon:

```ts
exitPosition = detectedExitPosition + direction * epsilon;
```

Epsilon должен быть связан с terrain cell size, а не быть случайным magic number.

---

# 30. Terrain penetration channel

Успешное penetration должно повреждать terrain вдоль пути.

Добавить semantic operation:

```ts
interface CapsuleTerrainDamage {
  type: 'capsule';

  from: Vec2;

  to: Vec2;

  radiusMeters: number;
}
```

И сохранить текущую:

```ts
interface CircleTerrainDamage {
  type: 'circle';

  center: Vec2;

  radiusMeters: number;
}
```

---

# 31. TerrainDamageOperation

Объединить:

```ts
type TerrainDamageOperation = CircleTerrainDamage | CapsuleTerrainDamage;
```

Если текущая архитектура использует Event:

```ts
TerrainDamageEvent;
```

он должен содержать operation.

Например:

```ts
interface TerrainDamageEvent {
  type: 'terrainDamage';

  tick: number;

  sourceProjectileId: EntityId;

  operation: TerrainDamageOperation;
}
```

---

# 32. Capsule destruction

Для MVP capsule можно реализовать как:

```text
серия overlap circles вдоль segment
```

Не нужно писать сложную geometry rasterization.

Главное:

- deterministic;
- predictable;
- покрывает trajectory;
- не оставляет случайных solid gaps внутри penetration channel.

---

# 33. Failed penetration

Если projectile не смог выйти из материала:

```text
ImpactResolution = stop
```

Terrain damage должна отражать путь, который projectile успел пройти.

Например:

```text
██████████████████
----->       █████
██████████████████
```

То есть channel заканчивается внутри terrain.

---

# 34. Crater vs penetration channel

Не превращать любой penetrator impact в огромный crater.

ImpactDefinition должен разделять:

```text
surface damage
penetration damage
```

Например:

```ts
interface ImpactDefinition {
  terrainDamage: {
    crater: {
      ...
    };

    penetration?: {
      channelRadiusScale: number;
    };
  };
}
```

Но сохранить систему простой.

---

# 35. Material blast resistance

Если это не создаёт большой риск regression, crater radius можно модифицировать material resistance.

Например:

```ts
effectiveCraterRadius = baseCraterRadius / material.blastResistance;
```

или более мягкой формулой.

Но:

> Это optional часть Step 3.

Если изменение crater behavior сильно усложняет regression testing — сначала реализовать materials + penetration без blast resistance.

---

# 36. Basic Cannon

Basic Cannon должен остаться универсальным.

Например:

```text
medium energy
medium crater
limited penetration
```

Он может получить:

```text
penetration enabled = true
```

с умеренными параметрами.

Но поведение по обычному Soil не должно радикально отличаться от Step 2.

---

# 37. Mortar

Mortar должен иметь:

```text
low penetration
large terrain damage
```

Можно:

```text
penetration.enabled = false
```

или очень низкий penetrationPower.

Mortar должен демонстрировать отличие:

> большая разрушительная область ≠ хорошее пробитие.

---

# 38. Heavy Penetrator

Добавить третий weapon или projectile profile:

```text
Heavy Penetrator
```

Минимальные свойства:

```text
high mass
high velocity
high penetration power
small crater
small penetration channel
```

Его роль:

```text
пробивать terrain
```

а не создавать большой crater.

---

# 39. Weapon selection

Если сейчас:

```text
1 — Basic Cannon
2 — Mortar
```

добавить:

```text
3 — Heavy Penetrator
```

Использовать существующий SetWeaponCommand.

Не писать отдельную input architecture.

---

# 40. Trajectory preview

Preview должна продолжать использовать реальную projectile physics.

Но penetration simulation в trajectory preview пока можно ограничить.

Предпочтительный вариант:

Trajectory preview:

```text
показывает полёт до первого terrain impact
```

На Step 3 не обязательно визуализировать trajectory после penetration.

Если текущая архитектура позволяет легко сделать полный penetration preview — допустимо.

Но не усложнять ради этого Step 3.

---

# 41. Technical Settings

Добавить секцию:

```text
TERRAIN MATERIAL DEBUG

Cell under cursor:
Rock

Penetration resistance:
...

Blast resistance:
...

Hardness:
...
```

Cursor inspection может использовать world position → TerrainGrid lookup.

---

# 42. Projectile Debug

Добавить:

```text
PENETRATION

Enabled
true

Penetration power
...

Max depth
...

Channel radius
...
```

Для active weapon / projectile.

---

# 43. Impact telemetry

После impact отображать:

```text
LAST IMPACT

Material:
Rock

Impact energy:
4200 J

Penetration:
SUCCESS

Penetration depth:
1.72 m

Energy lost:
2700 J

Remaining energy:
1500 J

Exit speed:
24.49 m/s
```

При fail:

```text
Penetration:
STOPPED
```

---

# 44. Debug visualization

Добавить optional debug:

```text
Show penetration path
```

Визуализировать:

```text
entry point
sample points
exit point
```

Это должен быть debug rendering.

Не добавлять данные PixiJS в simulation.

---

# 45. PenetrationResult

Создать отдельный результат resolver.

Например:

```ts
export interface PenetrationResult {
  penetrated: boolean;

  entryPosition: Vec2;

  finalPosition: Vec2;

  exitPosition?: Vec2;

  penetrationDistanceMeters: number;

  initialEnergyJ: number;

  remainingEnergyJ: number;

  traversedSegments: PenetrationSegment[];
}
```

---

# 46. PenetrationSegment

Полезно сохранять traversal по материалам.

Например:

```ts
interface PenetrationSegment {
  materialId: TerrainMaterialId;

  from: Vec2;
  to: Vec2;

  distanceMeters: number;

  energyLostJ: number;
}
```

Это облегчит:

- debugging;
- telemetry;
- будущую работу с multiple materials;
- network/replay investigation.

Не хранить эти segments постоянно в GameState.

Это transient result.

---

# 47. Multiple materials traversal

Penetrator должен корректно обрабатывать:

```text
Soil → Rock → Soil
```

Например:

```text
------> SSSSS RRRRR SSSS ---->
```

Каждый material должен добавлять собственный energy cost.

Не считать всю толщину по материалу entry point.

---

# 48. Event flow

После Step 3 pipeline должен выглядеть примерно:

```text
ProjectilePhysics
      ↓
TerrainCollision
      ↓
ImpactEvent
      ↓
ImpactResolver
      ↓
TerrainMaterial lookup
      ↓
PenetrationResolver
      ↓
ImpactResolution
      ↓
TerrainDamageEvent(s)
      ↓
TerrainGrid
```

При success:

```text
ImpactResolution.penetrate
      ↓
update ProjectileState
      ↓
continue simulation
```

---

# 49. Avoid recursive collision bugs

После успешного penetration:

- projectile reposition to exit;
- previousPosition корректно обновить;
- исключить повторную collision с entry surface;
- не обрабатывать дважды один impact.

Добавить тест на это.

---

# 50. Safety limit

Penetration traversal обязательно должен иметь hard upper bound.

Например:

```text
max sample count
```

или:

```text
maxPenetrationDistanceMeters
```

Чтобы ошибочная terrain geometry не могла создать infinite loop.

---

# 51. Tests — Terrain Material Storage

Проверить:

```text
set Soil
get Soil
```

и:

```text
set Rock
get Rock
```

Air должен корректно считаться non-solid.

---

# 52. Tests — Legacy Soil

Terrain, полностью состоящий из Soil, должен поддерживать существующие:

```text
collision
crater
surface lookup
```

---

# 53. Tests — Seeded Generation

Одинаковый seed должен создавать одинаковые:

```text
terrain shape
material distribution
```

---

# 54. Tests — Resistance

Одинаковый projectile:

```text
Soil
```

должен проходить глубже, чем:

```text
Rock
```

при одинаковой толщине.

---

# 55. Tests — Insufficient Energy

Projectile с недостаточной энергией должен:

```text
enter terrain
lose energy
stop
```

и не появляться с другой стороны.

---

# 56. Tests — Successful Penetration

Projectile с достаточной энергией должен:

```text
enter
traverse
exit
```

и получить:

```text
remainingEnergy < initialEnergy
```

---

# 57. Tests — Exit Velocity

При known:

```text
mass
remaining energy
```

скорость после penetration должна соответствовать:

```text
sqrt(2E / m)
```

---

# 58. Tests — Material Sequence

Для:

```text
Soil → Rock → Soil
```

energy loss должен быть суммой соответствующих traversal costs.

---

# 59. Tests — Max Penetration Distance

Даже projectile с очень большой энергией не должен traversal бесконечно.

При достижении:

```text
maxPenetrationDistance
```

resolver останавливается.

---

# 60. Tests — Capsule Damage

После penetration path cells внутри channel становятся Air.

Cells далеко от channel остаются неизменными.

---

# 61. Tests — Failed Penetration Channel

Если projectile остановился внутри terrain, damage channel должен заканчиваться около finalPosition.

---

# 62. Tests — No Negative Energy

Ни при каких параметрах:

```text
remainingEnergy
```

не должна становиться отрицательной.

---

# 63. Tests — No duplicate impact

После successful penetration projectile не должен на следующем tick снова зарегистрировать тот же entry impact.

---

# 64. Recommended implementation phases

## Phase A — Protect baseline

Запустить:

```text
typecheck
lint
tests
build
```

Добавить недостающие regression tests.

---

## Phase B — Material IDs

Перевести TerrainGrid:

```text
air / solid
```

на:

```text
Air / Soil / Rock
```

Пока генерировать только Soil.

Проверить весь проект.

---

## Phase C — Material Definitions

Добавить:

```text
TerrainMaterialDefinition
registry
```

Не менять gameplay.

---

## Phase D — Material Rendering

Добавить разные visuals.

Добавить Rock generation.

Проверить deterministic seed.

---

## Phase E — Penetration Definition

Добавить penetration parameters в ProjectileDefinition.

Пока не менять impact behavior.

---

## Phase F — PenetrationResolver

Создать pure function penetration traversal.

Сначала тестировать изолированно.

---

## Phase G — Impact integration

Подключить resolver:

```text
ImpactEvent
 ↓
PenetrationResolver
 ↓
stop / penetrate
```

---

## Phase H — Projectile continuation

При успешном penetration:

```text
update position
update velocity
continue flight
```

Проверить отсутствие duplicate impacts.

---

## Phase I — Capsule Terrain Damage

Добавить penetration channel.

Сохранить current circle crater.

---

## Phase J — Heavy Penetrator

Добавить третий weapon/projectile definition.

---

## Phase K — Debug tools

Добавить:

```text
material inspector
penetration telemetry
penetration path
```

---

## Phase L — Final validation

Запустить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

# 65. Что НЕ делать

Не реализовывать:

```text
ricochet
surface-normal gameplay
deflection
armor
units
health
building damage
fragmentation
cluster shells
shields
explosive AoE against entities
AI
pathfinding
economy
fog of war
networking
backend
ECS migration
realistic geology
realistic terminal ballistics
```

---

# 66. Не переписывать Projectile Physics

Текущие:

```text
gravity
wind
drag
fixed timestep
trajectory
```

должны остаться.

Penetration является impact behavior.

Не превращать projectilePhysics в огромную систему, содержащую:

```text
terrain
materials
damage
penetration
effects
```

---

# 67. Не переписывать TerrainGrid

Расширить cell representation.

Не заменять рабочую grid architecture на:

```text
polygon terrain
voxel engine
marching squares physics
complex mesh terrain
```

если это не требуется текущей реализации.

---

# 68. Не создавать generic material engine

Не нужны:

```text
MaterialComponentFactory
PhysicsMaterialService
PenetrationStrategyManager
CollisionResponseContainer
```

Предпочитать:

```text
plain definitions
pure functions
typed data
small resolvers
```

---

# 69. Network readiness

Все новые semantic events должны оставаться serializable.

Например:

```text
TerrainDamageOperation
ImpactResolution
```

не должны содержать:

```text
Pixi objects
functions
DOM values
class references
```

---

# 70. Future ricochet readiness

Step 3 не реализует ricochet.

Но после него должно быть легко добавить:

```text
ImpactEvent
 ↓
surface normal
 ↓
impact angle
 ↓
RicochetResolver
```

Поэтому не hardcode:

```text
impact always penetration
```

ImpactResolver должен быть расширяемым.

Будущий flow:

```text
Impact
 ↓
penetration / ricochet decision
```

---

# 71. Definition of Done

Step 3 завершён, если:

1. Existing Step 2 behavior не сломан.

2. TerrainGrid хранит material IDs.

3. Реализованы:

```text
Air
Soil
Rock
```

4. TerrainMaterialDefinition отделён от TerrainGrid.

5. Terrain generation deterministic.

6. Soil и Rock визуально различаются.

7. Existing collision работает с material grid.

8. ProjectileDefinition поддерживает penetration parameters.

9. Создан PenetrationResolver.

10. Penetration зависит от:

```text
projectile energy
projectile penetration power
material resistance
material thickness
```

11. Projectile может остановиться внутри terrain.

12. Projectile может полностью пробить terrain.

13. После penetration projectile теряет kinetic energy.

14. Его скорость после penetration пересчитывается из remaining energy.

15. Direction на Step 3 сохраняется.

16. Projectile после выхода продолжает ballistic flight.

17. Нет duplicate collision сразу после выхода.

18. Реализована semantic capsule terrain damage operation.

19. Penetration создаёт channel в terrain.

20. Failed penetration создаёт partial channel.

21. Basic Cannon работает.

22. Mortar работает.

23. Добавлен Heavy Penetrator.

24. Оружие переключается через существующий command pipeline.

25. UI показывает active material.

26. UI показывает penetration telemetry.

27. Добавлены regression tests.

28. Добавлены penetration tests.

29. Typecheck проходит.

30. Lint проходит.

31. Tests проходят.

32. Production build проходит.

---

# 72. Итоговая архитектура

После Step 3 ожидается:

```text
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
TerrainMaterialDefinition
        ↓
PenetrationResolver
        ↓
 ┌─────────────┴──────────────┐
 ↓                            ↓
STOP                       PENETRATE
 ↓                            ↓
terrain damage             energy loss
                              ↓
                        terrain channel
                              ↓
                       remaining velocity
                              ↓
                       continue projectile
```

---

# 73. Следующий extension point

Не реализовывать его сейчас.

Step 4 должен иметь возможность добавить:

```text
surface normal
+
impact angle
+
ricochet
```

примерно так:

```text
ImpactEvent
    ↓
ImpactResolver
    ↓
material
surface normal
impact angle
    ↓
┌──────────┬───────────┐
↓          ↓           ↓
stop    penetrate   ricochet
```

Архитектура Step 3 должна позволять добавить третью ветку без переписывания penetration.

---

# 74. Финальный отчёт Codex

После выполнения показать:

1. какие существующие файлы изменены;
2. какие новые файлы добавлены;
3. как изменился TerrainGrid;
4. как устроены TerrainMaterialDefinition;
5. как работает PenetrationResolver;
6. формулу energy loss;
7. как определяется successful penetration;
8. как создаётся penetration channel;
9. как обновляется velocity projectile;
10. параметры Basic Cannon / Mortar / Heavy Penetrator;
11. какие tests добавлены;
12. результаты typecheck/lint/test/build;
13. известные ограничения penetration model;
14. какие extension points готовы для Step 4.

После завершения Step 3 остановиться.

Не реализовывать ricochet самостоятельно.
