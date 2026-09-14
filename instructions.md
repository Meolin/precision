# Project: Minimal 2D Ballistics RTS Prototype

## 0. Роль Codex

Ты работаешь как senior frontend/gameplay engineer.

Необходимо самостоятельно создать минимальный локальный прототип 2D-игры с видом сбоку.

Это не одноразовый технический demo-код. Архитектура должна позволять постепенно превратить проект в сетевую RTS с:

- несколькими юнитами;
- зданиями;
- экономикой;
- разрушаемым рельефом;
- ballistic weapons;
- fog of war;
- authoritative server;
- client prediction;
- replay;
- AI;
- различными типами оружия.

При этом текущий MVP должен оставаться максимально маленьким.

Не реализовывать перечисленные будущие системы сейчас.

Главный принцип:

> Сделать минимальное рабочее вертикальное ядро, но не создавать архитектурных тупиков.

---

# 1. Цель MVP

После запуска приложения должна открываться одна игровая сцена.

На сцене присутствуют:

1. процедурно созданный 2D-рельеф;
2. одно неподвижное орудие;
3. управление направлением ствола;
4. ballistic projectile;
5. гравитация;
6. ветер;
7. столкновение с рельефом;
8. разрушение рельефа в месте попадания;
9. техническая панель настройки физических параметров;
10. trajectory preview;
11. возможность быстро перезапустить сцену.

Никаких:

- врагов;
- здоровья;
- базы;
- ресурсов;
- AI;
- мультиплеера;
- аккаунтов;
- backend;
- matchmaking;
- сложного pathfinding.

---

# 2. Основной стек

Использовать:

- React 19+
- TypeScript
- Vite
- PixiJS 8
- `@pixi/react`
- Vitest
- ESLint
- Prettier

По возможности использовать актуальные stable версии.

Package manager:

- использовать существующий package manager проекта;
- если проект создаётся с нуля — npm.

Не использовать полноценный игровой движок.

Не использовать:

- Unity;
- Godot;
- Phaser;
- Matter.js;
- Box2D.

Физику снаряда реализовать самостоятельно.

---

# 3. Основной архитектурный принцип

Разделить приложение на три слоя:

```text
┌──────────────────────────────┐
│ React UI                     │
│ settings / debug / controls  │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Rendering                    │
│ PixiJS / @pixi/react         │
└──────────────┬───────────────┘
               │ reads
┌──────────────▼───────────────┐
│ Game Simulation             │
│ pure TypeScript             │
│ NO React / NO PixiJS        │
└──────────────────────────────┘
```

Самый важный слой:

```text
Game Simulation
```

Он не должен импортировать:

```text
react
pixi.js
@pixi/react
DOM API
window
document
```

Simulation должна потенциально запускаться:

```text
Browser Client
Node.js Server
Tests
Replay Runner
AI simulation
```

---

# 4. Не использовать React как game loop

Запрещено хранить обновляемые каждый frame координаты projectile в обычном React state.

Не делать:

```ts
setProjectile(...)
```

60 раз в секунду.

React используется для:

- layout;
- HUD;
- технических настроек;
- debug UI;
- кнопок;
- переключателей;
- lifecycle компонентов.

Game simulation живёт отдельно.

Rendering считывает состояние simulation.

React не является источником истины игрового мира.

---

# 5. Структура проекта

Ориентироваться примерно на:

```text
src/

  app/
    App.tsx
    App.css

  game/

    config/
      GameConfig.ts
      defaultGameConfig.ts

    core/
      GameRuntime.ts
      GameState.ts
      GameSnapshot.ts
      SimulationClock.ts

    commands/
      GameCommand.ts
      executeCommand.ts

    math/
      Vec2.ts
      clamp.ts

    terrain/
      TerrainGrid.ts
      generateTerrain.ts
      damageTerrain.ts
      terrainCollision.ts

    ballistics/
      Projectile.ts
      projectilePhysics.ts
      trajectoryPreview.ts

    entities/
      Cannon.ts

    rendering/
      GameCanvas.tsx
      GameScene.tsx
      TerrainLayer.tsx
      CannonLayer.tsx
      ProjectileLayer.tsx
      TrajectoryLayer.tsx
      DebugLayer.tsx

    input/
      useGameInput.ts

  ui/
    TechnicalPanel/
      TechnicalPanel.tsx
      TechnicalPanel.css

    HUD/
      HUD.tsx

  main.tsx
```

