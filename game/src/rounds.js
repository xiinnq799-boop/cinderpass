// rounds.js — the match as a state machine: buy phase, live round, the
// charge planted and ticking, round end, next round. It owns who stands
// where at the whistle, the plant and defuse channels, the economy awards,
// and the win checks. Movement and gunfire live in their own modules; this
// one only decides what the score is.

import { TEAM, WEAPONS, GRENADES, ECONOMY, MATCH, makeFighter, newMatchState, emit } from './state.js';
import { SPAWNS, SITES } from './map.js';
import { equipStart, buyWeapon } from './weapons.js';
import { newBrain, planRound } from './bots.js';

const NAMES = {
  jackal: ['Rook', 'Vex'],
  warden: ['Hale', 'Ilsa', 'Moss'],
};

export function createMatch(rng) {
  const S = newMatchState(rng);
  const player = makeFighter(TEAM.JACKAL, 'You', true);
  S.player = player;
  S.fighters.push(player);
  for (const n of NAMES.jackal) {
    const b = makeFighter(TEAM.JACKAL, n, false); b.brain = newBrain(); S.fighters.push(b);
  }
  for (const n of NAMES.warden) {
    const b = makeFighter(TEAM.WARDEN, n, false); b.brain = newBrain(); S.fighters.push(b);
  }
  for (const f of S.fighters) equipStart(f);
  return S;
}

export function startMatch(S, now) {
  S.score.jackal = 0; S.score.warden = 0; S.round = 0;
  for (const f of S.fighters) { f.money = ECONOMY.start; f.kills = 0; f.deaths = 0; }
  startRound(S, now);
}

function startRound(S, now) {
  S.round++;
  S.phase = 'buy'; S.phaseAt = now; S.phaseEndsAt = now + MATCH.buySec;
  S.winner = null; S.winReason = '';
  S.projectiles = [];
  S.bomb = { carrier: null, planted: false, site: null, pos: null, plantedAt: 0, detonateAt: 0, defuser: null, defuseEndsAt: 0, planter: null, plantEndsAt: 0, droppedAt: null };
  const jackals = S.fighters.filter((f) => f.team === TEAM.JACKAL);
  S.bomb.carrier = jackals[Math.floor(S.rng() * jackals.length)];
  for (const team of [TEAM.JACKAL, TEAM.WARDEN]) {
    const spawns = SPAWNS[team];
    S.fighters.filter((f) => f.team === team).forEach((f, i) => {
      const died = !f.alive;
      f.pos.x = spawns[i].x; f.pos.z = spawns[i].z; f.pos.y = 0;
      f.vel.x = f.vel.y = f.vel.z = 0;
      f.yaw = team === TEAM.JACKAL ? -Math.PI / 2 : Math.PI / 2;
      f.pitch = 0; f.crouch = false;
      f.hp = 100; f.alive = true; f.blindUntil = 0;
      if (died) { equipStart(f); f.armor = 0; f.grenades = { frag: 0, flash: 0 }; }
      else if (f.gun) { // survivors keep their kit; reserves top up
        for (const slot of ['primary', 'sidearm']) {
          const g = f.weapons[slot];
          if (g) g.reserve = WEAPONS[g.key].reserve;
        }
      }
      if (f.brain) { f.brain.enemy = null; f.brain.dest = null; f.brain.path = null; f.brain.noisePos = null; }
    });
  }
  planRound(S);
  emit(S, 'round_start', { round: S.round });
}

function endRound(S, now, winner, reason) {
  S.phase = 'end'; S.phaseAt = now; S.phaseEndsAt = now + MATCH.endSec;
  S.winner = winner; S.winReason = reason;
  S.score[winner]++;
  for (const f of S.fighters) {
    f.money = Math.min(ECONOMY.maxMoney, f.money + (f.team === winner ? ECONOMY.win : ECONOMY.loss));
  }
  if (reason === 'defuse' && S.bomb.defuser) {
    S.bomb.defuser.money = Math.min(ECONOMY.maxMoney, S.bomb.defuser.money + ECONOMY.defuse);
  }
  emit(S, 'round_end', { winner, reason });
}

