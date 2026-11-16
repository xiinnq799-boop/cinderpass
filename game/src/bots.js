// bots.js — the fighters who are not the player: a brain per bot (plan,
// perceive, engage, plant, defuse) and the low-poly soldier each one wears.
// Brains steer through the waypoint graph, stop to shoot (moving ruins
// their spread too), hold angles on defence, and rotate on information:
// a teammate's sighting, a gunshot heard, the charge going down.

import { TEAM, emit } from './state.js';
import { WAYPOINTS, nearestNode, findPath, losClear, SITES } from './map.js';
import { stepMovement, eyePos, EYE_STAND } from './player.js';
import { tryFire, startReload, throwGrenade } from './weapons.js';

const _eye = { x: 0, y: 0, z: 0 }, _chest = { x: 0, y: 0, z: 0 };

// Cover/hold points per site: where a fighter stands and what they watch.
const HOLDS = {
  A: [
    { x: 24.2, z: -13.8, yaw: 2.6 }, { x: 35.8, z: -14.6, yaw: 2.2 },
    { x: 26.5, z: -24.5, yaw: -1.2 }, { x: 33, z: -15.8, yaw: 2.9 },
  ],
  B: [
    { x: 24.2, z: 13.8, yaw: -2.6 }, { x: 35.8, z: 25.5, yaw: -2.2 },
    { x: 27, z: 23.5, yaw: 1.2 }, { x: 33, z: 15.2, yaw: -2.9 },
  ],
  MID: [{ x: 0, z: 0, yaw: 1.57, high: true }, { x: -12.8, z: 3.8, yaw: -1.4 }, { x: 12.8, z: -5, yaw: 1.8 }],
};

export function newBrain() {
  return {
    state: 'advance', path: null, pathI: 0, dest: null,
    enemy: null, lastSeenAt: -99, lastSeenPos: null, reactAt: 0, aimErr: 0.05,
    thinkAt: 0, burstUntil: 0, pauseUntil: 0,
    holdPos: null, holdUntil: 0, role: 'cover', site: null,
    noisePos: null, noiseAt: -99, strafeDir: 1, strafeAt: 0,
    checkAt: Math.random() * 0.15,
  };
}

// --- team plans, dealt by rounds.js at the start of each round -------------

export function planRound(S) {
  const rng = S.rng;
  const jackals = S.fighters.filter((f) => f.team === TEAM.JACKAL);
  const wardens = S.fighters.filter((f) => f.team === TEAM.WARDEN);
  const siteKey = rng() < 0.5 ? 'A' : 'B';
  const split = rng() < 0.3;
  jackals.forEach((f, i) => {
    const b = f.brain; if (!b) return;
    b.site = split && i === jackals.length - 1 ? (siteKey === 'A' ? 'B' : 'A') : siteKey;
    b.role = S.bomb.carrier === f ? 'planter' : 'cover';
    b.state = 'advance'; b.path = null;
  });
  const spots = ['A', 'B', 'MID'];
  wardens.forEach((f, i) => {
    const b = f.brain; if (!b) return;
    b.site = spots[i % spots.length] === 'MID' ? null : spots[i % spots.length];
    b.role = 'holder'; b.state = 'advance'; b.path = null;
    const holds = HOLDS[spots[i % spots.length]];
    b.holdPos = holds[Math.floor(rng() * holds.length)];
  });
}

// --- perception --------------------------------------------------------------

function canSee(S, f, o, colliders, now) {
  const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 78) return false;
  if (dist > 7) {
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    if ((dx * fx + dz * fz) / dist < 0.34) return false; // ~70 deg half-angle
  }
  if (now < f.blindUntil) return false;
  eyePos(f, _eye);
  _chest.x = o.pos.x; _chest.y = o.pos.y + (o.crouch ? 0.72 : 1.15); _chest.z = o.pos.z;
  return losClear(colliders, _eye.x, _eye.y, _eye.z, _chest.x, _chest.y, _chest.z);
}

