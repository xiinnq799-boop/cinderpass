// weapons.js — guns as data plus the hitscan that resolves them, reloads,
// weapon buying, and thrown charges (frag and flash). Accuracy is a cone
// whose size follows the shooter's state: still and crouched is tightest,
// moving opens it, airborne is wild — stopping to aim pays.
//
// Friendly bullets pass through teammates (nobody enjoys a bot emptying a
// magazine through its own line); thrown charges hurt everyone.

import { WEAPONS, GRENADES, emit } from './state.js';
import { rayHit, losClear, forwardVec } from './map.js';
import { eyePos, speedOf } from './player.js';

export function makeGun(key) {
  const def = WEAPONS[key];
  return { key, mag: def.mag, reserve: def.reserve, reloadingUntil: 0, nextShotAt: 0 };
}

// Every fighter starts a match with the sidearm drawn.
export function equipStart(f) {
  f.weapons = { primary: null, sidearm: makeGun('pistol') };
  f.gun = f.weapons.sidearm;
}

export function buyWeapon(f, key) {
  const def = WEAPONS[key];
  if (!def || f.money < def.price) return false;
  f.money -= def.price;
  f.weapons[def.slot] = makeGun(key);
  if (def.slot === 'primary') f.gun = f.weapons.primary;
  return true;
}

export function switchTo(f, slot) {
  const g = f.weapons[slot];
  if (g && g !== f.gun) { f.gun = g; f.gun.reloadingUntil = 0; return true; }
  return false;
}

export function spreadFor(f, def) {
  if (!f.onGround) return def.spreadAir;
  const sp = speedOf(f);
  let s = def.spreadStand + (def.spreadMove - def.spreadStand) * Math.min(1, sp / 4.35);
  if (f.crouch) s *= 0.62;
  return s;
}

const _eye = { x: 0, y: 0, z: 0 }, _dir = { x: 0, y: 0, z: 0 }, _hit = { x: 0, y: 0, z: 0 };

// Ray vs a fighter's sphere chain (three body spheres + a head sphere).
// Returns {t, head} or null.
function rayFighter(o, d, f, maxT) {
  const crouch = f.crouch;
  const spine = crouch ? [0.32, 0.6, 0.86] : [0.42, 0.88, 1.3];
  const radii = [0.33, 0.37, 0.33];
  let best = null;
  for (let i = 0; i < 3; i++) {
    const cy = f.pos.y + spine[i];
    const t = sphereT(o, d, f.pos.x, cy, f.pos.z, radii[i], maxT);
    if (t !== null && (!best || t < best.t)) best = { t, head: false };
  }
  const ht = sphereT(o, d, f.pos.x, f.pos.y + (crouch ? 1.06 : 1.56), f.pos.z, 0.215, maxT);
  if (ht !== null && (!best || ht < best.t + 0.12)) best = { t: ht, head: true };
  return best;
}

function sphereT(o, d, cx, cy, cz, r, maxT) {
  const ox = cx - o.x, oy = cy - o.y, oz = cz - o.z;
  const tca = ox * d.x + oy * d.y + oz * d.z;
  if (tca < 0 || tca > maxT) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}

export function damageFighter(S, victim, amount, attacker, head) {
  if (!victim.alive) return;
  let dmg = amount;
  if (victim.armor > 0) { const absorbed = dmg * 0.5; victim.armor = Math.max(0, victim.armor - absorbed); dmg -= absorbed; }
  victim.hp -= dmg;
  victim.lastDamageAt = S.time;
  victim.lastDamageFrom = attacker;
  emit(S, 'hit', { by: attacker, target: victim, head: !!head, killed: victim.hp <= 0 });
  if (victim.hp <= 0) {
    victim.hp = 0; victim.alive = false;
    victim.deaths++;
    if (attacker && attacker !== victim) { attacker.kills++; attacker.money = Math.min(9000, attacker.money + 300); }
    emit(S, 'kill', { by: attacker, victim, head: !!head });
  }
}

