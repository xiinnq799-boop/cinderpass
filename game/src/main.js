// main.js — boot and the frame loop. Owns the renderer, the camera, the
// player's viewmodel, and the wiring between the simulation (rounds, bots,
// weapons) and everything that presents it (HUD, sound, FX). The sim runs
// on a fixed 1/60 step; rendering happens whenever the browser paints.

import * as THREE from 'three';
import { makeRng, TEAM, WEAPONS } from './state.js';
import { buildColliders, buildScene, SITES } from './map.js';
import { createInput } from './input.js';
import { stepMovement, applyLook, eyePos } from './player.js';
import { tryFire, startReload, switchTo, throwGrenade, updateGuns, stepProjectiles, spreadFor } from './weapons.js';
import { stepBot, hearShot, buildBotView, updateBotView } from './bots.js';
import { createMatch, startMatch, stepRounds, tryBuy } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio, volAt } from './audio.js';
import { createFx } from './fx.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || (shotMode ? 1 : (Date.now() % 100000)));

const colliders = buildColliders();
const scene = buildScene(THREE, colliders);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 320);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const S = createMatch(makeRng(seed));
const fx = createFx(THREE, scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement);

// Bot bodies.
for (const f of S.fighters) {
  if (f.isPlayer) continue;
  f.view = buildBotView(THREE, f.team);
  scene.add(f.view);
}

// The player's gun, parented to the camera.
const viewmodel = new THREE.Group();
viewmodel.position.set(0.3, -0.27, -0.58);
viewmodel.scale.setScalar(0.78);
camera.add(viewmodel);
const gunMeshes = {};
{
  const gear = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb35c2e, roughness: 0.6, metalness: 0.3 });
  const shapes = {
    pistol: [[0.05, 0.09, 0.24, 0, 0, -0.08], [0.045, 0.13, 0.05, 0, -0.09, 0.04]],
    scatter: [[0.06, 0.08, 0.62, 0, 0, -0.2], [0.05, 0.05, 0.3, 0, -0.055, -0.28], [0.055, 0.11, 0.16, 0, -0.06, 0.1]],
    carbine: [[0.055, 0.1, 0.56, 0, 0, -0.16], [0.04, 0.16, 0.05, 0, -0.11, -0.02], [0.05, 0.07, 0.2, 0, 0.07, -0.12], [0.045, 0.1, 0.14, 0, -0.05, 0.14]],
    longshot: [[0.05, 0.08, 0.86, 0, 0, -0.28], [0.045, 0.09, 0.07, 0, 0.09, -0.18], [0.05, 0.11, 0.18, 0, -0.05, 0.16]],
  };
  for (const [key, parts] of Object.entries(shapes)) {
    const g = new THREE.Group();
    parts.forEach(([w, h, d, x, y, z], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i === 0 ? gear : accent);
      m.position.set(x, y, z);
      g.add(m);
    });
    g.visible = false;
    viewmodel.add(g);
    gunMeshes[key] = g;
  }
}

// Thrown-charge and planted-charge props.
const nadeMeshes = [];
{
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: 0x44502e, roughness: 0.6 });
  const flashMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(geo, fragMat);
    m.visible = false; m.userData.flashMat = flashMat; m.userData.fragMat = fragMat;
    scene.add(m); nadeMeshes.push(m);
  }
}
const bombMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.22, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x35383c, roughness: 0.5, metalness: 0.4 }));
bombMesh.visible = false; scene.add(bombMesh);
const bombLight = new THREE.PointLight(0xff4030, 0, 6, 1.6); scene.add(bombLight);
const dropMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.22, 0.3), bombMesh.material);
dropMesh.visible = false; scene.add(dropMesh);

// --- event draining: sim -> sound, pictures, HUD ----------------------------

const _ear = { x: 0, y: 0, z: 0 };
let lastProgress = null, lastBounceAt = -9, lastPlantTickAt = -9;

