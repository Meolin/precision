# Step 2 — Weapon System + Impact Pipeline

Шаг 2 реализован поверх исходного MVP. Step 3 не начат.

## Baseline и проверки

- Инициализирован Git, создан commit `fc7262d` (`baseline: ballistic terrain MVP`),
  tag `ballistic-mvp-v1`.
- До изменения gameplay прошли typecheck, lint, 32 существующих теста и build.
- До миграции сняты четыре baseline snapshot: default, wind/drag, low angle, high angle.
- После миграции Basic Cannon все snapshot совпали без обновления эталонов;
  затем добавлен Mortar.
- Финальные проверки: typecheck, lint, **54 теста в 6 файлах**, production build.
- Browser: выстрелы Basic Cannon и Mortar, более навесная начальная траектория Mortar,
  телеметрия попадания, селектор, пауза и очередь команд. Ошибок в console нет.
- Vite сообщает прежнее предупреждение о bundle > 500 kB; сборка успешна.

## Definitions и ownership

`WeaponDefinition` хранит ID, имя, ссылку на projectile definition, muzzle velocity,
cooldown и начальный угол при выборе оружия. `ProjectileDefinition` хранит массу,
радиус, множители world forces, lifetime и ссылку на impact definition.
`ImpactDefinition` задаёт включение terrain damage и параметры закона кратера.
Все registries — замороженные plain data с typed IDs; DI и event bus отсутствуют.

`GameConfig` владеет миром и необязательными overrides по ID оружия.
Definitions задают defaults; debug UI не изменяет глобальные registry.
Переключение сохраняет overrides отдельно для каждого оружия.
Физические параметры снаряда фиксируются при spawn; world forces остаются live.
Настройки impact разрешаются при контакте по сохранённым source weapon / impact IDs.

Оба оружия находятся в `src/game/weapons/weaponDefinitions.ts`:

| Weapon ID   | Projectile ID | Скорость | Масса | Радиус | Начальный угол | Cooldown |
| ----------- | ------------- | -------- | ----- | ------ | -------------- | -------- |
| basicCannon | basicShell    | 30 m/s   | 5 kg  | 0.12 m | 42°            | 0 s      |
| mortar      | mortarShell   | 24 m/s   | 9 kg  | 0.18 m | 70°            | 0.8 s    |

Mortar использует ту же физику. Начальный угол выше, снаряд тяжелее, кратер больше.
Угол после выбора можно менять как прежде. Cooldown общий для установки и не
обходится сменой оружия. Выстрел во время cooldown отклоняется.

## Fire pipeline

```text
Input / UI → сериализуемый fire → validate cannon / cooldown
           → Cannon.weaponId → resolve WeaponDefinition / ProjectileDefinition
           → muzzle transform → createProjectile → ProjectileState → simulation
```

`setWeapon` применяется через очередь команд. На паузе renderer и HUD показывают
проекцию накопленных aim/equip-команд на копию cannon, поэтому preview обновляется
сразу без изменения simulation state. Команды применяются по порядку на следующем тике.

## Impact pipeline

```text
advanceProjectile → TerrainHit → createImpactEvent
                  → resolveImpact(ImpactEvent, ImpactDefinition)
                  → TerrainDamageEvent → applyTerrainDamage → TerrainGrid.removeCircle
```

Событие содержит tick, source IDs, position, velocity, speed, kinetic energy и
optional surface normal. Энергия централизована в `calculateKineticEnergy`.
Resolver не изменяет terrain. Events очищаются в начале следующего тика;
`lastImpact` хранит только последнюю телеметрию. Последствия обрабатываются
последовательно по снарядам, сохраняя baseline-порядок разрушения в одном тике.

## Изменённые существующие файлы

Все пути ниже относительно корня проекта.

- `src/game/config/GameConfig.ts`, `defaultGameConfig.ts`: ownership и overrides.
- `src/game/entities/Cannon.ts`: weaponId, cooldown.
- `src/game/ballistics/Projectile.ts`, `projectilePhysics.ts`: definitions, snapshots,
  множители сил и единая функция энергии.
