import { clamp, type Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { bodyExtents, type BodyShape, type BodyState } from './Body';

/** Normal points from the first shape into the second. No state is changed here. */
export interface BodyContact {
  normal: Vec2;
  penetration: number;
  contactPoint: Vec2;
}

function rotate(point: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

function boxFace(
  center: Vec2,
  shape: Extract<BodyShape, { type: 'box' }>,
  angle: number,
  direction: Vec2,
): { center: Vec2; tangent: Vec2; halfLength: number } {
  const local = rotate(direction, -angle);
  const useX = Math.abs(local.x) >= Math.abs(local.y);
  const offset = rotate(
    useX
      ? { x: Math.sign(local.x) * shape.halfWidth, y: 0 }
      : { x: 0, y: Math.sign(local.y) * shape.halfHeight },
    angle,
  );
  return {
    center: { x: center.x + offset.x, y: center.y + offset.y },
    tangent: rotate(useX ? { x: 0, y: 1 } : { x: 1, y: 0 }, angle),
    halfLength: useX ? shape.halfHeight : shape.halfWidth,
  };
}

export function shapeContact(
  a: Vec2,
  aShape: BodyShape,
  b: Vec2,
  bShape: BodyShape,
  aAngle = 0,
  bAngle = 0,
): BodyContact | null {
  if (aShape.type === 'box' && bShape.type === 'box') {
    const axes = [
      rotate({ x: 1, y: 0 }, aAngle),
      rotate({ x: 0, y: 1 }, aAngle),
      rotate({ x: 1, y: 0 }, bAngle),
      rotate({ x: 0, y: 1 }, bAngle),
    ];
    const delta = { x: b.x - a.x, y: b.y - a.y };
    let best: BodyContact | null = null;
    for (let index = 0; index < axes.length; index++) {
      const axis = axes[index]!;
      const au = rotate(axis, -aAngle);
      const bu = rotate(axis, -bAngle);
      const ra = Math.abs(au.x) * aShape.halfWidth + Math.abs(au.y) * aShape.halfHeight;
      const rb = Math.abs(bu.x) * bShape.halfWidth + Math.abs(bu.y) * bShape.halfHeight;
      const signedDistance = delta.x * axis.x + delta.y * axis.y;
      const penetration = ra + rb - Math.abs(signedDistance);
      if (penetration <= 0) return null;
      if (!best || penetration < best.penetration) {
        const normal = signedDistance >= 0 ? axis : { x: -axis.x, y: -axis.y };
        const faceA = boxFace(a, aShape, aAngle, normal);
        const faceB = boxFace(b, bShape, bAngle, { x: -normal.x, y: -normal.y });
        const reference = index < 2 ? faceA : faceB;
        const incident = index < 2 ? faceB : faceA;
        const tangent = reference.tangent;
        const project = (point: Vec2) => point.x * tangent.x + point.y * tangent.y;
        const referenceCenter = project(reference.center);
        const incidentCenter = project(incident.center);
        const incidentHalfLength =
          incident.halfLength *
          Math.abs(incident.tangent.x * tangent.x + incident.tangent.y * tangent.y);
        const overlapMin = Math.max(
          referenceCenter - reference.halfLength,
          incidentCenter - incidentHalfLength,
        );
        const overlapMax = Math.min(
          referenceCenter + reference.halfLength,
          incidentCenter + incidentHalfLength,
        );
        const tangentPosition =
          overlapMin <= overlapMax ? (overlapMin + overlapMax) / 2 : referenceCenter;
        const normalPosition =
          (faceA.center.x * normal.x +
            faceA.center.y * normal.y +
            faceB.center.x * normal.x +
            faceB.center.y * normal.y) /
          2;
        best = {
          normal,
          penetration,
          contactPoint: {
            x: normal.x * normalPosition + tangent.x * tangentPosition,
            y: normal.y * normalPosition + tangent.y * tangentPosition,
          },
        };
      }
    }
    return best;
  }
  if (aShape.type === 'circle' && bShape.type === 'circle') {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const penetration = aShape.radius + bShape.radius - distance;
    return penetration > 0
      ? {
          normal: distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 1 },
          penetration,
          contactPoint: {
            x: a.x + (distance > 0 ? dx / distance : 0) * aShape.radius,
            y: a.y + (distance > 0 ? dy / distance : 1) * aShape.radius,
          },
        }
      : null;
  }
  if (aShape.type === 'box' && bShape.type === 'circle') {
    const reversed = shapeContact(b, bShape, a, aShape, bAngle, aAngle);
    return reversed
      ? {
          normal: { x: -reversed.normal.x, y: -reversed.normal.y },
          penetration: reversed.penetration,
          contactPoint: reversed.contactPoint,
        }
      : null;
  }
  if (aShape.type !== 'circle' || bShape.type !== 'box') return null;
  const local = rotate({ x: a.x - b.x, y: a.y - b.y }, -bAngle);
  let nearestX = clamp(local.x, -bShape.halfWidth, bShape.halfWidth);
  let nearestY = clamp(local.y, -bShape.halfHeight, bShape.halfHeight);
  const dx = nearestX - local.x;
  const dy = nearestY - local.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= aShape.radius) return null;
  if (distance > 0) {
    const normal = rotate({ x: dx / distance, y: dy / distance }, bAngle);
    const point = rotate({ x: nearestX, y: nearestY }, bAngle);
    return {
      normal,
      penetration: aShape.radius - distance,
      contactPoint: { x: b.x + point.x, y: b.y + point.y },
    };
  }
  // Circle center inside a box: take its nearest exit face.
  const faces = [
    { depth: local.x + bShape.halfWidth, normal: { x: -1, y: 0 } },
    { depth: bShape.halfWidth - local.x, normal: { x: 1, y: 0 } },
    { depth: local.y + bShape.halfHeight, normal: { x: 0, y: -1 } },
    { depth: bShape.halfHeight - local.y, normal: { x: 0, y: 1 } },
  ];
  faces.sort((left, right) => left.depth - right.depth);
  const face = faces[0]!;
  if (face.normal.x !== 0) nearestX = face.normal.x * bShape.halfWidth;
  else nearestY = face.normal.y * bShape.halfHeight;
  const point = rotate({ x: nearestX, y: nearestY }, bAngle);
  return {
    normal: rotate({ x: -face.normal.x, y: -face.normal.y }, bAngle),
    penetration: aShape.radius + face.depth,
    contactPoint: { x: b.x + point.x, y: b.y + point.y },
  };
}

