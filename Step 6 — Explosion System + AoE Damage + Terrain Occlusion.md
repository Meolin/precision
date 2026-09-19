# Step 6 — Explosion System + AoE Damage + Terrain Occlusion

## 0. Контекст

Проект находится после Step 5.

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
- ricochet;
- UnitState;
- HealthState;
- projectile ↔ entity swept collision;
- EntityImpactEvent;
- EntityDamageEvent;
- DamageResolver;
- HealthSystem;
- death;
- movement;
- target dummy / combat entities;
- damage number popups;
- debug HUD / telemetry;
- regression tests.

Step 5 является рабочим baseline.

Главное правило Step 6:

> Добавить Explosion System как новый слой поверх существующих ImpactEvent, EntityDamageEvent и TerrainDamageEvent. Не переписывать direct-hit damage pipeline.

На этом этапе НЕ добавлять knockback.

---

# 1. Главная цель

После Step 6 explosive projectile должен создавать:

```text id="g7jcfd"
Projectile
   ↓
Impact
   ↓
ExplosionEvent
   ↓
┌──────────────────────┬───────────────────────┐
│                      │                       │
↓                      ↓                       │
TerrainDamage       AreaQuery                  │
                       ↓
                 Damage Falloff
                       ↓
                 Terrain Occlusion
                       ↓
                EntityDamageEvent[]
                       ↓
                    Health
                       ↓
                Damage Popups
```

При этом direct hit должен продолжать работать отдельно.

---

# 2. Архитектурный принцип

Сохранить два независимых пути:

```text id="ar9x1v"
Projectile → EntityImpactEvent → Direct Damage
```

и:

```text id="dppmk9"
Projectile Impact → ExplosionEvent → AoE Damage
```

Не смешивать их в одну damage function.

---

# 3. Перед началом

Создать baseline commit.

Например:

```bash id="m4lfpj"
git add .
git commit -m "baseline: combat entities and movement"
```

Опционально:

```bash id="em7eec"
git tag combat-entities-v1
```

Проверить:

```bash id="xyl7ot"
npm run typecheck
npm run lint
npm run test
npm run build
```

Все существующие проверки должны проходить.

---

# 4. ExplosionDefinition

Добавить data-driven definition.

Пример:

```ts id="j2v1ay"
export interface ExplosionDefinition {
  radiusMeters: number;

  innerRadiusMeters: number;

  maxDamage: number;

  minDamage: number;

  terrainDamageRadiusMeters: number;

  terrainOcclusionEnabled: boolean;

  occludedDamageMultiplier: number;
}
```

Не добавлять knockback.

---

# 5. Где хранить ExplosionDefinition

Предпочтительно связать explosion с `ImpactDefinition`.

Например:

```ts id="j4iqhp"
export interface ImpactDefinition {
  ...

  explosion?: ExplosionDefinition;
}
```

Таким образом projectile может быть:

```text id="r62a09"
non-explosive
```

или:

```text id="b1fjlu"
explosive
```

без special-case по weapon ID.

---

# 6. ExplosionEvent

Создать отдельное semantic event.

Например:

```ts id="wh5p90"
export interface ExplosionEvent {
  type: 'explosion';

  tick: number;

  sourceEntityId?: EntityId;

  sourceProjectileId?: EntityId;

  position: Vec2;

  radiusMeters: number;

  innerRadiusMeters: number;

  maxDamage: number;

  minDamage: number;

  terrainDamageRadiusMeters: number;

  terrainOcclusionEnabled: boolean;

  occludedDamageMultiplier: number;
}
```

Допускается хранить только IDs и резолвить definition отдельно, если текущая event architecture так устроена.

Главное:

- event serializable;
- без Pixi/React объектов;
- без функций.

---

# 7. Explosion lifecycle

Explosion является transient event.

Не создавать:

```text id="hi6ogv"
ExplosionState[]
```

если explosion не живёт во времени.

Flow:

```text id="7r6ehy"
Impact
 ↓
create ExplosionEvent
 ↓
resolve ExplosionEvent
 ↓
event consumed
```

---

# 8. Direct Hit остаётся

Если projectile попадает прямо в Unit:

```text id="3an75f"
Projectile
 ↓
EntityImpactEvent
 ↓
Direct Damage
```

Если projectile explosive:

```text id="e82j6a"
EntityImpactEvent
 ↓
Direct Damage
+
ExplosionEvent
```

Это допустимо.

---

# 9. Terrain hit

Если explosive projectile попадает в terrain:

```text id="f8hf1f"
TerrainImpact
 ↓
ExplosionEvent
```

и:

```text id="i2znuq"
ExplosionEvent
 ↓
TerrainDamageEvent
```

---

# 10. Не делать special-case Mortar

Не писать:

```ts id="zw04ir"
if (weaponId === 'mortar') {
  explode();
}
```

Правильно:

```text id="sspg1d"
ImpactDefinition.explosion
```

определяет explosive behavior.

---

# 11. AreaQuery

Добавить отдельную pure/query функцию.

Например:

```ts id="u0zzxn"
queryEntitiesInRadius(
  center: Vec2,
  radius: number,
  entities: readonly UnitState[]
): AreaQueryResult[];
```

---

# 12. AreaQueryResult

Пример:

```ts id="90jqjg"
export interface AreaQueryResult {
  entityId: EntityId;

  distanceMeters: number;

  closestPoint?: Vec2;
}
```

Для Step 6 можно считать distance до центра entity.

Если легко — учитывать hitbox radius.

---

# 13. Не оптимизировать spatial queries

Пока допустим:

```text id="s026cn"
O(number of units)
```

простой loop по units.

Не добавлять:

```text id="ia5fsv"
quadtree
spatial hash
BVH
```

на этом этапе.

Но держать `queryEntitiesInRadius()` отдельной функцией, чтобы потом заменить реализацию.

---

# 14. Hitbox-aware radius query

Предпочтительно учитывать размер Unit.

Если:

```text id="04yx15"
distance(center, unit.position)
```

немного больше explosion radius, но hitbox входит в explosion radius, Unit должен считаться затронутым.

Для CircleHitbox:

```ts id="r21f96"
effectiveDistance = max(0, centerDistance - hitbox.radiusMeters);
```

Использовать это значение для AoE falloff.

---

# 15. Damage Falloff

Реализовать отдельную pure function.

Например:

```ts id="kduqv2"
calculateExplosionDamage(
  distanceMeters,
  definition
): number
```

---

# 16. Damage model

Использовать:

```text id="j4bnv7"
0 → innerRadius
    maxDamage

innerRadius → radius
    linear falloff

>= radius
    0 damage
```

---

# 17. Формула falloff

Например:

```ts id="h0qv6l"
if (distance <= innerRadius) {
  return maxDamage;
}

if (distance >= radius) {
  return 0;
}

const t = (distance - innerRadius) / (radius - innerRadius);

return lerp(maxDamage, minDamage, t);
```

---

# 18. Numerical safety

Обработать случай:

```text id="5lnprs"
innerRadius >= radius
```

Конфиг должен быть валидирован.

Например:

```text id="8eoxok"
0 <= innerRadius <= radius
```

---

# 19. Falloff должен быть deterministic

Не добавлять random damage variation.

Одинаковое положение → одинаковый damage.

Это важно для:

- debugging;
- replays;
- networking.

---

# 20. EntityDamageEvent reuse

Explosion System не должен напрямую менять Health.

Для каждой цели создать:

```text id="p11jhj"
EntityDamageEvent
```

через уже существующий pipeline.

---

# 21. Explosion damage source

`EntityDamageEvent` желательно расширить source context только если это полезно.

Например:

```ts id="fh9vpv"
damageKind?: 'direct' | 'explosion';
```

или:

```ts id="7ahvni"
sourceEventType?: 'entityImpact' | 'explosion';
```

Но не ломать существующий popup layer.

---

# 22. Damage popups

Existing damage number popups должны продолжать работать.

Explosion System НЕ должен делать:

```ts id="tl6pxx"
spawnDamagePopup(...)
```

Правильно:

```text id="lrm4gj"
ExplosionEvent
 ↓
EntityDamageEvent
 ↓
existing feedback pipeline
 ↓
damage popup
```

---

# 23. Multiple damage popups

Если explosion задевает несколько Units:

