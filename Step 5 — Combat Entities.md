# Step 5 — Combat Entities: Units, Hitboxes, Health, Damage and Movement

## 0. Контекст

Проект находится после Step 4.

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
- TerrainCollision;
- surface normals;
- impact angle;
- ImpactEvent;
- ImpactResolver;
- crater terrain damage;
- penetration;
- capsule terrain damage;
- ricochet;
- projectile continuation after penetration / ricochet;
- impact telemetry;
- Technical Settings Panel;
- regression tests.

Step 4 является рабочим baseline.

Главное правило Step 5:

> Не развивать дальше баллистическую модель. Использовать существующий projectile/impact pipeline для первого полноценного взаимодействия со игровыми сущностями.

Step 5 должен впервые превратить ballistic sandbox в минимальную combat simulation.

---

# 1. Главная цель

После Step 5 должна существовать сцена:

```text
 PLAYER UNIT                           TARGET UNIT

     █                                     █
____/ \___________ terrain _______________/ \____
        \
         \ projectile
          \------------------------------>
```

Projectile должен уметь сталкиваться:

```text
Projectile
    ↓
Collision Query
    ↓
nearest collision
    ↓

┌──────────────────┬──────────────────┐
│                  │                  │
↓                  ↓                  │
Terrain           Entity              │
│                  │
↓                  ↓
existing          EntityImpactEvent
impact                 ↓
pipeline           DamageResolver
                       ↓
                  EntityDamageEvent
                       ↓
                     Health
                       ↓
                      Death
```

Terrain pipeline Step 1–4 не переписывать.

---

# 2. Step 5 разделён на две части

Работать строго по этапам.

## Step 5A — Combat Entities

Реализовать:

```text
Unit
Hitbox
Projectile ↔ Entity collision
EntityImpactEvent
DamageResolver
EntityDamageEvent
Health
Death
```

В конце 5A:

```text
shooter
vs
stationary target
```

должен полностью работать.

---

## Step 5B — Movement

Только после успешного завершения 5A добавить:

```text
MoveCommand
terrain-surface movement
slope limit
moving units
```

Не смешивать implementation 5A и 5B.

---

# 3. Перед началом

Создать baseline commit.

Например:

```bash
git add .
git commit -m "baseline: ricochet ballistic sandbox"
```

Опционально:

```bash
git tag ricochet-v1
```

Затем проверить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Все существующие проверки должны проходить.

---

# 4. Не делать ECS

На этом этапе не вводить полноценный ECS.

Не нужны:

```text
EntityManager
ComponentRegistry
SystemScheduler
Archetypes
Sparse Sets
```

Использовать обычные типизированные структуры.

Например:

```ts
type EntityId = number;
type TeamId = number;
```

---

# 5. UnitState

Добавить простую игровую сущность.

Ориентировочно:

```ts
export interface UnitState {
  id: EntityId;

  position: Vec2;

  teamId: TeamId;

  health: HealthState;

  hitbox: Hitbox;

  activeWeaponId: WeaponId;

  aimAngleRad: number;

  alive: boolean;
}
```

Не обязательно использовать точную структуру.

Главное:

- unit существует внутри simulation;
- renderer только отображает его;
- React не является source of truth.

---

# 6. HealthState

Создать:

```ts
export interface HealthState {
  current: number;
  max: number;
}
```

Правила:

```text
0 <= current <= max
```

При:

```text
current <= 0
```

unit считается destroyed.

---

# 7. Entity ownership

Projectile должен знать источник.

Расширить `ProjectileState`:

```ts
ownerEntityId: EntityId;
teamId: TeamId;
```

Это понадобится для:

- attribution;
- friendly fire;
- kill tracking;
- future networking;
- statistics.

---

# 8. Friendly Fire

Friendly fire не отключать глобально.

Projectile должен иметь возможность попадать по:

```text
enemy
friendly
```

Это соответствует будущей физической природе игры.

Но projectile не должен немедленно сталкиваться со своим owner после spawn.

---

# 9. Owner collision exclusion

Не использовать случайный timeout вроде:

```text
ignore owner for 500 ms
```

Предпочтительно:

> Ignore owner until projectile has exited owner hitbox.

Можно хранить:

```ts
hasExitedOwnerHitbox: boolean;
```

