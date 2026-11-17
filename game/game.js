// game.js — Solmar Bay: a 3D open-world crime game (three.js).
// Entry point. Boots the renderer, builds the city, spawns traffic and
// pedestrians, and runs the game loop: on-foot movement, driving, stealing,
// wanted level + police, missions, combat, HUD, save/load.
import * as THREE from './vendor/three.module.min.js';
import { buildCity, HALF, ROAD_CENTERS } from './city.js';
import { makeCar, spawnTrafficCar, updateTraffic, updatePlayerCar, CAR_TYPES } from './vehicles.js';
import { makePedMesh, spawnPed, updatePed, knockPedDown } from './people.js';
import { addWanted, maintainPolice, updatePoliceCar, updateOfficer, updateWanted, clearPolice } from './police.js';
import { makeCombat } from './combat.js';
import { makeMissions } from './missions.js';
import { makeHud } from './hud.js';
import * as audio from './audio.js';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0x9fc3dd, 220, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 40, 90);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
sun.position.set(180, 260, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
sun.shadow.camera.top = 240; sun.shadow.camera.bottom = -240;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// ---------------------------------------------------------------- world
const world = {
  scene, camera, renderer,
  city: null, cars: [], peds: [], police: [],
  player: null, wanted: 0, wantedHeat: 0, lastCrimeT: 0, coolT: 0,
  money: 0, time: 0, state: 'menu', // menu | playing | paused | busted | wasted
  gunshotAt: null, busted: false,
  missions: null, hud: null, combat: null, audio,
  camYaw: 0.6, camPitch: 0.42, orbitYaw: 0, orbitPitch: 0,
  menuOrbit: 0,
  lastWantedAddT: -10,
};
world.city = buildCity(scene);

function policeAdd(amount, reason) {
  if (world.time - world.lastWantedAddT < 1.2) return;
  world.lastWantedAddT = world.time;
  addWanted(world, amount, reason);
}
world.policeAdd = policeAdd;

world.saveGame = function saveGame() {
  try {
    const p = world.player;
    localStorage.setItem('solmar-bay-save-v1', JSON.stringify({
      money: Math.floor(world.money),
      mission: world.missions ? world.missions.state.index : 0,
      obj: world.missions ? world.missions.state.objIndex : 0,
      x: p.pos.x, z: p.pos.z, health: p.health, time: world.time,
    }));
  } catch (e) { /* storage unavailable: play on without saving */ }
};
function loadSave() {
  try {
    const raw = localStorage.getItem('solmar-bay-save-v1');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- player
const playerGroup = makePedMesh(0xff7f2a, 0xf1c27d);
playerGroup.name = 'player';
scene.add(playerGroup);
const player = {
  group: playerGroup,
  pos: playerGroup.position,
  heading: 0,
  speed: 0,
  health: 100,
  onFoot: true,
  car: null,
  vy: 0,
  grounded: true,
  invulnT: 0,
  hurtT: 0,
  walkPhase: 0,
};
player.pos.set(14, 0, 14);
world.player = player;

// the player's own car: a beat-up sedan parked by the spawn, free to enter
const playerCar = makeCar('sedan', 0x7d8a96, { x: 16, z: 16, heading: Math.PI / 2, isPlayer: false });
playerCar.owner = 'player';
playerCar.name = 'Your Sedan';
scene.add(playerCar.group);
world.cars.push(playerCar);

// a Comet GT (sport) parked by the plaza for mission 2
const gtCar = makeCar('sport', 0x8e0000, { x: 36, z: 30, heading: Math.PI });
gtCar.owner = 'dealer';
scene.add(gtCar.group);
world.cars.push(gtCar);

// traffic + pedestrians
for (let i = 0; i < 13; i++) world.cars.push(spawnTrafficCar(scene, world.city));
for (let i = 0; i < 22; i++) world.peds.push(spawnPed(scene, world.city));

// systems (need the world, so they are built after it exists)
world.combat = makeCombat(scene, world);
world.missions = makeMissions(scene, world);
world.hud = makeHud(world);

// ---------------------------------------------------------------- input
const input = {
  forward: false, back: false, left: false, right: false,
  handbrake: false, sprint: false,
};
const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'KeyE') { tryEnterExitCar(); return; }
  if (e.code === 'KeyF') { tryShoot(); return; }
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
});

