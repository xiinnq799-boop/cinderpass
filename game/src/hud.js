// hud.js — the DOM overlay: health and armour, money, ammunition, the
// round clock and score, the killfeed, the buy menu, banners, and the
// full-screen flashes for damage and flash charges. It reads match state
// and sim events; it never changes the game.

import { WEAPONS } from './state.js';
import { BUY_ITEMS } from './rounds.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    timer: $('timer'), scoreJ: $('score-j'), scoreW: $('score-w'), round: $('round-label'),
    hp: $('hp-value'), hpBar: $('hp-bar'), armor: $('armor-value'), money: $('money-value'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weapon: $('weapon-name'),
    nades: $('nade-count'), feed: $('killfeed'), banner: $('banner'), bannerSub: $('banner-sub'),
    buy: $('buy-menu'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    vignette: $('vignette'), flash: $('flash-overlay'), scope: $('scope-overlay'),
    progress: $('progress'), progressBar: $('progress-bar'), progressLabel: $('progress-label'),
    hint: $('hint'), bombTag: $('bomb-tag'), carrier: $('carrier-tag'),
    spectate: $('spectate-tag'),
  };
  let bannerUntil = 0, hitmarkUntil = 0, damageAt = -99, flashUntil = 0, flashStrength = 0;

  function banner(title, sub, sec = 2.6) {
    el.banner.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.parentElement.classList.add('on');
    bannerUntil = performance.now() / 1000 + sec;
  }

  function feedLine(html) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.innerHTML = html;
    el.feed.appendChild(div);
    while (el.feed.children.length > 5) el.feed.firstChild.remove();
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 600); }, 4200);
  }

  function onEvent(S, ev) {
    const P = S.player;
    switch (ev.type) {
      case 'round_start':
        banner(`Round ${S.round}`, S.bomb.carrier === P ? 'You carry the breach charge' : 'Buy phase — press 1–6', 2.4);
        break;
      case 'round_live': banner('Round live', '', 1.2); break;
      case 'planted': banner('Charge planted', `Site ${ev.site} — 40 seconds`, 2.4); break;
      case 'round_end': {
        const mine = ev.winner === P.team;
        const why = { elimination: 'Elimination', time: 'Time expired', defuse: 'Charge defused', detonation: 'Detonation' }[ev.reason] || ev.reason;
        banner(mine ? 'Round won' : 'Round lost', `${ev.winner === 'jackal' ? 'Jackals' : 'Wardens'} — ${why}`, 3);
        break;
      }
      case 'hit':
        if (ev.by === P) { hitmarkUntil = performance.now() / 1000 + 0.09; el.hitmarker.classList.add('on'); }
        if (ev.target === P) damageAt = S.time;
        break;
      case 'kill': {
        const killer = ev.by ? ev.by.name : '—';
        feedLine(`<b class="${ev.by?.team}">${killer}</b> ▸ <b class="${ev.victim.team}">${ev.victim.name}</b>${ev.head ? ' ⌖' : ''}`);
        if (ev.by === P) { hitmarkUntil = performance.now() / 1000 + 0.22; el.hitmarker.classList.add('on'); }
        if (ev.victim === P) banner('You are down', 'Spectating until the round ends', 2.4);
        break;
      }
      case 'flashed':
        flashStrength = Math.min(1, ev.strength);
        flashUntil = performance.now() / 1000 + 0.4 + ev.strength * 1.6;
        break;
      case 'bomb_pickup': if (ev.by === P) banner('You have the charge', 'Plant it at site A or B — hold E', 2); break;
    }
  }

  function frame(S, now, view) {
    const P = S.player;
    const tNow = performance.now() / 1000;
    // clock: phase countdown, or the fuse once planted
    let clock = Math.max(0, S.phaseEndsAt - now);
    if (S.phase === 'menu' || S.phase === 'over') clock = 0;
    const mm = Math.floor(clock / 60), ss = Math.floor(clock % 60);
    el.timer.textContent = S.phase === 'planted' ? `💥 ${ss.toString().padStart(2, '0')}` : `${mm}:${ss.toString().padStart(2, '0')}`;
    el.timer.classList.toggle('danger', S.phase === 'planted' || (S.phase === 'live' && clock < 11));
    el.scoreJ.textContent = S.score.jackal;
    el.scoreW.textContent = S.score.warden;
    el.round.textContent = `Round ${Math.max(1, S.round)} · first to 7`;

    el.hp.textContent = Math.ceil(P.hp);
    el.hpBar.style.width = `${Math.max(0, P.hp)}%`;
    el.hpBar.classList.toggle('low', P.hp <= 30);
    el.armor.textContent = Math.ceil(P.armor);
    el.money.textContent = `$${P.money}`;
    if (P.gun) {
      const def = WEAPONS[P.gun.key];
      el.weapon.textContent = P.gun.reloadingUntil > now ? `${def.name} — reloading` : def.name;
      el.ammoMag.textContent = P.gun.mag;
      el.ammoReserve.textContent = `/ ${P.gun.reserve}`;
      el.ammoMag.classList.toggle('empty', P.gun.mag === 0);
    }
    el.nades.textContent = `Frag ×${P.grenades.frag} · Flash ×${P.grenades.flash}`;
    el.carrier.style.display = S.bomb.carrier === P && !S.bomb.planted && S.phase !== 'over' ? 'block' : 'none';
    el.spectate.style.display = !P.alive && (S.phase === 'live' || S.phase === 'planted') ? 'block' : 'none';

    // buy menu
    const showBuy = S.phase === 'buy' && P.alive;
    el.buy.classList.toggle('on', showBuy);
    if (showBuy) {
      el.buyMoney.textContent = `$${P.money}`;
      el.buyList.innerHTML = BUY_ITEMS.map((it, i) => {
        const owned = (it.kind === 'weapon' && P.weapons[WEAPONS[it.key].slot]?.key === it.key) ||
          (it.kind === 'armor' && P.armor >= 100) ||
          (it.kind === 'grenade' && P.grenades[it.key] >= 2);
        const afford = P.money >= it.price;
        return `<div class="buy-row ${owned ? 'owned' : afford ? '' : 'poor'}"><kbd>${i + 1}</kbd><span>${it.label}</span><b>${owned ? 'owned' : '$' + it.price}</b></div>`;
      }).join('');
    }

    // crosshair spread + scope
    el.crosshair.style.setProperty('--sp', `${view.spreadPx || 6}px`);
    el.crosshair.style.opacity = P.alive && !view.scoped ? 1 : 0;
    el.scope.style.opacity = view.scoped ? 1 : 0;
    if (tNow > hitmarkUntil) el.hitmarker.classList.remove('on');
    if (tNow > bannerUntil) el.banner.parentElement.classList.remove('on');

    // damage vignette + flash white-out decay
    const dmgK = Math.max(0, 1 - (now - damageAt) / 0.7);
    el.vignette.style.opacity = P.alive ? (dmgK * 0.85 + (P.hp <= 30 ? 0.25 : 0)).toFixed(2) : 0.4;
    const flK = Math.max(0, Math.min(1, (flashUntil - tNow) / 1.2)) * flashStrength;
    el.flash.style.opacity = flK.toFixed(2);

    // plant/defuse progress + contextual hint
    const prog = view.progress;
    if (prog) {
      el.progress.classList.add('on');
      el.progressBar.style.width = `${Math.round(prog.k * 100)}%`;
      el.progressLabel.textContent = prog.label;
    } else el.progress.classList.remove('on');
    el.hint.textContent = view.hint || '';
    el.bombTag.style.display = S.bomb.planted ? 'block' : 'none';
    if (S.bomb.planted) el.bombTag.textContent = `Charge at site ${S.bomb.site} — ${Math.max(0, S.bomb.detonateAt - now).toFixed(0)}s`;
  }

  return { onEvent, frame, banner };
}