Пока:

```text
false
```

projectile игнорирует collision с `ownerEntityId`.

После выхода:

```text
true
```

owner снова становится обычной collision target.

---

# 10. Hitbox architecture

Simulation должна иметь собственные hitboxes.

Не использовать:

```text
Pixi sprite bounds
DOM bounds
rendered pixels
```

как gameplay collision.

---

# 11. Первый тип hitbox

Начать с:

```ts
export interface CircleHitbox {
  type: 'circle';

  radiusMeters: number;

  offset?: Vec2;
}
```

Для первого Unit circle hitbox достаточно.

---

# 12. Future hitbox extension

API должен позволять позже добавить:

```ts
type Hitbox =
  | CircleHitbox
  | AabbHitbox;
```

Но Step 5 может использовать только CircleHitbox.

Не реализовывать polygon collision сейчас.

---

# 13. Projectile ↔ Entity Collision

Projectile уже хранит:

```text
previousPosition
current position
```

Использовать swept collision.

Не делать:

```ts
distance(projectile.position, unit.position) < radius
```

только в текущей позиции.

Это создаст tunneling для быстрых снарядов.

---

# 14. Segment ↔ Circle collision

Создать pure helper.

Например:

```ts
segmentCircleIntersection(
  from,
  to,
  circleCenter,
  circleRadius
)
```

Результат:

```ts
interface SegmentIntersection {
  hit: boolean;

  fraction?: number;

  point?: Vec2;

  normal?: Vec2;
}
```

`fraction`:

```text
0 = previousPosition
1 = currentPosition
```

---

# 15. Projectile radius

При collision учитывать:

```text
unit hitbox radius
+
projectile radius
```

То есть использовать expanded circle:

```text
effectiveRadius =
unitRadius + projectileRadius
```

---

# 16. Entity collision normal

Для circle hitbox:

```ts
normal =
  normalize(
    impactPoint - circleCenter
  );
```

Normal должна быть finite и normalized.

Использовать существующие vector safety helpers.

---

# 17. Unified collision candidate

Не проверять terrain и entity как две полностью независимые финальные системы.

Создать общий semantic candidate.

Например:

```ts
export type ProjectileCollisionCandidate =
  | TerrainCollisionCandidate
  | EntityCollisionCandidate;
```

---

# 18. TerrainCollisionCandidate

Адаптировать существующий terrain collision к примерно:

```ts
interface TerrainCollisionCandidate {
  type: 'terrain';

  fraction: number;

  point: Vec2;

  normal: Vec2;

  materialId: TerrainMaterialId;
}
```

Не переписывать сам terrain collision algorithm, если он уже работает.

---

# 19. EntityCollisionCandidate

Добавить:

```ts
interface EntityCollisionCandidate {
  type: 'entity';

  entityId: EntityId;

  fraction: number;

  point: Vec2;

  normal: Vec2;
}
```

---

# 20. Nearest collision

Это критически важно.

За один tick projectile может пересечь:

```text
unit
terrain
second unit
```

Нужно:

```text
collect candidates
       ↓
compare fraction
       ↓
select nearest
```

Не делать:

```text
check terrain first
if hit -> return
check entities
```

Порядок collision должен определяться геометрией, а не порядком функций.

---

# 21. ProjectileCollisionResult

После выбора nearest candidate вернуть:

```ts
type ProjectileCollisionResult =
  | TerrainCollisionResult
  | EntityCollisionResult;
```

---

# 22. Terrain impact

Для:

```text
collision.type === terrain
```

использовать существующий Step 4 pipeline без изменений:

```text
TerrainCollision
 ↓
ImpactEvent
 ↓
Ricochet / Penetration / Stop
```

---

# 23. EntityImpactEvent

Для entity создать новый semantic event.

Например:

```ts
export interface EntityImpactEvent {
  type: 'entityImpact';

  tick: number;

  projectileId: EntityId;

  projectileDefinitionId: ProjectileDefinitionId;

  ownerEntityId: EntityId;

  targetEntityId: EntityId;

  position: Vec2;

  velocity: Vec2;

  speed: number;

  kineticEnergyJ: number;

  surfaceNormal: Vec2;
}
```

---

# 24. Не использовать Terrain Impact для Unit