```text id="kh831o"
Unit A  -42
Unit B  -25
Unit C   -8
```

каждый должен получить собственный `EntityDamageEvent`.

---

# 24. Terrain Damage

Explosion должен использовать существующую terrain-damage architecture.

Пример:

```text id="g2o0e0"
ExplosionEvent
 ↓
CircleTerrainDamage
 ↓
TerrainDamageEvent
 ↓
TerrainGrid
```

Не делать terrain mutation прямо в ExplosionResolver.

---

# 25. Separate terrain and entity radius

Обязательно разделить:

```text id="qhmm9x"
explosion.radiusMeters
```

и:

```text id="dp9npf"
explosion.terrainDamageRadiusMeters
```

Например:

```text id="8pyuxm"
damage radius = 6m
crater radius = 2.5m
```

---

# 26. Existing crater formulas

Если текущий impact/crater pipeline использует kinetic energy:

не обязательно его удалять.

Для explosive projectile можно выбрать одно из двух:

### вариант A

Explosion полностью определяет crater.

### вариант B

direct impact crater +
explosion terrain damage

Не допускать случайного двойного огромного crater.

Выбрать единое понятное поведение и покрыть тестом.

Предпочтительно:

> explosive projectile terrain deformation определяется ExplosionDefinition.

---

# 27. Terrain Occlusion

Explosion damage не должен беспрепятственно проходить через толстый terrain.

Добавить:

```ts id="yl8p2s"
isBlastPathOccluded(explosionPosition, targetPosition, terrain);
```

---

# 28. Минимальная модель occlusion

Использовать segment sampling через TerrainGrid.

Пример:

```text id="d5j9vi"
Explosion ● ----------- Unit
             terrain?
```

Если segment между explosion и target пересекает solid terrain:

```text id="bqh44n"
occluded = true
```

---

# 29. Segment target point

Для первой реализации можно raycast к:

```text id="ri4hbp"
unit.position
```

Если это даёт странное поведение возле поверхности, можно позже использовать closest point hitbox.

Не переусложнять сейчас.

---

# 30. Sampling

Использовать step:

```text id="0bsffm"
<= terrain.cellSize / 2
```

или существующий terrain traversal helper.

Если в проекте уже есть reusable segment traversal из penetration/collision — использовать его.

Не дублировать алгоритм без причины.

---

# 31. Не считать start cell

Explosion часто возникает внутри/на краю crater/terrain.

Occlusion ray не должен сразу считать:

```text id="6piwsp"
explosion's own impact cell
```

полной преградой.

Начинать sampling после небольшого epsilon от explosion center.

---

# 32. Occluded Damage

Для первой версии:

```ts id="g7vhgs"
finalDamage = rawDamage * occludedDamageMultiplier;
```

Например:

```text id="9t4fw9"
clear path:
1.0

blocked:
0.2
```

---

# 33. Configurable Occlusion

`ExplosionDefinition` содержит:

```ts id="pkd8y9"
terrainOcclusionEnabled: boolean;
occludedDamageMultiplier: number;
```

Это позволит быстро сравнить gameplay.

---

# 34. Не делать binary 0 damage обязательно

По умолчанию лучше использовать уменьшение, а не полный ноль.

Например:

```text id="lr7ex7"
20–30%
```

Потому что explosion behind a small terrain edge может иначе ощущаться слишком бинарно.

Но точное число оставить как tuning.

---

# 35. Debug occlusion

Добавить debug toggle:

```text id="bvdn5v"
Show Explosion Occlusion
```

Для каждой candidate entity можно показать:

```text id="8xu9qp"
green-ish conceptual line:
clear

blocked conceptual line:
occluded
```

Конкретный цвет выбирать renderer может сам.

Не хранить graphics в simulation.

---

# 36. ExplosionResolver

Создать отдельную систему:

```ts id="3sj0oe"
resolveExplosion(...)
```

Она должна:

1. получить ExplosionEvent;
2. найти entities в radius;
3. вычислить raw damage;
4. проверить occlusion;
5. применить multiplier;
6. создать EntityDamageEvent[];
7. создать TerrainDamageEvent;
8. вернуть semantic result/events.

---

# 37. ExplosionResolver не применяет Health напрямую

