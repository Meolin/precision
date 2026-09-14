# Ballistics Lab

Локальный MVP 2D-полигона, Step 3: процедурный разрушаемый рельеф Soil/Rock, неподвижное орудие,
Basic Cannon / Mortar / Heavy Penetrator, пробитие с потерей энергии и техническая панель. React 19, TypeScript, Vite, PixiJS 8
и `@pixi/react`. Без сервера и внешних игровых ресурсов; после установки зависимостей
приложение не требует подключения к интернету.

## Запуск

Требуется Node.js **22.12+** и npm.

```bash
npm install
npm run dev
```

Откройте адрес, который выведет Vite (обычно `http://127.0.0.1:5173`).
Для воспроизводимой установки с существующим `package-lock.json` используйте `npm ci`.

Не открывайте `index.html` или `dist/index.html` двойным кликом через `file://`:
браузер намеренно блокирует ES-модули в таком режиме и показывает CORS-ошибку.
Для готовой сборки используйте preview-сервер:

```bash
npm run build
npm run preview
```

## Управление

| Действие                                 | Управление                      |
| ---------------------------------------- | ------------------------------- |
| Прицеливание                             | Движение мыши над картой        |
| Выстрел                                  | ЛКМ / Space                     |
| Уменьшить / увеличить угол               | A / D или ← / →                 |
| Basic Cannon / Mortar / Heavy Penetrator | 1 / 2 / 3 или селектор «Оружие» |
| Пауза / продолжить                       | P или кнопка «Пауза»            |
| Ровно один тик                           | «Шаг +1» на паузе               |
| Сбросить сцену с текущим seed            | R / «Сбросить сцену»            |
| Следующий seed                           | «Новый рельеф»                  |
| Вернуть default config                   | «Сбросить настройки»            |

Горячие клавиши не перехватывают ввод в полях и кнопках. Клавиши A/D/P/R работают
по физическому расположению, в том числе с русской раскладкой.
На паузе игровые команды накапливаются до следующего тика. Прицеливание, смена оружия и выстрел
применяются по порядку при «Шаг +1» или продолжении. Прогноз, ствол и HUD сразу показывают
запрошенные угол и оружие, не меняя simulation state. Смена оружия выставляет начальный
угол: Basic Cannon — 42°, Mortar — 70°, Heavy Penetrator — 8°; затем можно свободно прицеливаться.
Повторный выбор уже активного оружия сохраняет угол. Сброс сцены очищает очередь,
снаряды, кратеры, cooldown и счётчики, возвращает Basic Cannon; настройки и пауза сохраняются.

| Параметр                      | Basic Cannon | Mortar       | Heavy Penetrator       |
| ----------------------------- | ------------ | ------------ | ---------------------- |
| Снаряд                        | Basic Shell  | Mortar Shell | Heavy Penetrator Shell |
| Скорость                      | 30 m/s       | 24 m/s       | 50 m/s                 |
| Масса                         | 5 kg         | 9 kg         | 14 kg                  |
| Радиус                        | 0.12 m       | 0.18 m       | 0.16 m                 |
| Интервал выстрелов            | 0 s          | 0.8 s        | 1 s                    |
| Базовый / максимальный кратер | 0.8 / 3 m    | 1.1 / 4.5 m  | 0.35 / 0.8 m           |
| Пробитие                      | Выключено    | Выключено    | Включено               |
| Penetration power             | 1            | 0.4          | 4                      |
| Максимальный путь в материале | 2 m          | 0.8 m        | 24 m                   |
| Порог энергии выхода          | 20 J         | 50 J         | 50 J                   |

Cooldown считается по времени симуляции и не сбрасывается переключением оружия.
Выстрел во время cooldown отклоняется; пауза его не ускоряет.

В инспекторе отображаются профиль пробития и материал под курсором. В телеметрии
попадания — материал, SUCCESS / STOPPED / ВЫКЛЮЧЕНО, глубина, потерянная и оставшаяся
энергия, скорость выхода. «Путь пробития» записывает следующий контакт: оранжевая
точка обозначает вход, голубые — шаги расчёта, зелёная — выход, розовая — остановку.
Параметры penetration-профиля заданы в definitions и показываются только для чтения;
массу, начальную скорость, размер снаряда и кратер можно менять в прежних числовых полях.

