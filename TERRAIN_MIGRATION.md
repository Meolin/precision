# Hybrid terrain migration

## Аудит исходного пути

- Авторитетное состояние уже находилось в `TerrainGrid.cells`: `Uint8Array` материалов `Air`, `Soil`, `Rock`.
- Кратеры и каналы пробития применялись через сериализуемые `TerrainDamageEvent` и `circle`/`capsule` operations.
- Снаряды использовали swept sampling по сетке; установки находили поверхность локальным вертикальным sampling. Physics polygon colliders в gameplay не было.
- Marching Squares использовался только `terrainRaster.worker.ts`: при каждой новой версии worker копировал всю material grid, заново строил все контуры и полный bitmap. `TerrainLayer` затем заменял одну texture всей карты.
- Следовательно, безопасная миграция не требовала менять impact/explosion pipeline: нужно было заменить storage occupancy и визуальный adapter, сохранив `TerrainGrid` API.

## Реализованный путь

1. `TerrainGrid` теперь строит chunks настраиваемого размера (`256` по умолчанию). В каждом chunk occupancy упакована в `Uint32Array`; material map остаётся отдельным `Uint8Array`.
2. `isSolid`, swept projectile collision, surface normals, blast occlusion и unit grounding читают авторитетную bitmask через прежний API.
3. Circle damage вычисляет горизонтальные spans только в bounding box взрыва, очищает целые диапазоны битов и публикует `TerrainChangeResult` с modified pixels, affected chunks и dirty rectangles. Capsule damage использует тот же change journal.
4. `TerrainLayer` читает изменения без их consumption/mutation, расширяет dirty bounds на один cell для edge treatment и объединяет работу по chunk.
5. Worker получает только dirty-регион одного chunk с material halo. Он строит цвет+alpha из бинарной маски и повышает разрешение с antialiasing; contour extraction отсутствует.
6. Pixi хранит отдельную texture на chunk. Основная сцена и миникарта используют одни и те же textures; нормальный gameplay не выполняет GPU readback.
7. Debug overlay: `F3` — CPU collision mask, `F4` — chunk boundaries, `F5` — последний dirty rectangle. Overlay показывает collision query count, modified pixels, affected chunks и последнее worker raster time.

## Benchmark

Локальный one-shot benchmark выполнен 18 сентября 2026 на production-size сетке `1800 × 320`, 100 детерминированных взрывов радиусом 4–10 m.

| Путь                                                          |   CPU time |
| ------------------------------------------------------------- | ---------: |
| Старый: crater + полный Marching Squares после каждого взрыва | 2897.36 ms |
| Новый: local circle spans + chunk bitmask/dirty journal       |    5.49 ms |

В этом запуске CPU speedup составил `527.86×`. Старый путь рассматривал до `57,600,000` map cells; суммарная площадь новых dirty bounds — `248,116` cells (`≈232×` меньше). Это направленный microbenchmark, а не обещание одинакового frame-time ratio на каждом GPU. Worker отдельно сообщает `visualUpdateMs` для фактических локальных raster jobs.

## Оставшиеся зависимости

Marching Squares, contour regeneration, polygon terrain colliders и terrain meshes в normal gameplay path отсутствуют. Material-aware penetration и visual material registry сохранены намеренно. Персистентный save/load и network transport не добавлены, но terrain changes остаются компактными сериализуемыми operations, а dirty chunk data пригодны для будущих snapshots.