function drainEvents() {
  eyePos(S.player, _ear);
  for (const ev of S.events) {
    hud.onEvent(S, ev);
    switch (ev.type) {
      case 'shot': {
        hearShot(S, ev.pos, ev.by.team, S.time);
        audio.play('shot_' + ev.key, ev.by.isPlayer ? 0.9 : volAt(ev.pos, _ear));
        break;
      }
      case 'fx_tracer': fx.tracer(ev.from, ev.to, ev.color, S.time); break;
      case 'fx_impact': fx.impact(ev.pos, S.time); break;
      case 'fx_muzzle': fx.muzzle(ev.pos, S.time); break;
      case 'hit':
        if (ev.by === S.player) audio.play(ev.killed ? 'kill' : 'hit', 0.8);
        if (ev.target === S.player) audio.play('hurt', 0.7);
        break;
      case 'reload': audio.play('reload', ev.by.isPlayer ? 0.7 : volAt(ev.by.pos, _ear)); break;
      case 'dry': if (ev.by.isPlayer) audio.play('dry', 0.6); break;
      case 'throw': audio.play('throw', ev.by.isPlayer ? 0.5 : volAt(ev.by.pos, _ear)); break;
      case 'bounce': if (S.time - lastBounceAt > 0.09) { lastBounceAt = S.time; audio.play('bounce', volAt(ev.pos, _ear)); } break;
      case 'explosion': fx.explosion(ev.pos, S.time); audio.play('explosion', volAt(ev.pos, _ear)); break;
      case 'flashbang': audio.play('flash', volAt(ev.pos, _ear)); break;
      case 'beep': audio.play('beep', volAt(ev.pos, _ear)); break;
      case 'planted': audio.play('planted', 0.8); break;
      case 'defused': audio.play('defused', 0.8); break;
      case 'planting':
        lastProgress = { k: ev.progress, label: 'Planting the charge…', until: S.time + 0.25 };
        if (S.time - lastPlantTickAt > 0.5) { lastPlantTickAt = S.time; audio.play('planting', 0.4); }
        break;
      case 'defusing': lastProgress = { k: ev.progress, label: 'Charge being defused!', until: S.time + 0.25 }; break;
      case 'buy': if (ev.by.isPlayer) audio.play('buy', 0.7); break;
      case 'denied': audio.play('denied', 0.6); break;
      case 'round_end': audio.play(ev.winner === S.player.team ? 'roundwin' : 'roundlose', 0.9); break;
    }
  }
  S.events.length = 0;
}

// --- player control -----------------------------------------------------------

let scopedHeld = false;
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 2) scopedHeld = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) scopedHeld = false; });

function stepPlayer(dt, now) {
  const P = S.player;
  const look = input.takeLook();
  if (input.locked || shotMode) applyLook(P, look.dx, look.dy);
  P.crouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  // wish direction in world space from the keys and the player's yaw
  const f = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
  const r = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let wx = (-sin * f) + (cos * r), wz = (-cos * f) + (-sin * r);
  const il = Math.hypot(wx, wz) || 1;
  if (f || r) { wx /= il; wz /= il; } else { wx = 0; wz = 0; }
  const frozen = S.phase === 'buy';
  if (!frozen) stepMovement(P, wx, wz, input.keys.has('Space'), dt, colliders);
  else stepMovement(P, 0, 0, false, dt, colliders);

  if (S.phase === 'buy') {
    const buys = ['scatter', 'carbine', 'longshot', 'armor', 'frag', 'flash'];
    buys.forEach((key, i) => { if (input.drainPressed('Digit' + (i + 1))) tryBuy(S, P, key); });
    return;
  }
  if (S.phase !== 'live' && S.phase !== 'planted') return;
  if (input.drainPressed('Digit1')) switchTo(P, 'primary');
  if (input.drainPressed('Digit2')) switchTo(P, 'sidearm');
  if (input.drainPressed('KeyQ')) switchTo(P, P.gun === P.weapons.primary ? 'sidearm' : 'primary');
  if (input.drainPressed('KeyR')) startReload(S, P, now);
  if (input.drainPressed('KeyG')) throwGrenade(S, P, 'frag', now);
  if (input.drainPressed('KeyF')) throwGrenade(S, P, 'flash', now);
  const def = WEAPONS[P.gun.key];
  if (def.auto ? input.firing : input.clicked) tryFire(S, P, colliders, now);
}

// --- the fixed-step simulation --------------------------------------------------

