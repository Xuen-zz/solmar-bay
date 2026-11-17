// people.js — pedestrians: low-poly walkers who stroll the sidewalks,
// cross at intersections, and flee from danger (fast cars, gunfire, police).
import * as THREE from './vendor/three.module.min.js';
import { ROAD_CENTERS, HALF, ROAD } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xfd79a8];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

// A simple person facing +z: torso, head, legs, arms. Height ~1.8.
export function makePedMesh(shirtColor, skinColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.95 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.68; head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), pants);
  legL.position.set(-0.16, 0.39, 0); legL.name = 'legL';
  const legR = legL.clone(); legR.position.x = 0.16; legR.name = 'legR';
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.4, 1.12, 0); armL.name = 'armL';
  const armR = armL.clone(); armR.position.x = 0.4; armR.name = 'armR';
  g.add(torso, head, legL, legR, armL, armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function spawnPed(scene, city) {
  const shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  const group = makePedMesh(shirt, skin);
  // start on a sidewalk beside a road
  const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
  const along = (Math.random() * 2 - 1) * (HALF - 20);
  const side = Math.random() < 0.5 ? -1 : 1;
  const onX = Math.random() < 0.5;
  const x = onX ? along : road + side * (ROAD / 2 + 1.5);
  const z = onX ? road + side * (ROAD / 2 + 1.5) : along;
  const ped = {
    group,
    pos: group.position,
    heading: Math.random() * Math.PI * 2,
    speed: 1.1 + Math.random() * 0.9,
    walkSpeed: 1.1 + Math.random() * 0.9,
    state: 'walk',       // walk | flee | down | run
    stateT: 0,
    targetHeading: null,
    down: false,
    downT: 0,
    phase: Math.random() * 10,
  };
  group.position.set(x, 0, z);
  group.rotation.y = ped.heading;
  scene.add(group);
  return ped;
}

function forwardOf(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

// Pick a new sidewalk heading: along a road, either direction.
function pickSidewalkHeading(ped) {
  const onXRoad = Math.abs(ped.pos.z - nearestRoad(ped.pos.z)) < Math.abs(ped.pos.x - nearestRoad(ped.pos.x));
  if (onXRoad) return Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  return Math.random() < 0.5 ? 0 : Math.PI;
}
function nearestRoad(v) {
  let best = ROAD_CENTERS[0], bd = 1e9;
  for (const c of ROAD_CENTERS) { const d = Math.abs(v - c); if (d < bd) { bd = d; best = c; } }
  return best;
}

export function updatePed(ped, dt, world) {
  const g = ped.group;
  ped.stateT += dt;
  if (ped.down) {
    ped.downT += dt;
    g.rotation.x = Math.min(Math.PI / 2, g.rotation.x + 6 * dt); // fall over
    if (ped.downT > 6) { ped.down = false; g.rotation.x = 0; ped.state = 'flee'; ped.stateT = 0; }
    return;
  }
  g.rotation.x = 0;

  // danger: a fast car or a gunshot nearby -> flee
  let danger = null;
  for (const c of world.cars) {
    const d = Math.hypot(c.group.position.x - g.position.x, c.group.position.z - g.position.z);
    if (d < 9 && Math.abs(c.speed || 0) > 9) { danger = c.group.position; break; }
  }
  if (world.gunshotAt && Math.hypot(world.gunshotAt.x - g.position.x, world.gunshotAt.z - g.position.z) < 22) {
    danger = world.gunshotAt;
  }
  if (danger && ped.state !== 'flee') { ped.state = 'flee'; ped.stateT = 0; }
  if (ped.state === 'flee' && ped.stateT > 3.5) { ped.state = 'walk'; ped.stateT = 0; }

  const speed = ped.state === 'flee' ? 4.6 : ped.walkSpeed;
  if (ped.state === 'flee' && danger) {
    // run away from the danger
    const away = Math.atan2(g.position.x - danger.x, g.position.z - danger.z);
    ped.heading = away;
  } else if (ped.stateT > 6 + Math.random() * 4 || ped.targetHeading === null) {
    ped.targetHeading = pickSidewalkHeading(ped);
    ped.stateT = 0;
  }
  if (ped.targetHeading !== null) {
    let diff = ped.targetHeading - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += Math.sign(diff) * Math.min(Math.abs(diff), 3.2 * dt);
  }

  const f = forwardOf(ped.heading);
  g.position.x += f.x * speed * dt;
  g.position.z += f.z * speed * dt;
  // stay on sidewalks: steer back toward the nearest road's edge
  const rx = nearestRoad(g.position.x), rz = nearestRoad(g.position.z);
  const dxRoad = Math.abs(g.position.x - rx), dzRoad = Math.abs(g.position.z - rz);
  if (dxRoad > ROAD / 2 + 3 && dzRoad > ROAD / 2 + 3) {
    // wandered into a block: turn back toward the closest road
    ped.targetHeading = dxRoad < dzRoad
      ? Math.atan2(rx - g.position.x, 0)
      : Math.atan2(0, rz - g.position.z);
  }
  // keep inside the city
  g.position.x = Math.max(-HALF - 2, Math.min(HALF + 2, g.position.x));
  g.position.z = Math.max(-HALF - 2, Math.min(HALF + 2, g.position.z));
  // building collision (simple push-out)
  world.city.resolveCollision(g.position, 0.6);
  g.rotation.y = ped.heading;

  // walk-cycle swing
  ped.phase += dt * speed * 3.4;
  const sw = Math.sin(ped.phase) * 0.55;
  g.userData.legL.rotation.x = sw;
  g.userData.legR.rotation.x = -sw;
  g.userData.armL.rotation.x = -sw * 0.7;
  g.userData.armR.rotation.x = sw * 0.7;
}

// Knock a pedestrian down (car hit). Returns true if it was standing.
export function knockPedDown(ped) {
  if (ped.down) return false;
  ped.down = true;
  ped.downT = 0;
  return true;
}