// Fire one trigger pull if the gun is ready. Returns true when a shot left.
export function tryFire(S, f, colliders, now) {
  const gun = f.gun, def = WEAPONS[gun.key];
  if (!f.alive || gun.reloadingUntil > now || now < gun.nextShotAt) return false;
  if (gun.mag <= 0) {
    gun.nextShotAt = now + 0.3;
    emit(S, 'dry', { by: f });
    startReload(S, f, now);
    return false;
  }
  gun.mag--;
  gun.nextShotAt = now + 60 / def.rpm;
  eyePos(f, _eye);
  emit(S, 'shot', { by: f, pos: { x: _eye.x, y: _eye.y, z: _eye.z }, key: gun.key });
  const spread = spreadFor(f, def);
  for (let p = 0; p < def.pellets; p++) {
    forwardVec(f.yaw, f.pitch, _dir);
    // gaussian-ish cone jitter from the match RNG
    const j = () => (S.rng() + S.rng() + S.rng() - 1.5) / 1.5;
    _dir.x += j() * spread; _dir.y += j() * spread; _dir.z += j() * spread;
    const il = 1 / Math.hypot(_dir.x, _dir.y, _dir.z);
    _dir.x *= il; _dir.y *= il; _dir.z *= il;
    const wallT = rayHit(colliders, _eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, def.range * 2);
    let bestT = wallT, bestFighter = null, bestHead = false;
    for (const o of S.fighters) {
      if (o === f || !o.alive || o.team === f.team) continue;
      const hit = rayFighter(_eye, _dir, o, bestT);
      if (hit && hit.t < bestT) { bestT = hit.t; bestFighter = o; bestHead = hit.head; }
    }
    _hit.x = _eye.x + _dir.x * bestT; _hit.y = _eye.y + _dir.y * bestT; _hit.z = _eye.z + _dir.z * bestT;
    emit(S, 'fx_tracer', { from: { x: _eye.x, y: _eye.y - 0.12, z: _eye.z }, to: { x: _hit.x, y: _hit.y, z: _hit.z }, color: def.tracer });
    if (bestFighter) {
      let dmg = def.damage * (bestHead ? def.headMult : 1);
      if (bestT > def.range) dmg *= Math.max(0.4, 1 - (bestT - def.range) / def.range * 0.6);
      damageFighter(S, bestFighter, dmg, f, bestHead);
    } else if (wallT < def.range * 2) {
      emit(S, 'fx_impact', { pos: { x: _hit.x, y: _hit.y, z: _hit.z } });
    }
  }
  // muzzle flash at the gun tip + recoil into the shooter's view
  forwardVec(f.yaw, f.pitch, _dir);
  emit(S, 'fx_muzzle', { pos: { x: _eye.x + _dir.x * 0.7, y: _eye.y - 0.14 + _dir.y * 0.7, z: _eye.z + _dir.z * 0.7 } });
  f.pitch += def.kick * (0.7 + S.rng() * 0.6);
  f.yaw += (S.rng() - 0.5) * def.kick * 0.7;
  if (gun.mag === 0) startReload(S, f, now);
  return true;
}

export function startReload(S, f, now) {
  const gun = f.gun, def = WEAPONS[gun.key];
  if (gun.reloadingUntil > now || gun.mag >= def.mag || gun.reserve <= 0) return false;
  gun.reloadingUntil = now + def.reloadMs / 1000;
  emit(S, 'reload', { by: f });
  return true;
}

// Finish reloads whose time has come. Called once per sim step.
export function updateGuns(S, now) {
  for (const f of S.fighters) {
    const gun = f.gun;
    if (gun && gun.reloadingUntil && now >= gun.reloadingUntil) {
      const def = WEAPONS[gun.key];
      const take = Math.min(def.mag - gun.mag, gun.reserve);
      gun.mag += take; gun.reserve -= take; gun.reloadingUntil = 0;
    }
  }
}

// --- thrown charges ---------------------------------------------------------

export function throwGrenade(S, f, kind, now) {
  if (!f.alive || f.grenades[kind] <= 0) return false;
  f.grenades[kind]--;
  eyePos(f, _eye);
  forwardVec(f.yaw, f.pitch + 0.16, _dir);
  S.projectiles.push({
    kind, by: f, team: f.team,
    pos: { x: _eye.x + _dir.x * 0.4, y: _eye.y, z: _eye.z + _dir.z * 0.4 },
    vel: { x: _dir.x * 13.5, y: _dir.y * 13.5 + 2.2, z: _dir.z * 13.5 },
    fuseAt: now + (kind === 'frag' ? 2.1 : 1.5),
    rest: false,
  });
  emit(S, 'throw', { by: f });
  return true;
}