function perceive(S, f, colliders, now) {
  const b = f.brain;
  let seen = null;
  for (const o of S.fighters) {
    if (o.team === f.team || !o.alive) continue;
    if (canSee(S, f, o, colliders, now)) { seen = o; break; }
  }
  if (seen) {
    if (b.enemy !== seen) { b.reactAt = now + 0.26 + S.rng() * 0.22; b.aimErr = 0.055; }
    b.enemy = seen; b.lastSeenAt = now;
    b.lastSeenPos = { x: seen.pos.x, z: seen.pos.z };
    // word travels: teammates learn the position a moment later
    for (const t of S.fighters) {
      if (t.team === f.team && t.brain && t !== f && !t.brain.enemy) {
        t.brain.noisePos = { x: seen.pos.x, z: seen.pos.z }; t.brain.noiseAt = now;
      }
    }
  } else if (b.enemy && now - b.lastSeenAt > 0.4) {
    b.enemy = null;
  }
}

// --- steering ------------------------------------------------------------------

function setDest(S, f, x, z) {
  const b = f.brain;
  const from = nearestNode(f.pos.x, f.pos.z), to = nearestNode(x, z);
  b.path = findPath(from, to);
  b.pathI = 0;
  b.dest = { x, z };
}

// Move toward the current steering point; returns true on arrival.
function steer(S, f, dt, colliders, speedMul = 1) {
  const b = f.brain;
  let tx = b.dest?.x ?? f.pos.x, tz = b.dest?.z ?? f.pos.z;
  if (b.path && b.pathI < b.path.length) {
    const n = WAYPOINTS.nodes[b.path[b.pathI]];
    tx = n.x; tz = n.z;
    if (Math.hypot(tx - f.pos.x, tz - f.pos.z) < 1.0 && b.pathI < b.path.length - 1) {
      b.pathI++; const n2 = WAYPOINTS.nodes[b.path[b.pathI]]; tx = n2.x; tz = n2.z;
    }
  }
  const dx = tx - f.pos.x, dz = tz - f.pos.z;
  const dist = Math.hypot(dx, dz);
  const arrived = dist < (b.path && b.pathI < b.path.length - 1 ? 1.0 : 0.55);
  const prevMul = f.speedMul;
  f.speedMul = speedMul;
  if (dist > 0.05) {
    stepMovement(f, dx / dist, dz / dist, false, dt, colliders);
    if (!b.enemy && b.state !== 'hold') {
      const want = Math.atan2(-dx, -dz);
      f.yaw = turnToward(f.yaw, want, dt * 7);
    }
  } else {
    stepMovement(f, 0, 0, false, dt, colliders);
  }
  f.speedMul = prevMul;
  return arrived && (!b.path || b.pathI >= b.path.length - 1);
}

export function turnToward(cur, want, maxStep) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

// --- the brain tick --------------------------------------------------------------