Не делать:

```ts id="e9sx1o"
unit.health.current -= ...
```

в ExplosionResolver.

Использовать существующий HealthSystem.

---

# 38. ExplosionResolution result

Полезно вернуть transient debug result.

Например:

```ts id="2jpfnl"
export interface ExplosionResolution {
  position: Vec2;

  affectedEntities: ExplosionEntityResult[];

  terrainDamageEvent?: TerrainDamageEvent;
}
```

---

# 39. ExplosionEntityResult

Например:

```ts id="mn71om"
export interface ExplosionEntityResult {
  entityId: EntityId;

  distanceMeters: number;

  rawDamage: number;

  occluded: boolean;

  finalDamage: number;
}
```

Это удобно для:

- telemetry;
- tests;
- debug rendering.

Не хранить навсегда в GameState.

---

# 40. Explosion event ordering

Важно определить порядок.

Для одного impact:

```text id="nlewcq"
1. Direct impact damage
2. Explosion damage
3. Terrain damage
```

или другой фиксированный порядок.

Рекомендуется:

```text id="u00yw5"
Impact detected
 ↓
Direct damage event
 ↓
ExplosionEvent
 ↓
AoE damage events
 ↓
Terrain damage
```

Главное — deterministic порядок.

---

# 41. Direct + AoE stacking

Если projectile напрямую попал в Unit:

Target может получить:

```text id="8r3hoz"
direct damage
+
explosion damage
```

Это нормально.

Но это должно быть явно задокументировано и протестировано.

---

# 42. Dead target during same impact

Если direct hit уже убил target:

решить, должен ли ExplosionResolver ещё обрабатывать target.

Рекомендованный вариант:

> Explosion query может видеть entity, но HealthSystem не должен повторно создавать бессмысленный death transition.

Допускается пропустить уже dead entities.

---

# 43. Weapon roles

После Step 6 настроить:

## Basic Cannon

```text id="id6d7v"
direct damage: high
explosion: none or very small
terrain damage: medium
```

## Mortar

```text id="klyw6e"
direct damage: low/moderate
explosion radius: large
AoE damage: high
terrain damage: large
occlusion: enabled
```

## Heavy Penetrator

```text id="hf2llx"
direct damage: very high
explosion: none
terrain penetration: high
```

---

# 44. Не добавлять новые weapons

Не создавать grenade / rocket / mine сейчас.

Существующих трёх weapons достаточно для проверки architecture.

---

# 45. Mortar ExplosionDefinition

Mortar должен стать главным proof-of-concept explosive weapon.

Примерно:

```text id="svpyvl"
radiusMeters
large

innerRadiusMeters
small/medium

maxDamage
high

minDamage
low

terrainDamageRadius
medium/high

occlusion enabled
true
```

Конкретный баланс подобрать вручную.

---

# 46. Technical Panel

Добавить секцию:

```text id="l4qofm"
EXPLOSION

Enabled
true

Radius
6.0 m

Inner Radius
1.5 m

Max Damage
60

Min Damage
5

Terrain Radius
2.8 m

Terrain Occlusion
true

Occluded Multiplier
0.25
```

---

# 47. Runtime overrides

Сохранить текущую модель debug overrides.

Изменение explosion settings должно влиять:

```text id="uh0wmu"
на следующие impacts
```

а не обязательно переписывать уже созданные events.

---

# 48. Explosion telemetry

После explosion показывать:

```text id="y523op"
LAST EXPLOSION

Position
x: ...
y: ...

Radius
6.0 m

Entities in radius
3

Entities damaged
3

Occluded
1

Max dealt
54

Terrain radius
2.8 m
```

---

# 49. Per-entity debug telemetry

Опционально:

```text id="k1ppg9"
Unit #2

Distance
1.4 m

Raw Damage
60

Occluded
false

Final Damage
60
```

---

# 50. Explosion debug visualization

Добавить toggle:

```text id="28q2n2"
Show Explosion Radius
```

Показывать:

```text id="mxfpvn"
inner radius
outer radius
```

на короткое время или для последнего explosion.

---

# 51. Не делать VFX частью simulation

Animation explosion может быть реализована renderer-side.

Simulation создаёт semantic explosion event.