Это ориентир, а не требование создать лишние файлы ради файлов.

Если несколько небольших сущностей логичнее объединить — объединить.

---

# 6. Координатная система

Не привязывать simulation непосредственно к пикселям.

Использовать world units.

Предпочтительно:

```text
1 simulation unit = 1 meter
```

Rendering использует коэффициент:

```ts
pixelsPerMeter;
```

Например:

```ts
pixelsPerMeter = 20;
```

Таким образом:

```text
simulation:

x = 20 m
y = 10 m


render:

x = 400 px
y = 200 px
```

В simulation координата:

```text
+x → вправо
+y → вниз
```

или

```text
+y → вверх
```

может быть выбрана самостоятельно.

Главное:

- единая система;
- отсутствие хаотичных преобразований;
- хорошие названия функций преобразования;
- документирование решения.

---

# 7. GameConfig

Все параметры симуляции должны находиться в одном типизированном конфиге.

Не разбрасывать magic numbers по коду.

Создать примерно:

```ts
export interface GameConfig {
  simulation: {
    tickRate: number;
    maxFrameDeltaMs: number;
  };

  world: {
    widthMeters: number;
    heightMeters: number;
    pixelsPerMeter: number;
  };

  physics: {
    gravity: number;
    windAcceleration: number;
    airDrag: number;
  };

  projectile: {
    muzzleVelocity: number;
    massKg: number;
    radiusMeters: number;
    maxLifetimeSeconds: number;
  };

  terrain: {
    cellSizeMeters: number;
    baseCraterRadiusMeters: number;
    maxCraterRadiusMeters: number;
    energyToCraterScale: number;
  };

  cannon: {
    minAngleDeg: number;
    maxAngleDeg: number;
    barrelLengthMeters: number;
  };
}
```

Названия могут быть улучшены.

Главное — сохранить разделение ответственности.

---

# 8. Technical Settings Panel

Справа или слева от игровой сцены должна находиться React-панель:

```text
TECHNICAL SETTINGS

Simulation
─────────────────
Tick rate            60 Hz

World physics
─────────────────
Gravity               9.81
Wind                   0.00
Air drag               0.00

Projectile
─────────────────
Muzzle velocity       30.0 m/s
Mass                    5.0 kg
Radius                  0.12 m

Kinetic energy        2250 J

Terrain
─────────────────
Base crater             0.8 m
Energy scale            ...
Maximum crater          3.0 m

Debug
─────────────────
[x] trajectory
[x] velocity vector
[ ] collision samples

[Pause]
[Step]
[Reset Scene]
[Reset Settings]
```

Все основные числовые параметры должны иметь:

- numeric input;
- при необходимости slider;
- понятную единицу измерения.

---

# 9. Kinetic Energy

Не создавать независимые одновременно редактируемые параметры:

```text
velocity
mass
kinetic energy
```

потому что это физически избыточно.

Использовать:

```text
E = 0.5 * m * v²
```

Основными настройками являются:

```text
mass
muzzle velocity
```

А kinetic energy показывать как вычисляемое read-only значение:

```text
Kinetic energy: 2250 J
```

То же самое вычислять при столкновении используя реальную скорость projectile:

```ts
impactEnergy = 0.5 * projectile.mass * speedSquared;
```

Таким образом изменение:

```text
mass
velocity
```

реально влияет на разрушение рельефа.

---

# 10. Game State

Simulation state должен быть обычной TypeScript-структурой.

Например:

