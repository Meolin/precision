# Архитектура Ballistics Lab

## Обзор

Проект разделён на детерминированное ядро симуляции и адаптеры представления. `GameRuntime` создаётся вне React и владеет `GameState`, конфигурацией, очередью команд и `SimulationClock`. React отображает UI; Pixi читает итоговое состояние; DOM-ввод преобразуется в команды.

```text
React UI / DOM input                  Pixi renderer
      │                                      ▲
      ├── GameCommand ──► GameRuntime ──► GameState
      │                       │                 │
      │                       ▼                 │
      │                 stepSimulation ─────────┘
      │                       │
      │        commands → orders → weapons → projectile physics
      │                       │
      └──────────────── collision → impacts / combat / explosions → terrain
```

## Слои и владение

| Слой           | Каталоги                                                              | Ответственность                                                          |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Application/UI | `app`, `ui`                                                           | React layout, настройки, HUD и телеметрия; не владеет миром.             |
| Runtime        | `game/core`                                                           | Часы, пауза/step/reset, очередь команд, fixed tick, snapshot.            |
| Gameplay       | `commands`, `orders`, `entities`, `weapons`, `ballistics`, `movement` | Модель установок, приказы, выбор оружия, solver и полёт.                 |
| Resolution     | `collision`, `impacts`, `combat`, `explosions`, `terrain`             | Геометрические факты, pure resolutions, damage/events и изменение сетки. |
| Adapters       | `client`, `input`, `rendering`, `effects`                             | Камера, client-only selection, DOM/Pixi и визуальные эффекты.            |

## Tick и события

`SimulationClock` накапливает длительность кадров и вызывает fixed tick. `stepSimulation` обрабатывает команды, обновляет приказы и установки, продвигает снаряды, а затем применяет последствия в стабильном порядке.

`state.events` содержит только данные текущего тика: spawn/impact/resolve/damage/explosion/terrain-damage события. В начале следующего тика он очищается. `lastImpact` и отладочный путь — отдельные каналы для HUD/debug, не журнал истории.

```text
FireCommand → fireInstallation → ProjectileState → advanceProjectile
    → queryProjectileCollision → ImpactEvent / EntityImpactEvent
    → resolveImpact | resolveEntityDamage | resolveExplosion
    → TerrainDamageEvent / EntityDamageEvent → apply state mutation
```

Коллизия определяет первый контакт, нормаль и точку касания. Она не принимает gameplay-решение. `resolveImpact` выбирает `stop`, `penetrate` или `ricochet` и возвращает semantic terrain operation; только обработчик события изменяет `TerrainGrid`.

## Данные мира

- `GameConfig` хранит мир, генерацию, RTS-параметры и per-weapon runtime overrides. Неизменяемые registries definitions — источник defaults.
- `GameState` содержит установки, снаряды, terrain, очередь текущих событий и краткую телеметрию.
- `InstallationState` — стационарная управляемая сущность с ownership, здоровьем, оружием и очередью приказов.
- `TerrainGrid` хранит `Uint8Array` материалов `Air`/`Soil`/`Rock` и авторитетную occupancy-маску в chunks по 256×256 ячеек. Каждый chunk упаковывает 32 горизонтальные ячейки в слово `Uint32`; version и журнал dirty-изменений позволяют renderer и preview замечать локальные изменения.
- Снаряд копирует параметры, нужные для стабильного полёта, при spawn. Настройки оружия действуют на следующие выстрелы; изменения сил действуют со следующего тика.

## Рендеринг и клиентское состояние

Pixi получает состояние от runtime через `GameCanvas`/`GameScene`. `TerrainLayer` читает журнал dirty-прямоугольников, объединяет изменения по chunk и передаёт Web Worker только локальную material-область с небольшим halo. Worker строит сглаженный mask-derived bitmap без контуров; отдельная Pixi texture каждого затронутого chunk обновляется независимо. CPU occupancy остаётся единственным источником collision, GPU/Canvas не читаются обратно. Preview использует те же helpers полёта и impact, но делает временную копию terrain для скола. React получает только компактную телеметрию с ограниченной частотой, а не обновляет дерево на каждый игровой кадр.

Анимация строительства проходит отдельной presentation-цепочкой:

```text
Animation Sandbox UI → BuildingAnimationConfig → BuildingAnimationPlayer → SceneRenderer / PixiJS
                                                    ↑
                                      production buildProgress 0..1
```

`BuildingAnimationConfig` schema v2 сериализуем и хранит только стабильные `assetId`; Object URL
загруженных локально PNG остаются в React preview-state. Помимо стадий и переходов конфиг содержит
alpha-content bounds, размер sprite в world units, редактируемый hitbox, blend mode перехода и
настройки texture sampling/mipmaps/anisotropy. `BuildingAnimationPlayer` не импортирует React и не
владеет таймером: `setProgress(0..1)` вычисляет stage/transition из глобального progress. Временное
тестовое здание живёт в слое `SceneRenderer`, использует текущие camera/terrain/world units и не
изменяет `GameState`. Crossfade, reveal и shader dissolve используют один player как в sandbox,
так и в production-вызове; будущие VFX и sound events отделены от transition schema.

`SelectionState` и `RtsController` — client-side: selection, hover, рамка выделения и control groups. Они переводят намерение игрока в `GameCommand`; `GameState` остаётся пригодным для server/replay.

## Границы расширения

Чистое ядро и serializable commands/snapshots оставляют путь к сети и replay, но сами эти системы отсутствуют. Новые виды оружия расширяются definitions и resolver-профилями; новые entity/hitbox типы — collision candidate/query, без смешивания с terrain impacts.
