# Step 3 — Terrain Materials + Penetration

Реализованы материалы Air/Soil/Rock, слоистая seeded-генерация, пробитие с потерей
энергии, полные и частичные каналы, Heavy Penetrator и отладочная телеметрия.
Гравитация, ветер, drag, fixed timestep и существующий command/weapon pipeline сохранены.
Step 4 не реализован.

## Baseline и границы проверки

- Сохранён исходный Step 2: commit `1244dc5` — `baseline: weapon and impact pipeline`,
  tag `weapon-impact-v1`. Включены имевшиеся незакоммиченные изменения Step 2 и инструкция Step 3.
- До реализации прошли typecheck, lint, 54 теста в 6 файлах и production build.
- Сначала grid переведён на material IDs с генерацией только Soil. Пробитие в этот
  момент отсутствовало. Прошли 55 тестов, включая четыре неизменённых baseline snapshots.
- После этого пользователь попросил **не запускать тесты и визуальные проверки**.
  Итоговые тесты добавлены и типизированы, но не запускались. Браузерные проверки не проводились.
- Итоговые `npm run typecheck`, `npm run lint`, `npm run build` проходят.
  Сборка сохраняет прежнее предупреждение Vite о размере JS chunk больше 500 kB.
- Эталонные `.snap` не изменены; baseline fixture явно использует `rockDepthMeters = null`.
  Поэтому утверждение о совпадении snapshots относится к промежуточной миграции,
  а не к повторному запуску итогового набора тестов.

## TerrainGrid и материалы

`TerrainGrid.cells` остаётся `Uint8Array`: `Air = 0`, `Soil = 1`, `Rock = 2`.
Добавлены `getMaterialAtCell`, `getMaterialAtWorldPosition`, `setMaterial`, `removeCapsule`.
`isSolid` проверяет ID на отличие от Air; `setSolid` сохранён как совместимый Soil/Air helper.
Чтение за границей возвращает Air. `removeCircle` удаляет оба твёрдых материала;
версия изменяется один раз на операцию при наличии реально удалённых ячеек.

Grid не знает коэффициентов материалов. В отдельном замороженном registry:

| Материал | Density | Hardness | Penetration resistance | Blast resistance |
| -------- | ------- | -------- | ---------------------- | ---------------- |
| Air      | 0       | 0        | 0 J/m                  | 0                |
| Soil     | 1       | 1        | 1500 J/m               | 1                |
| Rock     | 3       | 8        | 12000 J/m              | 4                |

Это игровые коэффициенты. Density/hardness доступны для инспекции; blast resistance
пока не меняет кратер, чтобы сохранить старый закон разрушения.

Поверхность и размещение cannon остались прежними. Отдельный seeded stream задаёт
фазу границы Rock; глубина по умолчанию `6 ± 1.5 m` относительно локальной поверхности.
Один seed даёт одну форму и распределение материалов. `rockDepthMeters = null`
выключает Rock для legacy-сценария. Новый renderer использует прежнюю texture с цветами
из `terrainMaterialVisuals`, зависящими только от ID. Пообъектного рендеринга ячеек нет.

## Resolver, энергия и продолжение полёта

```text
ProjectilePhysics → TerrainCollision → ImpactEvent
                  → resolveImpact → material lookup → resolvePenetration
                  → ImpactResolution(stop / penetrate)
                  → terrainDamage.operation(circle / capsule)
                  → applyTerrainDamage
                  → update projectile lifecycle
```

Collision сообщает контакт, включая радиус, и больше не убивает снаряд.
`ImpactEvent` не дублирует material ID: resolver запрашивает исходный terrain.
Центр снаряда при контакте может ещё находиться в Air — в этом случае material lookup
использует касание окружности с ячейкой. Внутри твёрдого материала приоритет имеет
материал центра. Это также обрабатывает касательные попадания.

`resolvePenetration` — чистая функция с явными входами: позиция, скорость, масса,
энергия, радиус, penetration definition, terrain и необязательный registry материалов.
Для живого снаряда `createActivePenetration` один раз сохраняет bounded material trace
до `maxPenetrationDistanceMeters`, а `advanceActivePenetration` использует этот trace
на каждом последующем fixed tick. Поэтому уже вычищенный канал не маскирует Rock/Soil
впереди снаряда. Шаг материала не более `cellSize / 2`:

```text
effectiveResistance = material.penetrationResistance / penetrationPower
energyLostJ = effectiveResistance × distanceMeters
remainingEnergyJ = max(0, remainingEnergyJ − energyLostJ)
```

При переходе Soil → Rock → Soil сопротивление берётся заново на каждом шаге trace.
Если энергия достигает `minimumExitEnergyJ`, последний шаг сокращается до доступного
расстояния. Другие причины остановки: max distance, hard bound 4096 samples,
некорректный вход. Отрицательная энергия не возвращается.