```ts
interface GameState {
  tick: number;

  cannon: CannonState;

  projectiles: ProjectileState[];

  terrain: TerrainGrid;
}
```

Не добавлять ECS на этом этапе.

Для одного орудия и нескольких projectile ECS будет преждевременным усложнением.

Но entity должны иметь ID:

```ts
type EntityId = number;
```

Чтобы позже можно было перейти к:

```text
units
buildings
projectiles
commands
network events
```

---

# 11. Fixed timestep

Simulation должна работать с фиксированным timestep.

Например:

```text
60 Hz
```

то есть:

```ts
dt = 1 / 60;
```

Rendering может работать:

```text
60 Hz
120 Hz
144 Hz
240 Hz
```

но simulation остаётся фиксированной.

Использовать accumulator pattern:

```text
frame delta
   ↓
accumulator
   ↓
while accumulator >= fixedDt
    stepSimulation(fixedDt)
```

Обязательно ограничить слишком большой frame delta после возвращения во вкладку.

Например:

```text
maxFrameDelta = 250 ms
```

---

# 12. Simulation API

Основная логика должна быть приблизительно такой:

```ts
stepSimulation(state, config, dt);
```

Она выполняет:

```text
apply commands
      ↓
update projectile physics
      ↓
detect terrain collisions
      ↓
resolve impacts
      ↓
modify terrain
      ↓
remove dead projectiles
      ↓
tick++
```

По возможности сделать logic максимально функциональной и тестируемой.

---

# 13. Cannon

Орудие:

- находится на рельефе;
- неподвижно;
- имеет основание;
- имеет вращающийся ствол;
- стреляет только вправо/вверх в первом MVP;
- имеет ограничение минимального и максимального угла.

Пример:

```text
          /
         /
        /
       O
──────███────────
```

Позиция cannon задаётся в simulation.

Rendering только отображает её.

---

# 14. Управление

Основное управление:

### Mouse

Движение мыши по игровой области:

```text
cannon → cursor
```

определяет направление ствола.

ЛКМ:

```text
FIRE
```

### Keyboard

Дополнительно:

```text
A / Left Arrow
    уменьшить угол

D / Right Arrow
    увеличить угол

Space
    выстрел

R
    reset scene

P
    pause
```

Не привязывать gameplay напрямую к DOM keydown handlers внутри simulation.

Input должен преобразовываться в command.

---

# 15. Commands

С первого MVP использовать command abstraction.

Например:

```ts
type GameCommand =
  | {
      type: "setAim";
      cannonId: number;
      angleRad: number;
    }
  | {
      type: "fire";
      cannonId: number;
    };
```

UI/Input создаёт command.

Simulation применяет command.

Не делать:

```ts
runtime.state.cannon.angle = ...
```

из React-компонента.

Правильно:

```text
Input
 ↓
GameCommand
 ↓
GameRuntime
 ↓
Simulation
```

---

# 16. Почему Commands обязательны

Это будущая точка перехода к сети.

Локально сейчас:

```text
React
 ↓
FireCommand
 ↓
local simulation
```

В будущем:

```text
React client
 ↓
FireCommand
 ↓
network
 ↓
authoritative server
 ↓
simulation
```

То есть gameplay API не придётся полностью переписывать.

---

# 17. Projectile

Projectile при создании должен иметь snapshot собственных параметров.

Пример:

```ts
interface ProjectileState {
  id: EntityId;

  position: Vec2;
  previousPosition: Vec2;

  velocity: Vec2;

  radius: number;
  massKg: number;

  lifetimeSeconds: number;

  alive: boolean;
}
```

При выстреле:

```text
barrel angle
+
muzzle velocity
```

определяют initial velocity.

Например:

```ts
vx = cos(angle) * velocity;
vy = sin(angle) * velocity;
```

с учётом выбранной системы координат.

---

# 18. Projectile Physics

Не использовать physics engine.

Минимальная физика:

```text
gravity
wind
air drag
```

При `airDrag = 0` движение должно соответствовать обычной ballistic trajectory.