function aliveCount(S, team) {
  return S.fighters.filter((f) => f.team === team && f.alive).length;
}

function inSite(f, site) {
  return Math.hypot(f.pos.x - site.x, f.pos.z - site.z) <= site.r;
}

export function stepRounds(S, dt, colliders, now, input) {
  const bomb = S.bomb;
  switch (S.phase) {
    case 'buy':
      if (S._botsBought !== S.round) {
        S._botsBought = S.round;
        for (const f of S.fighters) if (f.brain) botBuy(S, f);
      }
      if (now >= S.phaseEndsAt) {
        S.phase = 'live'; S.phaseAt = now; S.phaseEndsAt = now + MATCH.roundSec;
        emit(S, 'round_live', {});
      }
      break;
    case 'live': {
      // the charge changes hands: a dead carrier drops it, a teammate
      // walking over it picks it up
      if (bomb.carrier && !bomb.carrier.alive && !bomb.droppedAt) {
        bomb.droppedAt = { x: bomb.carrier.pos.x, z: bomb.carrier.pos.z };
        emit(S, 'bomb_dropped', { pos: bomb.droppedAt });
      }
      if (bomb.droppedAt) {
        for (const f of S.fighters) {
          if (f.team === TEAM.JACKAL && f.alive &&
              Math.hypot(f.pos.x - bomb.droppedAt.x, f.pos.z - bomb.droppedAt.z) < 1.2) {
            bomb.carrier = f; bomb.droppedAt = null;
            if (f.brain) { f.brain.role = 'planter'; f.brain.state = 'advance'; f.brain.dest = null; }
            emit(S, 'bomb_pickup', { by: f });
            break;
          }
        }
      }
      // plant channel: the carrier stands in a site and works
      const carrier = bomb.carrier;
      let planting = false;
      if (carrier && carrier.alive && !bomb.planted) {
        for (const [key, site] of Object.entries(SITES)) {
          if (!inSite(carrier, site)) continue;
          const wants = carrier.isPlayer ? input.plantHeld : carrier.brain?.state === 'plant';
          if (wants) {
            planting = true;
            if (bomb.planter !== carrier) { bomb.planter = carrier; bomb.plantEndsAt = now + MATCH.plantSec; }
            emit(S, 'planting', { progress: 1 - (bomb.plantEndsAt - now) / MATCH.plantSec, site: key });
            if (now >= bomb.plantEndsAt) {
              bomb.planted = true; bomb.site = key;
              bomb.pos = { x: carrier.pos.x, y: 0.25, z: carrier.pos.z };
              bomb.plantedAt = now; bomb.detonateAt = now + MATCH.bombSec;
              S.phase = 'planted'; S.phaseAt = now; S.phaseEndsAt = bomb.detonateAt;
              for (const f of S.fighters) if (f.team === TEAM.JACKAL) f.money = Math.min(ECONOMY.maxMoney, f.money + ECONOMY.plantTeam);
              emit(S, 'planted', { site: key, pos: bomb.pos });
            }
          }
        }
      }
      if (!planting && bomb.planter && !bomb.planted) bomb.planter = null;
      // win checks
      if (S.phase === 'live') {
        if (aliveCount(S, TEAM.WARDEN) === 0) endRound(S, now, TEAM.JACKAL, 'elimination');
        else if (aliveCount(S, TEAM.JACKAL) === 0) endRound(S, now, TEAM.WARDEN, 'elimination');
        else if (now >= S.phaseEndsAt) endRound(S, now, TEAM.WARDEN, 'time');
      }
      break;
    }
    case 'planted': {
      // beeps, faster as the fuse burns down
      const left = bomb.detonateAt - now;
      const interval = left > 20 ? 1 : left > 10 ? 0.5 : 0.25;
      if (!bomb.lastBeep || now - bomb.lastBeep >= interval) {
        bomb.lastBeep = now;
        emit(S, 'beep', { pos: bomb.pos });
      }
      // defuse channel
      let defusing = null;
      for (const f of S.fighters) {
        if (f.team === TEAM.WARDEN && f.alive && f.brain?.state === 'defuse' &&
            Math.hypot(f.pos.x - bomb.pos.x, f.pos.z - bomb.pos.z) < 1.8) { defusing = f; break; }
      }
      if (defusing) {
        if (bomb.defuser !== defusing) { bomb.defuser = defusing; bomb.defuseEndsAt = now + MATCH.defuseSec; }
        emit(S, 'defusing', { progress: 1 - (bomb.defuseEndsAt - now) / MATCH.defuseSec });
        if (now >= bomb.defuseEndsAt) { emit(S, 'defused', {}); endRound(S, now, TEAM.WARDEN, 'defuse'); break; }
      } else bomb.defuser = null;
      if (S.phase !== 'planted') break;
      if (aliveCount(S, TEAM.WARDEN) === 0) { endRound(S, now, TEAM.JACKAL, 'elimination'); break; }
      if (now >= bomb.detonateAt) {
        emit(S, 'explosion', { pos: { x: bomb.pos.x, y: 0.6, z: bomb.pos.z }, big: true });
        endRound(S, now, TEAM.JACKAL, 'detonation');
      }
      break;
    }
    case 'end':
      if (now >= S.phaseEndsAt) {
        if (S.score.jackal >= MATCH.roundsToWin || S.score.warden >= MATCH.roundsToWin || S.round >= MATCH.maxRounds) {
          S.phase = 'over';
          emit(S, 'match_over', { winner: S.score.jackal === S.score.warden ? null : (S.score.jackal > S.score.warden ? TEAM.JACKAL : TEAM.WARDEN) });
        } else startRound(S, now);
      }
      break;
  }
}