const STEP = 1 / 60;
let simNow = 0, accumulator = 0, lastTs = -1;
let spectateIdx = 0, spectateAt = 0;
const _eye = { x: 0, y: 0, z: 0 };

function stepSim() {
  simNow += STEP;
  S.time = simNow;
  const now = simNow;
  const inRound = ['buy', 'live', 'planted', 'end'].includes(S.phase);
  if (inRound && !shotMode) {
    stepRounds(S, STEP, colliders, now, { plantHeld: input.keys.has('KeyE') && S.player.alive });
    if (S.phase !== 'buy') {
      if (S.player.alive) stepPlayer(STEP, now);
      for (const f of S.fighters) if (f.brain) stepBot(S, f, STEP, colliders, now);
    } else if (S.player.alive) stepPlayer(STEP, now);
    stepProjectiles(S, STEP, colliders, now);
    updateGuns(S, now);
  }
  drainEvents();
}

// --- presentation -----------------------------------------------------------------

let walkCycle = 0, recoil = 0, wasReloading = false;

function present(dt) {
  const P = S.player;
  // camera: the player's eyes, or a living teammate's while spectating
  let camF = P;
  if (!P.alive && (S.phase === 'live' || S.phase === 'planted')) {
    const mates = S.fighters.filter((f) => f.team === P.team && f.alive);
    if (mates.length) {
      if (simNow - spectateAt > 5) { spectateAt = simNow; spectateIdx = (spectateIdx + 1) % mates.length; }
      camF = mates[spectateIdx % mates.length];
    }
  }
  eyePos(camF, _eye);
  const shake = fx.update(simNow, shotMode ? 0 : dt);
  camera.position.set(
    _eye.x + (Math.random() - 0.5) * shake * 0.09,
    _eye.y + (Math.random() - 0.5) * shake * 0.09,
    _eye.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = camF.yaw;
  camera.rotation.x = camF.pitch;
  // scope: the Heron settles to a narrow view while the right button is held
  const scoped = !!(P.alive && camF === P && scopedHeld && P.gun?.key === 'longshot');
  const wantFov = scoped ? 30 : 78;
  if (Math.abs(camera.fov - wantFov) > 0.4) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 11); camera.updateProjectionMatrix(); }

  // viewmodel life: recoil spring, reload dip, walk bob
  const gunKey = P.gun?.key;
  for (const [k, g] of Object.entries(gunMeshes)) g.visible = k === gunKey && P.alive;
  recoil = Math.max(0, recoil - dt * 7);
  if (P.gun && P.gun.reloadingUntil > simNow) wasReloading = true;
  else if (wasReloading) wasReloading = false;
  const reloading = P.gun && P.gun.reloadingUntil > simNow;
  walkCycle += dt * (4 + Math.hypot(P.vel.x, P.vel.z) * 1.7);
  const bobA = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) * 0.011;
  viewmodel.position.y = -0.27 + Math.sin(walkCycle * 2) * bobA - (reloading ? 0.09 : 0);
  viewmodel.position.x = 0.3 + Math.cos(walkCycle) * bobA * 0.7;
  viewmodel.rotation.x = recoil * 0.6 + (reloading ? -0.55 : 0);
  viewmodel.position.z = -0.58 + recoil * 0.05;
  viewmodel.visible = P.alive && !scoped;

  // bot bodies, projectiles, the charge. The fighter whose eyes we are
  // borrowing hides their own body — otherwise the camera sits in a helmet.
  for (const f of S.fighters) if (f.view) { f.view.visible = f !== camF; updateBotView(f, simNow, shotMode ? 0.016 : dt); }
  S.projectiles.forEach((pr, i) => {
    const m = nadeMeshes[i]; if (!m) return;
    m.visible = true;
    m.material = pr.kind === 'frag' ? m.userData.fragMat : m.userData.flashMat;
    m.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
  });
  for (let i = S.projectiles.length; i < nadeMeshes.length; i++) nadeMeshes[i].visible = false;
  if (S.bomb.planted) {
    bombMesh.visible = true;
    bombMesh.position.set(S.bomb.pos.x, 0.14, S.bomb.pos.z);
    bombLight.position.set(S.bomb.pos.x, 0.7, S.bomb.pos.z);
    bombLight.intensity = (simNow * 2.4) % 1 < 0.18 ? 9 : 0;
  } else { bombMesh.visible = false; bombLight.intensity = 0; }
  if (S.bomb.droppedAt) {
    dropMesh.visible = true;
    dropMesh.position.set(S.bomb.droppedAt.x, 0.14, S.bomb.droppedAt.z);
  } else dropMesh.visible = false;

  // HUD view extras
  let hint = '';
  if (P.alive && S.phase === 'live') {
    if (S.bomb.carrier === P) {
      const inA = Math.hypot(P.pos.x - SITES.A.x, P.pos.z - SITES.A.z) <= SITES.A.r;
      const inB = Math.hypot(P.pos.x - SITES.B.x, P.pos.z - SITES.B.z) <= SITES.B.r;
      hint = inA || inB ? 'Hold E — plant the charge' : 'Carry the charge into site A or B';
    }
  } else if (P.alive && S.phase === 'planted' && P.team === 'jackal') hint = 'Defend the charge';
  const progress = lastProgress && simNow < lastProgress.until ? lastProgress : null;
  const spreadPx = P.gun ? Math.tan(spreadFor(P, WEAPONS[P.gun.key])) * (innerHeight / 2) / Math.tan(camera.fov * Math.PI / 360) * 2.2 : 6;
  hud.frame(S, simNow, { spreadPx, scoped, progress, hint });
  renderer.render(scene, camera);
}

