# Step 4 — Surface Normals + Impact Angles + Ricochet

## 0. Контекст

Проект находится после Step 3.

Уже реализованы:

- React + TypeScript;
- PixiJS rendering;
- pure TypeScript simulation;
- fixed timestep;
- procedural destructible terrain;
- TerrainGrid;
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
- projectile ↔ terrain collision;
- ImpactEvent;
- ImpactResolver;
- TerrainDamageEvent;
- circle terrain damage;
- capsule penetration damage;
- kinetic energy;
- PenetrationResolver;
- projectile continuation after penetration;
- material penetration resistance;
- penetration telemetry;
- debug tools;
- regression tests.

Step 3 является рабочим baseline.

Главное правило Step 4:

> Добавить surface normals, impact angles и ricochet как новый вариант разрешения ImpactEvent, не переписывая существующий penetration pipeline.

---

# 1. Главная цель

После Step 4 impact должен иметь три возможных результата:

```text
Projectile
    ↓
TerrainCollision
    ↓
ImpactEvent
    ↓
ImpactResolver
    ↓

┌────────────┬──────────────┬─────────────┐
│            │              │             │
↓            ↓              ↓             │
STOP     PENETRATE      RICOCHET          │
              │              │
              ↓              ↓
        energy loss      energy loss
              │              │
              ↓              ↓
        continue          reflect
        projectile        velocity
                              │
                              ↓
                       continue flight
```

Ricochet должен зависеть как минимум от:

```text
surface normal
impact angle
material
projectile properties
current energy / speed
```

---

# 2. Критическое правило

Не менять поведение существующей penetration-модели до тех пор, пока surface-normal migration не завершена и regression tests не проходят.

Работать последовательно:

```text
existing collision
      ↓
add normal
      ↓
verify old impacts
      ↓
add angle calculation
      ↓
verify
      ↓
add ricochet decision
```

Не переписывать collision + penetration + terrain одновременно.

---

# 3. Перед началом

Создать baseline:

```bash
git add .
git commit -m "baseline: terrain materials and penetration"
```

Опционально:

```bash
git tag terrain-penetration-v1
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

# 4. Архитектурный результат

После Step 4 pipeline должен выглядеть примерно так:

```text
ProjectilePhysics
      ↓
TerrainCollision
      ↓
CollisionResult
      ↓
ImpactEvent
      ↓
ImpactContext
      ↓
ImpactResolver
      ↓
┌────────────┬──────────────┬──────────────┐
↓            ↓              ↓
Stop      Penetrate      Ricochet
```

Rendering остаётся passive consumer.

---

# 5. CollisionResult

Расширить collision result.

Пример:

```ts
export interface TerrainCollisionResult {
  hit: boolean;

  point: Vec2;

  normal: Vec2;

  materialId: TerrainMaterialId;

  travelFraction?: number;
}
```

`normal` является главным новым полем.

Не добавлять Pixi geometry.

---

# 6. Surface Normal

Surface normal — единичный вектор, направленный из solid terrain в Air.

Например:

```text
             normal
               ↗
              /
