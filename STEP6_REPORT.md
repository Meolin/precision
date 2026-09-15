# Step 6 — Explosion System, AoE и укрытия

## Результат и статус проверок

Добавлен отдельный путь взрывного урона поверх существующих событий попадания,
урона сущностям и разрушения рельефа. Mortar детонирует при первом контакте,
поражает цели в радиусе и создаёт один кратер. Basic Cannon и Heavy Penetrator
по умолчанию остаются невзрывными.

Исходное рабочее дерево Step 5 сохранено в baseline-коммите **`0db4e17`**
с сообщением `baseline: combat entities and movement`.

| Проверка                                | Результат                                                        |
| --------------------------------------- | ---------------------------------------------------------------- |
| Typecheck приложения и pure simulation  | Прошёл                                                           |
| ESLint                                  | Прошёл                                                           |
| Production build                        | Прошёл                                                           |
| Unit/integration/regression tests       | Добавлены/сохранены, **не запускались по указанию пользователя** |
| Браузер, скриншоты, визуальные проверки | **Не запускались по указанию пользователя**                      |

Vite выдаёт прежнее предупреждение о JS chunk больше 500 kB. Это не ошибка сборки.
Баланс задан численно; ручная игровая проверка и подтверждение прохождения тестов отсутствуют.

## Definitions и события

`ImpactDefinition` расширен необязательным `explosion?: ExplosionDefinition`.
Наличие профиля определяет взрывное поведение, без сравнения weapon ID.

```ts
interface ExplosionDefinition {
  readonly radiusMeters: number;
  readonly innerRadiusMeters: number;
  readonly maxDamage: number;
  readonly minDamage: number;
  readonly terrainDamageRadiusMeters: number;
  readonly terrainOcclusionEnabled: boolean;
  readonly occludedDamageMultiplier: number;
}

interface ExplosionEvent extends ExplosionDefinition {
  type: 'explosion';
  tick: number;
  sourceEntityId?: EntityId;
  sourceProjectileId: EntityId;
  position: Vec2;
}
```

На этом шаге каждый взрыв происходит от снаряда, поэтому `sourceProjectileId` обязателен,
как и в существующем `TerrainDamageEvent`. Событие содержит копию позиции и значений
профиля на момент контакта. React, Pixi, функции и ссылки на сущности отсутствуют.

`weaponOverrides[id].explosion` содержит partial-настройки и необязательный `enabled`.
Можно выключать Mortar или включать взрывы для другого оружия через инспектор.
Настройки сохраняются при смене оружия и сбросе сцены; сброс настроек удаляет overrides.
Они применяются к следующим контактам, включая уже летящие снаряды, по исходному оружию
снаряда, независимо от текущего выбора. Созданные события больше не перенастраиваются.

Валидация ограничивает `0 <= innerRadius <= radius`, `0 <= minDamage <= maxDamage`
и множитель укрытия диапазоном `[0, 1]`. Верхние границы debug-настроек: AoE 60 m,
кратер 20 m, урон 1000 HP. Нечисловые overrides отбрасываются. Нулевой радиус
поражения разрешён; он выключает AoE, сохраняя независимое разрушение terrain.

## Жизненный цикл и порядок

При попадании по юниту:

1. `EntityImpactEvent`.
2. Прежний `resolveEntityDamage` → `EntityDamageEvent` → `applyEntityDamage`.
3. Если определён взрыв: `createExplosionEvent` → `ExplosionEvent`.
4. `resolveExplosion` читает оставшихся живых юнитов и ещё не разрушенный рельеф.
5. Его `EntityDamageEvent[]` применяются существующей функцией Health.
6. Его единственный `TerrainDamageEvent`, если радиус кратера положительный, применяется к grid.
7. `explosionResolved` содержит результаты расчёта и применения для телеметрии.
8. Снаряд останавливается и удаляется при очистке текущего тика.

При попадании в рельеф шаги 1–2 заменяются `ImpactEvent` и `impactResolved`.
Взрывной профиль заставляет `resolveImpact` вернуть `stop` без кинетического кратера,
скола или начала пробития. Взрыв создаётся координатором тика и проходит шаги 3–8.
Срабатывает ровно один контактный взрыв. Время жизни/выход за границы сами по себе
не детонируют снаряд. Прогноз использует тот же impact resolver и заканчивается на контакте.