Не добавлять в `ImpactEvent` условные поля:

```text
terrainMaterial?
targetEntity?
unitHealth?
```

Terrain и Entity impacts должны оставаться отдельными semantic events.

---

# 25. Damage pipeline

Не делать:

```ts
target.health -= damage;
```

прямо внутри projectile collision.

Использовать:

```text
EntityImpactEvent
      ↓
DamageResolver
      ↓
EntityDamageEvent
      ↓
HealthSystem
```

---

# 26. EntityDamageEvent

Добавить:

```ts
export interface EntityDamageEvent {
  type: 'entityDamage';

  tick: number;

  sourceEntityId?: EntityId;

  projectileId?: EntityId;

  targetEntityId: EntityId;

  damage: number;

  kineticEnergyJ: number;
}
```

---

# 27. DamageDefinition

Добавить data-driven параметры entity damage.

Например:

```ts
export interface EntityDamageDefinition {
  enabled: boolean;

  energyToDamageScale: number;

  minDamage: number;

  maxDamage: number;
}
```

Подключить к:

```text
ImpactDefinition
```

или ProjectileDefinition, в зависимости от текущей архитектуры.

Не создавать новый огромный definition layer.

---

# 28. Damage formula

Начать с простой модели:

```ts
damage =
  kineticEnergyJ *
  energyToDamageScale;
```

После чего:

```ts
damage = clamp(
  damage,
  minDamage,
  maxDamage
);
```

Никакой armor system пока нет.

---

# 29. DamageResolver

Создать pure resolver:

```ts
resolveEntityDamage(...)
```

Он получает примерно:

```text
EntityImpactEvent
EntityDamageDefinition
```

и возвращает:

```text
EntityDamageEvent
```

---

# 30. HealthSystem

Отдельно применяет:

```text
EntityDamageEvent
```

к UnitState.

Пример flow:

```text
damage event
   ↓
find target
   ↓
health.current -= damage
   ↓
clamp
   ↓
death check
```

---

# 31. Death

При:

```text
health.current <= 0
```

установить:

```ts
alive = false;
```

Не удалять unit прямо в середине collision processing, если это может ломать iteration.

Предпочтительно cleanup после processing tick.

---

# 32. Dead Units

Dead unit:

- не принимает новые commands;
- не стреляет;
- не участвует в collision;
- не блокирует projectile;
- может быть удалён из active collection позже.

---

# 33. Rendering destroyed unit

Минимум:

```text
alive = false
```

может означать:

- скрыть unit;
- показать затемнённый wreck;
- показать простой death marker.

Не создавать полноценную destruction VFX system.

---

# 34. Projectile behavior after Entity impact

На Step 5 использовать простое правило:

```text
projectile hits entity
      ↓
damage
      ↓
projectile stops
```

То есть после EntityImpact:

```ts
projectile.alive = false;
```

---

# 35. Не использовать terrain penetration для Units

Не пытаться сейчас заставить:

```text
Heavy Penetrator
```

пробивать Unit насквозь.

Entity penetration будет отдельным будущим слоем вместе с armor.

---

# 36. Mortar behavior

На Step 5 Mortar:

```text
direct hit entity
→ direct entity damage
```

Но:

```text
terrain impact
→ existing crater
```

Не реализовывать AoE damage пока.

---

# 37. Basic Cannon behavior

Basic Cannon:

```text
direct hit
→ kinetic damage
```

---

# 38. Heavy Penetrator behavior

Heavy Penetrator:

```text
high kinetic energy
→ high direct-hit damage
```

Но max damage clamp должен защищать от absurd values.

---

# 39. Shooter migration

Если сейчас существует отдельный `CannonState`, не переписывать его мгновенно.

Допустим промежуточный вариант:

```text
existing Cannon
+
new Target Unit
```

Но архитектурная цель Step 5:

```text
Unit
 └─ activeWeaponId
```

---

# 40. Safe migration of Cannon

Если перенос Cannon → Unit прост:

выполнить его после entity combat pipeline.

Если перенос рискованный:

сохранить Cannon как shooter adapter и перенести в Unit на следующем маленьком refactor.

Не ломать рабочую стрельбу ради унификации типов.

---

# 41. Initial scene — Step 5A

Создать:

```text
Shooter
```