Успешное пробитие: после касания твёрдого материала весь круг снаряда достигает Air,
сохраняет энергию строго выше порога и не исчерпывает distance/sample budget.
Результат включает entry/final/exit position, initial/remaining energy, distance,
remaining velocity и segments с материалом, длиной и затратой энергии.

```text
direction = normalize(impactVelocity)
exitSpeed = sqrt(2 × remainingEnergyJ / massKg)
remainingVelocity = direction × exitSpeed
```

При успехе `stepSimulation` обновляет position и previousPosition отдельными копиями
exit position и присваивает remaining velocity. Добавляется epsilon `cellSize × 0.001`,
если он не помещает снаряд в другую преграду. Истёкший lifetime/выход за мир не возрождает
снаряд. При остановке скорость нулевая и снаряд удаляется. Следующий тик снова использует
тот же ballistic integrator. Несколько снарядов обрабатываются последовательно, как раньше.

## Terrain damage и debug

`TerrainDamageEvent` теперь содержит union `operation`:

```ts
type TerrainDamageOperation =
  | { type: 'circle'; center: Vec2; radiusMeters: number }
  | { type: 'capsule'; from: Vec2; to: Vec2; radiusMeters: number };
```

Capsule удаляет ячейки, центры которых находятся в радиусе сегмента; геометрия
непрерывная и детерминированная. Для предотвращения зацепов радиус ограничен снизу:

```text
max(profileRadius × channelRadiusScale,
    projectileRadius + cellSize × (√½ + 0.001))
```

При успехе канал идёт до exit, при неуспехе — до finalPosition внутри преграды.
Кратер управляется прежней `terrainDamage`-секцией, канал — отдельной
`penetrationDamage.channelRadiusScale` и projectile penetration profile.
События и результаты — JSON-сериализуемые plain data.

`impactResolved` хранит детальный результат только в событиях текущего тика.
`lastImpact` хранит скалярную телеметрию: материал, статус, глубину, потерю энергии,
остаток, скорость выхода и прежние показатели кратера.
При включённом debug runtime сохраняет последний путь отдельно от GameState;
reset его очищает. UI обновляет показания с прежней частотой 10 Hz.
Позиция курсора также хранится вне simulation state и snapshot.

Панель показывает материал под курсором, resistance/hardness/blast resistance,
профиль активного оружия и фактический радиус канала. Горячая клавиша 3 и селектор
используют тот же `setWeapon` command. Preview показывает реальный полёт только
до первого контакта, без повреждения terrain и расчёта пробития.

## Профили оружия

| Параметр                  | Basic Cannon    | Mortar            | Heavy Penetrator   |
| ------------------------- | --------------- | ----------------- | ------------------ |
| Weapon ID                 | basicCannon     | mortar            | heavyPenetrator    |
| Projectile ID             | basicShell      | mortarShell       | penetratorShell    |
| Масса / скорость          | 5 kg / 30 m/s   | 9 kg / 24 m/s     | 14 kg / 50 m/s     |
| Дульная энергия           | 2250 J          | 2592 J            | 17500 J            |
| Радиус снаряда            | 0.12 m          | 0.18 m            | 0.16 m             |
| Начальный угол / cooldown | 42° / 0 s       | 70° / 0.8 s       | 8° / 1 s           |
| Crater base / scale / max | 0.8 / 0.025 / 3 | 1.1 / 0.035 / 4.5 | 0.35 / 0.001 / 0.8 |
| Пробитие enabled          | false           | false             | true               |
| Penetration power         | 1               | 0.4               | 4                  |
| Max distance              | 2 m             | 0.8 m             | 24 m               |
| Profile channel radius    | 0.16 m          | 0.22 m            | 0.18 m             |
| Minimum exit energy       | 20 J            | 50 J              | 50 J               |

Для Heavy Penetrator фактический default channel radius ≈ 0.302 m из-за размеров
снаряда и ячейки. У Basic Cannon/Mortar пробитие выключено для сохранения Step 2.
Penetration definitions фиксируются при spawn; смена оружия не меняет снаряды в полёте.
UI показывает penetration profile только для чтения. Старые overrides массы/скорости/
радиуса/кратера работают, и через энергию/радиус влияют на пробитие.

## Тестовые сценарии

Новые файлы, написанные без финального запуска:

- `materials.test.ts`: Soil/Rock/Air, lookup, version, удаление Rock, detached bytes,
  seeded-распределение, неизменная форма/поверхность и столкновения обоих материалов.
- `penetration.test.ts`: успех, частичная остановка, сопротивления, толщина и power,
  Soil → Rock → Soil, известные расходы энергии, скорость выхода, наклонное направление,
  max distance, hard sample bound, NaN/Infinity/negative energy и некорректные входы.