████████████ / surface
████████████/
```

У нормали:

```ts
length(normal) ≈ 1
```

---

# 7. Не использовать Renderer для Normal

Нормаль должна вычисляться на основе:

```text
TerrainGrid
```

а не:

- визуальной texture;
- Pixi mesh;
- canvas pixels;
- sprite bounds.

Simulation terrain остаётся source of truth.

---

# 8. Метод вычисления normal

Для текущего grid terrain использовать gradient-based normal approximation.

Например, вокруг impact position определить occupancy / density:

```text
left
right
up
down
```

и вычислить gradient.

Концептуально:

```ts
gx = sample(x + d, y) - sample(x - d, y);
gy = sample(x, y + d) - sample(x, y - d);
```

После чего:

```ts
normal = normalize(-gradient);
```

Знак адаптировать под принятую систему координат.

---

# 9. Более устойчивый sampling

Предпочтительно использовать не только 4 точки, а небольшой neighborhood.

Например:

```text
3 × 3
```

или:

```text
5 × 5
```

kernel.

Цель:

> Normal не должна резко прыгать от одной terrain cell к другой.

Но не создавать сложный marching-squares normal solver на этом этапе.

---

# 10. Material sampling и Normal

Для вычисления поверхности считать:

```text
Air = 0
solid material = 1
```

То есть:

```text
Soil
Rock
```

для геометрической normal одинаково являются solid.

Material properties используются позднее ImpactResolver.

---

# 11. Fallback normal

Если gradient невозможно надёжно определить:

использовать fallback.

Например:

```ts
normal = normalize(-projectile.velocity);
```

или другой безопасный вариант.

Не допускать:

```text
NaN
Infinity
zero-length normal
```

---

# 12. Normal validation

Создать helper:

```ts
isValidNormal(...)
```

или эквивалентную защиту.

Проверить:

```text
finite values
length > epsilon
```

После normalize:

```text
length ≈ 1
```

---

# 13. ImpactEvent extension

Расширить `ImpactEvent`:

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

  surfaceNormal: Vec2;

  terrainMaterialId: TerrainMaterialId;
}
```

Если `terrainMaterialId` сейчас lookup-ится внутри resolver и это удобно — допускается оставить lookup там.

Но `surfaceNormal` должна соответствовать конкретному collision result.

---

# 14. Impact Direction

Создать единый helper:

```ts
const incomingDirection = normalize(impact.velocity);
```

Не дублировать это вычисление в penetration / ricochet.

---

# 15. Impact Angle

Нужен понятный и единый convention.

Рекомендуется определить:

```text
0° = лобовое попадание, перпендикулярно поверхности

90° = почти касательное попадание
```

Пример:

```text
FRONTAL

projectile
    ↓
    ↓
────────────
     ↑
   normal

angle ≈ 0°
```

И:

```text
GLANCING

projectile ───────>

──────────────────
        ↑
      normal

angle ≈ 90°
```

---

# 16. Angle calculation

Можно использовать:

```ts
const incoming = normalize(velocity);

const cosine = clamp(dot(scale(incoming, -1), surfaceNormal), -1, 1);

const impactAngleRad = Math.acos(cosine);
```

При необходимости преобразовать:

```ts
impactAngleDeg;
```

Главное — один convention во всём проекте.

---

# 17. Общий utility

Создать:

```ts
calculateImpactAngle(...)
```

Не вычислять угол отдельно:

- в HUD;
- RicochetResolver;
- debug layer;
- tests.

---

# 18. ImpactContext

Рекомендуется ввести лёгкий объект:

```ts
export interface ImpactContext {
  event: ImpactEvent;

  material: TerrainMaterialDefinition;

  projectile: ProjectileDefinition;

  impactAngleRad: number;
}
```

Не создавать сложный context framework.

Он нужен только для уменьшения повторных lookup/calculation.

---

# 19. Projectile Ricochet Definition

Расширить projectile definition.

Например:

```ts
export interface ProjectileRicochetDefinition {
  enabled: boolean;

  minRicochetAngleDeg: number;

  maxRicochetAngleDeg?: number;

  minSpeedMetersPerSecond: number;

  energyRetention: number;

  materialHardnessInfluence: number;

  maxRicochets: number;
}
```

Не обязательно использовать все поля.

Минимальный вариант:

```ts
{
  enabled: boolean;
  minRicochetAngleDeg: number;
  minSpeedMetersPerSecond: number;
  energyRetention: number;
  maxRicochets: number;
}
```

---

# 20. Не переусложнять probability

Первую версию ricochet сделать deterministic.

То есть:

```text
условия выполнены
→ ricochet

условия не выполнены
→ penetration / stop
```

Не добавлять random chance.

Это важно для:

- debugging;
- replays;
- networking;
- skill-based gameplay.

---

# 21. Material Ricochet Properties

Расширить material definition минимально.

Например:

```ts
interface TerrainMaterialDefinition {
  ...

  hardness: number;

  ricochetFactor: number;
}
```

Пример:

```text
Soil:
low ricochetFactor

Rock:
high ricochetFactor
```

---

# 22. Soil behavior

Soil должен редко или никогда не давать сильный ricochet.

Например:

```text
Soil
→ penetration / stop
```

при большинстве попаданий.

Можно оставить ricochetFactor очень низким.

---

# 23. Rock behavior

Rock должен позволять ricochet при пологом impact angle.

Пример:

```text
       projectile
──────────────→
             /
            /
████████████████
```

Если projectile скользит вдоль Rock:

```text
ricochet вероятен / разрешён
```

---

# 24. Ricochet decision

Создать отдельный pure resolver:

```ts
resolveRicochet(...)
```

или:

```ts
canRicochet(...)
```

Он принимает:

```text
impact angle
speed
energy
projectile definition
material definition
ricochet count
```

и возвращает понятный результат.

---

# 25. RicochetResult

Например:

```ts
export interface RicochetResult {
  ricocheted: boolean;

  outgoingVelocity?: Vec2;

  retainedEnergyJ?: number;

  energyLostJ?: number;

  impactAngleRad: number;
}
```

---

# 26. Resolver order

На Step 4 использовать явный порядок.

Рекомендуемый:

```text
Impact
  ↓
can ricochet?
  ↓
YES → ricochet

NO
  ↓
try penetration
  ↓
penetrate / stop
```

Почему:

при пологом столкновении твёрдая поверхность должна сначала дать шанс на ricochet, вместо того чтобы любой удар пытался пробивать материал.

---

# 27. Не смешивать resolvers

Не писать одну функцию на 300 строк:

```ts
resolveImpact();
```

с десятками nested `if`.

Предпочтительно:

```text
ImpactResolver
   ↓
RicochetResolver
   ↓
PenetrationResolver
```

`ImpactResolver` занимается orchestration.

---

# 28. ImpactResolution union

Расширить существующий union:

```ts
export type ImpactResolution =
  StopImpactResolution | PenetrationImpactResolution | RicochetImpactResolution;
```

---

# 29. RicochetImpactResolution

Например:

```ts
export interface RicochetImpactResolution {
  type: 'ricochet';

  position: Vec2;

  outgoingVelocity: Vec2;

  initialEnergyJ: number;

  remainingEnergyJ: number;

  energyLostJ: number;

  impactAngleRad: number;

  surfaceNormal: Vec2;
}
```

---

# 30. Reflection

Для отражения velocity использовать стандартную vector reflection.

Для normalized normal:

```ts
reflected = velocity - 2 * dot(velocity, normal) * normal;
```

Создать общий helper:

```ts
reflectVector(...)
```

---

# 31. Energy loss on ricochet

Ricochet не должен сохранять 100% энергии.

Использовать:

```text
remainingEnergy =
initialEnergy × energyRetention
```

Например:

```text
energyRetention = 0.6
```

означает 60% энергии после ricochet.

---

# 32. Velocity after ricochet

После вычисления remaining energy:

```ts
speedAfter = Math.sqrt((2 * remainingEnergyJ) / projectile.massKg);
```

Затем:

```ts
outgoingVelocity = normalize(reflectedDirection) * speedAfter;
```

Таким образом энергия остаётся source of truth.

---

# 33. Не умножать velocity напрямую дважды

Не делать одновременно:

```ts
velocity *= 0.7;
energy *= 0.6;
```

иначе физика станет противоречивой.

Выбрать:

```text
energy retention
```

и восстановить speed из энергии.

---

# 34. Minimum speed

Если после ricochet:

```text
speedAfter < minimum viable speed
```

projectile должен остановиться.

Не создавать projectile, который бесконечно дрожит по поверхности.

---

# 35. Ricochet Count

Добавить в `ProjectileState`:

```ts
ricochetCount: number;
```

При каждом ricochet:

```ts
ricochetCount += 1;
```

---

# 36. Max Ricochets

`ProjectileDefinition` должен ограничивать:

```text
maxRicochets
```

Например:

```text
Basic shell → 1
Penetrator → 2
Mortar → 0
```