/** Bounds limit queries to the intersecting CPU occupancy cells and their chunks. */
export function terrainContact(
  terrain: TerrainGrid,
  body: BodyState,
  position: Vec2 = body.position,
  rotationRad = body.rotationRad,
): BodyContact | null {
  const extent =
    body.shape.type === 'circle'
      ? { x: body.shape.radius, y: body.shape.radius }
      : {
          x:
            body.shape.halfWidth * Math.abs(Math.cos(rotationRad)) +
            body.shape.halfHeight * Math.abs(Math.sin(rotationRad)),
          y:
            body.shape.halfWidth * Math.abs(Math.sin(rotationRad)) +
            body.shape.halfHeight * Math.abs(Math.cos(rotationRad)),
        };
  const size = terrain.cellSizeMeters;
  const left = Math.max(0, Math.floor((position.x - extent.x) / size));
  const right = Math.min(terrain.columns - 1, Math.floor((position.x + extent.x) / size));
  const top = Math.max(0, Math.floor((position.y - extent.y) / size));
  const bottom = Math.min(terrain.rows - 1, Math.floor((position.y + extent.y) / size));
  const cellShape: BodyShape = { type: 'box', halfWidth: size / 2, halfHeight: size / 2 };
  let best: BodyContact | null = null;
  let tied = 0;
  if (right < left || bottom < top) return null;
  const chunkSize = terrain.chunkSizeCells;
  for (let chunkY = Math.floor(top / chunkSize); chunkY <= Math.floor(bottom / chunkSize); chunkY++)
    for (
      let chunkX = Math.floor(left / chunkSize);
      chunkX <= Math.floor(right / chunkSize);
      chunkX++
    ) {
      const chunk = terrain.getChunk({ column: chunkX, row: chunkY })!;
      const localLeft = Math.max(0, left - chunk.originX);
      const localRight = Math.min(chunk.width - 1, right - chunk.originX);
      const localTop = Math.max(0, top - chunk.originY);
      const localBottom = Math.min(chunk.height - 1, bottom - chunk.originY);
      for (let localY = localTop; localY <= localBottom; localY++)
        for (let wordX = localLeft >>> 5; wordX <= localRight >>> 5; wordX++) {
          let bits = chunk.collision[localY * chunk.wordsPerRow + wordX] ?? 0;
          // Mask out cells outside the body's AABB without touching material data.
          if (wordX === localLeft >>> 5) bits &= 0xffffffff << (localLeft & 31);
          if (wordX === localRight >>> 5) bits &= 0xffffffff >>> (31 - (localRight & 31));
          while (bits !== 0) {
            const bit = 31 - Math.clz32(bits & -bits);
            const column = chunk.originX + wordX * 32 + bit;
            const row = chunk.originY + localY;
            const contact = shapeContact(
              position,
              body.shape,
              { x: (column + 0.5) * size, y: (row + 0.5) * size },
              cellShape,
              rotationRad,
            );
            if (contact) {
              if (!best || contact.penetration > best.penetration + 1e-5) {
                best = contact;
                tied = 1;
              } else if (
                Math.abs(contact.penetration - best.penetration) <= 1e-5 &&
                contact.normal.x * best.normal.x + contact.normal.y * best.normal.y > 0.99
              ) {
                best.contactPoint.x += contact.contactPoint.x;
                best.contactPoint.y += contact.contactPoint.y;
                tied++;
              }
            }
            bits &= bits - 1;
          }
        }
    }
  if (best && tied > 1) {
    best.contactPoint.x /= tied;
    best.contactPoint.y /= tied;
  }
  return best;
}

