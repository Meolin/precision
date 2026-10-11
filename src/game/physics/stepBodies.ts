import type { Vec2 } from '../math/Vec2';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { TerrainRect } from '../terrain/TerrainChunk';
import { bodyExtents, inverseInertia, inverseMass, type BodyState } from './Body';
import { shapeContact, sweepBodyTerrain, terrainContact, type BodyContact } from './bodyCollision';

const sleepSpeed = 0.08;
const sleepDelay = 0.45;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

function velocityAt(body: BodyState, arm: Vec2): Vec2 {
  return {
    x: body.velocity.x - body.angularVelocityRadPerSecond * arm.y,
    y: body.velocity.y + body.angularVelocityRadPerSecond * arm.x,
  };
}

function applyImpulse(body: BodyState, impulse: Vec2, arm: Vec2): void {
  const mass = inverseMass(body);
  body.velocity.x += impulse.x * mass;
  body.velocity.y += impulse.y * mass;
  body.angularVelocityRadPerSecond += cross(arm, impulse) * inverseInertia(body);
}

function resolveContact(
  a: BodyState,
  b: BodyState | null,
  contact: BodyContact,
  friction: number,
  restitution: number,
): void {
  const invA = inverseMass(a);
  const invB = b ? inverseMass(b) : 0;
  const invSum = invA + invB;
  if (invSum === 0) return;
  const n = contact.normal;
  const armA = {
    x: contact.contactPoint.x - a.position.x,
    y: contact.contactPoint.y - a.position.y,
  };
  const armB = b
    ? { x: contact.contactPoint.x - b.position.x, y: contact.contactPoint.y - b.position.y }
    : { x: 0, y: 0 };
  const va = velocityAt(a, armA);
  const vb = b ? velocityAt(b, armB) : { x: 0, y: 0 };
  const relativeX = vb.x - va.x;
  const relativeY = vb.y - va.y;
  const normalSpeed = relativeX * n.x + relativeY * n.y;
  if (normalSpeed < 0) {
    const bounce = normalSpeed < -0.5 ? restitution : 0;
    const torqueA = cross(armA, n);
    const torqueB = cross(armB, n);
    const normalMass =
      invSum + torqueA ** 2 * inverseInertia(a) + (b ? torqueB ** 2 * inverseInertia(b) : 0);
    const impulse = (-(1 + bounce) * normalSpeed) / normalMass;
    applyImpulse(a, { x: -n.x * impulse, y: -n.y * impulse }, armA);
    if (b) applyImpulse(b, { x: n.x * impulse, y: n.y * impulse }, armB);
    const nextA = velocityAt(a, armA);
    const nextB = b ? velocityAt(b, armB) : { x: 0, y: 0 };
    const tangent: Vec2 = { x: -n.y, y: n.x };
    const slip = (nextB.x - nextA.x) * tangent.x + (nextB.y - nextA.y) * tangent.y;
    const tangentA = cross(armA, tangent);
    const tangentB = cross(armB, tangent);
    const tangentMass =
      invSum + tangentA ** 2 * inverseInertia(a) + (b ? tangentB ** 2 * inverseInertia(b) : 0);
    const frictionImpulse = Math.max(
      -friction * impulse,
      Math.min(friction * impulse, -slip / tangentMass),
    );
    applyImpulse(a, { x: -tangent.x * frictionImpulse, y: -tangent.y * frictionImpulse }, armA);
    if (b)
      applyImpulse(b, { x: tangent.x * frictionImpulse, y: tangent.y * frictionImpulse }, armB);
  }
  const correction = (contact.penetration + 1e-5) / invSum;
  a.position.x -= n.x * correction * invA;
  a.position.y -= n.y * correction * invA;
  if (b) {
    b.position.x += n.x * correction * invB;
    b.position.y += n.y * correction * invB;
  }
}

function pairContact(a: BodyState, b: BodyState): BodyContact | null {
  return shapeContact(a.position, a.shape, b.position, b.shape, a.rotationRad, b.rotationRad);
}

/** Relative sweep covers body pairs that cross entirely within one fixed tick. */
function sweptPairContact(a: BodyState, b: BodyState): BodyContact | null {
  if (
    shapeContact(
      a.previousPosition,
      a.shape,
      b.previousPosition,
      b.shape,
      a.previousRotationRad,
      b.previousRotationRad,
    )
  )
    return null;
  const adx = a.position.x - a.previousPosition.x;
  const ady = a.position.y - a.previousPosition.y;
  const bdx = b.position.x - b.previousPosition.x;
  const bdy = b.position.y - b.previousPosition.y;
  const ea =
    a.shape.type === 'box'
      ? {
          x: Math.hypot(a.shape.halfWidth, a.shape.halfHeight),
          y: Math.hypot(a.shape.halfWidth, a.shape.halfHeight),
        }
      : bodyExtents(a);
  const eb =
    b.shape.type === 'box'
      ? {
          x: Math.hypot(b.shape.halfWidth, b.shape.halfHeight),
          y: Math.hypot(b.shape.halfWidth, b.shape.halfHeight),
        }
      : bodyExtents(b);
  if (
    Math.max(a.previousPosition.x, a.position.x) + ea.x <
      Math.min(b.previousPosition.x, b.position.x) - eb.x ||
    Math.max(b.previousPosition.x, b.position.x) + eb.x <
      Math.min(a.previousPosition.x, a.position.x) - ea.x ||
    Math.max(a.previousPosition.y, a.position.y) + ea.y <
      Math.min(b.previousPosition.y, b.position.y) - eb.y ||
    Math.max(b.previousPosition.y, b.position.y) + eb.y <
      Math.min(a.previousPosition.y, a.position.y) - ea.y
  )
    return null;
  const step = Math.max(0.05, Math.min(ea.x, ea.y, eb.x, eb.y) * 0.5);
  const travel =
    Math.hypot(adx - bdx, ady - bdy) +
    ea.x * Math.abs(a.rotationRad - a.previousRotationRad) +
    eb.x * Math.abs(b.rotationRad - b.previousRotationRad);
  const count = Math.max(1, Math.ceil(travel / step));
  for (let index = 1; index <= count; index++) {
    const fraction = index / count;
    const pa = {
      x: a.previousPosition.x + adx * fraction,
      y: a.previousPosition.y + ady * fraction,
    };
    const pb = {
      x: b.previousPosition.x + bdx * fraction,
      y: b.previousPosition.y + bdy * fraction,
    };
    const angleA = a.previousRotationRad + (a.rotationRad - a.previousRotationRad) * fraction;
    const angleB = b.previousRotationRad + (b.rotationRad - b.previousRotationRad) * fraction;
    const hit = shapeContact(pa, a.shape, pb, b.shape, angleA, angleB);
    if (!hit) continue;
    a.position = pa;
    b.position = pb;
    a.rotationRad = angleA;
    b.rotationRad = angleB;
    return hit;
  }
  return null;
}

