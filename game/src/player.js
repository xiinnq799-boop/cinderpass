// player.js — movement physics shared by the player and the bots: ground
// acceleration and friction, a weak air control, crouching, jumping, step-up
// onto low cover, and cylinder-vs-box collision. Accuracy lives elsewhere;
// this only decides where a fighter is.

import { groundHeight, collide } from './map.js';

export const EYE_STAND = 1.62, EYE_CROUCH = 1.16;
export const RADIUS = 0.36, HEIGHT = 1.78, HEIGHT_CROUCH = 1.3;
const WALK = 4.35, CROUCH_SPEED = 1.7, ACCEL = 42, FRICTION = 9.5, GRAVITY = 22, JUMP = 7.4;

export function eyeHeight(f) {
  return f.crouch ? EYE_CROUCH : EYE_STAND;
}

export function eyePos(f, out) {
  out.x = f.pos.x; out.y = f.pos.y + eyeHeight(f); out.z = f.pos.z;
  return out;
}

// wishX/wishZ: desired world-space move direction (not normalised by the
// caller beyond unit length), scaled by the caller's speed fraction.
export function stepMovement(f, wishX, wishZ, wantJump, dt, colliders) {
  const maxSpeed = (f.crouch ? CROUCH_SPEED : WALK) * (f.speedMul || 1);
  const groundY = groundHeight(colliders, f.pos.x, f.pos.z, f.pos.y);
  const onGround = f.pos.y <= groundY + 0.02 && f.vel.y <= 0.01;
  f.onGround = onGround;

  if (onGround) {
    f.pos.y = groundY;
    f.vel.y = 0;
    // friction, then accelerate toward the wish velocity
    const sp = Math.hypot(f.vel.x, f.vel.z);
    if (sp > 0) {
      const drop = sp * FRICTION * dt;
      const k = Math.max(0, sp - drop) / sp;
      f.vel.x *= k; f.vel.z *= k;
    }
    f.vel.x += wishX * ACCEL * dt;
    f.vel.z += wishZ * ACCEL * dt;
    const sp2 = Math.hypot(f.vel.x, f.vel.z);
    if (sp2 > maxSpeed) { f.vel.x *= maxSpeed / sp2; f.vel.z *= maxSpeed / sp2; }
    if (wantJump) { f.vel.y = JUMP; f.onGround = false; }
  } else {
    // air: gravity and a whisper of control
    f.vel.y -= GRAVITY * dt;
    f.vel.x += wishX * 2.4 * dt;
    f.vel.z += wishZ * 2.4 * dt;
  }

  f.pos.x += f.vel.x * dt;
  f.pos.y += f.vel.y * dt;
  f.pos.z += f.vel.z * dt;

  const floor = groundHeight(colliders, f.pos.x, f.pos.z, f.pos.y);
  if (f.pos.y < floor) { f.pos.y = floor; f.vel.y = 0; f.onGround = true; }
  if (f.pos.y < 0) { f.pos.y = 0; f.vel.y = 0; f.onGround = true; }
  collide(colliders, f.pos, RADIUS, f.crouch ? HEIGHT_CROUCH : HEIGHT);
  // collision may have pushed us into a new column; re-seat on its floor
  const floor2 = groundHeight(colliders, f.pos.x, f.pos.z, f.pos.y);
  if (f.onGround && f.pos.y < floor2) f.pos.y = floor2;
}

export function speedOf(f) {
  return Math.hypot(f.vel.x, f.vel.z);
}

// Mouse look for the human: yaw turns left/right, pitch clamps.
export function applyLook(f, dx, dy, sensitivity = 0.0021) {
  f.yaw -= dx * sensitivity;
  f.pitch -= dy * sensitivity;
  const lim = Math.PI / 2 - 0.01;
  f.pitch = Math.max(-lim, Math.min(lim, f.pitch));
}
