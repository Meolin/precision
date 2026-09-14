# Ballistics Lab

Локальный MVP 2D-полигона, Step 2: процедурный разрушаемый рельеф, неподвижное орудие,
Basic Cannon / Mortar, баллистические снаряды, impact pipeline и техническая панель. React 19, TypeScript, Vite, PixiJS 8
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

| Действие                      | Управление                  |
| ----------------------------- | --------------------------- |
| Прицеливание                  | Движение мыши над картой    |
| Выстрел                       | ЛКМ / Space                 |
| Уменьшить / увеличить угол    | A / D или ← / →             |
| Выбрать Basic Cannon / Mortar | 1 / 2 или селектор «Оружие» |
| Пауза / продолжить            | P или кнопка «Пауза»        |
| Ровно один тик                | «Шаг +1» на паузе           |
| Сбросить сцену с текущим seed | R / «Сбросить сцену»        |
| Следующий seed                | «Новый рельеф»              |
| Вернуть default config        | «Сбросить настройки»        |

Горячие клавиши не перехватывают ввод в полях и кнопках. Клавиши A/D/P/R работают
по физическому расположению, в том числе с русской раскладкой.
На паузе игровые команды накапливаются до следующего тика. Прицеливание, смена оружия и выстрел
применяются по порядку при «Шаг +1» или продолжении. Прогноз, ствол и HUD сразу показывают
запрошенные угол и оружие, не меняя simulation state. Смена оружия выставляет начальный
угол: Basic Cannon — 42°, Mortar — 70°; затем можно свободно прицеливаться.
Повторный выбор уже активного оружия сохраняет угол. Сброс сцены очищает очередь,
снаряды, кратеры, cooldown и счётчики, возвращает Basic Cannon; настройки и пауза сохраняются.

| Параметр                      | Basic Cannon | Mortar       |
| ----------------------------- | ------------ | ------------ |
| Снаряд                        | Basic Shell  | Mortar Shell |
| Скорость                      | 30 m/s       | 24 m/s       |
| Масса                         | 5 kg         | 9 kg         |
| Радиус                        | 0.12 m       | 0.18 m       |
| Интервал выстрелов            | 0 s          | 0.8 s        |
| Базовый / максимальный кратер | 0.8 / 3 m    | 1.1 / 4.5 m  |

Cooldown считается по времени симуляции и не сбрасывается переключением оружия.
Выстрел во время cooldown отклоняется; пауза его не ускоряет.

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
    impacts/             ImpactDefinition, ImpactEvent, resolveImpact, crater law
    terrain/             Uint8Array grid, seeded generator, collision, damage
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
  `windInfluence`, `dragCoefficient` — множители снаряда; у обоих типов равны 1.
  При нулевом сопротивлении действует
  обычная баллистика с численной погрешностью интегратора.
- Снаряд копирует ID оружия, снаряда и impact, массу, радиус, начальную скорость,
  максимальное время жизни и множители гравитации, ветра, сопротивления
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
  Генератор воспроизводим по seed. Орудие устанавливается по запросу поверхности
  на 17% ширины карты. Свойства генерации находятся в конфиге.
- Swept collision проверяет сегмент с шагом не больше половины ячейки, учитывает
  радиус снаряда и уточняет первый контакт бинарным поиском. Разрушение — операция
  `{ type: 'circle', center, radius }`, удаляющая ячейки по их центрам.
- Renderer обновляет terrain texture только при смене grid или его `version`.
  Прогноз кешируется по конфигу, оружию, углу и версии рельефа. Он вызывает ту же функцию
  `advanceProjectile`, ограничен временем/числом точек и прекращается при столкновении.
- `state.events` содержит события только текущего тика: `projectileSpawned`,
  `projectileImpact`, `terrainDamage`; очередь очищается в начале следующего тика.
  Для каждого снаряда последствия применяются сразу, поэтому следующие снаряды
  того же тика видят уже изменённый грунт, как в baseline.
  `lastImpact` сохраняет результат последнего попадания для HUD: исходное оружие,
  тип снаряда, скорость, энергию, координаты, радиус кратера и удалённые ячейки.
  `createGameSnapshot` создаёт отдельную JSON-сериализуемую копию по запросу.

