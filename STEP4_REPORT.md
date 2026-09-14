# Step 4 — Surface Normals + Impact Angles + Ricochet

Добавлены нормали, углы попадания и детерминированный рикошет как третий исход impact.
Сохранены pure TypeScript simulation, fixed timestep, командный pipeline, три оружия,
материалы и отдельное пробитие. Step 5 не реализован.

## Baseline и границы проверки

- По инструкции создан commit `bc0cefe` — `baseline: terrain materials and penetration`.
  Он сохраняет все исходные изменения Step 3 и инструкцию Step 4.
- Исходные typecheck/lint/build прошли, тесты: 88 прошли, 1 упал. Активное пробитие
  принимало Air в середине sample-интервала за полный выход снаряда уже в начале интервала.
- До добавления нормалей исправлен захват trailing material: если midpoint в Air,
  проверяется начало интервала. Геометрия выхода теперь учитывает полный радиус.
  В тесте lifetime сравнивается с временем фактического выхода, учитывая несколько тиков
  внутри материала. После этой отдельной правки прошли все **89 тестов Step 3**.
- Нормали добавлены без изменения исхода ударов. Последний запуск перед запретом пользователя:
  95 из 96 тестов прошли; JSON-сравнение обнаружило `-0` в нормали. Исправлена канонизация
  нуля; также исправлена слишком узкая аннотация типа материала в новом тестовом helper.
- После сообщения «тесты и визуальные проверки не запускай» тесты больше **не запускались**.
  Исправление `-0`, итоговые регрессии и новые тесты не подтверждены выполнением.
  Визуальные/браузерные проверки не проводились.
- Итоговые `npm run typecheck`, `npm run lint`, `npm run build` проходят.
  Сборка сохраняет предупреждение Vite о JS chunk больше 500 kB.
- Исходные `.snap` не редактировались. Отчёт не утверждает выполнение полного Definition of Done
  в части тестового и визуального подтверждения: эти проверки исключены пользователем.

## Нормаль и геометрия контакта

`TerrainHit.normal` и `ImpactEvent.surfaceNormal` обязательны. `position` сохраняет прежний
смысл — центр снаряда в момент контакта. Новое `contactPoint` — ближайшая точка касающейся
ячейки; скол и стрелка нормали располагаются на поверхности даже при центре снаряда в Air.
Поиск первого контакта, swept sampling и уточнение fraction сохранены.

`calculateSurfaceNormal` выполняет 25 occupancy-запросов вокруг касающейся ячейки:

```text
smooth     = [ 1,  4, 6, 4, 1]
derivative = [-1, -2, 0, 2, 1]
gx = sum(occupancy * derivative[x] * smooth[y])
gy = sum(occupancy * derivative[y] * smooth[x])
normal = normalize(-gx, -gy)
```

Soil/Rock имеют occupancy 1, Air — 0. При +y вниз горизонтальный грунт даёт `(0, -1)`,
стена справа — `(-1, 0)`, склон `y = x` — примерно `(√½, -√½)`.
Значения материала, рендерер и текстура не участвуют. Запрос не копирует TerrainGrid
и не создаёт массивы соседних ячеек.

`isValidNormal` проверяет конечность и ненулевую длину; `normalize` сначала масштабирует
компоненты, чтобы избежать переполнения. Fallback — против движения, далее вверх `(0, -1)`.
Компоненты `-0` заменяются на `0` для точного JSON round-trip.

## Угол и контекст

`ImpactContext` один раз собирает материал, направление входа, нормаль и угол.
Направление передаётся активному penetration resolver; standalone-пробитие использует
тот же `normalize`. Угол рассчитывается только `calculateImpactAngle`:

```text
angle = acos(clamp(-dot(normalize(velocity), normal), -1, 1))
```

0° — лобовое попадание, 90° — касательное. >90° означает движение от поверхности;
такой контакт не становится рикошетом. UI только переводит сохранённый угол из радиан в градусы.

## Порядок resolver и энергия

```text
TerrainCollision → ImpactEvent → ImpactContext → resolveRicochet
    успешен → separation → ricochet + small chip → продолжение полёта
    не разрешён → createActivePenetration → penetrate / stop
```

`resolveRicochet` — чистая функция. Проверяет enabled, валидность входов, счётчик,
скорость, материал, направление контакта и угол. Вероятности и `Math.random` отсутствуют.
Soil/Air: `ricochetFactor = 0`, Rock: `1`. Для промежуточного фактора порог:

```text
thresholdDeg = 90 - (90 - minRicochetAngleDeg) * clamp(ricochetFactor, 0, 1)
```