/** Called only by stepSimulation. Input order does not affect pair resolution. */
export function stepBodies(
  bodies: BodyState[],
  terrain: TerrainGrid,
  gravity: number,
  dt: number,
): void {
  const ordered = [...bodies].sort((a, b) => a.id - b.id);
  const supported = new Set<number>();
  for (const body of ordered) {
    body.previousPosition = { ...body.position };
    body.previousRotationRad = body.rotationRad;
    if (body.kind === 'static' || body.sleeping) continue;
    if (body.kind === 'dynamic') body.velocity.y += gravity * dt;
    const target: Vec2 = {
      x: body.position.x + body.velocity.x * dt,
      y: body.position.y + body.velocity.y * dt,
    };
    body.rotationRad += body.angularVelocityRadPerSecond * dt;
    const hit = sweepBodyTerrain(terrain, body, body.position, target);
    body.position = hit?.position ?? target;
    if (hit) body.rotationRad = hit.rotationRad;
    if (hit) {
      if (body.kind === 'kinematic') {
        body.position.x -= hit.contact.normal.x * (hit.contact.penetration + 1e-5);
        body.position.y -= hit.contact.normal.y * (hit.contact.penetration + 1e-5);
        const normalSpeed =
          body.velocity.x * hit.contact.normal.x + body.velocity.y * hit.contact.normal.y;
        if (normalSpeed > 0) {
          body.velocity.x -= hit.contact.normal.x * normalSpeed;
          body.velocity.y -= hit.contact.normal.y * normalSpeed;
        }
      } else {
        resolveContact(body, null, hit.contact, body.friction * 0.75, body.restitution);
        if (hit.contact.normal.y > 0.5) supported.add(body.id);
      }
    }
  }
  for (let iteration = 0; iteration < 4; iteration++) {
    for (const body of ordered) {
      if (body.kind !== 'dynamic' || body.sleeping) continue;
      const contact = terrainContact(terrain, body);
      if (!contact) continue;
      resolveContact(body, null, contact, body.friction * 0.75, body.restitution);
      if (contact.normal.y > 0.5) supported.add(body.id);
    }
    for (let i = 0; i < ordered.length; i++)
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i]!;
        const b = ordered[j]!;
        if (a.kind !== 'dynamic' && b.kind !== 'dynamic') continue;
        if (a.sleeping && b.sleeping) continue;
        const contact = pairContact(a, b) ?? (iteration === 0 ? sweptPairContact(a, b) : null);
        if (!contact) continue;
        if (a.sleeping) wakeBody(a);
        if (b.sleeping) wakeBody(b);
        resolveContact(
          a,
          b,
          contact,
          Math.sqrt(a.friction * b.friction),
          Math.min(a.restitution, b.restitution),
        );
        if (contact.normal.y > 0.5) supported.add(a.id);
        if (contact.normal.y < -0.5) supported.add(b.id);
      }
  }
  for (const body of ordered) {
    if (body.kind !== 'dynamic' || body.sleeping) continue;
    if (supported.has(body.id)) {
      body.velocity.x *= Math.max(0, 1 - 0.2 * dt);
      body.angularVelocityRadPerSecond *= Math.max(0, 1 - 0.7 * dt);
    }
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    body.sleepSeconds =
      supported.has(body.id) &&
      speed < sleepSpeed &&
      Math.abs(body.angularVelocityRadPerSecond) < 0.08
        ? body.sleepSeconds + dt
        : 0;
    if (body.sleepSeconds >= sleepDelay) {
      body.sleeping = true;
      body.velocity = { x: 0, y: 0 };
      body.angularVelocityRadPerSecond = 0;
    }
  }
}

export function wakeBody(body: BodyState): void {
  if (body.kind !== 'dynamic') return;
  body.sleeping = false;
  body.sleepSeconds = 0;
}

/** Dirty cell bounds are expanded by each body's AABB, so lost support wakes it. */
export function wakeBodiesNearTerrainChange(
  bodies: BodyState[],
  rect: TerrainRect,
  cellSize: number,
): void {
  const left = rect.minX * cellSize;
  const top = rect.minY * cellSize;
  const right = (rect.maxX + 1) * cellSize;
  const bottom = (rect.maxY + 1) * cellSize;
  for (const body of bodies) {
    if (!body.sleeping) continue;
    const extent = bodyExtents(body);
    if (
      body.position.x + extent.x + cellSize < left ||
      body.position.x - extent.x - cellSize > right ||
      body.position.y + extent.y + cellSize < top ||
      body.position.y - extent.y - cellSize > bottom
    )
      continue;
    wakeBody(body);
  }
}