export function stepBot(S, f, dt, colliders, now) {
  const b = f.brain;
  if (!f.alive) return;
  b.checkAt -= dt;
  if (b.checkAt <= 0) { b.checkAt = 0.13; perceive(S, f, colliders, now); }

  // Engage beats everything: stop, aim with settling error, burst fire.
  if (b.enemy && b.enemy.alive) {
    const e = b.enemy;
    const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2((e.pos.y + 1.15) - (f.pos.y + EYE_STAND), dist) * 0.9;
    b.aimErr = Math.max(0.011, b.aimErr - dt * 0.05);
    const err = (S.rng() - 0.5) * 2 * b.aimErr;
    f.yaw = turnToward(f.yaw, wantYaw + err, dt * 9);
    f.pitch = turnToward(f.pitch, wantPitch + err * 0.6, dt * 9);
    // hold position while fighting; shuffle a little between bursts
    if (now < b.pauseUntil && dist > 14) {
      if (now >= b.strafeAt) { b.strafeDir = S.rng() < 0.5 ? -1 : 1; b.strafeAt = now + 0.5 + S.rng() * 0.6; }
      const px = -dz / (dist || 1) * b.strafeDir, pz = dx / (dist || 1) * b.strafeDir;
      const prev = f.speedMul; f.speedMul = 0.45;
      stepMovement(f, px, pz, false, dt, colliders);
      f.speedMul = prev;
    } else {
      stepMovement(f, 0, 0, false, dt, colliders);
    }
    if (now >= b.reactAt) {
      if (now >= b.pauseUntil && now >= b.burstUntil) {
        b.burstUntil = now + 0.28 + S.rng() * 0.5;
      }
      if (now < b.burstUntil) {
        if (!tryFire(S, f, colliders, now) && f.gun.mag === 0) startReload(S, f, now);
      } else if (b.pauseUntil < now) {
        b.pauseUntil = now + 0.22 + S.rng() * 0.4;
        if (f.gun.mag <= 4) startReload(S, f, now);
      }
    }
    return;
  }

  // The charge is down: jackals guard it, wardens rush to defuse.
  if (S.bomb.planted) {
    if (f.team === TEAM.WARDEN) {
      const bp = S.bomb.pos;
      if (Math.hypot(bp.x - f.pos.x, bp.z - f.pos.z) < 1.6) {
        stepMovement(f, 0, 0, false, dt, colliders);
        b.state = 'defuse'; // rounds.js reads this and runs the channel
        return;
      }
      if (!b.dest || Math.hypot(b.dest.x - bp.x, b.dest.z - bp.z) > 2) setDest(S, f, bp.x, bp.z);
      steer(S, f, dt, colliders, 1);
      b.state = 'advance';
      return;
    }
    // jackal guard: nearest hold point of the planted site
    if (b.state !== 'hold') {
      const holds = HOLDS[S.bomb.site];
      let best = holds[0], bd = Infinity;
      for (const h of holds) { const d = Math.hypot(h.x - f.pos.x, h.z - f.pos.z); if (d < bd) { bd = d; best = h; } }
      b.holdPos = best; b.state = 'goto-hold';
    }
  }

  switch (b.state) {
    case 'advance': {
      if (!b.dest) {
        if (b.role === 'holder' && b.holdPos) setDest(S, f, b.holdPos.x, b.holdPos.z);
        else if (b.site) { const s = SITES[b.site]; setDest(S, f, s.x + (S.rng() - 0.5) * 3, s.z + (S.rng() - 0.5) * 3); }
        else setDest(S, f, f.pos.x, f.pos.z);
      }
      if (steer(S, f, dt, colliders, b.noiseAt > now - 3 ? 1 : 0.92)) {
        b.dest = null;
        if (b.role === 'planter') b.state = 'plant';
        else if (b.role === 'holder') b.state = 'hold';
        else {
          // cover fighters settle on a hold point of their site
          const holds = HOLDS[b.site || 'MID'];
          b.holdPos = holds[Math.floor(S.rng() * holds.length)];
          b.state = 'goto-hold';
        }
      }
      break;
    }
    case 'goto-hold': {
      if (!b.dest) setDest(S, f, b.holdPos.x, b.holdPos.z);
      if (steer(S, f, dt, colliders)) { b.dest = null; b.state = 'hold'; }
      break;
    }
    case 'hold': {
      stepMovement(f, 0, 0, false, dt, colliders);
      if (b.holdPos) f.yaw = turnToward(f.yaw, b.holdPos.yaw, dt * 3);
      f.crouch = !!b.holdPos?.high ? false : f.crouch;
      // stale information pulls a holder off their angle
      if (b.noisePos && now - b.noiseAt < 4 && f.team === TEAM.WARDEN && !S.bomb.planted) {
        if (S.rng() < 0.008) { setDest(S, f, b.noisePos.x, b.noisePos.z); b.state = 'investigate'; }
      }
      break;
    }
    case 'investigate': {
      if (steer(S, f, dt, colliders)) { b.dest = null; b.state = 'hold'; b.holdPos = { x: f.pos.x, z: f.pos.z, yaw: f.yaw }; }
      break;
    }
    case 'plant': {
      stepMovement(f, 0, 0, false, dt, colliders);
      // rounds.js watches the planter standing in the site and channels.
      break;
    }
    default: stepMovement(f, 0, 0, false, dt, colliders);
  }

  // A bot with a fresh noise report and no orders looks toward it.
  if (b.noisePos && now - b.noiseAt < 2.5 && b.state === 'hold') {
    const want = Math.atan2(-(b.noisePos.x - f.pos.x), -(b.noisePos.z - f.pos.z));
    f.yaw = turnToward(f.yaw, want, dt * 4);
  }
  if (f.gun.mag === 0) startReload(S, f, now);
}

