// state.js — the one place match state lives, plus every tuning table.
// No three.js here: the simulation reads and writes this store, the
// renderer and HUD only read it.

// Deterministic RNG (mulberry32) so a seed always plays the same match —
// the screenshot modes lean on that.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEAM = { JACKAL: 'jackal', WARDEN: 'warden' };
// Jackals attack: they carry the breach charge to site A or B and plant it.
// Wardens defend: stop the plant, or defuse the charge once it is down.

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 26, headMult: 4,
    rpm: 340, auto: false, mag: 12, reserve: 48, reloadMs: 1100,
    spreadStand: 0.006, spreadMove: 0.02, spreadAir: 0.05, range: 60,
    pellets: 1, kick: 0.011, tracer: 0xbfe3ff,
  },
  scatter: {
    name: 'Mule Scattergun', slot: 'primary', price: 900, damage: 9, headMult: 2,
    rpm: 78, auto: false, mag: 6, reserve: 24, reloadMs: 2400,
    spreadStand: 0.045, spreadMove: 0.06, spreadAir: 0.09, range: 26,
    pellets: 8, kick: 0.05, tracer: 0xffd9a0,
  },
  carbine: {
    name: 'Kestrel Carbine', slot: 'primary', price: 2400, damage: 33, headMult: 4,
    rpm: 600, auto: true, mag: 30, reserve: 90, reloadMs: 1900,
    spreadStand: 0.009, spreadMove: 0.028, spreadAir: 0.06, range: 90,
    pellets: 1, kick: 0.016, tracer: 0xffe9b0,
  },
  longshot: {
    name: 'Heron Longshot', slot: 'primary', price: 3200, damage: 97, headMult: 2,
    rpm: 44, auto: false, mag: 5, reserve: 20, reloadMs: 2600,
    spreadStand: 0.0015, spreadMove: 0.05, spreadAir: 0.09, range: 160,
    pellets: 1, kick: 0.07, tracer: 0xfff3d0, scope: true,
  },
};

export const GRENADES = {
  frag: { name: 'Frag charge', price: 300, radius: 6.5, damage: 92 },
  flash: { name: 'Flash charge', price: 200, radius: 13, blindSec: 3.2 },
};

export const ECONOMY = {
  start: 800, win: 1400, loss: 900, kill: 300, plantTeam: 300, defuse: 300,
  armorPrice: 650, maxMoney: 9000,
};

export const MATCH = {
  roundsToWin: 7, maxRounds: 12, buySec: 12, roundSec: 100,
  plantSec: 5, defuseSec: 10, bombSec: 40, endSec: 4.5, teamSize: 3,
};

// A combatant: the player is one of these too (isPlayer), driven by input
// instead of the bot brain. Positions are feet-centre; eye height derives
// from crouch. `gun` is the live weapon instance (def key + ammo counts).
export function makeFighter(team, name, isPlayer) {
  return {
    team, name, isPlayer: !!isPlayer,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, crouch: false, onGround: true,
    hp: 100, armor: 0, alive: true,
    money: ECONOMY.start,
    weapons: { primary: null, sidearm: 'pistol' },
    gun: null, // {key, mag, reserve, reloadingUntil, nextShotAt}
    grenades: { frag: 0, flash: 0 },
    speedMul: 1,
    // bot brain scratch
    brain: null,
    // per-frame render handles, filled by the view layer
    view: null,
    lastDamageAt: -99, lastDamageFrom: null,
    blindUntil: 0, deafUntil: 0,
    kills: 0, deaths: 0,
  };
}

export function newMatchState(rng) {
  return {
    rng,
    phase: 'menu', // menu | buy | live | planted | end | over
    phaseAt: 0, phaseEndsAt: 0,
    round: 0, score: { jackal: 0, warden: 0 },
    fighters: [],
    player: null,
    bomb: { carrier: null, planted: false, site: null, pos: null, plantedAt: 0, defuser: null, defuseEndsAt: 0, planter: null, plantEndsAt: 0 },
    projectiles: [], // thrown grenades in flight / on the ground
    events: [], // transient events the HUD/audio/FX drain each frame
    winner: null, winReason: '',
    time: 0,
    paused: true,
  };
}

// Events are how the sim talks to sound and pictures without importing them.
export function emit(S, type, data) {
  S.events.push(Object.assign({ type, at: S.time }, data || {}));
}
