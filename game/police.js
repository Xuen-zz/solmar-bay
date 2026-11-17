// police.js — the wanted system and the Solmar Bay Police Department.
// Wanted 0-5 stars. Crimes raise it; it cools off when the police lose sight
// of the player. Police cars chase and ram; officers on foot chase and try to
// bust the player. At high wanted, officers open fire.
import * as THREE from './vendor/three.module.min.js';
import { makeCar } from './vehicles.js';
import { makePedMesh } from './people.js';
import { ROAD_CENTERS, HALF } from './city.js';

export const MAX_WANTED = 5;

export function wantedForLevel(w) {
  // how many police units the level sustains
  return [0, 1, 2, 3, 4, 6][Math.min(MAX_WANTED, w)];
}

export function addWanted(world, amount, reason) {
  const before = world.wanted;
  world.wanted = Math.max(0, Math.min(MAX_WANTED, world.wanted + amount));
  if (world.wanted > before) {
    world.wantedHeat = 1; // fresh crime: police know where you are
    world.lastCrimeT = world.time;
    if (world.hud) world.hud.flashWanted();
  }
  return world.wanted;
}

function forwardOf(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

export function spawnPoliceCar(scene, world, nearPos) {
  const car = makeCar('police', 0x111111, { isTraffic: false });
  // spawn on a road near the player, a little behind/ahead
  const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
  const ang = Math.random() * Math.PI * 2;
  const r = 26 + Math.random() * 18;
  let x = nearPos.x + Math.cos(ang) * r;
  let z = nearPos.z + Math.sin(ang) * r;
  x = Math.max(-HALF + 10, Math.min(HALF - 10, x));
  z = Math.max(-HALF + 10, Math.min(HALF - 10, z));
  car.group.position.set(x, 0, z);
  car.heading = Math.atan2(nearPos.x - x, nearPos.z - z);
  car.group.rotation.y = car.heading;
  car.isPolice = true;
  car.police = { mode: 'chase', stuckT: 0 };
  scene.add(car.group);
  world.cars.push(car);
  world.police.push(car);
  return car;
}

export function spawnOfficer(scene, world, nearPos) {
  const group = makePedMesh(0x1a2a6c, 0xe0ac69);
  // navy uniform + cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x101a33, roughness: 0.6 }));
  cap.position.y = 1.92;
  group.add(cap);
  const ang = Math.random() * Math.PI * 2;
  const r = 14 + Math.random() * 10;
  const x = Math.max(-HALF + 8, Math.min(HALF - 8, nearPos.x + Math.cos(ang) * r));
  const z = Math.max(-HALF + 8, Math.min(HALF - 8, nearPos.z + Math.sin(ang) * r));
  group.position.set(x, 0, z);
  const off = { group, pos: group.position, heading: 0, speed: 3.4, walkSpeed: 3.4, state: 'chase', stateT: 0, targetHeading: null, down: false, downT: 0, phase: 0, isOfficer: true, shootT: 1 + Math.random() };
  scene.add(group);
  world.peds.push(off);
  world.police.push(off);
  return off;
}

// Keep the police count matched to the wanted level.
export function maintainPolice(scene, world) {
  if (world.wanted <= 0) return;
  const want = wantedForLevel(world.wanted);
  let cars = 0, officers = 0;
  for (const u of world.police) { if (u.group && u.isPolice) cars++; else if (u.isOfficer) officers++; }
  const wantCars = Math.min(want, 4);
  const wantOfficers = Math.max(0, want - wantCars);
  const pp = world.player.pos;
  while (cars < wantCars) { spawnPoliceCar(scene, world, pp); cars++; }
  while (officers < wantOfficers) { spawnOfficer(scene, world, pp); officers++; }
}

// A police car chases the player: steer toward them, ram to slow them.
export function updatePoliceCar(car, dt, world) {
  const p = world.player;
  const pos = car.group.position;
  const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turnRate = 2.6;
  car.heading += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
  // speed: faster than the player's cruise, slower when very close (to ram, not overshoot)
  const target = dist > 26 ? car.maxSpeed : dist > 10 ? 26 : 15;
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), car.accel * dt);
  const f = forwardOf(car.heading);
  pos.x += f.x * car.speed * dt;
  pos.z += f.z * car.speed * dt;
  if (world.city.resolveCollision(pos, 2.1)) car.speed *= 0.5;
  pos.x = Math.max(-HALF - 4, Math.min(HALF + 26, pos.x));
  pos.z = Math.max(-HALF - 4, Math.min(HALF + 26, pos.z));
  // ram the player's car
  if (p.car) {
    const pd = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (pd < 3.4) {
      p.car.speed *= 0.82;
      car.speed *= 0.7;
      if (Math.abs(p.car.speed) < 2.5 && world.wanted > 0 && dist < 3.4) {
        // player stopped while a cop is on them: busted is handled by officers
      }
      if (world.audio) world.audio.crash();
    }
  }
  car.group.rotation.y = car.heading;
  // light bar flash
  car.sirenPhase += dt * 6;
  const bar = car.group.getObjectByName('lightbar');
  const bar2 = car.group.getObjectByName('lightbar2');
  const on = Math.sin(car.sirenPhase) > 0;
  if (bar) bar.material.emissiveIntensity = on ? 2.2 : 0.25;
  if (bar2) bar2.material.emissiveIntensity = on ? 0.25 : 2.2;
}