Hardness остаётся прежним свойством материала; дополнительных формул поверх фактора нет.
Отражение и энергетический баланс:

```text
reflected = v - 2 * dot(v, n) * n
remainingEnergyJ = initialEnergyJ * energyRetention
energyLostJ = initialEnergyJ - remainingEnergyJ
speedAfter = sqrt(2 * remainingEnergyJ / massKg)
outgoingVelocity = normalize(reflected) * speedAfter
```

Retention строго между 0 и 1; UI допускает 0.01–0.99. Повторного независимого масштабирования
скорости нет. Минимальная скорость проверяется до решения и после потери энергии.
Если кандидат не сохраняет достаточную скорость или для него не найдено свободное положение,
он останавливается у поверхности. Обычный отказ по enabled/углу/материалу/скорости/лимиту
передаёт управление пробитию, затем stop.

`ImpactResolution` — discriminated union: `StopImpactResolution`,
`PenetrationImpactResolution`, `RicochetImpactResolution`. Результат содержит plain data,
сериализуемые события и никаких объектов Pixi/DOM или callbacks.

## Продолжение и защита от повторного контакта

`separateRicochet` ищет первое свободное положение всего круга вдоль внешней нормали:

```text
epsilon = max(cellSize * 0.1, projectileRadius * 0.1)
candidate = impactCenter + normal * epsilon * step
```

Не более 32 шагов и не далее `radius + 2 * cellSize`. Проверяется исходная геометрия,
до скола, поэтому продолжение не зависит от включённого damage. При отсутствии свободного
положения снаряд останавливается. Нет временного игнорирования коллизий.

Общий `applyRicochetContinuation` используется в simulation и preview:
отдельные копии position/previousPosition, новая скорость, новый счётчик, очистка penetrationState.
Проверяются lifetime и границы мира; истёкший снаряд не возрождается.
Следующий тик использует обычные gravity/wind/drag. Максимум рикошетов принадлежит снаряду.

## Скол и preview

Скол использует прежнюю semantic circle operation, но отдельный `ricochetDamage` profile:

```text
radius = clamp(0.16 + sqrt(energyLostJ) * 0.001, 0.16, maxRadius)
maxRadius = 0.30 m (Basic/Mortar), 0.25 m (Heavy Penetrator)
```

Центр — `contactPoint`, энергия события — потерянная энергия. Полный кратер и capsule при
рикошете не создаются. Отключение terrain damage отключает и скол. Stop-crater law сохранён.

Прогноз вызывает те же collision, normal, angle, ImpactResolver и continuation.
Лимит — один рикошет, затем конец перед пробитием или вторым контактом; остаётся общий лимит
времени. При первом рикошете создаётся одна временная копия TerrainGrid и применяется тот же
скол, чтобы последующий полёт видел согласованную геометрию. Основной terrain, version,
GameState и очередь событий не изменяются. До первого рикошета копирования нет.
Маркер рикошета добавляется в `preview.ricochets`; без рикошета сохраняется прежняя форма
preview для неизменённых baseline snapshots. Число точек ограничено прежним stride и одной
дополнительной точкой рикошета.

## Профили и UI

| Параметр                      | Basic Cannon | Mortar | Heavy Penetrator |
| ----------------------------- | ------------ | ------ | ---------------- |
| Enabled                       | true         | false  | true             |
| Минимальный угол              | 70°          | 80°    | 60°              |
| Минимальная скорость до/после | 10 m/s       | 12 m/s | 10 m/s           |
| Retention                     | 0.55         | 0.35   | 0.65             |
| Максимум рикошетов            | 1            | 0      | 2                |

Mortar по умолчанию не рикошетит; для эксперимента UI позволяет включить его и поднять лимит.
Роли пробития/кратеров Step 3 сохранены, четвёртого оружия нет.
`weaponOverrides[weaponId].ricochet` хранит настройки отдельно для каждого оружия.
Профиль копируется при spawn и в snapshot; изменение UI или смена оружия не меняет летящий снаряд.
Валидация ограничивает angle до 89°, speed до 1–120 m/s, retention до 0.01–0.99,
целочисленный count до 0–8. Reset Settings возвращает defaults и обновляет preview cache.

HUD с прежней частотой 10 Hz показывает материал, угол, компоненты нормали, результат,
энергию retained/lost, процент сохранения, скорость после отражения и счётчик `N / max`.
Есть счётчик последнего активного снаряда. Toggle «Нормали поверхности» выводит стрелку
от последнего контакта независимо от маркера кратера. В инспекторе показан ricochetFactor
материала под курсором. UI обозначает версию STEP 4.