// --- the buy menu --------------------------------------------------------------

export const BUY_ITEMS = [
  { key: 'scatter', label: 'Mule Scattergun', price: WEAPONS.scatter.price, kind: 'weapon' },
  { key: 'carbine', label: 'Kestrel Carbine', price: WEAPONS.carbine.price, kind: 'weapon' },
  { key: 'longshot', label: 'Heron Longshot', price: WEAPONS.longshot.price, kind: 'weapon' },
  { key: 'armor', label: 'Vest + helmet', price: ECONOMY.armorPrice, kind: 'armor' },
  { key: 'frag', label: 'Frag charge', price: GRENADES.frag.price, kind: 'grenade' },
  { key: 'flash', label: 'Flash charge', price: GRENADES.flash.price, kind: 'grenade' },
];

export function tryBuy(S, f, itemKey) {
  if (S.phase !== 'buy') return false;
  const item = BUY_ITEMS.find((i) => i.key === itemKey);
  if (!item || f.money < item.price) { emit(S, 'denied', {}); return false; }
  if (item.kind === 'weapon') {
    if (!buyWeapon(f, item.key)) { emit(S, 'denied', {}); return false; }
  } else if (item.kind === 'armor') {
    if (f.armor >= 100) { emit(S, 'denied', {}); return false; }
    f.money -= item.price; f.armor = 100;
  } else {
    if (f.grenades[item.key] >= 2) { emit(S, 'denied', {}); return false; }
    f.money -= item.price; f.grenades[item.key]++;
  }
  emit(S, 'buy', { by: f, item: item.key });
  return true;
}

// Bots shop with the same rules during the buy phase.
export function botBuy(S, f) {
  if (f.money >= WEAPONS.carbine.price && !f.weapons.primary) tryBuy(S, f, 'carbine');
  else if (f.money >= WEAPONS.scatter.price + 300 && !f.weapons.primary) tryBuy(S, f, 'scatter');
  if (f.armor < 100 && f.money >= ECONOMY.armorPrice + 200) tryBuy(S, f, 'armor');
  if (f.money >= 900 && f.grenades.frag === 0) tryBuy(S, f, 'frag');
  if (f.money >= 700 && f.grenades.flash === 0) tryBuy(S, f, 'flash');
}