Это предотвращает бесконечные bouncing loops.

---

# 37. Post-ricochet position

После reflection projectile нельзя оставлять прямо внутри collision point.

Переместить его немного от surface:

```ts
position = impactPoint + surfaceNormal * separationEpsilon;
```

или вдоль outgoing direction, если это лучше подходит текущему collision.

---

# 38. Separation epsilon

Epsilon должен быть связан с:

```text
terrain cell size
projectile radius
```

Не использовать произвольный pixel value.

Например концептуально:

```ts
epsilon = Math.max(terrain.cellSize * 0.1, projectile.radius * 0.1);
```

---

# 39. Previous Position

После ricochet обязательно корректно обновить:

```text
previousPosition
position
velocity
```

чтобы следующий simulation tick не зарегистрировал тот же impact ещё раз.

---

# 40. Duplicate-impact protection

Добавить regression test:

> После ricochet projectile не должен повторно сталкиваться с той же поверхностью на следующем tick из-за numerical overlap.

---

# 41. Surface Normal Debug

Добавить toggle:

```text
Show surface normals
```

После impact показывать:

```text
impact point ●
             ↗ normal
```

Не хранить Pixi graphics в simulation.

---

# 42. Impact Angle Debug

Показывать:

```text
IMPACT

Material
Rock

Angle
73.2°

Normal
x: ...
y: ...

Result
RICOCHET
```

---

# 43. Ricochet Telemetry

После ricochet:

```text
RICOCHET

Impact energy
4200 J

Impact angle
78.4°

Energy retained
58%

Remaining energy
2436 J

Outgoing speed
34.9 m/s

Ricochets
1 / 2
```

---

# 44. Technical Panel

Добавить секцию active projectile:

```text
RICOCHET

Enabled
true

Minimum angle
65°

Minimum speed
10 m/s

Energy retention
60%

Maximum ricochets
2
```

Это debug sandbox, поэтому параметры можно менять.

---

# 45. Runtime Overrides

Сохранить существующий принцип:

```text
Definition defaults
        ↓
debug runtime overrides
        ↓
spawn projectile snapshot
```

Если projectile уже летит, изменение параметров ricochet не должно неожиданно менять его свойства, если текущая архитектура использует spawn snapshots.

---

# 46. Weapon Roles

После Step 4 оружие должно начать различаться ещё сильнее.

### Basic Cannon

```text
medium penetration
medium ricochet
medium crater
```

### Mortar

```text
large crater
low penetration
ricochet disabled
```

### Heavy Penetrator

```text
high penetration
high speed
higher ricochet capability on Rock
small crater
```

---

# 47. Не добавлять новый weapon только ради ricochet

Не нужен четвёртый weapon.

Использовать существующие:

```text
Basic Cannon
Mortar
Heavy Penetrator
```

для проверки системы.

---

# 48. Terrain Damage on Ricochet

Ricochet должен оставить небольшое повреждение поверхности.

Не использовать полный crater от обычного stop impact.

Добавить лёгкую semantic operation.

Например:

```text
small impact chip
```

Можно использовать существующий circle damage с маленьким radius.

---

# 49. Ricochet Surface Damage

Пример:

```ts
radius = baseImpactMarkRadius * someEnergyFactor;
```

Не создавать большую воронку при скользящем ricochet.

---

# 50. Energy accounting

При impact:

```text
initialEnergy
```

после ricochet:

```text
remainingEnergy
```

разница:

```text
energyLost
```

может быть использована для небольшого terrain damage.

Не требуется физически идеальная модель.

---

# 51. Impact Decision Logic

Предпочтительно держать решение прозрачным.

Пример:

```text
if ricochet disabled
    ↓
penetration

else if speed < minimum
    ↓
penetration

else if angle < minRicochetAngle
    ↓
penetration

else if material too soft
    ↓
penetration

else
    ↓
ricochet
```

---

# 52. Hardness influence

Не делать overly complex formula.

Например:

```text
effectiveRicochetThreshold =
baseThreshold
+
material/projectile modifier
```