Первый вариант может использовать semi-implicit Euler.

Например концептуально:

```ts
velocity += acceleration * dt;
position += velocity * dt;
```

Где:

```text
acceleration.x = wind
acceleration.y = gravity
```

Air drag реализовать минимально и предсказуемо.

Например как коэффициент, уменьшающий velocity.

Не пытаться реализовать полноценную аэродинамику.

---

# 19. Terrain Representation

Рельеф должен иметь simulation representation, независимое от PixiJS.

Для MVP использовать binary occupancy grid.

Например:

```text
0 = воздух
1 = грунт
```

Хранить данные компактно:

```ts
Uint8Array;
```

Пример:

```text
000000000000000
000000000000000
000000000000000
000001110000000
000111111100000
011111111111110
111111111111111
```

Не хранить каждый cell как JS object.

---

# 20. TerrainGrid API

Примерно:

```ts
terrain.isSolid(x, y);

terrain.setSolid(x, y, value);

terrain.worldToCell(position);

terrain.removeCircle(center, radius);

terrain.version;
```

`terrain.version` увеличивается только после изменения terrain.

Это позволит renderer понимать:

> нужно ли обновлять terrain texture.

---

# 21. Генерация Terrain

Для первой версии использовать простой процедурный heightmap.

Например:

```text
base height
+
несколько sine waves
+
seeded noise
```

Получить что-то вроде:

```text
           ___
      ____/   \__
_____/           \____
```

Не нужен сложный noise library.

Можно сделать собственную небольшую генерацию.

При необходимости использовать seeded PRNG.

Не использовать:

```ts
Math.random();
```

в simulation/game generation без seed.

Создать:

```ts
createSeededRandom(seed);
```

или эквивалент.

---

# 22. Spawn Cannon

После генерации terrain определить поверхность примерно на:

```text
15–20% ширины карты
```

и расположить cannon поверх земли.

Не прописывать Y cannon вручную.

Нужно использовать terrain query.

Например:

```ts
terrain.findSurfaceY(x);
```

---

# 23. Projectile ↔ Terrain Collision

Нельзя проверять только:

```ts
terrain.isSolid(projectile.position);
```

потому что быстрый projectile может пролететь через несколько cells за tick.

Использовать swept collision.

Минимальная реализация:

```text
previousPosition
       ↓
---------------- projectile path ----------------
       ↑
currentPosition
```

Разбить segment на достаточно маленькие интервалы.

Максимальный шаг sampling должен быть не больше примерно:

```text
terrainCellSize / 2
```

или использовать grid traversal.

Для MVP допустим sampling.

Алгоритм должен быть вынесен в отдельную функцию.

---

# 24. Impact

При первом столкновении с terrain:

1. определить приблизительную точку impact;
2. вычислить скорость projectile;
3. вычислить kinetic energy;
4. вычислить размер crater;
5. изменить terrain;
6. удалить projectile.

Например:

```ts
impactEnergy = 0.5 * mass * speed ** 2;
```

Crater:

```ts
radius = baseCraterRadius + sqrt(impactEnergy) * energyToCraterScale;
```

После чего:

```ts
radius = clamp(radius, minRadius, maxRadius);
```

Формула может быть немного изменена.

Важно:

- рост энергии должен увеличивать crater;
- изменение не должно становиться неконтролируемым;
- параметры должны быть доступны из Technical Settings.

---

# 25. Destructible Terrain

Для разрушения:

```ts
terrain.removeCircle(impactPosition, craterRadius);
```

Все cells внутри окружности становятся воздухом.

Пример:

```text
до

##################
##################
##################


после

##################
#######     ######
######       #####
#######     ######
```

Не делать пока:

- falling sand;
- erosion;
- collapsing terrain;
- debris physics;
- particles с физикой;
- structural simulation.

Terrain остаётся статическим после удаления cells.

---

# 26. Rendering Terrain

Simulation TerrainGrid является source of truth.

Rendering не должен иметь отдельную физическую terrain-модель.