// mouse: drag orbits the camera; a quick click punches / shoots
let dragging = false, dragButton = 0, downX = 0, downY = 0, downT = 0, moved = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true; dragButton = e.button;
  downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = 0;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  moved += Math.abs(dx) + Math.abs(dy);
  world.camYaw -= dx * 0.005;
  world.camPitch = Math.max(0.08, Math.min(1.1, world.camPitch + dy * 0.004));
  if (player.car) world.orbitYaw -= dx * 0.005;
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const quick = performance.now() - downT < 350 && moved < 8;
  if (!quick || world.state !== 'playing') return;
  if (dragButton === 0 && player.onFoot) tryPunch();
  if (dragButton === 2 && player.onFoot) tryShoot();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const target = new THREE.Vector3();
  if (world.state === 'menu') {
    // slow cinematic orbit over the city for the start screen
    world.menuOrbit += dt * 0.045;
    const r = 150;
    camera.position.set(Math.cos(world.menuOrbit) * r, 62, Math.sin(world.menuOrbit) * r);
    camera.lookAt(0, 6, 0);
    return;
  }
  if (player.car) {
    target.copy(player.car.group.position).add(new THREE.Vector3(0, 2.2, 0));
    // camera swings behind the car; the mouse-drag offset fades back
    world.orbitYaw *= Math.max(0, 1 - 0.9 * dt);
    let wantYaw = player.car.heading + Math.PI + world.orbitYaw;
    let diff = wantYaw - world.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    world.camYaw += diff * Math.min(1, 2.6 * dt);
  } else {
    target.copy(player.pos).add(new THREE.Vector3(0, 1.7, 0));
  }
  const dist = player.car ? 11.5 : 7.5;
  const cp = Math.cos(world.camPitch), sp = Math.sin(world.camPitch);
  const ox = Math.sin(world.camYaw) * cp * dist;
  const oz = Math.cos(world.camYaw) * cp * dist;
  const oy = sp * dist + 1.2;
  const desired = new THREE.Vector3(target.x + ox, target.y + oy, target.z + oz);
  camera.position.lerp(desired, Math.min(1, 10 * dt));
  camera.lookAt(target);
}