## Архитектура

```text
src/
  app/                   React layout и координация UI
  game/
    config/              GameConfig, defaults, реестр полей и валидация
    core/                GameRuntime, GameState, clock, stepSimulation, snapshot
    commands/            Сериализуемые setAim / setWeapon / fire и их применение
    math/                Векторы, углы, интерполяция
    entities/            CannonState и размещение по поверхности
    weapons/             WeaponDefinition, registry, runtime overrides
    ballistics/          ProjectileDefinition, ProjectileState, общая физика, preview
    impacts/             ImpactResolution, penetration traversal, crater law
    terrain/             Material IDs/definitions, Uint8Array grid, collision, circle/capsule
    rendering/           @pixi/react lifecycle и императивный Pixi-адаптер
    input/               DOM-события → команды
  ui/
    HUD/                 Телеметрия с частотой 10 Hz
    TechnicalPanel/      Числовые параметры, debug toggles, pause/step/reset
    useTelemetry.ts      Компактные данные только для HUD
  main.tsx               Создание runtime и React root
```

**React UI → команды → чистая TypeScript-симуляция → Pixi renderer.** Runtime
создаётся вне React-компонентов и владеет миром, конфигом, очередью и часами.
React не хранит координаты снарядов и не обновляет игровое дерево каждый кадр.
Pixi ticker передаёт длительность кадра в runtime, после чего renderer читает состояние.

- Единицы мира — метры, секунды, килограммы; **+x вправо, +y вниз**. Угол орудия
  положителен вверх от горизонтали: `vx = cos(angle) × speed`, `vy = -sin(angle) × speed`.
  `fitWorld`/`screenToWorld` изолируют масштабирование и поля по краям при resize.
- Симуляция использует accumulator и фиксированный шаг `1 / tickRate`.
  Один кадр ограничен 250 ms. `previousPosition`, `position` и clock alpha обеспечивают
  интерполяцию при отрисовке. Пауза не накапливает пропущенное время.
- Физика — semi-implicit Euler; ветер — ускорение по X, сопротивление — линейное
  затухание скорости `exp(-airDrag × dragCoefficient × dt)`. `gravityScale`,
  `windInfluence`, `dragCoefficient` — множители снаряда; у всех трёх типов равны 1.
  При нулевом сопротивлении действует
  обычная баллистика с численной погрешностью интегратора.
- Снаряд копирует ID оружия, снаряда и impact, массу, радиус, начальную скорость,
  максимальное время жизни, профиль пробития и множители гравитации, ветра, сопротивления
  при выстреле. Изменения этих полей влияют на **следующие** снаряды. Изменение
  гравитации, ветра и сопротивления действует на существующие снаряды со следующего тика.
- Definitions — неизменяемые данные и единственный источник defaults.
  `GameConfig` хранит мир и необязательные `weaponOverrides[weaponId]`:
  секции `weapon`, `projectile`, `impact`. Панель редактирует overrides выбранного оружия;
  переключение их сохраняет, «Сбросить настройки» удаляет все overrides.
- Энергия вычисляется общей `calculateKineticEnergy` как `E = 0.5 × mass × (vx² + vy²)`;
  она не редактируется и не вычисляется отдельной формулой в UI.
  Радиус кратера: `clamp(base + sqrt(E) × scale, base, max)`.
  Удар использует текущую скорость снаряда. Настройки кратера применяются в момент удара
  для оружия, запустившего снаряд, независимо от текущего выбора в панели.
- Рельеф 120 × 64 m хранится в сетке 600 × 320 ячеек размером 0.2 m.
  Ячейки содержат `Air = 0`, `Soil = 1`, `Rock = 2`; сопротивления хранятся в отдельном registry.
  Rock начинается на глубине `6 ± 1.5 m` от поверхности; материал имеет отдельный seeded stream.
  `terrain.rockDepthMeters = null` возвращает all-Soil генерацию для baseline.
  Генератор воспроизводим по seed. Орудие устанавливается по запросу поверхности
  на 17% ширины карты. Свойства генерации находятся в конфиге.
