# Текущее состояние проекта

_Срез подготовлен по исходникам, README и отчётам Step 2–7. Это описание репозитория, а не результат нового запуска приложения или тестов._

## Реализовано

Проект находится после Step 7: локальный 2D RTS-полигон с четырьмя стационарными установками игрока и четырьмя целевыми установками.

- Fixed-timestep баллистика: гравитация, ветер, drag, траекторный preview и численный ballistic aim solver.
- Три оружейных/снарядных профиля, weapon overrides и техническая панель.
- Destructible terrain: seeded material map, авторитетная chunked `Uint32Array` collision mask, swept projectile collision, локальные кратеры и capsule-каналы пробития.
- Углы контакта, нормали, детерминированный рикошет и безопасное продолжение полёта.
- Установки с ownership, круговыми hitbox, здоровьем, прямым уроном, смертью и damage popups.
- Взрывы: AoE falloff, terrain occlusion и один crater pipeline.
- RTS-слой: single/shift/box selection, hover, control groups, AttackGround/AttackTarget/Stop, очереди приказов и групповой огонь.
- Pixi-рендеринг с независимыми terrain chunk textures и mask-derived сглаживанием, камера/миникарта, debug overlays и post-processing.
- Встроенный Animation Sandbox: multi-PNG stages, alignment/milestones, crossfade/reveal/dissolve,
  групповое редактирование кадров, progress scrub/play, onion skin, edge-only blend modes,
  тест в реальной Pixi-сцене и production JSON schema v2.

## Проверки

Доступные команды:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
```

Исторически для Step 2 подтверждены typecheck, lint, build и 54 теста. Для Step 4 подтверждён прежний набор из 89 тестов до финальной миграции; финальная проверка Step 4 не зафиксирована. В отчётах Step 6 и Step 7 typecheck/lint/build указаны как пройденные в соответствующих этапах, но добавленные regression-тесты и browser-проверки намеренно не запускались. Поэтому текущее прохождение полного набора следует установить свежим запуском команд выше.

## Известные ограничения

- Установки стационарны: нет движения, pathfinding, unit collision avoidance или перехвата движущихся целей.
- Нет multiplayer/network protocol, replay, AI, экономики, gameplay-системы строительства или ECS.
  Animation Sandbox добавляет только presentation/runtime player и временное тестовое здание вне `GameState`.
- Terrain не осыпается; точность ограничена ячейкой 0.2 m. Взрывная волна мгновенна, без delayed detonators, fragmentation, armor и status effects.
- Solver синхронный, ограниченный и без кэша; производительность массовых залпов не измерялась.
- Preview показывает не более одного рикошета; остаток fixed tick после контакта не доинтегрируется.
- Некоторые расширенные тесты созданы для Step 6/7, но их прохождение не заявлено историческими отчётами.

## Ближайшие безопасные направления

1. Запустить и исправить полный regression-набор, затем выполнить ручную браузерную проверку RTS-сценариев.
2. Добавить измерение производительности для максимальной очереди/залпа и solver.
3. Выбрать следующий продуктовый шаг отдельно: мобильность и pathfinding, более богатые combat-правила либо networking/replay.

## Первичные источники

- Базовая спецификация: `instructions.md`.
- Реализованные изменения: `STEP2_REPORT.md`, `STEP3_REPORT.md`, `STEP4_REPORT.md`, `STEP6_REPORT.md`, `STEP7_REPORT.md`.
- Пользовательское описание и управление: `README.md`.