Для отображения можно использовать:

```text
Offscreen Canvas / Canvas
        ↓
ImageData
        ↓
Pixi texture
        ↓
Sprite
```

или другой эффективный PixiJS-подход.

Не создавать тысячи React-компонентов для terrain cells.

Запрещено:

```text
<GroundCell />
<GroundCell />
<GroundCell />
... × 100000
```

При изменении:

```ts
terrain.version;
```

обновить terrain texture.

Для MVP допустимо перерисовать всю terrain texture после impact.

Архитектурно оставить возможность позже обновлять только dirty chunks.

---

# 27. Terrain Visual Style

Пока использовать простой debug-friendly стиль.

Например:

```text
sky:
dark blue/gray

terrain:
dark muted brown/gray

terrain edge:
slightly brighter

cannon:
neutral metallic

projectile:
bright contrasting point
```

Не тратить время на полноценный art direction.

Главное:

- хорошо видеть поверхность;
- видеть crater;
- видеть projectile;
- видеть trajectory.

---

# 28. Renderer

Renderer должен быть dumb относительно gameplay.

Например:

```text
CannonLayer

получает:
position
angle

и рисует cannon
```

Он не решает:

- можно ли стрелять;
- какая velocity;
- произошло ли столкновение;
- какой crater создать.

Этим занимается simulation.

---

# 29. Trajectory Preview

Показывать пунктирную предполагаемую траекторию.

Важно:

trajectory preview должна использовать ту же physics logic, что и настоящий projectile.

Не писать отдельную ballistic формулу, которая постепенно начнёт расходиться с simulation.

Предпочтительный вариант:

```ts
simulateTrajectoryPreview(...)
```

внутри использует общий:

```ts
stepProjectile(...)
```

с копией projectile state.

Preview:

- ограничена по времени;
- ограничена по количеству точек;
- останавливается при столкновении с terrain.

Например:

```text
                    ·
                ·
            ·
        ·
    ·
CANNON
```

---

# 30. Debug visualization

Добавить toggle:

```text
Show trajectory
Show velocity vector
Show impact marker
Show terrain grid
Show collision samples
```

По умолчанию:

```text
trajectory = true
velocity vector = false
terrain grid = false
collision samples = false
```

Не делать debug UI слишком сложным.

---

# 31. HUD

Минимальный HUD показывает:

```text
ANGLE
42.3°

MUZZLE VELOCITY
30 m/s

PROJECTILE MASS
5 kg

MUZZLE ENERGY
2250 J
```

Если projectile находится в воздухе:

```text
SPEED
27.4 m/s

CURRENT ENERGY
1876 J
```

После последнего impact:

```text
IMPACT ENERGY
1642 J

CRATER
1.37 m
```

---

# 32. Pause / Step

Technical panel должен иметь:

```text
Pause
Resume
Step
```

`Step` при pause выполняет ровно:

```text
1 simulation tick
```

Это сильно поможет дальнейшей разработке физики.

---

# 33. Reset Scene

Кнопка:

```text
Reset Scene
```

должна:

- пересоздать terrain с тем же seed;
- удалить projectile;
- вернуть cannon;
- сбросить simulation tick.

Добавить также:

```text
New Terrain
```

которая использует новый seed.

---

# 34. Reset Settings

Кнопка:

```text
Reset Physics
```

возвращает default config.

Config должен иметь отдельный:

```ts
defaultGameConfig;
```

Не дублировать defaults внутри UI.

---

# 35. React Settings State

UI settings можно хранить обычным React state/context.

Если состояние начинает становиться неудобным — разрешается Zustand.

Но для текущего MVP:

> не добавлять Zustand только потому, что он существует.

Предпочитать минимальное количество dependencies.

---

# 36. Runtime

Создать объект уровня:

```ts
GameRuntime;
```

который владеет:

```text
GameState
GameConfig
Command Queue
Simulation Clock
```

Пример API:

```ts
runtime.enqueueCommand(command);

runtime.step();

runtime.reset();

runtime.getState();

runtime.updateConfig(...);
```

Это не обязательный точный API.

Смысл:

> React не должен самостоятельно координировать simulation.

---

# 37. Future Network Boundary

Архитектура должна предполагать, что позже вместо:

```text
runtime.enqueueCommand(command)
```

появится:

```text
network.send(command)
```

А authoritative server выполнит:

```text
serverRuntime.enqueueCommand(command)
```

Поэтому GameCommand должен быть serializable.

Использовать данные:

```text
number
string
boolean
array
plain objects
```

Не передавать:

```text
class instances
DOM objects
Pixi objects
functions
```

---

# 38. Tick

Каждая simulation update должна иметь:

```ts
tick: number;
```

Commands архитектурно должны позволять позже добавить:

```ts
tick;
sequence;
playerId;
```

Но сейчас не нужно искусственно добавлять multiplayer complexity.

---

# 39. Snapshot-ready State

Simulation state должен быть потенциально сериализуемым.

Это понадобится для:

```text
network snapshots
replays
save/load
debugging
AI
```

Terrain может иметь отдельную сериализацию из-за `Uint8Array`.

Не требуется прямо сейчас реализовывать полноценные snapshots по сети.

Но нельзя строить state вокруг PixiJS объектов.

---

# 40. Determinism Rules

Не требуется абсолютный lockstep determinism между разными компьютерами.

Будущая сеть предполагается:

```text
authoritative server
+
client prediction/interpolation
```

Тем не менее simulation должна быть воспроизводимой настолько, насколько разумно.

Поэтому:

- fixed timestep;
- seeded random;
- никаких `Date.now()` внутри gameplay logic;
- никаких React timestamps внутри simulation;
- никаких случайных вызовов `Math.random()`.

---

# 41. Future Server Compatibility

Код должен позволять впоследствии вынести:

```text
game/core
game/math
game/terrain
game/ballistics
game/entities
game/commands
game/config
```

в отдельный package:

```text
packages/game-simulation
```

и подключить его:

```text
apps/client
apps/server
```

Но monorepo прямо сейчас создавать не нужно.

Не переусложнять MVP.

---

# 42. Performance Rules

Не оптимизировать преждевременно.

Но соблюдать очевидные правила.

### Нельзя

- React rerender всего дерева 60 раз/сек;
- объект на каждый terrain cell;
- React component на каждый terrain cell;
- пересоздавать terrain grid каждый frame;
- делать JSON deep clone game state каждый frame.

### Можно

- mutable internal simulation state;
- typed arrays;
- refs;
- PixiJS imperative updates внутри rendering adapter;
- texture regeneration после terrain destruction.

---

# 43. Projectile Rendering

Rendering projectile может обновляться каждый visual frame.

Если simulation идёт 60 Hz, а rendering 144 Hz, предусмотреть interpolation между:

```text
previousPosition
currentPosition
```

Например:

```ts
renderPosition = lerp(previousPosition, position, alpha);
```

Где:

```text
alpha =
accumulator / fixedDt
```

Даже если первая реализация будет простой, архитектура clock должна позволять interpolation.

---

# 44. Camera

Для MVP камера фиксированная.

Показывать всю карту.

Не реализовывать:

- zoom;
- pan;
- camera follow.

Но world → screen conversion держать отдельно, чтобы позже камера могла быть добавлена.

---

# 45. Responsive Layout

Desktop является основным target.

Layout:

```text
┌──────────────────────────────────────────────┐
│ HUD                                          │
├───────────────────────────────────┬──────────┤
│                                   │ SETTINGS │
│                                   │          │
│            GAME                   │ Physics  │
│            CANVAS                 │ Terrain  │
│                                   │ Debug    │
│                                   │          │
├───────────────────────────────────┴──────────┤
│ optional debug/status bar                    │
└──────────────────────────────────────────────┘
```

При недостатке ширины Technical Panel может переходить вниз.