или использовать простой material multiplier.

Главное:

```text
Rock > Soil
```

по склонности к ricochet.

---

# 53. Avoid hidden randomness

Не использовать:

```ts
Math.random();
```

для ricochet.

Если позже понадобится variation, использовать seeded deterministic randomness.

Но не в Step 4.

---

# 54. Trajectory Preview

Это важный момент.

После Step 4 preview желательно научить показывать один ricochet.

Поскольку preview уже использует ту же projectile physics, использовать тот же:

```text
ImpactResolver
```

в preview simulation.

---

# 55. Preview limits

Чтобы preview не становился дорогим:

```text
max preview ricochets = 1
```

или:

```text
preview max simulation time
```

Не показывать бесконечные bouncing trajectories.

---

# 56. Preview Visualization

Например:

```text
          ·
       ·
    ·
C ·
        \
         ● impact
          ·
           ·
            ·
```

Место ricochet можно отметить маленькой точкой.

---

# 57. Same Logic Rule

Запрещено создавать отдельную формулу для preview ricochet.

Нужно использовать тот же:

```text
surface normal
impact angle
RicochetResolver
ImpactResolver
```

что и реальная simulation.

---

# 58. Surface Normal Quality

Добавить debug scene / test cases с простыми поверхностями:

```text
horizontal
vertical
45° slope
```

Проверить нормали.

---

# 59. Horizontal Surface Test

Для плоской поверхности normal должна быть примерно:

```text
up
```

с учётом выбранной координатной системы.

---

# 60. Vertical Surface Test

Для вертикальной стены:

```text
normal → horizontal
```

---

# 61. Slope Test

Для склона примерно 45°:

```text
normal
```

должна быть примерно перпендикулярна slope.

Не требовать математически идеального результата для pixel/grid terrain.

---

# 62. Impact Angle Tests

Проверить convention:

### Frontal

```text
projectile падает прямо на поверхность
```

ожидается:

```text
angle ≈ 0°
```

### Glancing

```text
projectile идёт почти вдоль поверхности
```

ожидается:

```text
angle ≈ 90°
```

---

# 63. Reflection Test

Для известного случая:

```text
velocity = (1, 1)
normal = (0, -1)
```

reflected direction должен соответствовать ожидаемому зеркальному отражению с учётом координат проекта.

---

# 64. Ricochet Threshold Test

Например:

```text
threshold = 65°
```

Impact:

```text
40°
```

не должен ricochet.

Impact:

```text
75°
```

должен ricochet при остальных подходящих условиях.

---

# 65. Material Test

Одинаковый projectile и impact angle:

```text
Soil
```

и:

```text
Rock
```

должны давать разные решения, если material ricochet settings различаются.

---

# 66. Speed Test

Projectile ниже:

```text
minRicochetSpeed
```

не должен ricochet даже при пологом угле.

---

# 67. Energy Retention Test

При:

```text
initialEnergy = 1000 J
retention = 0.6
```

ожидается:

```text
remainingEnergy = 600 J
```

---

# 68. Velocity From Energy Test

После ricochet скорость должна соответствовать:

```text
sqrt(2E / m)
```

---

# 69. Max Ricochet Test

Если:

```text
maxRicochets = 1
```

второй collision не должен снова ricochet.

Он должен перейти в:

```text
penetration / stop
```

---

# 70. Duplicate Collision Test

После successful ricochet следующий tick не должен регистрировать тот же surface contact.

---

# 71. Penetration Regression

Обязательно сохранить существующие Step 3 tests.

Ricochet disabled:

```text
Impact behavior
```

должен быть практически идентичен Step 3.

Это ключевой regression criterion.

---

# 72. Mortar Regression

Mortar с:

```text
ricochet.enabled = false
```

должен продолжать вести себя как раньше.

---

# 73. Penetrator Regression

При почти frontal impact Heavy Penetrator должен по-прежнему пробивать подходящую толщину terrain.

Ricochet не должен перехватывать нормальные frontal impacts.

---

# 74. Recommended Implementation Phases

