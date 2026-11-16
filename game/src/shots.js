// shots.js — composed stills for the entry's screenshots. The game reads
// ?shot=<mode>&seed=<n> and freezes a truthful moment of play: real state,
// real HUD, real models, rendered by the same loop as a live match. Modes:
// start (buy phase, charge in hand), play (the A-entry fight), buy (the
// buy menu with a full wallet), plant (the charge down at B, defuse race),
// end (the match-over screen, final score and the way back in).

import { TEAM } from './state.js';
import { makeGun } from './weapons.js';
import { SPAWNS } from './map.js';

function give(f, key, mag) {
  const g = makeGun(key);
  if (mag !== undefined) g.mag = mag;
  f.weapons[g.key === 'pistol' ? 'sidearm' : 'primary'] = g;
  f.gun = g;
}

function place(f, x, z, yaw, pitch = 0) {
  f.pos.x = x; f.pos.z = z; f.pos.y = 0;
  f.yaw = yaw; f.pitch = pitch;
}

export function setupShot(S, mode, { fx }) {
  const P = S.player;
  const byName = Object.fromEntries(S.fighters.map((f) => [f.name, f]));
  const rook = byName.Rook, vex = byName.Vex;
  const hale = byName.Hale, ilsa = byName.Ilsa, moss = byName.Moss;
  S.round = 1; S.score.jackal = 0; S.score.warden = 0;

  if (mode === 'start') {
    S.phase = 'buy'; S.phaseEndsAt = 9;
    place(P, SPAWNS.jackal[0].x, SPAWNS.jackal[0].z, -Math.PI / 2, 0.01);
    place(rook, -37.5, -1.5, -Math.PI / 2);
    place(vex, -37.5, -6.5, -Math.PI / 2);
    place(hale, SPAWNS.warden[0].x, SPAWNS.warden[0].z, Math.PI / 2);
    place(ilsa, SPAWNS.warden[1].x, SPAWNS.warden[1].z, Math.PI / 2);
    place(moss, SPAWNS.warden[2].x, SPAWNS.warden[2].z, Math.PI / 2);
    S.bomb.carrier = P;
    P.money = 800;
  } else if (mode === 'play') {
    S.phase = 'live'; S.phaseEndsAt = 63; S.round = 3;
    S.score.jackal = 2; S.score.warden = 1;
    place(P, 20.5, -12.9, -1.148, 0.03);
    give(P, 'carbine', 17);
    P.hp = 78; P.armor = 60; P.money = 2650; P.grenades.frag = 1;
    place(hale, 28.5, -16.5, 1.99, -0.02);
    give(hale, 'carbine', 22);
    place(ilsa, 35.2, -14.8, 2.8);
    place(rook, 24, -21, -1.9);
    give(rook, 'scatter');
    place(vex, 8, -3, -1.57);
    place(moss, 36, -24.5, 0.6);
    S.bomb.carrier = rook;
    // the fight, frozen mid-exchange: two tracers crossing the lane
    fx.tracer({ x: 20.5, y: 1.5, z: -12.9 }, { x: 28.3, y: 1.35, z: -16.4 }, 0xffe9b0, 0);
    fx.tracer({ x: 28.5, y: 1.5, z: -16.5 }, { x: 21.6, y: 1.05, z: -13.4 }, 0xbfe3ff, 0);
    fx.impact({ x: 28.3, y: 1.35, z: -16.4 }, 0, 8);
  } else if (mode === 'buy') {
    S.phase = 'buy'; S.phaseEndsAt = 8; S.round = 4;
    S.score.jackal = 2; S.score.warden = 2;
    place(P, SPAWNS.jackal[2].x, SPAWNS.jackal[2].z, -Math.PI / 2, 0.01);
    give(P, 'scatter');
    P.money = 3400; P.armor = 0; P.grenades.flash = 1;
    place(rook, -40, -5, -Math.PI / 2);
    place(vex, -40, 5, -Math.PI / 2);
    place(hale, SPAWNS.warden[0].x, SPAWNS.warden[0].z, Math.PI / 2);
    place(ilsa, SPAWNS.warden[1].x, SPAWNS.warden[1].z, Math.PI / 2);
    place(moss, SPAWNS.warden[2].x, SPAWNS.warden[2].z, Math.PI / 2);
    S.bomb.carrier = rook;
  } else if (mode === 'end') {
    S.phase = 'over'; S.round = 11;
    S.score.jackal = 7; S.score.warden = 4;
    P.kills = 9; P.deaths = 5;
    place(P, 18, -6, -1.35, 0.02);
    give(P, 'carbine', 21);
    P.hp = 46; P.armor = 30; P.money = 3900;
    place(rook, 15.5, -10.5, -1.2);
    give(rook, 'scatter');
    place(vex, 21.5, -2.5, -1.8);
    place(hale, 30, -18, 2.6);
    place(ilsa, 33, -12, 2.9);
    place(moss, 27, -24, 1.1);
    S.bomb.carrier = null;
  } else { // plant
    S.phase = 'planted'; S.phaseEndsAt = 23; S.round = 6;
    S.score.jackal = 3; S.score.warden = 2;
    S.bomb.planted = true; S.bomb.site = 'B';
    S.bomb.pos = { x: 30, y: 0.25, z: 20 };
    S.bomb.detonateAt = 23; S.bomb.plantedAt = -17;
    place(P, 24.8, 15.6, -2.5, 0.02);
    give(P, 'carbine', 9);
    P.hp = 54; P.armor = 25; P.money = 1150;
    place(ilsa, 30.9, 20.8, 0.8);
    ilsa.crouch = true;
    place(moss, 35.5, 24.5, -2.4);
    place(rook, 24, 24.2, -0.7);
    give(rook, 'carbine', 19);
    place(vex, 12, 3, -1.2);
    place(hale, 33, 6, 3.0);
    fx.tracer({ x: 24.8, y: 1.5, z: 15.6 }, { x: 34.8, y: 1.2, z: 23.9 }, 0xffe9b0, 0);
  }
  for (const f of S.fighters) if (!f.view && !f.isPlayer) f.alive = true;
}