Direct + AoE складываются. Если прямой удар уже убил цель, radius query пропускает её;
соседние цели продолжают получать AoE. Порядок снарядов и целей соответствует порядку
массивов. Более поздний снаряд того же тика видит уже изменённые HP и рельеф.
Переразмещение юнитов по поверхности выполняется прежней системой grounding в конце тика.

`ExplosionEvent` и `explosionResolved` очищаются вместе с `state.events` на следующем тике.
Отдельного `ExplosionState[]` нет. `GameRuntime` удерживает только последнее разрешённое
событие для UI/debug; в GameState и snapshots оно не сохраняется. Reset очищает его.

## Area query, hitbox и falloff

`queryEntitiesInRadius` — отдельная чистая функция с линейным обходом юнитов.
Она исключает `alive=false` и HP <= 0, учитывает offset кругового хитбокса и возвращает
ID, расстояние до его края, центр хитбокса и ближайшую точку.

```text
d = max(0, distance(explosionPosition, hitboxCenter) - hitboxRadius)

d >= radius                  → 0
d <= innerRadius             → maxDamage
иначе:
  t = (d - innerRadius) / (radius - innerRadius)
  damage = maxDamage + (minDamage - maxDamage) * t
```

Круг, заходящий в зону только краем, также поражается. Ровно на внешнем крае он
остаётся кандидатом query, но не получает damage event. Проверка внешней границы
выполняется первой: при `innerRadius == radius` нет деления на ноль; внутри — полный
урон, на границе — ноль. Случайных поправок и округления игрового урона нет.

## Укрытия и кратер

`isBlastPathOccluded` проверяет отрезок от взрыва до центра хитбокса цели.
Общий `sampleTerrainSegment` извлечён из terrain swept collision: шаг не больше
половины ячейки, конечная точка включена. Точность и порядок исходного swept sampling
сохранены; бинарное уточнение projectile contact осталось в `sweepTerrain`.

Пропускаются стартовая epsilon-область и вся исходная ячейка взрыва. Любая следующая
solid-ячейка закрывает путь. Включённое укрытие даёт:

```text
finalDamage = rawDamage * occludedDamageMultiplier
```

При открытом пути или выключенном occlusion урон равен rawDamage. Значение множителя 0
полностью блокирует урон, 1 — сохраняет его. Проверка проходит до разрушения кратера,
поэтому взрыв не удаляет собственное укрытие перед расчётом урона.

Выбран вариант A из инструкции: деформация от explosive impact определяется только
`terrainDamageRadiusMeters`. Resolver возвращает circle operation через существующий
`TerrainDamageEvent`; `applyTerrainDamage` выполняет мутацию отдельно. Сетка не копируется.
Кинетическая энергия AoE/его terrain event равна 0: взрыв не выводится из кинетической
энергии. Radius полностью определяет circle operation, энергия остаётся контекстным полем.

## Health, карточки и debug

`EntityDamageEvent` получил необязательные `damageKind`, `position`, `velocity`.
Прямой resolver сохраняет свои расчёты и добавляет контактный контекст. Взрывной resolver
генерирует тот же тип события с `damageKind: 'explosion'`, собственной целью и уроном.
Он никогда не меняет Health или terrain напрямую.

Runtime создаёт карточки из damage events, без поиска соответствующего прямого попадания.
Прямые карточки сохраняют скорость и энергию снаряда, в том числе поддержку нулевого
прямого урона. Взрывные карточки стартуют в зафиксированном центре каждой цели и движутся
вверх через тот же presentation helper. Renderer карточек не менялся. Direct + AoE
показываются двумя карточками; события разных целей не агрегируются.

«Последний взрыв» показывает позицию, радиус, кандидатов, реально повреждённых юнитов,
цели за укрытием, максимальную фактическую потерю HP и удалённые ячейки. Для каждой цели
доступны расстояние, raw damage, occlusion и final damage до ограничения оставшимися HP.

Переключатели показывают последний взрыв: внешний оранжевый круг, внутренний светло-зелёный,
серый радиус кратера. Линии к прежним позициям целей зелёные для открытого пути и розовые
для укрытия. В simulation нет графических объектов, анимаций или частиц.

## Роли оружия

| Настройка                      | Basic Cannon           | Mortar                  | Heavy Penetrator           |
| ------------------------------ | ---------------------- | ----------------------- | -------------------------- |
| Прямой урон                    | clamp(E × 0.01, 1, 60) | clamp(E × 0.006, 1, 25) | clamp(E × 0.01, 1, 90)     |
| Взрыв по умолчанию             | Нет                    | Есть                    | Нет                        |
| AoE / inner radius             | —                      | 6 / 1.5 m               | —                          |
| Максимальный / минимальный AoE | —                      | 60 / 5 HP               | —                          |
| Радиус кратера                 | Прежний кинетический   | 2.8 m                   | Прежний кратер и канал     |
| Укрытие                        | —                      | Включено, ×0.25         | —                          |
| Рикошет / пробитие             | Прежний рикошет        | Детонация при контакте  | Прежний рикошет и пробитие |