примерно в левой части карты.

И:

```text
Target Dummy
```

примерно в правой части.

Target должен автоматически ставиться на поверхность terrain.

Использовать существующий:

```text
findSurfaceY
```

или аналогичный query.

---

# 42. Target Dummy

Target Dummy имеет:

```text
id
position
health
hitbox
teamId
alive
```

Не имеет:

```text
AI
movement
weapon
aim
```

если это упрощает первую реализацию.

---

# 43. Teams

Добавить минимальные:

```ts
type TeamId = number;
```

Например:

```text
Player = 1
Target = 2
```

Пока никакой team manager не нужен.

---

# 44. Technical Panel — Entities

Добавить debug section:

```text
ENTITIES

Active units
2

Selected / inspected unit
Unit #2

Team
2

Health
73 / 100

Alive
true

Hitbox
Circle

Radius
0.8 m
```

---

# 45. Damage telemetry

Добавить:

```text
LAST ENTITY IMPACT

Projectile
Heavy Penetrator

Target
Unit #2

Impact Energy
3480 J

Damage
34.8

Health Before
100

Health After
65.2

Result
HIT
```

При уничтожении:

```text
Result
DESTROYED
```

---

# 46. Debug hitboxes

Добавить toggle:

```text
Show Entity Hitboxes
```

Renderer должен отображать simulation hitboxes.

Не брать hitbox из visual sprite.

---

# 47. Debug collision point

После entity impact показывать:

```text
impact point
surface normal
```

если соответствующие debug flags включены.

---

# 48. Tests — Segment Circle

Добавить тесты:

```text
segment misses circle
segment crosses center
segment grazes edge
segment starts near circle
```

---

# 49. Tests — High speed projectile

Projectile должен попадать в unit даже если за один tick проходит полностью через hitbox.

Это обязательный regression case против tunneling.

---

# 50. Tests — Projectile radius

Проверить, что projectile radius учитывается.

---

# 51. Tests — Nearest collision

Сценарий:

```text
projectile
→ unit
→ terrain
```

должен выбрать unit.

---

# 52. Tests — Terrain before Unit

Сценарий:

```text
projectile
→ terrain
→ unit
```

должен выбрать terrain.

---

# 53. Tests — Multiple Units

Если segment пересекает:

```text
Unit A
Unit B
```

impact получает ближайший Unit.

---

# 54. Tests — Owner Ignore

Projectile внутри owner hitbox после spawn:

```text
не должен попадать в owner
```

После выхода и возвращения:

```text
может попасть
```

если траектория это позволяет.

---

# 55. Tests — Damage Formula

При known energy:

```text
1000 J
```

и:

```text
energyToDamageScale = 0.01
```

ожидается:

```text
10 damage
```

если clamp не вмешивается.

---

# 56. Tests — Min Damage

Проверить нижний clamp.

---

# 57. Tests — Max Damage

Проверить верхний clamp.

---

# 58. Tests — Health

При:

```text
100 HP
30 damage
```

ожидается:

```text
70 HP
```

---

# 59. Tests — Death

При:

```text
20 HP
30 damage
```

ожидается:

```text
0 HP
alive = false
```

---

# 60. Tests — Dead Unit collision

Destroyed unit не должен блокировать следующий projectile.

---

# 61. Tests — Terrain Regression

Все Step 4 tests должны продолжать проходить:

```text
crater
penetration
ricochet
surface normals
impact angle
```

---

# 62. Definition of Done — Step 5A

Step 5A завершён, если:

1. Существует UnitState.

2. Существует HealthState.

3. Существует CircleHitbox.

4. Unit hitbox принадлежит simulation.

5. Projectile умеет делать swept entity collision.

6. High-speed projectile не tunnel-ит через unit.

7. Terrain и entity collision объединены через collision candidate layer.

8. Выбирается nearest collision.

9. Terrain impacts используют старый pipeline.

10. Entity impacts создают EntityImpactEvent.

11. Существует DamageResolver.

12. Существует EntityDamageEvent.

13. HealthSystem применяет damage.

14. Unit может умереть.

15. Dead unit больше не участвует в collision.

16. Projectile останавливается после entity hit.

17. Friendly fire архитектурно разрешён.

18. Owner collision корректно игнорируется при spawn.