- Swept collision проверяет сегмент с шагом не больше половины ячейки, учитывает
  радиус снаряда и уточняет первый контакт бинарным поиском. Collision не решает судьбу снаряда.
  `resolveImpact` возвращает `stop` / `penetrate` и semantic damage operations:
  `{ type: 'circle', center, radiusMeters }` или `{ type: 'capsule', from, to, radiusMeters }`.
  `TerrainDamageEvent` содержит `operation`; удаляются ячейки по их центрам.
- Renderer обновляет terrain texture только при смене grid или его `version`.
  Прогноз кешируется по конфигу, оружию, углу и версии рельефа. Он вызывает ту же функцию
  `advanceProjectile`, ограничен временем/числом точек и прекращается при столкновении.
- `state.events` содержит события только текущего тика: `projectileSpawned`,
  `projectileImpact`, `impactResolved`, `terrainDamage`; очередь очищается в начале следующего тика.
  Для каждого снаряда последствия применяются сразу, поэтому следующие снаряды
  того же тика видят уже изменённый грунт, как в baseline.
  `lastImpact` сохраняет результат последнего попадания для HUD: исходное оружие,
  тип снаряда, скорость, энергию, координаты, радиус кратера, удалённые ячейки и summary пробития.
  Полные traversal segments живут только в transient resolution; включённый debug сохраняет
  последний путь в runtime отдельно от simulation state.
  `createGameSnapshot` создаёт отдельную JSON-сериализуемую копию по запросу.

Simulation не импортирует React, Pixi, DOM, часы системы или нефиксированную случайность.
Это закреплено ESLint и отдельным `tsconfig.simulation.json` с `lib: ["ES2022"]`.
Ядро можно вынести в пакет и использовать на Node.js-сервере, в replay runner или AI.
Сетевой протокол, replay-система и AI в MVP не реализованы.

```text
Input → FireCommand → Cannon.weaponId → WeaponDefinition + ProjectileDefinition
      → createProjectile → ProjectileState → общая физика

TerrainCollision → ImpactEvent → resolveImpact → material lookup → resolvePenetration
                 → ImpactResolution(stop / penetrate)
                 → TerrainDamageEvent.operation → removeCircle / removeCapsule
                 → остановка или exit position + remaining velocity → следующий тик
```

Collision не вычисляет кратер. Resolver возвращает данные без мутации terrain.
`TerrainDamageEvent` можно сериализовать и применить к другой копии terrain.

Пробитие проходит по направлению скорости с шагом `cellSize / 2`; при входе создаётся
bounded material trace из исходного terrain до применения канала. Цена шага:
`ΔE = penetrationResistance × distance / penetrationPower`.
Soil имеет сопротивление 1500 J/m, Rock — 12000 J/m. Это игровые коэффициенты.
Успех требует, чтобы весь круг снаряда вышел в Air с энергией выше `minimumExitEnergyJ`.
Скорость выхода: `normalize(impactVelocity) × sqrt(2 × remainingEnergyJ / massKg)`.
При нехватке энергии последний шаг сокращается; создаётся частичный канал.
Лимиты: заданная максимальная глубина и максимум 4096 samples.

Канал растеризуется как непрерывная capsule. Чтобы между центрами ячеек не остались
зацепы для снаряда, его радиус не меньше `projectileRadius + cellSize × (√½ + 0.001)`.
Для Heavy Penetrator default это около 0.302 m при заданном profile radius 0.18 m.
Инспектор показывает фактический радиус. Кратер по прежней формуле независим от канала;
blast resistance сохранён в definitions как справочное значение и пока не влияет на кратеры.