## Phase A — Baseline

Проверить:

```text
typecheck
lint
tests
build
```

---

## Phase B — Collision Normal

Добавить:

```text
surface normal
```

в TerrainCollisionResult.

Не менять impact behavior.

Проверить regression.

---

## Phase C — Normal Tests + Debug

Добавить:

```text
horizontal
vertical
slope
```

tests.

Добавить visualization normal.

---

## Phase D — Impact Angle

Добавить:

```text
calculateImpactAngle()
```

и telemetry.

Не добавлять ricochet.

---

## Phase E — Definition Extension

Добавить:

```text
ProjectileRicochetDefinition
material ricochet properties
ricochetCount
```

Без изменения gameplay.

---

## Phase F — RicochetResolver

Реализовать isolated pure resolver.

Добавить unit tests.

---

## Phase G — ImpactResolution

Добавить:

```text
type: 'ricochet'
```

в existing union.

---

## Phase H — Impact Integration

ImpactResolver:

```text
try ricochet
     ↓
else penetration
     ↓
else stop
```

---

## Phase I — Projectile Continuation

После ricochet:

```text
position
previousPosition
velocity
ricochetCount
```

должны обновляться.

---

## Phase J — Terrain Chip

Добавить небольшое surface damage на ricochet.

---

## Phase K — Preview

Добавить поддержку ricochet в trajectory preview.

---

## Phase L — Debug UI

Добавить:

```text
normal
impact angle
result
energy retention
ricochet counter
```

---

## Phase M — Final Validation

Запустить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

---

# 75. Performance

Не оптимизировать prematurely.

Но normal calculation вызывается на каждом impact, поэтому:

- не создавать большие arrays;
- не копировать TerrainGrid;
- не сканировать огромную область;
- использовать небольшой fixed neighborhood.

---

# 76. Numerical Safety

Все vector functions должны защищаться от:

```text
zero vector
NaN
Infinity
acos outside [-1, 1]
```

Перед `Math.acos` обязательно:

```ts
clamp(value, -1, 1);
```

---

# 77. Network Readiness

Ricochet resolution должна быть pure/serializable.

Не включать в result:

```text
Pixi objects
DOM
callbacks
functions
class instances
```

В будущем server сможет authoritative вычислять:

```text
Impact
→ Ricochet
→ new projectile state
```

---

# 78. Replay Readiness

Ricochet должен быть полностью воспроизводим из:

```text
projectile state
terrain state
material definition
surface normal
impact resolver
```

Отсутствие randomness на этом этапе особенно важно.

---

# 79. Не делать сейчас

Не реализовывать:

```text
units
health
armor
building damage
shields
fragmentation
cluster weapons
guided projectiles
explosive AoE against entities
vehicle movement
AI
pathfinding
economy
fog of war
networking
backend
matchmaking
ECS migration
terrain collapse
advanced fracture physics
random ricochet spread
projectile deformation
```

---

# 80. Не делать realistic ricochet simulation

Не нужны:

```text
spin stabilization
yaw
projectile deformation
temperature
material fracture mechanics
real ballistic coefficient tables
```

Нужна:

```text
simple
predictable
skill-based
tunable
```

модель.

---

# 81. Не переписывать PenetrationResolver

PenetrationResolver Step 3 должен оставаться отдельной системой.

Ricochet добавляется:

```text
перед penetration
```

в decision pipeline.

Не смешивать две механики в один algorithm.

---

# 82. Не переписывать TerrainGrid

Surface normal является query поверх TerrainGrid.

Не заменять terrain architecture на:

```text
polygon terrain
mesh collider
physics engine
marching squares collision engine
```

в рамках Step 4.

---

# 83. Не добавлять Physics Engine

По-прежнему не использовать:

```text
Matter.js
Box2D
Planck
Rapier
```

для решения ricochet.

Текущий simulation core должен оставаться собственным и контролируемым.

---

# 84. Definition of Done

Step 4 считается завершённым, если:

1. Step 3 regression tests продолжают проходить.

2. Terrain collision возвращает surface normal.