Rendering показывает:

```text id="7tcux5"
flash
circle
particles
```

если уже есть простой feedback layer.

Не блокировать Step 6 из-за красивых VFX.

---

# 52. Damage popup integration

Проверить существующую систему damage labels.

Она должна работать при AoE без special-case.

Если popup сейчас создаётся непосредственно из direct hit logic — рефакторить его на:

```text id="6u2yfz"
EntityDamageEvent
```

или на существующий универсальный combat feedback event.

---

# 53. Popup aggregation

Не объединять AoE damage автоматически.

Если три Unit получили damage:

```text id="nk4cp8"
создать три отдельных popup
```

Если один Unit получил direct + explosion damage:

допускаются:

```text id="uxan7t"
два popup
```

или existing feedback layer может агрегировать события одного tick.

Не усложнять simulation ради UI aggregation.

---

# 54. Tests — Area Query

Проверить:

```text id="pa1ouq"
inside radius → included
outside radius → excluded
```

---

# 55. Tests — Hitbox radius

Unit, чей center находится немного за radius, но hitbox входит в blast radius, должен корректно учитываться, если реализована hitbox-aware query.

---

# 56. Tests — Full Damage Zone

Entity внутри:

```text id="e2nlrc"
innerRadius
```

получает:

```text id="7xuqx0"
maxDamage
```

---

# 57. Tests — Falloff

Проверить:

```text id="v25x14"
damage near center
>
damage halfway
>
damage near outer radius
```

---

# 58. Tests — Outer Radius

Entity на расстоянии:

```text id="b1u6rg"
>= radius
```

не получает damage.

---

# 59. Tests — Min Damage

При position около внешней границы damage не должен становиться отрицательным или ниже ожидаемого configured minimum внутри active radius.

---

# 60. Tests — Multiple Entities

Explosion должен создавать несколько:

```text id="pbp1yq"
EntityDamageEvent
```

для нескольких entities.

---

# 61. Tests — Clear Occlusion

Без terrain между explosion и Unit:

```text id="uk1as1"
occluded = false
damage unchanged
```

---

# 62. Tests — Terrain Occlusion

При solid terrain между:

```text id="0vmd7q"
explosion
unit
```

должно быть:

```text id="6ddh8b"
occluded = true
```

---

# 63. Tests — Occluded multiplier

Например:

```text id="rkg92c"
rawDamage = 40
multiplier = 0.25
```

ожидается:

```text id="41yf2n"
finalDamage = 10
```

---

# 64. Tests — Occlusion disabled

При:

```text id="7m3n0v"
terrainOcclusionEnabled = false
```

terrain между explosion и entity не уменьшает damage.

---

# 65. Tests — Terrain damage

Explosion должен создать корректный:

```text id="38yv5i"
CircleTerrainDamage
```

с `terrainDamageRadiusMeters`.

---

# 66. Tests — Separate radii

Проверить, что:

```text id="i6nr3n"
entity damage radius
```

и:

```text id="ofjvo6"
terrain damage radius
```

работают независимо.

---

# 67. Tests — Direct + Explosion

При direct hit explosive projectile:

```text id="vyqpa2"
direct damage
+
AoE damage
```

оба события должны примениться в deterministic порядке.

---

# 68. Tests — Non-explosive weapon regression

Basic Cannon / Heavy Penetrator без explosion definition не должны создавать ExplosionEvent.

---

# 69. Tests — Mortar

Mortar impact должен создавать ExplosionEvent.

---

# 70. Tests — Damage popup regression

Если popup logic тестируема:

проверить, что AoE damage идёт через тот же feedback path, что и direct damage.

Не тестировать визуальный CSS/animation без необходимости.

---

# 71. Tests — Dead units

Dead unit не должен получать повторный meaningful damage event, если текущая HealthSystem уже исключает dead units.

---

# 72. Tests — Determinism

Одинаковое:

```text id="1gyfav"
explosion position
entity positions
terrain
definition
```

должно давать одинаковые:

```text id="gf93zi"
damage
occlusion
terrain damage
```

---

# 73. Recommended Implementation Phases

## Phase A — Baseline

Проверить:

```text id="tzupx0"
typecheck
lint
tests
build
```