19. Target Dummy отображается.

20. Target Dummy имеет health.

21. Direct hit уменьшает health.

22. Несколько попаданий уничтожают target.

23. HUD показывает health.

24. Debug layer показывает hitbox.

25. Impact telemetry показывает entity hit.

26. Existing terrain behavior не сломано.

27. Tests проходят.

28. Typecheck проходит.

29. Lint проходит.

30. Production build проходит.

Только после этого переходить к Step 5B.

---

# 63. STEP 5B — Movement

После стабильного entity combat добавить минимальное движение.

Не менять damage/collision pipeline.

---

# 64. Цель Movement

Получить:

```text
movable shooter
vs
movable / stationary target
```

и проверить:

```text
positioning
terrain
ballistics
```

вместе.

---

# 65. MoveCommand

Movement должен идти через существующий command pipeline.

Рекомендуемый вариант:

```ts
type MoveUnitCommand = {
  type: 'moveUnit';

  unitId: EntityId;

  targetX: number;
};
```

Это лучше, чем напрямую передавать:

```text
left / right
```

потому что ближе к будущей RTS.

---

# 66. Command validation

Simulation должна проверить:

```text
unit exists
unit alive
target position valid
```

React не должен напрямую менять `position`.

---

# 67. MovementState

При необходимости:

```ts
interface UnitMovementState {
  targetX?: number;

  speedMetersPerSecond: number;
}
```

Не добавлять acceleration system.

---

# 68. Terrain-following movement

На каждом movement update:

```text
current x
   ↓
move toward targetX
   ↓
query terrain surface
   ↓
set y to surface
```

Использовать:

```text
terrain.findSurfaceY(x)
```

или существующий аналог.

---

# 69. Unit grounding

Unit должен находиться:

```text
hitbox radius
```

выше terrain surface.

Не ставить center прямо на surface.

---

# 70. Slope detection

Перед движением определить:

```text
current surface Y
next surface Y
```

и приблизительный slope.

Если slope превышает:

```text
maxSlopeAngle
```

движение блокируется.

---

# 71. Max slope

Добавить data/config parameter:

```ts
maxSlopeAngleDeg
```

Например стартовое значение:

```text
35–45°
```

Точное значение оставить tuning panel.

---

# 72. Terrain destruction and movement

После crater terrain может измениться под unit.

На каждом tick или после terrain version change unit должен корректно обновить grounding.

Не хранить старый surface Y навсегда.

---

# 73. Falling

На Step 5 не делать полноценную gravity simulation для units.

Если земля под unit исчезла:

предпочтительно:

```text
найти surface ниже
```

и переместить unit вниз контролируемо.

Можно реализовать простое vertical falling speed, если легко.

Но не вводить Rigidbody.

---

# 74. Unit inside terrain safety

После terrain damage unit не должен:

```text
застревать внутри solid cell
```

Добавить простой correction query.

Не писать сложный physics solver.

---

# 75. Controls

Для debug sandbox можно использовать:

```text
Left Click on terrain
→ MoveUnitCommand
```

если shooter selected.

Или:

```text
A / D
```

как временный control.

Но command layer остаётся обязательным.

---

# 76. Предпочтительный вариант — mouse move target

Для будущей RTS полезнее:

```text
select unit
right click terrain
→ move to X
```

Если это существенно усложняет Step 5B, допускается:

```text
A / D
```

через commands.

---

# 77. Shooting while moving

На Step 5 можно разрешить или запретить стрельбу во время движения.

Предпочтительно:

```text
movement does not block fire
```

чтобы не добавлять state machine.

---

# 78. Aim while moving

Aim продолжает работать как раньше.

Weapon pipeline не менять.

---

# 79. Unit collision with Unit

Не реализовывать полноценное unit-unit collision.

Если два unit overlap в debug sandbox — допустимо минимальное separation или запрет movement.

Но не строить crowd simulation.

---

# 80. Movement telemetry

Добавить:

```text
MOVEMENT

Position
x: ...
y: ...

Target X
...

Speed
...

Grounded
true

Slope
23°
```

---

# 81. Debug movement

Опционально:

```text
Show ground samples
Show movement target
Show slope
```

---

# 82. Tests — Surface movement

Unit на flat terrain должен двигаться к targetX.