// Noise feed: main/rounds call this when a shot event drains.
export function hearShot(S, pos, byTeam, now) {
  for (const f of S.fighters) {
    if (!f.brain || !f.alive || f.team === byTeam) continue;
    const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
    if (d < 27) { f.brain.noisePos = { x: pos.x, z: pos.z }; f.brain.noiseAt = now; }
  }
}

// --- the soldier each bot wears ------------------------------------------------

export function buildBotView(THREE, team) {
  const suit = new THREE.MeshStandardMaterial({ color: team === 'jackal' ? 0xa85a2c : 0x39685f, roughness: 0.85 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.7, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.8 });
  const group = new THREE.Group();
  const parts = {};
  const add = (geo, mat, x, y, z, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    group.add(m); if (name) parts[name] = m;
    return m;
  };
  add(new THREE.BoxGeometry(0.17, 0.78, 0.2), gear, -0.13, 0.39, 0, 'legL');
  add(new THREE.BoxGeometry(0.17, 0.78, 0.2), gear, 0.13, 0.39, 0, 'legR');
  add(new THREE.BoxGeometry(0.52, 0.66, 0.3), suit, 0, 1.1, 0, 'torso');
  add(new THREE.BoxGeometry(0.4, 0.3, 0.24), gear, 0, 1.18, -0.05, 'vest');
  const head = add(new THREE.SphereGeometry(0.16, 14, 10), skin, 0, 1.58, 0, 'head');
  add(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, 1.25), gear, 0, 1.62, 0, 'helm');
  add(new THREE.BoxGeometry(0.2, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.3 }), 0, 1.58, -0.15, 'visor');
  // arms + gun on a shoulder pivot so pitch reads at a glance
  const pivot = new THREE.Group(); pivot.position.set(0.18, 1.38, 0); group.add(pivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.52), suit);
  arm.position.set(0, -0.04, -0.2); arm.castShadow = true; pivot.add(arm);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.78), gear);
  gun.position.set(0, 0.02, -0.42); gun.castShadow = true; pivot.add(gun);
  const armL = add(new THREE.BoxGeometry(0.11, 0.46, 0.11), suit, -0.31, 1.16, -0.1, 'armL');
  armL.rotation.x = -0.7;
  group.userData.parts = parts;
  group.userData.pivot = pivot;
  group.userData.head = head;
  return group;
}

export function updateBotView(f, now, dt) {
  const g = f.view;
  if (!g) return;
  g.position.set(f.pos.x, f.pos.y, f.pos.z);
  const parts = g.userData.parts;
  if (!f.alive) {
    // fall where shot: tip over and settle
    g.rotation.x = Math.max(-Math.PI / 2 + 0.12, g.rotation.x - dt * 5);
    g.position.y = f.pos.y + 0.12;
    return;
  }
  g.rotation.set(0, f.yaw, 0);
  const sp = Math.hypot(f.vel.x, f.vel.z);
  const cyc = now * (4 + sp * 1.6);
  const swing = Math.min(1, sp / 3) * 0.5;
  parts.legL.rotation.x = Math.sin(cyc) * swing;
  parts.legR.rotation.x = -Math.sin(cyc) * swing;
  parts.legL.position.y = 0.39 + Math.abs(Math.sin(cyc)) * 0.03 * swing;
  parts.legR.position.y = 0.39 + Math.abs(Math.cos(cyc)) * 0.03 * swing;
  g.userData.pivot.rotation.x = f.pitch;
  const crouchK = f.crouch ? 0.32 : 0;
  g.position.y = f.pos.y - crouchK;
  parts.head.position.y = 1.58 - crouchK * 0.9;
}