---

## Phase B — ExplosionDefinition

Добавить data definitions.

Никаких gameplay changes.

---

## Phase C — ExplosionEvent

Добавить semantic event и wiring из ImpactDefinition.

Пока не наносить AoE damage.

---

## Phase D — AreaQuery

Реализовать и покрыть unit tests.

---

## Phase E — Damage Falloff

Реализовать pure:

```text id="lupv6h"
calculateExplosionDamage()
```

и tests.

---

## Phase F — Entity AoE Damage

ExplosionEvent создаёт:

```text id="ymziwj"
EntityDamageEvent[]
```

через существующий damage pipeline.

---

## Phase G — Damage Popup Verification

Проверить, что существующий popup layer автоматически работает для explosion damage.

Если нет — перевести feedback layer на общий damage event.

---

## Phase H — Terrain Damage

ExplosionEvent создаёт semantic terrain damage operation.

---

## Phase I — Occlusion Query

Добавить:

```text id="e7aypw"
isBlastPathOccluded()
```

и tests.

---

## Phase J — Occlusion Integration

Применить:

```text id="m0cszp"
occludedDamageMultiplier
```

к AoE damage.

---

## Phase K — Mortar Tuning

Подключить ExplosionDefinition к Mortar.

---

## Phase L — Debug UI

Добавить:

```text id="x3nccx"
radius
inner radius
occlusion
affected entities
damage
```

---

## Phase M — Final Validation

Запустить:

```bash id="u9e02z"
npm run typecheck
npm run lint
npm run test
npm run build
```

---

# 74. Performance Rules

Не оптимизировать преждевременно.

Допустимо:

```text id="ps4umg"
loop through all active units
```

на каждый explosion.

Но:

- не deep clone GameState;
- не копировать TerrainGrid;
- не создавать texture/query data в simulation;
- переиспользовать существующие terrain traversal helpers.

---

# 75. Не создавать Generic Effect System

Не нужны:

```text id="u6b0iu"
EffectManager
AoEStrategyFactory
DamagePipelineContainer
ExplosionServiceLocator
```

Использовать:

```text id="pdb7ec"
definitions
events
pure functions
small systems
```

---

# 76. Network readiness

ExplosionEvent и resulting damage events должны быть serializable.

В будущем authoritative server должен иметь возможность вычислить:

```text id="v2igys"
Impact
 ↓
Explosion
 ↓
AoE damage
```

без client renderer.

---

# 77. Replay readiness

Explosion должен полностью определяться:

```text id="rhv742"
impact
definition
entity state
terrain state
tick
```

Не использовать randomness.

---

# 78. Event ordering

Зафиксировать deterministic processing order.

Рекомендуемый simulation tick order:

```text id="05tbaa"
projectile collision
      ↓
direct impact events
      ↓
explosion events
      ↓
entity damage events
      ↓
health
      ↓
terrain damage events
      ↓
cleanup
```

Если текущая architecture использует другой порядок — адаптировать, но документировать.

---

# 79. Не добавлять knockback

На Step 6 запрещено добавлять:

```text id="06zzal"
ImpulseEvent
force
velocity to units
horizontal displacement
vertical displacement
blast movement
ragdoll
```

Explosion влияет только на:

```text id="zymfhb"
Health
Terrain
Visual feedback
```

---

# 80. Не добавлять fragmentation

Не создавать:

```text id="w03prf"
shrapnel projectiles
fragments
secondary rays
```

AoE damage пока абстрактное.

---

# 81. Не добавлять status effects

Не нужны:

```text id="ngzpvj"
burning
stun
slow
bleeding
EMP
```

---

# 82. Не добавлять armor/shields

AoE damage пока идёт напрямую в существующий damage/health layer.

Armor будет отдельным будущим шагом.

---

# 83. Не добавлять Buildings

Step 6 работает только с существующими combat entities.

---

# 84. Не добавлять RTS controls

Не реализовывать:

```text id="qog05d"
multi-selection
box selection
control groups
formation orders
```

Это следующий отдельный слой.

---

# 85. Definition of Done

Step 6 считается завершённым, если:

1. Existing Step 5 behavior не сломан.

2. Существует `ExplosionDefinition`.