Mortar получил меньший прямой урон и основной урон по площади. Новых weapons нет.

## Добавленные тестовые сценарии — без запуска

- `collision/areaQuery.test.ts`: попадание внутрь/наружу, пересечение краем, offset,
  стабильный порядок, мёртвые цели, нулевая/невалидная область.
- `explosions/explosions.test.ts`: полный урон, линейное уменьшение, minimum/граница,
  равные радиусы, валидация и независимость overrides/events, Soil/Rock, пропуск стартовой
  ячейки, соседняя преграда, короткий/диагональный отрезок, occlusion toggle/multiplier,
  несколько целей, чистота resolver, сериализация, детерминизм, независимые радиусы,
  replay terrain operation и отсутствие нулевых AoE events.
- `explosions/explosionIntegration.test.ts`: direct + AoE + один кратер, смерть от direct,
  укрытие до разрушения, невзрывные weapons, включение/выключение взрыва после выстрела,
  независимость от выбора оружия, общий popup path, telemetry/reset, несколько взрывов
  одного тика и preview без мутации.
- Существующий `combat/combat.test.ts` сохраняет проверку direct-only pipeline для всех
  weapons с явно выключенным explosion. Новое default-поведение Mortar проверяется отдельно.
  Исходные ballistic snapshots и остальные regression fixtures не переписаны.

## Файлы

Новые:

- `src/game/explosions/ExplosionDefinition.ts`
- `src/game/explosions/ExplosionEvent.ts`
- `src/game/explosions/calculateExplosionDamage.ts`
- `src/game/explosions/isBlastPathOccluded.ts`
- `src/game/explosions/resolveExplosion.ts`
- `src/game/explosions/explosions.test.ts`
- `src/game/explosions/explosionIntegration.test.ts`
- `src/game/collision/queryEntitiesInRadius.ts`
- `src/game/collision/areaQuery.test.ts`
- `src/game/terrain/sampleTerrainSegment.ts`
- `STEP6_REPORT.md`

Изменены:

- `src/game/impacts/ImpactDefinition.ts`, `impactDefinitions.ts`, `resolveImpact.ts`
- `src/game/combat/EntityDamageEvent.ts`, `resolveEntityDamage.ts`, `combat.test.ts`
- `src/game/core/GameState.ts`, `GameRuntime.ts`, `stepSimulation.ts`
- `src/game/weapons/WeaponSettings.ts`, `src/game/config/defaultGameConfig.ts`
- `src/game/ballistics/trajectoryPreview.ts`, `src/game/terrain/terrainCollision.ts`
- `src/game/effects/DamagePopup.ts`
- `src/game/rendering/DebugOptions.ts`, `SceneRenderer.ts`
- `src/ui/TechnicalPanel/TechnicalPanel.tsx`, `src/ui/useTelemetry.ts`, `src/app/App.tsx`
- `eslint.config.js`, `tsconfig.simulation.json`, `README.md`

## Ограничения и точки расширения

Один луч к центру хитбокса и binary solid-query не учитывают долю открытого тела,
толщину укрытия или blast resistance материалов. Любое препятствие после стартовой ячейки
имеет одинаковый множитель. Sampling приблизителен на касательных углах ячеек; форма кратера
ограничена сеткой. Передача взрывной волны во времени и задержанные детонаторы отсутствуют.

Урон допускает friendly fire и самоурон. По умолчанию сцена содержит орудие и одну цель;
resolver поддерживает произвольный массив юнитов, а сценарии нескольких целей добавлены в тесты.
Радиусы и debug-линии показывают последний взрыв; новые VFX не добавлялись. Unit grounding
продолжает реагировать на изменённую поверхность без импульсов или blast velocity.

Для Step 7 остаются прежние UnitState/EntityId, moveUnit-команда и command queue.
Отдельный radius query можно заменить пространственным индексом, не меняя falloff/Health.
Explosion и damage events сериализуемы для будущего authoritative server/replay.
В этом изменении не реализованы Step 7, knockback, fragmentation, status effects,
armor, buildings, групповое управление или networking.