/** Fixed spatial samples and binary refinement prevent crossing a thin occupied cell. */
export function sweepBodyTerrain(
  terrain: TerrainGrid,
  body: BodyState,
  from: Vec2,
  to: Vec2,
): { position: Vec2; rotationRad: number; contact: BodyContact } | null {
  const extent = bodyExtents(body);
  const worldWidth = terrain.columns * terrain.cellSizeMeters;
  const worldHeight = terrain.rows * terrain.cellSizeMeters;
  if (
    (from.y - extent.y > worldHeight && to.y - extent.y > worldHeight) ||
    (from.x - extent.x > worldWidth && to.x - extent.x > worldWidth) ||
    (from.x + extent.x < 0 && to.x + extent.x < 0)
  )
    return null;
  if (terrainContact(terrain, body, from, body.previousRotationRad)) return null;
  const angularRadius =
    body.shape.type === 'circle'
      ? body.shape.radius
      : Math.hypot(body.shape.halfWidth, body.shape.halfHeight);
  const distance =
    Math.hypot(to.x - from.x, to.y - from.y) +
    angularRadius * Math.abs(body.rotationRad - body.previousRotationRad);
  const steps = Math.max(1, Math.ceil(distance / (terrain.cellSizeMeters * 0.5)));
  for (let index = 1; index <= steps; index++) {
    const fraction = index / steps;
    const sample = {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    };
    const angle =
      body.previousRotationRad + (body.rotationRad - body.previousRotationRad) * fraction;
    if (!terrainContact(terrain, body, sample, angle)) continue;
    let low = (index - 1) / steps;
    let high = fraction;
    for (let iteration = 0; iteration < 8; iteration++) {
      const middle = (low + high) / 2;
      const point = { x: from.x + (to.x - from.x) * middle, y: from.y + (to.y - from.y) * middle };
      const middleAngle =
        body.previousRotationRad + (body.rotationRad - body.previousRotationRad) * middle;
      if (terrainContact(terrain, body, point, middleAngle)) high = middle;
      else low = middle;
    }
    const position = { x: from.x + (to.x - from.x) * high, y: from.y + (to.y - from.y) * high };
    const hitAngle =
      body.previousRotationRad + (body.rotationRad - body.previousRotationRad) * high;
    return {
      position,
      rotationRad: hitAngle,
      contact: terrainContact(terrain, body, position, hitAngle)!,
    };
  }
  return null;
}