3. Explosion подключается через data-driven ImpactDefinition.

4. Существует `ExplosionEvent`.

5. Non-explosive weapons не создают ExplosionEvent.

6. Mortar создаёт ExplosionEvent.

7. Explosion является transient event, а не permanent entity.

8. Существует `queryEntitiesInRadius()`.

9. Query учитывает только active/alive Units.

10. Реализован inner radius.

11. В inner radius наносится max damage.

12. Реализован damage falloff.

13. За outer radius damage отсутствует.

14. Explosion создаёт `EntityDamageEvent[]`.

15. Explosion не изменяет Health напрямую.

16. Existing HealthSystem применяет AoE damage.

17. Damage popups работают для explosion damage.

18. Несколько Units получают отдельные damage events.

19. Direct hit и explosion могут stack-иться.

20. Terrain damage создаётся через существующий semantic terrain pipeline.

21. Terrain damage radius отделён от entity damage radius.

22. Реализован terrain occlusion query.

23. Clear path не уменьшает damage.

24. Blocked path уменьшает damage.

25. `occludedDamageMultiplier` работает.

26. Occlusion можно отключить через definition/debug config.

27. Explosion debug visualization показывает radius.

28. Debug UI показывает affected entities.

29. Debug UI показывает occluded targets.

30. Debug UI показывает calculated damage.

31. Basic Cannon сохраняет существующее поведение.

32. Heavy Penetrator сохраняет существующее поведение.

33. Mortar становится основным AoE weapon.

34. Step 1–5 regression tests проходят.

35. Добавлены Explosion tests.

36. Typecheck проходит.

37. Lint проходит.

38. Все tests проходят.

39. Production build проходит.

40. Knockback отсутствует.

---

# 86. Итоговая архитектура

После Step 6:

```text id="0x2er1"
Projectile
     ↓
Collision
     ↓
Impact
     ↓
ImpactDefinition
     ↓
┌────────────────────┬────────────────────┐
│                    │                    │
↓                    ↓                    │
Direct Impact     ExplosionEvent          │
│                    │
↓                    ├───────────────┐
EntityDamageEvent    ↓               ↓
│                 AreaQuery     TerrainDamage
↓                    │               │
Health               ↓               ↓
                 Falloff         TerrainGrid
                     ↓
                  Occlusion
                     ↓
              EntityDamageEvent[]
                     ↓
                   Health
                     ↓
               Damage Popups
```

---

# 87. Архитектурная цель

После Step 6 должны существовать три заметно разные weapon roles:

```text id="1mppn8"
Basic Cannon
→ direct kinetic combat

Heavy Penetrator
→ terrain penetration + high direct damage

Mortar
→ indirect fire + AoE + terrain destruction
```

Это первый момент, когда weapon system должен ощущаться не просто набором разных чисел, а набором разных тактических ролей.

---

# 88. Следующий шаг

Не реализовывать сейчас.

Рекомендуемый Step 7:

```text id="p03emk"
RTS Control Layer
```

с:

```text id="l8shnp"
multiple units
selection
box selection
right-click orders
multiple selected units
control groups
basic command queue
```

Цель Step 7:

> перейти от управления одним combat unit к управлению небольшой группой.

---

# 89. Финальный отчёт Codex

После выполнения показать:

1. какие существующие файлы изменены;
2. какие новые файлы добавлены;
3. структуру ExplosionDefinition;
4. структуру ExplosionEvent;
5. как ExplosionEvent создаётся из impact;
6. как работает AreaQuery;
7. формулу damage falloff;
8. как учитывается hitbox;
9. как работает terrain occlusion;
10. как применяется occluded multiplier;
11. как создаются EntityDamageEvent;
12. как damage popup system переиспользуется;
13. как explosion создаёт TerrainDamageEvent;
14. настройки Mortar;
15. поведение Basic Cannon;
16. поведение Heavy Penetrator;
17. какие tests добавлены;
18. результаты typecheck/lint/test/build;
19. известные ограничения explosion model;
20. какие extension points готовы для Step 7.

После завершения Step 6 остановиться.

Не реализовывать knockback, fragmentation, armor, buildings, multi-selection или networking самостоятельно.