---

# 83. Tests — Target stop

Unit должен остановиться около targetX без oscillation.

---

# 84. Tests — Slope block

Unit не должен проходить склон круче maxSlopeAngle.

---

# 85. Tests — Terrain-following

При плавном hill terrain Y unit должен меняться корректно.

---

# 86. Tests — Destroyed Unit

Destroyed unit не выполняет MoveCommand.

---

# 87. Tests — Terrain changed

После terrain destruction grounding должен пересчитаться.

---

# 88. Tests — Simulation independence

Movement logic не должен зависеть от:

```text
React
Pixi
DOM
```

---

# 89. Definition of Done — Step 5B

Step 5B завершён, если:

1. Существует MoveUnitCommand.

2. Unit может получить targetX.

3. Movement выполняется внутри simulation.

4. Unit следует поверхности terrain.

5. Скорость задаётся в world units/sec.

6. Существует max slope.

7. Слишком крутой slope блокирует movement.

8. Terrain destruction влияет на grounding.

9. Unit не застревает внутри terrain после обычных crater events.

10. Dead unit не движется.

11. Aim работает после movement.

12. Fire работает после movement.

13. Projectile collision использует новую позицию unit.

14. HUD показывает movement telemetry.

15. Tests проходят.

16. Typecheck проходит.

17. Lint проходит.

18. Build проходит.

---

# 90. Итоговый игровой сценарий

После полного Step 5 должно работать:

1. Запустить сцену.

2. На карте есть shooter и target.

3. Shooter имеет weapon.

4. Target имеет health.

5. Игрок выбирает weapon.

6. Игрок наводит cannon.

7. Trajectory preview работает.

8. Игрок стреляет.

9. Projectile может попасть в terrain.

10. Terrain использует crater / penetration / ricochet.

11. Projectile может попасть в Unit.

12. Entity collision выбирается по реальному nearest intersection.

13. EntityImpactEvent создаётся.

14. Damage вычисляется из kinetic energy.

15. Health уменьшается.

16. Unit уничтожается при 0 HP.

17. Dead unit перестаёт участвовать в gameplay collision.

18. Shooter может перемещаться по terrain.

19. Изменение позиции меняет ballistic possibilities.

20. Разрушение terrain влияет на movement.

---

# 91. Архитектура после Step 5

Ожидаемый pipeline:

```text
Input
  ↓
GameCommand
  ↓
GameRuntime
  ↓
Simulation

        Unit
         │
         ├── Position
         ├── Health
         ├── Hitbox
         ├── Weapon
         └── Movement

ProjectilePhysics
        ↓
Collision Query
        ↓
nearest collision
        ↓
┌───────────────────┬───────────────────┐
│                   │                   │
Terrain            Entity               │
│                   │
↓                   ↓
ImpactEvent       EntityImpactEvent
│                   │
↓                   ↓
Ricochet          DamageResolver
Penetration          │
Stop                 ↓
│                EntityDamageEvent
↓                    │
TerrainDamage        ↓
                  HealthSystem
                      ↓
                     Death
```

---

# 92. Network readiness

Все новые commands/events должны быть serializable plain data.

В будущем:

```text
MoveUnitCommand
FireCommand
SetWeaponCommand
```

смогут отправляться на authoritative server.

Не помещать в state/events:

```text
functions
Pixi objects
React refs
DOM nodes
class callbacks
```

---

# 93. Replay readiness

Результат simulation должен быть воспроизводим из:

```text
initial state
terrain seed
commands
definitions
fixed ticks
```

Не добавлять random damage.

---

# 94. Не делать на Step 5

Не реализовывать:

```text
armor
entity penetration
AoE entity damage
explosion splash
shields
building entities
resource system
worker units
production
multiple unit selection
RTS control groups
AI
pathfinding
formation movement
unit-unit physics
vehicle suspension
wheels
acceleration simulation
fog of war
networking
server
matchmaking
ECS migration
```

---

# 95. Не развивать ballistics дальше

Step 5 не должен добавлять:

```text
новые projectile physics
spin
fragmentation
advanced ricochet
advanced penetration
new terrain material system
```

Использовать существующую физику.

Главная задача теперь:

> проверить физику на реальной игровой цели.

---

# 96. Не создавать Generic Combat Framework