// An officer on foot runs at the player; close enough and slow = busted.
export function updateOfficer(off, dt, world) {
  const p = world.player;
  const g = off.group;
  const dx = p.pos.x - g.position.x, dz = p.pos.z - g.position.z;
  const dist = Math.hypot(dx, dz);
  off.heading = Math.atan2(dx, dz);
  const speed = dist > 30 ? 4.4 : 5.2;
  const f = forwardOf(off.heading);
  g.position.x += f.x * speed * dt;
  g.position.z += f.z * speed * dt;
  world.city.resolveCollision(g.position, 0.6);
  g.rotation.y = off.heading;
  off.phase += dt * speed * 3.2;
  const sw = Math.sin(off.phase) * 0.6;
  g.userData.legL.rotation.x = sw;
  g.userData.legR.rotation.x = -sw;
  // bust: player on foot, slow, officer right on them
  if (p.onFoot && dist < 1.6 && p.speed < 2.5) {
    world.busted = true;
  }
  // at wanted 3+, officers shoot when in range
  if (world.wanted >= 3 && dist < 26 && dist > 4) {
    off.shootT -= dt;
    if (off.shootT <= 0) {
      off.shootT = 1.1 + Math.random() * 0.8;
      if (world.combat) world.combat.officerShoot(off, world);
    }
  }
}

// Wanted cools off when the player is out of sight and crime-free.
export function updateWanted(dt, world) {
  if (world.wanted <= 0) return;
  const p = world.player.pos;
  let seen = false;
  for (const u of world.police) {
    const up = u.group ? u.group.position : u.pos;
    if (Math.hypot(up.x - p.x, up.z - p.z) < 55) { seen = true; break; }
  }
  const sinceCrime = world.time - (world.lastCrimeT || 0);
  if (!seen && sinceCrime > 14) {
    world.coolT = (world.coolT || 0) + dt;
    if (world.coolT > 7) {
      world.wanted = Math.max(0, world.wanted - 1);
      world.coolT = 0;
      if (world.wanted === 0) clearPolice(world);
      if (world.hud) world.hud.flashWanted();
    }
  } else {
    world.coolT = 0;
  }
}

export function clearPolice(world) {
  for (const u of world.police) {
    if (u.group) {
      u.group.parent && u.group.parent.remove(u.group);
    }
    const ci = world.cars.indexOf(u);
    if (ci >= 0) world.cars.splice(ci, 1);
    const pi = world.peds.indexOf(u);
    if (pi >= 0) world.peds.splice(pi, 1);
  }
  world.police.length = 0;
}