- `penetrationIntegration.test.ts`: материал при центре в Air, чистота resolver,
  каналы, сериализуемый replay damage, продолжение с гравитацией, отсутствие повторного
  entry impact, новая отдельная преграда, частичный канал, grazing contact, lifetime,
  snapshot профиля и source weapon после переключения.
- `capsuleDamage.test.ts`: горизонтальные/вертикальные/диагональные каналы без зазоров,
  удаление обоих материалов, сохранение дальних ячеек, версия, replay, degenerate capsule.

Старые assertions сохранены с адаптацией к новой границе ответственности:
collision оставляет projectile alive, stop выполняется через resolver; damage имеет operation;
preview/live сравниваются до первого контакта. Добавлен Heavy Penetrator в общий preview-сценарий.

## Изменённые существующие файлы

Все пути ниже относительно корня проекта:

```text
README.md
src/app/App.css
src/app/App.tsx
src/game/ballistics/Projectile.ts
src/game/ballistics/ProjectileDefinition.ts
src/game/ballistics/projectileDefinitions.ts
src/game/ballistics/projectilePhysics.ts
src/game/ballistics/trajectoryPreview.ts
src/game/ballistics/ballistics.test.ts
src/game/commands/executeCommand.ts
src/game/config/GameConfig.ts
src/game/config/defaultGameConfig.ts
src/game/core/GameRuntime.ts
src/game/core/GameSnapshot.ts
src/game/core/GameState.ts
src/game/core/stepSimulation.ts
src/game/core/baseline.test.ts
src/game/impacts/ImpactDefinition.ts
src/game/impacts/impactDefinitions.ts
src/game/impacts/resolveImpact.ts
src/game/impacts/impacts.test.ts
src/game/input/useGameInput.ts
src/game/rendering/DebugOptions.ts
src/game/rendering/SceneRenderer.ts
src/game/rendering/TerrainLayer.ts
src/game/terrain/TerrainDamageEvent.ts
src/game/terrain/TerrainGrid.ts
src/game/terrain/damageTerrain.ts
src/game/terrain/generateTerrain.ts
src/game/terrain/terrainCollision.ts
src/game/terrain/terrain.test.ts
src/game/weapons/WeaponDefinition.ts
src/game/weapons/weaponDefinitions.ts
src/game/weapons/weapons.test.ts
src/ui/HUD/HUD.tsx
src/ui/TechnicalPanel/TechnicalPanel.css
src/ui/TechnicalPanel/TechnicalPanel.tsx
src/ui/useTelemetry.ts
```

## Новые файлы

```text
STEP3_REPORT.md
src/game/impacts/ImpactResolution.ts
src/game/impacts/ProjectilePenetrationDefinition.ts
src/game/impacts/PenetrationResult.ts
src/game/impacts/resolvePenetration.ts
src/game/impacts/penetration.test.ts
src/game/impacts/penetrationIntegration.test.ts
src/game/terrain/TerrainMaterialId.ts
src/game/terrain/TerrainMaterialDefinition.ts
src/game/terrain/TerrainDamageOperation.ts
src/game/terrain/materials.test.ts
src/game/terrain/capsuleDamage.test.ts
src/game/rendering/terrainMaterialVisuals.ts
```

## Ограничения и Step 4

- Модель игровая: нет деформации, осколков, отклонения направления или реалистичной геологии.
- В момент контакта создаётся `penetrationState`. Каждый fixed tick выполняет
  `advanceActivePenetration`: расстояние ограничено `speed × dt`, затем энергия и скорость
  уменьшаются, поэтому толстый слой занимает несколько кадров. Внутри материала гравитация
  и ветер не интегрируются; после выхода снаряд возвращается к обычному ballistic integrator.
- Sampling приближает границы материалов; trailing step может завысить толщину до
  половины ячейки. Учитывается полный радиус снаряда, включая grazing contact.
- Если разные материалы одновременно касаются окружности при центре в Air, выбирается
  первая касающаяся ячейка в порядке обхода, без сложной смеси сопротивлений.
- При остановке remaining energy означает остаток traversal budget; он рассеивается
  при удалении снаряда. Это не энергия продолжающего движение объекта.
- Crater tuning независимо от затрат пробития; blast resistance пока справочный.
- Размер канала ограничен сеткой; рельеф не осыпается. Полная texture обновляется при изменении.
- Прогноз заканчивается у первого impact. Сетевой протокол и restore/replay runner отсутствуют.
- Итоговая работа не проверена запуском тестов или визуально по указанию пользователя.

Step 4 может добавить нормали в `terrainCollision`, использовать optional
`ImpactEvent.surfaceNormal`, выбирать ricochet в `resolveImpact` и добавить вариант
в `ImpactResolution` с обработкой в `stepSimulation`. Material registry и отдельный
penetration resolver уже доступны для такого расширения; текущий интегратор менять не нужно.