Simulation не импортирует React, Pixi, DOM, часы системы или нефиксированную случайность.
Это закреплено ESLint и отдельным `tsconfig.simulation.json` с `lib: ["ES2022"]`.
Ядро можно вынести в пакет и использовать на Node.js-сервере, в replay runner или AI.
Сетевой протокол, replay-система и AI в MVP не реализованы.

```text
Input → FireCommand → Cannon.weaponId → WeaponDefinition + ProjectileDefinition
      → createProjectile → ProjectileState → общая физика

TerrainCollision → ImpactEvent → resolveImpact(ImpactDefinition)
                 → TerrainDamageEvent → applyTerrainDamage → TerrainGrid.removeCircle
```

Collision не вычисляет кратер. Resolver возвращает данные без мутации terrain.
`TerrainDamageEvent` можно сериализовать и применить к другой копии terrain.

## Проверки

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
```

Vitest: 54 теста в 6 файлах. Существующие тесты адаптированы к новой модели настроек.
Добавлены `baseline.test.ts`, `weapons.test.ts`, `impacts.test.ts`.
Четыре неизменяемых snapshot сняты с исходного MVP до миграции: они проверяют все точки
preview, время полёта, контакт, энергию, кратер, число удалённых ячеек и checksum грунта.
Остальные тесты проверяют forces, lifecycle, cooldown, ID, очереди, snapshot параметров,
per-weapon overrides, порядок событий, повторное применение damage к копии terrain
и совпадение live/preview для обоих оружий.

Step 2: typecheck, lint, 54 теста и production build проходят. В браузере проверены
выстрелы обоих оружий, телеметрия попаданий и переключение; ошибок console нет.
Git baseline: commit `fc7262d`, tag `ballistic-mvp-v1`.
TypeScript ограничен совместимой веткой 6.0 из-за peer dependency `typescript-eslint`.

## Следующие точки расширения

| Файл                                       | Что расширять                                               |
| ------------------------------------------ | ----------------------------------------------------------- |
| `game/commands/GameCommand.ts`             | Команды юнитов, последовательности, будущая сетевая граница |
| `game/core/GameRuntime.ts`                 | Доставка команд, authoritative runtime, prediction          |
| `game/core/stepSimulation.ts`              | Порядок обновления сущностей и событий                      |
| `game/core/GameSnapshot.ts`                | Сериализация состояния; restore/протокол пока отсутствуют   |
| `game/weapons/weaponDefinitions.ts`        | Basic Cannon / Mortar, параметры запуска                    |
| `game/ballistics/projectileDefinitions.ts` | Физические параметры новых снарядов                         |
| `game/impacts/ImpactDefinition.ts`         | Данные будущих penetration / ricochet                       |
| `game/impacts/resolveImpact.ts`            | Разрешение попадания и новые типы последствий               |
| `game/terrain/terrainCollision.ts`         | Optional normal; вычисление нормалей для ricochet           |
| `game/terrain/damageTerrain.ts`            | Другие semantic damage operations                           |
| `game/terrain/TerrainGrid.ts`              | Chunking, dirty regions, журнал операций                    |
| `game/rendering/SceneRenderer.ts`          | Дополнительные слои, эффекты, отображение новых сущностей   |
| `game/rendering/viewport.ts`               | Преобразования координат для будущей камеры                 |

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
- Penetration и ricochet не реализованы; `normal` / `surfaceNormal` пока optional.
  При их добавлении понадобится расширить результат resolver и применение lifecycle:
  текущий impact завершает жизнь снаряда. Интегратор и terrain damage менять не требуется.

Полный перечень изменений и решений: [отчёт Step 2](STEP2_REPORT.md).

API интеграции: [официальная документация @pixi/react](https://github.com/pixijs/pixi-react),
[текстуры PixiJS](https://pixijs.com/8.x/guides/components/textures).