## Добавленные тесты — без финального запуска

- `surfaceNormal.test.ts`: пол, стена, 45° склон, соседние ячейки, радиус снаряда,
  Soil/Rock, изменения terrain, неоднозначный градиент и нечисловые скорости.
- `impactGeometry.test.ts`: convention 0°/45°/90°/180°, отражение от пола/стены/склона,
  единичные нормали, zero/NaN/Infinity/огромные векторы и acos safety.
- `ricochet.test.ts`: порог 65°, углы 40°/75°, Rock/Soil/Air, промежуточный factor,
  disabled, минимальная скорость до/после, лимиты, 1000 J → 600 J, sqrt(2E/m),
  детерминизм, чистота, JSON, уходящий контакт и некорректные входы.
- `ricochetIntegration.test.ts`: малый скол/replay, отсутствие overlap/повторного контакта,
  продолжение с gravity/wind/drag, damage disabled, Mortar/Soil stop, фронтальное пробитие,
  приоритет рикошета, повторные реальные отскоки между полом и потолком, исчерпание лимита,
  остановка при малой энергии, lifetime, snapshots/смена оружия, preview/live и overrides.

Старые тесты сохранены; дополнены обязательными полями. Fixture Step 3 явно выключает
рикошет, чтобы проверять независимую модель пробития. Snapshot-файлы не изменены.

## Изменённые существующие файлы

```text
README.md
src/app/App.tsx
src/game/ballistics/Projectile.ts
src/game/ballistics/ProjectileDefinition.ts
src/game/ballistics/ballistics.test.ts
src/game/ballistics/projectileDefinitions.ts
src/game/ballistics/trajectoryPreview.ts
src/game/config/defaultGameConfig.ts
src/game/core/GameSnapshot.ts
src/game/core/GameState.ts
src/game/core/stepSimulation.ts
src/game/impacts/ImpactDefinition.ts
src/game/impacts/ImpactEvent.ts
src/game/impacts/ImpactResolution.ts
src/game/impacts/impactDefinitions.ts
src/game/impacts/impacts.test.ts
src/game/impacts/penetrationIntegration.test.ts
src/game/impacts/resolveImpact.ts
src/game/impacts/resolvePenetration.ts
src/game/math/Vec2.ts
src/game/rendering/DebugOptions.ts
src/game/rendering/SceneRenderer.ts
src/game/terrain/TerrainMaterialDefinition.ts
src/game/terrain/terrainCollision.ts
src/game/weapons/WeaponSettings.ts
src/ui/HUD/HUD.tsx
src/ui/TechnicalPanel/TechnicalPanel.tsx
src/ui/useTelemetry.ts
```

## Новые файлы

```text
STEP4_REPORT.md
src/game/impacts/ImpactContext.ts
src/game/impacts/ProjectileRicochetDefinition.ts
src/game/impacts/calculateImpactAngle.ts
src/game/impacts/impactGeometry.test.ts
src/game/impacts/resolveRicochet.ts
src/game/impacts/ricochet.test.ts
src/game/impacts/ricochetContinuation.ts
src/game/impacts/ricochetIntegration.test.ts
src/game/terrain/surfaceNormal.test.ts
src/game/terrain/surfaceNormal.ts
```

## Ограничения и точки расширения Step 5

- Нормаль приближена сеточным ядром: углы/тонкие островки/границы карты могут давать
  сглаженное или fallback-направление. Смешанный контакт использует прежний порядок выбора материала.
- Столкновение расходует весь fixed tick; оставшаяся после контакта часть времени не
  доинтегрируется. Preview и live используют одинаковое правило. Межмашинный lockstep не обещается.
- Preview показывает один рикошет и текущий рельеф; другие снаряды могут изменить его позже.
- При coarse grid скол может не удалить ячейки, если ни один центр не попал в малый радиус.
- Retention/factor — игровые коэффициенты. Нет деформации, случайного разброса,
  реалистичной механики разрушения, вращения или осыпания terrain.
- Penetration остаётся отдельным механизмом со своими прежними sampling-ограничениями;
  его изменения ограничены устранением найденной ошибки выхода и общим направлением входа.
- Для Step 5 готовы: геометрические факты Collision/ImpactEvent, общий ImpactContext,
  расширяемый ImpactResolution, semantic TerrainDamageEvent, transient events, snapshot
  с состоянием рикошета и command boundary. Можно добавить тип цели и EntityDamageEvent
  отдельной веткой, не меняя формулы отражения и ядро пробития.
- Unit, Health, EntityDamage, movement, AI и networking в этом шаге не добавлялись.