- `src/game/commands/GameCommand.ts`, `executeCommand.ts`: выбор оружия, валидация, cooldown.
- `src/game/core/GameRuntime.ts`: preview учитывает выбранное оружие и очередь.
- `src/game/core/GameState.ts`, `stepSimulation.ts`, `GameSnapshot.ts`: события и lifecycle.
- `src/game/terrain/damageTerrain.ts`, `terrainCollision.ts`: semantic damage и optional normal.
- `src/game/input/useGameInput.ts`: клавиши 1/2.
- `src/game/rendering/SceneRenderer.ts`: preview ствола и маркер нового lastImpact.
- `src/ui/useTelemetry.ts`, `src/ui/HUD/HUD.tsx`: оружие и полная impact telemetry.
- `src/ui/TechnicalPanel/TechnicalPanel.tsx`, `TechnicalPanel.css`: селектор и per-weapon tuning.
- `src/app/App.tsx`, `App.css`: связь панели с runtime и подсказки.
- `src/game/ballistics/ballistics.test.ts`, `src/game/core/runtime.test.ts`,
  `src/game/terrain/terrain.test.ts`: адаптация существующих тестов без снижения assertions.
- `eslint.config.js`, `tsconfig.simulation.json`: новые gameplay-модули включены в
  проверку независимости от React, Pixi и DOM.
- `README.md`: управление, архитектура, проверки и ограничения Step 2.

## Новые файлы

```text
src/game/
  weapons/
    WeaponDefinition.ts
    weaponDefinitions.ts
    WeaponSettings.ts
    weapons.test.ts
  ballistics/
    ProjectileDefinition.ts
    projectileDefinitions.ts
  impacts/
    ImpactDefinition.ts
    impactDefinitions.ts
    ImpactEvent.ts
    resolveImpact.ts
    impacts.test.ts
  terrain/
    TerrainDamageEvent.ts
  core/
    baseline.test.ts
    __snapshots__/baseline.test.ts.snap
STEP2_REPORT.md
```

Массового переноса файлов нет; renderer, runtime и интегратор сохранены.

## Добавленные regression tests

- Четыре pre-migration baseline snapshot: trajectory, impact, crater, terrain checksum.
- Basic Cannon defaults и известный muzzle transform.
- Snapshot всех физических параметров и применение live world forces.
- Mortar: скорость, масса, размер и более высокая начальная дуга.
- Per-weapon overrides, reset и неизменность definitions.
- Порядок fire/setWeapon, неизвестные IDs, cooldown и отсутствие его обхода.
- Preview на паузе, смена оружия при том же угле, все preview points совпадают с live
  для обоих оружий при ветре и сопротивлении.
- Энергия 100 J для 2 kg / 10 m/s; collision без изменения terrain.
- Detached contact data, normal, semantic damage, disabled damage и crater limits.
- Порядок и очистка событий, ровно одно попадание, telemetry persistence.
- Damage можно сериализовать и воспроизвести на копии грунта.
- Смена оружия в полёте сохраняет source IDs и верное impact tuning.
- Последовательное разрушение при двух контактах в одном тике.
- Lifetime expiration не создаёт impact; snapshot векторов изолирован.

## Extension points и ограничения

`ImpactDefinition.ts` и `resolveImpact.ts` — место для данных и решений penetration /
ricochet. `TerrainHit.normal` / `ImpactEvent.surfaceNormal` подготовлены как optional;
расчёт точной нормали пока отсутствует. `ImpactEvent` сохраняет скорость и энергию до
удаления projectile. Для продолжения полёта нужно будет расширить результат resolver
и lifecycle-обработчик в `stepSimulation.ts` / `advanceProjectile`; базовую физику и
terrain damage переписывать не требуется.

Сейчас любой контакт завершает полёт; отсутствуют penetration, ricochet, unit damage,
сеть, VFX/audio framework, AI и другие механики Step 3. Snapshot остаётся границей
сериализации, полноценный restore/replay runner не добавлен.

Запуск: `npm run dev`. Проверки: `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build`. Production: `npm run preview`.