## Проверки

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
```

До Step 3 прошли typecheck, lint, 54 теста Step 2 и production build.
После перехода на material IDs, ещё до пробития, прошли 55 тестов, включая baseline snapshots.
Далее пользователь запретил запуск тестов и визуальные проверки: итоговые тесты Step 3
добавлены, но **не запускались**, браузерная проверка Step 3 **не проводилась**.
Финальные typecheck, lint и production build проходят.

Добавлены `materials.test.ts`, `capsuleDamage.test.ts`, `penetration.test.ts`,
`penetrationIntegration.test.ts`; прежние тесты адаптированы к явному результату impact.
Четыре неизменяемых snapshot сняты с исходного MVP до миграции: они проверяют все точки
preview, время полёта, контакт, энергию, кратер, число удалённых ячеек и checksum грунта.
Остальные тесты проверяют forces, lifecycle, cooldown, ID, очереди, snapshot параметров,
per-weapon overrides, порядок событий, повторное применение damage к копии terrain
и совпадение live/preview до первого контакта для всех трёх оружий.

Baseline Step 2: commit `1244dc5`, tag `weapon-impact-v1`.
Baseline исходного MVP: commit `fc7262d`, tag `ballistic-mvp-v1`.
TypeScript ограничен совместимой веткой 6.0 из-за peer dependency `typescript-eslint`.

## Следующие точки расширения

| Файл                                        | Что расширять                                               |
| ------------------------------------------- | ----------------------------------------------------------- |
| `game/commands/GameCommand.ts`              | Команды юнитов, последовательности, будущая сетевая граница |
| `game/core/GameRuntime.ts`                  | Доставка команд, authoritative runtime, prediction          |
| `game/core/stepSimulation.ts`               | Порядок обновления сущностей и событий                      |
| `game/core/GameSnapshot.ts`                 | Сериализация состояния; restore/протокол пока отсутствуют   |
| `game/weapons/weaponDefinitions.ts`         | Три оружия, параметры запуска                               |
| `game/ballistics/projectileDefinitions.ts`  | Физические параметры новых снарядов                         |
| `game/impacts/ImpactDefinition.ts`          | Независимые кратеры/каналы, будущие ricochet-параметры      |
| `game/impacts/ImpactResolution.ts`          | Будущая третья ветка ricochet                               |
| `game/impacts/resolvePenetration.ts`        | Сопротивления и traversal                                   |
| `game/terrain/TerrainMaterialDefinition.ts` | Новые игровые материалы                                     |
| `game/impacts/resolveImpact.ts`             | Разрешение попадания и новые типы последствий               |
| `game/terrain/terrainCollision.ts`          | Optional normal; вычисление нормалей для ricochet           |
| `game/terrain/damageTerrain.ts`             | Другие semantic damage operations                           |
| `game/terrain/TerrainGrid.ts`               | Chunking, dirty regions, журнал операций                    |
| `game/rendering/SceneRenderer.ts`           | Дополнительные слои, эффекты, отображение новых сущностей   |
| `game/rendering/viewport.ts`                | Преобразования координат для будущей камеры                 |

## Ограничения MVP

- Одно неподвижное орудие; при разрушении опоры оно остаётся закреплённым на месте.
- Грунт после разрушения не осыпается. Точность контура ограничена ячейкой 0.2 m.
- Края карты слева/справа и низ завершают жизнь снаряда; верх открыт, поэтому
  снаряд может вернуться сверху. Очень быстрый выстрел может уйти за карту без попадания.
- Прогноз учитывает текущий рельеф; другой летящий снаряд может изменить его до попадания.
- Кратеры ограничены maximum radius; после достижения лимита рост энергии не увеличивает их.
- Интегратор приближённый, swept sampling также приближённый в касательных случаях.
  Межмашинный lockstep determinism не гарантируется.
- Полная texture обновляется при разрушении; chunking пока не нужен.
- Требуется браузер с WebGL. Основной сценарий — desktop, панель адаптируется под узкий экран.
- Нет backend, сети, AI, экономики, здоровья, сохраняемой игры или стороннего physics engine.
- При контакте создаётся активное состояние пробития. На каждом fixed tick снаряд проходит
  не больше `speed × dt` внутри материала; его скорость пересчитывается из оставшейся энергии.
  После выхода обычный баллистический полёт возобновляется со следующего тика.
- Цена материала приблизительна до половины ячейки на границах. В смешанном контакте
  используется материал центра, а если центр в Air — первая касающаяся ячейка.
- Остаточная энергия при STOPPED — неизрасходованный бюджет traversal; остановленный
  снаряд удаляется, его скорость нулевая. Прогноз заканчивается до пробития.
- Ricochet не реализован; `normal` / `surfaceNormal` пока optional. Step 4 может расширить
  `ImpactResolution` и lifecycle третьей веткой без изменения интегратора и penetration resolver.

Полный перечень изменений и решений: [отчёт Step 3](STEP3_REPORT.md).
История предыдущего этапа: [отчёт Step 2](STEP2_REPORT.md).

API интеграции: [официальная документация @pixi/react](https://github.com/pixijs/pixi-react),
[текстуры PixiJS](https://pixijs.com/8.x/guides/components/textures).