// ---------------------------------------------------------------- actions
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of world.cars) {
    if (c.isPlayer) continue;
    const d = Math.hypot(c.group.position.x - player.pos.x, c.group.position.z - player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function tryEnterExitCar() {
  if (world.state !== 'playing') return;
  if (player.car) {
    // exit: step out to the car's right side and park it
    const c = player.car;
    const side = { x: Math.cos(c.heading), z: -Math.sin(c.heading) };
    player.pos.set(c.group.position.x + side.x * 2.6, 0, c.group.position.z + side.z * 2.6);
    player.group.visible = true;
    player.group.position.copy(player.pos);
    player.heading = c.heading;
    c.isPlayer = false;
    c.speed = 0;
    player.car = null;
    player.onFoot = true;
    audio.sfxClick();
    return;
  }
  const near = nearestCar(4.5);
  if (!near) return;
  const isSteal = near.owner !== 'player';
  player.car = near;
  player.onFoot = false;
  player.group.visible = false;
  near.isPlayer = true;
  near.isTraffic = false;
  if (isSteal) {
    near.owner = 'player';
    policeAdd(1, 'stole a car');
    world.hud.toast(`You stole the ${near.name}! The police are coming.`);
    audio.sfxHorn();
  } else {
    audio.sfxClick();
  }
  world.camYaw = near.heading + Math.PI;
  world.orbitYaw = 0;
}

function tryPunch() {
  if (world.state !== 'playing' || !player.onFoot) return;
  const dir = { x: Math.sin(player.heading), z: Math.cos(player.heading) };
  world.combat.playerPunch({ x: player.pos.x, y: 1.2, z: player.pos.z }, dir);
}

function tryShoot() {
  if (world.state !== 'playing') return;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  const d = ray.ray.direction;
  const origin = player.onFoot
    ? { x: player.pos.x, y: 1.5, z: player.pos.z }
    : { x: player.car.group.position.x, y: 1.6, z: player.car.group.position.z };
  world.combat.playerShoot(origin, { x: d.x, y: d.y, z: d.z });
}

function togglePause() {
  if (world.state === 'playing') {
    world.state = 'paused';
    document.getElementById('pause').style.display = 'flex';
    world.hud.hide();
  } else if (world.state === 'paused') {
    world.state = 'playing';
    document.getElementById('pause').style.display = 'none';
    world.hud.show();
  }
}
function toggleMute() {
  audio.setMuted(!audio.isMuted());
  const b = document.getElementById('btnMute2');
  if (b) b.textContent = 'SOUND: ' + (audio.isMuted() ? 'OFF' : 'ON');
}

function respawn(kind) {
  const lost = Math.max(0, Math.floor(world.money * (kind === 'busted' ? 0.15 : 0.2)));
  world.money -= lost;
  player.health = 100;
  world.wanted = 0;
  world.busted = false;
  clearPolice(world);
  if (player.car) { player.car.isPlayer = false; player.car.speed = 0; player.car = null; }
  player.onFoot = true;
  player.group.visible = true;
  const plaza = world.city.landmarks.plaza || { x: 30, z: 30 };
  player.pos.set(plaza.x, 0, plaza.z);
  player.heading = 0;
  player.invulnT = 3;
  if (kind === 'busted') { audio.sfxBusted(); world.hud.banner('BUSTED', `The SBPD got you. -$${lost}`); }
  else { audio.sfxWasted(); world.hud.banner('WASTED', `You got taken out. -$${lost}`); }
  world.saveGame();
}

// ---------------------------------------------------------------- per-frame
function updatePlayer(dt) {
  if (player.car) {
    const res = updatePlayerCar(player.car, input, dt, world);
    if (res.crashed) audio.sfxCrash();
    player.pos.copy(player.car.group.position);
    player.heading = player.car.heading;
    player.speed = player.car.speed;
  } else {
    const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const str = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const cf = { x: -Math.sin(world.camYaw), z: -Math.cos(world.camYaw) };
    const cr = { x: Math.cos(world.camYaw), z: -Math.sin(world.camYaw) };
    let mx = cf.x * fwd + cr.x * str;
    let mz = cf.z * fwd + cr.z * str;
    const len = Math.hypot(mx, mz);
    const speed = input.sprint ? 10 : 6;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      let diff = targetHeading - player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.heading += diff * Math.min(1, 12 * dt);
      player.pos.x += mx * speed * dt;
      player.pos.z += mz * speed * dt;
      player.speed = speed;
    } else player.speed = 0;
    // jump (Space doubles as handbrake in a car)
    if (input.handbrake && player.grounded) { player.vy = 7.5; player.grounded = false; }
    if (!player.grounded) {
      player.vy -= 22 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.grounded = true; }
    }
    world.city.resolveCollision(player.pos, 0.6);
    player.pos.x = Math.max(-HALF - 4, Math.min(HALF + 26, player.pos.x));
    player.pos.z = Math.max(-HALF - 4, Math.min(HALF + 26, player.pos.z));
    player.group.rotation.y = player.heading;
    player.walkPhase += dt * player.speed * 2.2;
    const sw = Math.sin(player.walkPhase) * (player.speed > 0.1 ? 0.5 : 0);
    player.group.userData.legL.rotation.x = sw;
    player.group.userData.legR.rotation.x = -sw;
    player.group.userData.armL.rotation.x = -sw * 0.7;
    player.group.userData.armR.rotation.x = sw * 0.7;
  }
  // contextual prompt + crosshair
  if (player.onFoot) {
    const near = nearestCar(4.5);
    world.hud.setPrompt(near ? `Press <b>E</b> to enter the ${near.name}` : '');
    world.hud.setCrosshair(true);
  } else {
    world.hud.setPrompt('Press <b>E</b> to exit &nbsp;·&nbsp; <b>F</b> shoot &nbsp;·&nbsp; <b>Space</b> handbrake');
    world.hud.setCrosshair(false);
  }
}