Canvas должен корректно resize.

Изменение размера canvas не должно менять simulation coordinates.

---

# 46. Types

Использовать TypeScript strict mode.

Не использовать:

```ts
any;
```

без очень веской причины.

Не злоупотреблять type assertions:

```ts
as Something
```

Предпочитать реальные типы.

---

# 47. Tests

Добавить unit tests минимум для следующих вещей.

## Ballistics

При:

```text
gravity = 0
wind = 0
drag = 0
```

projectile движется по прямой.

---

При:

```text
gravity > 0
wind = 0
drag = 0
```

vertical velocity изменяется ожидаемо.

---

## Kinetic energy

Проверить:

```ts
0.5 * mass * velocity²
```

---

## Terrain destruction

После:

```ts
removeCircle();
```

cells внутри crater пусты.

Cells далеко за crater остаются без изменений.

---

## Collision

Projectile segment, пересекающий terrain, должен зарегистрировать impact.

Высокоскоростной projectile не должен проходить сквозь один terrain cell.

---

## Seeded terrain

Один seed:

```text
12345
```

должен создавать одинаковый terrain.

---

# 48. Dev Quality

После реализации выполнить:

```text
npm run typecheck
npm run lint
npm run test
npm run build
```

Если scripts называются иначе — использовать реальные scripts проекта.

Исправить найденные ошибки.

Не оставлять проект в состоянии:

```text
works only in dev mode
```

---

# 49. README

Создать короткий README.

Он должен объяснять:

## Run

```bash
npm install
npm run dev
```

## Controls

```text
Mouse       aim
LMB         fire
A/D         adjust angle
Space       fire
P           pause
R           reset
```

## Architecture

Кратко объяснить:

```text
React UI
Pixi rendering
Pure TS simulation
```

И почему simulation изолирована от rendering.

---

# 50. Visual Requirements

Не делать интерфейс похожим на стандартный bootstrap/admin dashboard.

Technical panel должна выглядеть как:

```text
game development tool
/
physics sandbox
```

Использовать:

- тёмную тему;
- компактные numeric inputs;
- моноширинные значения там, где это полезно;
- чёткие группы параметров;
- минимальные borders;
- хорошую визуальную иерархию.

Не тратить время на сложные animations.

---

# 51. Definition of Done

MVP считается законченным, если выполняется следующий сценарий.

### Scenario

1. Я запускаю приложение.
2. Вижу side-view terrain.
3. В левой части карты стоит cannon.
4. Двигаю мышь.
5. Barrel следует за aim.
6. Вижу predicted trajectory.
7. Нажимаю ЛКМ.
8. Projectile вылетает из barrel.
9. Projectile движется с gravity.
10. При ненулевом wind траектория изменяется.
11. Projectile сталкивается с terrain.
12. Terrain получает crater.
13. Размер crater зависит от impact kinetic energy.
14. Я увеличиваю muzzle velocity.
15. Следующий projectile летит быстрее.
16. Его kinetic energy увеличивается.
17. Размер разрушения увеличивается.
18. Я меняю gravity.
19. Trajectory preview сразу отражает изменение.
20. Я могу Pause.
21. Я могу выполнить один simulation Step.
22. Я могу Reset Scene.
23. Новый terrain генерируется через New Terrain.
24. TypeScript compilation проходит без ошибок.
25. Unit tests проходят.
26. Production build проходит.

---

# 52. Что НЕ реализовывать

Не добавлять без необходимости:

```text
multiplayer
WebSocket
backend
database
authentication
ECS framework
Redux
complex state manager
physics engine
pathfinding
AI
health
damage to units
buildings
resources
particles system
sound system
screen shake
mobile controls
weapons inventory
save system
replay UI
map editor
fog of war
camera system
procedural biomes
advanced shaders
lighting engine
```

Если что-либо из этого кажется полезным:

> оставить понятную extension point, но не реализовывать систему.

---

# 53. Architectural extension points

После MVP архитектура должна позволять последовательно добавить:

```text
Projectile
   ↓
Weapon
   ↓
Unit
   ↓
Multiple units
   ↓
Selection
   ↓
Commands
   ↓
Buildings
   ↓
Economy
   ↓
Fog of war
   ↓
Networking
```

Terrain:

```text
TerrainGrid
   ↓
Chunked Terrain
   ↓
dirty chunks
   ↓
terrain operation log
   ↓
network terrain events
```

Networking:

```text
local command
   ↓
serializable command
   ↓
client command queue
   ↓
server validation
   ↓
authoritative simulation
```

Rendering:

```text
single scene
   ↓
camera
   ↓
culling
   ↓
effects
```

---

# 54. Terrain Network Readiness

Особенно важно:

разрушение terrain должно происходить через semantic operation.

Например:

```ts
applyTerrainDamage({
  type: "circle",
  center,
  radius,
});
```

А не через произвольное редактирование Pixi texture.

В будущем сервер сможет отправить:

```text
TerrainDamageEvent
x
y
radius
tick
```

и клиент применит ту же операцию.

---

# 55. Projectile Network Readiness

Создание projectile тоже должно быть отдельным событием внутри simulation.

Будущая сеть должна иметь возможность описать projectile приблизительно так:

```ts
{
  (id, spawnTick, position, velocity, radius, mass);
}
```

Не реализовывать network protocol сейчас.

Просто не создавать архитектуру, которая этому препятствует.

---

# 56. Последовательность реализации

Выполнять работу примерно в таком порядке.

## Phase 1

Создать приложение:

```text
React
TypeScript
Vite
PixiJS
```

Убедиться, что canvas отображается.

---

## Phase 2

Создать:

```text
GameConfig
GameState
GameRuntime
fixed timestep
```

Без terrain.

---

## Phase 3

Создать TerrainGrid.

Сгенерировать terrain.

Отобразить его.

---

## Phase 4

Добавить cannon.

Добавить aim.

---

## Phase 5

Добавить projectile.

Добавить gravity.

Добавить fixed-step ballistic simulation.

---

## Phase 6

Добавить terrain collision.

---

## Phase 7

Добавить crater destruction.

---

## Phase 8

Связать crater radius с kinetic energy.

---

## Phase 9

Добавить trajectory preview.

---

## Phase 10

Добавить Technical Settings Panel.

---

## Phase 11

Добавить:

```text
Pause
Step
Reset
New Terrain
```

---

## Phase 12

Добавить unit tests.

---

## Phase 13

Проверить:

```text
typecheck
lint
tests
build
```

---

# 57. Правило изменения архитектуры

Если в процессе реализации обнаружится, что какая-либо конкретная структура из этой спецификации мешает сделать код проще и качественнее:

можно изменить конкретную реализацию.

Но необходимо сохранить фундаментальные принципы:

```text
Pure TS simulation
Fixed timestep
Serializable commands
Simulation independent from rendering
Terrain represented in simulation
PixiJS only as renderer
React primarily for UI
No gameplay state tied to React lifecycle
No unnecessary systems
Future authoritative-server compatibility
```

---

# 58. Приоритеты

Если возникает выбор между:

```text
более красивый UI
```

и

```text
правильное simulation ядро
```

выбирать simulation.

Если возникает выбор между:

```text
больше features
```

и

```text
простая расширяемая архитектура
```

выбирать архитектуру.

Если возникает выбор между:

```text
абстракция на будущее
```

и

```text
реальная необходимость сейчас
```

не создавать абстракцию, если не видно конкретной extension point.

---

# 59. Конечный результат

После завершения показать:

1. краткое описание созданной архитектуры;
2. итоговую структуру директорий;
3. основные архитектурные решения;
4. команды запуска;
5. результаты tests/typecheck/build;
6. известные ограничения MVP;
7. какие файлы являются основными extension points для следующего этапа.

Не останавливаться только на создании skeleton.

В конце должен существовать реально запускаемый и интерактивный MVP.