Не нужны:

```text
CombatEntityFactory
DamageStrategyManager
HitboxProviderRegistry
EntityBehaviorContainer
CombatServiceLocator
```

Предпочитать:

```text
plain state
typed events
pure resolvers
small systems
```

---

# 97. Suggested folders

Адаптировать к текущей структуре.

Не перемещать десятки существующих файлов.

Ориентир:

```text
game/

  entities/
    UnitState.ts
    HealthState.ts

  collision/
    ProjectileCollisionResult.ts
    entityCollision.ts
    segmentCircleIntersection.ts

  combat/
    EntityImpactEvent.ts
    EntityDamageEvent.ts
    DamageDefinition.ts
    resolveEntityDamage.ts
    applyEntityDamage.ts

  movement/
    MoveUnitCommand.ts
    updateUnitMovement.ts
    terrainGrounding.ts
```

---

# 98. Implementation order

Строго предпочтительный порядок:

```text
A. baseline tests

B. UnitState + HealthState

C. CircleHitbox

D. segment-circle collision

E. entity collision candidate

F. unified nearest collision

G. EntityImpactEvent

H. DamageResolver

I. HealthSystem

J. Target Dummy

K. Debug UI + hitboxes

L. finish Step 5A validation

M. MoveCommand

N. terrain-following movement

O. slope restriction

P. grounding after terrain destruction

Q. Step 5B tests

R. full validation
```

---

# 99. Regression rule

После каждого крупного sub-step:

```text
typecheck
tests
```

Перед переходом 5A → 5B обязательно:

```text
typecheck
lint
tests
build
```

Не продолжать с уже сломанным combat layer.

---

# 100. Definition of Done — полный Step 5

Step 5 считается полностью завершённым, если:

- Step 4 regression сохранён;
- Unit layer существует;
- собственные simulation hitboxes существуют;
- projectile↔unit swept collision работает;
- nearest collision между terrain/entities работает;
- EntityImpactEvent существует;
- EntityDamageEvent существует;
- kinetic energy влияет на damage;
- Health работает;
- Death работает;
- target dummy можно уничтожить;
- projectile не tunnel-ит;
- owner collision корректно исключается;
- movement работает через command;
- unit следует поверхности;
- slope restriction работает;
- terrain destruction влияет на unit position;
- shooter может изменить позицию и продолжить стрельбу;
- debug HUD показывает combat state;
- tests проходят;
- typecheck проходит;
- lint проходит;
- production build проходит.

---

# 101. Что должно стать возможным после Step 5

Архитектура должна позволять следующим шагом добавить:

```text
ExplosionEvent
        ↓
AreaQuery
        ↓
multiple EntityDamageEvents
```

без изменения текущего direct-hit damage pipeline.

Также должно быть возможно позже добавить:

```text
Armor
Entity penetration
Buildings
Multiple units
Selection
RTS orders
```

---

# 102. Следующий шаг

Не реализовывать его сейчас.

Рекомендуемый Step 6:

```text
Explosions + AoE + Blast Damage + Knockback foundation
```

То есть Mortar впервые сможет работать как настоящее explosive weapon:

```text
terrain impact
      ↓
ExplosionEvent
   ↙       ↘
terrain   entities
damage    AoE damage
```

После Step 6 уже можно переходить к:

```text
multiple units
selection
RTS commands
```

---

# 103. Финальный отчёт Codex

После завершения Step 5 показать:

1. какие существующие файлы изменены;
2. какие новые файлы добавлены;
3. структуру UnitState;
4. структуру Hitbox;
5. как работает segment-circle collision;
6. как определяется nearest collision;
7. как устроен EntityImpactEvent;
8. как устроен DamageResolver;
9. формулу damage;
10. как работает HealthSystem;
11. как предотвращается collision projectile с owner;
12. как работает MoveUnitCommand;
13. как unit следует terrain;
14. как обрабатываются slopes;
15. как terrain destruction влияет на grounding;
16. какие regression tests добавлены;
17. результаты typecheck/lint/test/build;
18. известные ограничения Step 5;
19. какие extension points готовы для Step 6.

После выполнения Step 5 остановиться.

Не реализовывать AoE, armor, buildings, RTS selection или multiplayer самостоятельно.