function updateCrimes() {
  if (!player.car) return;
  const speed = Math.abs(player.car.speed);
  if (speed < 5) return;
  const pp = player.car.group.position;
  for (const ped of world.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.group.position.x - pp.x, ped.group.position.z - pp.z);
    if (d < 2.4 && knockPedDown(ped)) {
      policeAdd(ped.isOfficer ? 3 : 2, ped.isOfficer ? 'ran over an officer' : 'hit a pedestrian');
      audio.sfxCrash();
      player.car.speed *= 0.7;
    }
  }
  for (const u of world.police) {
    if (!u.isPolice) continue;
    const d = Math.hypot(u.group.position.x - pp.x, u.group.position.z - pp.z);
    if (d < 3.6 && speed > 10) policeAdd(1, 'rammed a police car');
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (world.state === 'playing') {
    world.time += dt;
    updatePlayer(dt);
    for (const car of world.cars) {
      if (car.isTraffic && !car.isPlayer) updateTraffic(car, dt, world);
    }
    for (const ped of world.peds) {
      if (ped.isOfficer) {
        if (!ped.down) updateOfficer(ped, dt, world);
        else { ped.downT += dt; }
      } else updatePed(ped, dt, world);
    }
    for (const u of world.police) if (u.isPolice) updatePoliceCar(u, dt, world);
    maintainPolice(scene, world);
    updateWanted(dt, world);
    world.missions.update(dt, world);
    world.combat.update(dt);
    updateCrimes();
    player.invulnT = Math.max(0, player.invulnT - dt);
    player.hurtT = Math.max(0, player.hurtT - dt);
    audio.updateEngine(player.car ? Math.abs(player.car.speed) / player.car.maxSpeed : 0, !!player.car);
    audio.updateSiren(world.wanted > 0 && world.police.length > 0);
    if (world.busted) respawn('busted');
    if (player.health <= 0) respawn('wasted');
    world.hud.update(dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- menus
function startGame(fromSave) {
  audio.initAudio();
  audio.sfxClick();
  const save = fromSave ? loadSave() : null;
  if (save) {
    world.money = save.money || 0;
    player.health = save.health ?? 100;
    player.pos.set(save.x ?? 10, 0, save.z ?? 10);
    world.missions.setProgress(save.mission || 0, save.obj || 0);
    world.time = save.time || 0;
  } else {
    world.money = 0;
    player.health = 100;
    player.pos.set(14, 0, 14);
    player.heading = 0;
    world.missions.setProgress(0, 0);
    world.time = 0;
  }
  world.wanted = 0;
  world.busted = false;
  clearPolice(world);
  player.onFoot = true;
  player.car = null;
  player.group.visible = true;
  player.group.position.copy(player.pos);
  world.missions.start();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').style.display = 'none';
  world.hud.show();
  world.state = 'playing';
  world.hud.toast(save ? 'Welcome back to Solmar Bay.' : 'Welcome to Solmar Bay. Get in your car.');
}

document.getElementById('btnStart').addEventListener('click', () => startGame(false));
document.getElementById('btnContinue').addEventListener('click', () => startGame(true));
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnSave').addEventListener('click', () => { world.saveGame(); world.hud.toast('Game saved.'); });
document.getElementById('btnMute2').addEventListener('click', toggleMute);
document.getElementById('btnQuit').addEventListener('click', () => {
  world.saveGame();
  world.state = 'menu';
  document.getElementById('pause').style.display = 'none';
  document.getElementById('menu').classList.remove('hidden');
  world.hud.hide();
});
if (loadSave()) document.getElementById('btnContinue').classList.remove('hidden');

// expose a tiny handle for automated checks (not part of the game UI)
window.__solmar = { world, player };

// ---------------------------------------------------------------- boot
animate();