export function stepProjectiles(S, dt, colliders, now) {
  const keep = [];
  for (const pr of S.projectiles) {
    if (now >= pr.fuseAt) { detonate(S, pr, colliders, now); continue; }
    if (!pr.rest) {
      pr.vel.y -= 18 * dt;
      pr.pos.x += pr.vel.x * dt; pr.pos.y += pr.vel.y * dt; pr.pos.z += pr.vel.z * dt;
      // bounce off boxes: if the point entered a box, push out on the
      // shallowest axis and reflect that velocity component, damped.
      for (const b of colliders) {
        if (pr.pos.x > b.x0 - 0.09 && pr.pos.x < b.x1 + 0.09 &&
            pr.pos.z > b.z0 - 0.09 && pr.pos.z < b.z1 + 0.09 &&
            pr.pos.y > b.y0 && pr.pos.y < b.y1 + 0.09) {
          if (pr.vel.y < 0 && pr.pos.y > b.y1 - 0.3) {
            pr.pos.y = b.y1 + 0.09;
            pr.vel.y = -pr.vel.y * 0.38; pr.vel.x *= 0.7; pr.vel.z *= 0.7;
            if (Math.abs(pr.vel.y) < 1.1) { pr.vel.y = 0; pr.rest = pr.pos.y <= b.y1 + 0.1; }
            emit(S, 'bounce', { pos: pr.pos });
          } else {
            const dl = pr.pos.x - (b.x0 - 0.09), dr = (b.x1 + 0.09) - pr.pos.x;
            const dn = pr.pos.z - (b.z0 - 0.09), df = (b.z1 + 0.09) - pr.pos.z;
            const m = Math.min(dl, dr, dn, df);
            if (m === dl) { pr.pos.x = b.x0 - 0.09; pr.vel.x = -Math.abs(pr.vel.x) * 0.4; }
            else if (m === dr) { pr.pos.x = b.x1 + 0.09; pr.vel.x = Math.abs(pr.vel.x) * 0.4; }
            else if (m === dn) { pr.pos.z = b.z0 - 0.09; pr.vel.z = -Math.abs(pr.vel.z) * 0.4; }
            else { pr.pos.z = b.z1 + 0.09; pr.vel.z = Math.abs(pr.vel.z) * 0.4; }
          }
        }
      }
      if (pr.pos.y < 0.09) {
        pr.pos.y = 0.09;
        pr.vel.y = -pr.vel.y * 0.38; pr.vel.x *= 0.7; pr.vel.z *= 0.7;
        if (Math.abs(pr.vel.y) < 1.1) { pr.vel.y = 0; pr.rest = true; }
        emit(S, 'bounce', { pos: pr.pos });
      }
    }
    keep.push(pr);
  }
  S.projectiles = keep;
}

function detonate(S, pr, colliders, now) {
  const def = GRENADES[pr.kind];
  const p = pr.pos;
  emit(S, pr.kind === 'frag' ? 'explosion' : 'flashbang', { pos: { x: p.x, y: p.y, z: p.z } });
  for (const f of S.fighters) {
    if (!f.alive) continue;
    const cx = f.pos.x, cy = f.pos.y + 0.9, cz = f.pos.z;
    const d = Math.hypot(cx - p.x, cy - p.y, cz - p.z);
    if (d > def.radius + 0.5) continue;
    if (!losClear(colliders, p.x, Math.max(0.4, p.y), p.z, cx, cy, cz)) continue;
    if (pr.kind === 'frag') {
      const dmg = def.damage * Math.max(0.08, 1 - d / (def.radius + 1.5));
      damageFighter(S, f, dmg, pr.by, false);
    } else {
      // flash: strength follows how squarely the fighter faces the burst
      eyePos(f, _eye);
      forwardVec(f.yaw, f.pitch, _dir);
      const away = ((p.x - _eye.x) * _dir.x + (p.z - _eye.z) * _dir.z) / Math.max(1, d);
      const facing = Math.max(0, away);
      const strength = (0.25 + 0.75 * facing) * Math.max(0, 1 - d / (def.radius + 2));
      if (strength > 0.12) {
        f.blindUntil = Math.max(f.blindUntil, now + def.blindSec * strength);
        if (f.isPlayer) emit(S, 'flashed', { strength });
      }
    }
  }
}