3. Surface normal вычисляется на основе TerrainGrid.

4. Normal normalized и numerical-safe.

5. Horizontal surface test проходит.

6. Vertical surface test проходит.

7. Slope test проходит.

8. Реализован единый impact-angle convention.

9. `calculateImpactAngle()` используется во всей simulation.

10. Impact telemetry показывает angle.

11. ProjectileDefinition поддерживает ricochet config.

12. TerrainMaterialDefinition поддерживает ricochet-related property.

13. ProjectileState имеет `ricochetCount`.

14. Реализован pure RicochetResolver.

15. ImpactResolution поддерживает `ricochet`.

16. ImpactResolver сначала рассматривает ricochet, затем penetration.

17. Frontal impact не ricochet при стандартных настройках.

18. Glancing impact по Rock может ricochet.

19. Soil значительно хуже поддерживает ricochet.

20. Mortar ricochet disabled.

21. Heavy Penetrator способен ricochet при подходящем угле.

22. Ricochet использует vector reflection.

23. Ricochet теряет energy.

24. Speed после ricochet восстанавливается из remaining kinetic energy.

25. Projectile продолжает ballistic simulation после ricochet.

26. Projectile не застревает в поверхности после reflection.

27. Нет duplicate impact на следующем tick.

28. Max ricochet limit работает.

29. Ricochet создаёт небольшое terrain surface damage.

30. Penetration продолжает работать.

31. Trajectory preview способен показать минимум один ricochet.

32. Debug UI показывает normal.

33. Debug UI показывает impact angle.

34. Debug UI показывает ricochet result.

35. Debug UI показывает energy retained/lost.

36. Добавлены unit tests.

37. Typecheck проходит.

38. Lint проходит.

39. Все tests проходят.

40. Production build проходит.

---

# 85. Итоговая архитектура

После Step 4:

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
SurfaceNormal
       ↓
ImpactEvent
       ↓
ImpactAngle
       ↓
ImpactResolver
       ↓
  ┌───────────────┐
  │               │
  ↓               ↓
Ricochet?        No
  │               │
 YES              ↓
  │        PenetrationResolver
  ↓            │
Reflection     ├─ Penetrate
  ↓            │
Energy loss    └─ Stop
  ↓
Projectile continues
```

TerrainDamage остаётся отдельной semantic системой.

---

# 86. Архитектурная цель

После Step 4 ballistic foundation должен поддерживать:

```text
direct impact
crater
penetration
partial penetration
multiple terrain materials
energy loss
surface normals
impact angles
ricochet
multiple ricochets
```

без зависимости simulation от React/Pixi.

---

# 87. Что будет Step 5

Не реализовывать это сейчас.

Следующим естественным этапом должен стать первый полноценный игровой объект:

```text
Unit
```

с:

```text
position
movement
hitbox
health
damage
weapon
team
```

Первый vertical slice:

```text
movable combat unit
        vs
stationary / movable target
```

Projectile pipeline тогда расширяется:

```text
Projectile
   ↓
Collision
   ↓
Terrain OR Unit
```

а ImpactResolver начинает создавать:

```text
TerrainDamageEvent

или

EntityDamageEvent
```

Step 4 должен оставить для этого extension point, но не реализовывать Unit сейчас.

---

# 88. Финальный отчёт Codex

После выполнения задачи показать:

1. какие существующие файлы изменены;
2. какие новые файлы появились;
3. как вычисляется surface normal;
4. какой impact-angle convention используется;
5. как устроен RicochetResolver;
6. порядок `ricochet → penetration → stop`;
7. формулу reflection;
8. формулу energy retention;
9. как предотвращается повторный collision;
10. параметры ricochet для Basic Cannon;
11. параметры ricochet для Mortar;
12. параметры ricochet для Heavy Penetrator;
13. какие tests добавлены;
14. результаты typecheck/lint/test/build;
15. известные ограничения модели;
16. какие extension points готовы для Step 5.

После завершения Step 4 остановиться.

Не реализовывать Unit / Health / EntityDamage самостоятельно.