// recoil follows the player's own shots (drained events carry no slot for
// this, so watch the pitch the gun kicked into the view)
let lastPitch = 0;
function trackRecoil() {
  const P = S.player;
  if (P.alive && P.pitch > lastPitch + 0.004) recoil = Math.min(1, recoil + (P.pitch - lastPitch) * 22);
  lastPitch = P.pitch;
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (lastTs < 0) lastTs = ts;
  let dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (shotMode) {
    present(0.016);
    if (++frame.count === 14) window.__shotReady = true;
    return;
  }
  const running = S.phase !== 'menu' && (input.locked || S.phase === 'over');
  if (running) {
    accumulator += dt;
    while (accumulator >= STEP) { stepSim(); accumulator -= STEP; }
  } else {
    input.takeLook();
  }
  trackRecoil();
  present(dt);
}
frame.count = 0;

// --- menus and starting -------------------------------------------------------------

const menuEl = document.getElementById('menu');
const overEl = document.getElementById('gameover');
document.getElementById('play').addEventListener('click', () => {
  audio.unlock();
  menuEl.style.display = 'none';
  input.requestLock();
  if (S.phase === 'menu' || S.phase === 'over') { overEl.style.display = 'none'; startMatch(S, simNow); }
});
document.getElementById('again').addEventListener('click', () => {
  audio.unlock();
  overEl.style.display = 'none';
  input.requestLock();
  startMatch(S, simNow);
});
document.addEventListener('pointerlockchange', () => {
  const started = S.phase !== 'menu' && S.phase !== 'over';
  if (!document.pointerLockElement && started && !shotMode) {
    menuEl.style.display = 'grid';
    document.getElementById('menu-title').textContent = 'Paused';
    document.getElementById('menu-copy').textContent = 'The match is waiting. Click to jump back in.';
    document.getElementById('play').textContent = 'Resume';
  } else if (document.pointerLockElement) {
    menuEl.style.display = 'none';
  }
});
setInterval(() => {
  if (S.phase === 'over' && overEl.style.display !== 'grid') {
    overEl.style.display = 'grid';
    const w = S.score.jackal === S.score.warden ? 'Draw' : (S.score.jackal > S.score.warden ? 'Jackals win the yard' : 'Wardens hold the yard');
    document.getElementById('over-title').textContent = w;
    document.getElementById('over-copy').textContent =
      `Final score ${S.score.jackal} — ${S.score.warden}. You: ${S.player.kills} kills, ${S.player.deaths} deaths.`;
    document.exitPointerLock?.();
  }
}, 400);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (shotMode) {
  audio.setMuted(true);
  menuEl.style.display = 'none';
  setupShot(S, shotMode, { fx, scene, THREE });
  drainEvents();
  // pose the viewmodels/bodies once so the first frame is already composed
  present(0.016);
}
requestAnimationFrame(frame);
