// vehicles.js — car models, traffic AI and player driving physics.
// Cars are built from boxes (low-poly, original designs). Traffic follows the
// road grid with right-hand lanes, slows for the car ahead and turns at
// intersections. Player driving is arcade: accelerate / brake / reverse /
// handbrake, with steering that scales with speed.
import * as THREE from './vendor/three.module.min.js';
import { ROAD_CENTERS, HALF, ROAD } from './city.js';

export const CAR_TYPES = {
  sedan:   { name: 'Solmar Sedan',   maxSpeed: 34, accel: 16, colors: [0xc0392b, 0x2e86c1, 0x7d8a96, 0xe67e22, 0x95a5a6] },
  taxi:    { name: 'Bay Taxi',       maxSpeed: 32, accel: 15, colors: [0xf1c40f] },
  sport:   { name: 'Comet GT',       maxSpeed: 44, accel: 22, colors: [0x8e0000, 0x111111, 0x1a5276] },
  truck:   { name: 'Harbor Truck',   maxSpeed: 26, accel: 11, colors: [0x6e7b8b, 0x7d6608] },
  van:     { name: 'Courier Van',    maxSpeed: 30, accel: 13, colors: [0xeaf2f8, 0x2c3e50] },
  police:  { name: 'SBPD Interceptor', maxSpeed: 40, accel: 20, colors: [0x111111] },
};

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

function makeWheel(x, z) {
  const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.42, z);
  w.castShadow = true;
  return w;
}

// Build a low-poly car facing +z (front toward +z). Returns a THREE.Group.
export function makeCarMesh(type, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.15, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 });

  const isTruck = type === 'truck';
  const isVan = type === 'van';
  const L = isTruck ? 5.6 : isVan ? 5.0 : 4.4;   // length (z)
  const W = isTruck ? 2.4 : 2.0;                  // width (x)
  const bodyH = isTruck ? 1.5 : 0.75;

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);

  if (isTruck) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W, 1.1, 1.6), paint);
    cab.position.set(0, 1.9, L / 2 - 1.0);
    cab.castShadow = true;
    g.add(cab);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.8, 0.1), glass);
    windshield.position.set(0, 1.9, L / 2 - 0.18);
    g.add(windshield);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W - 0.15, 0.5, L - 2.2), dark);
    bed.position.set(0, 1.55, -0.8);
    g.add(bed);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.28, 0.62, L * 0.48), glass);
    cabin.position.set(0, 1.42, -L * 0.06);
    cabin.castShadow = true;
    g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.1, L * 0.5), paint);
    roof.position.set(0, 1.76, -L * 0.06);
    g.add(roof);
    // headlights / taillights
    const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.7 });
    const tl = new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x7a1010, emissiveIntensity: 0.8 });
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), hl);
      h.position.set(sx * (W / 2 - 0.32), 0.82, L / 2 + 0.02);
      g.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tl);
      t.position.set(sx * (W / 2 - 0.32), 0.82, -L / 2 - 0.02);
      g.add(t);
    }
  }

  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.95, 0);
    g.add(sign);
  }
  if (type === 'police') {
    // black body, white doors, light bar
    const door = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.5, L * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    door.position.set(0, 0.78, 0);
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2233ff, emissive: 0x2233ff, emissiveIntensity: 1.2 }));
    bar.position.set(0, 1.92, -0.1);
    bar.name = 'lightbar';
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.2 }));
    bar2.position.set(0.62, 1.92, -0.1);
    bar2.name = 'lightbar2';
    g.add(bar2);
  }

  const wheelZ = L / 2 - 0.85;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(makeWheel(sx * (W / 2 - 0.05), sz * wheelZ));

  g.userData.length = L;
  g.userData.width = W;
  return g;
}

function laneOffset(axis, dir) {
  // right-hand traffic: lane offset perpendicular to travel direction
  if (axis === 'x') return dir > 0 ? 3.2 : -3.2;   // driving +-x, offset in z
  return dir > 0 ? -3.2 : 3.2;                     // driving +-z, offset in x
}
function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}
function forwardOf(heading) { return { x: Math.sin(heading), z: Math.cos(heading) }; }

export function makeCar(type, color, opts = {}) {
  const group = makeCarMesh(type, color);
  const cfg = CAR_TYPES[type] || CAR_TYPES.sedan;
  const car = {
    group, type, color,
    name: cfg.name,
    heading: opts.heading ?? 0,
    speed: 0,
    maxSpeed: cfg.maxSpeed,
    accel: cfg.accel,
    isPlayer: !!opts.isPlayer,
    isPolice: type === 'police',
    isTraffic: !!opts.isTraffic,
    driver: opts.driver ?? null,
    axis: opts.axis || 'x',
    dir: opts.dir || 1,
    targetSpeed: 9 + Math.random() * 5,
    turning: 0,          // 0 = straight; else target heading while turning
    turnTimer: 0,
    sirenPhase: Math.random() * 10,
    length: group.userData.length,
    width: group.userData.width,
  };
  group.position.set(opts.x ?? 0, 0, opts.z ?? 0);
  group.rotation.y = car.heading;
  return car;
}

export function spawnTrafficCar(scene, city, count = 0) {
  const types = ['sedan', 'sedan', 'taxi', 'sport', 'truck', 'van'];
  const type = types[Math.floor(Math.random() * types.length)];
  const cfg = CAR_TYPES[type];
  const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const dir = Math.random() < 0.5 ? 1 : -1;
  const road = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
  const along = (Math.random() * 2 - 1) * (HALF - 30);
  const off = laneOffset(axis, dir);
  const x = axis === 'x' ? along : road + off;
  const z = axis === 'x' ? road + off : along;
  const car = makeCar(type, color, { x, z, axis, dir, heading: headingFor(axis, dir), isTraffic: true });
  scene.add(car.group);
  return car;
}

function carAhead(car, others, lookAhead) {
  const f = forwardOf(car.heading);
  let best = null, bestD = lookAhead;
  for (const o of others) {
    if (o === car) continue;
    const dx = o.group.position.x - car.group.position.x;
    const dz = o.group.position.z - car.group.position.z;
    const along = dx * f.x + dz * f.z;
    if (along < 0 || along > lookAhead) continue;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (side > 3.4) continue;
    if (along < bestD) { bestD = along; best = o; }
  }
  return best ? bestD : null;
}

export function updateTraffic(car, dt, world) {
  if (car.turning !== 0) {
    // ease the heading toward the turn target
    let diff = car.turning - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 2.4 * dt);
    car.heading += step;
    car.speed = Math.min(car.speed, 7);
    car.turnTimer += dt;
    if (Math.abs(diff) < 0.06 || car.turnTimer > 1.6) {
      car.heading = car.turning;
      car.turning = 0;
      car.turnTimer = 0;
      // settle onto the new axis/dir
      if (Math.abs(Math.sin(car.heading)) > 0.7) { car.axis = 'x'; car.dir = Math.sin(car.heading) > 0 ? 1 : -1; }
      else { car.axis = 'z'; car.dir = Math.cos(car.heading) > 0 ? 1 : -1; }
    }
  } else {
    // decide a turn at intersections
    const p = car.group.position;
    const cross = car.axis === 'x' ? ROAD_CENTERS : ROAD_CENTERS;
    const along = car.axis === 'x' ? p.x : p.z;
    for (const c of cross) {
      const d = (c - along) * car.dir;
      if (d > 0 && d < 2.5 && Math.abs((car.axis === 'x' ? p.z : p.x) - c) > 1) {
        // near an intersection on the cross axis: maybe turn
        if (Math.random() < 0.38) {
          const turnLeft = Math.random() < 0.5;
          const delta = turnLeft ? Math.PI / 2 : -Math.PI / 2;
          // turning left/right relative to travel: for axis x dir +1, left = -z heading...
          car.turning = car.heading + delta;
          car.turnTimer = 0;
        }
        break;
      }
    }
    // reverse direction at the city edge
    if (Math.abs(along) > HALF - 8) {
      car.dir *= -1;
      car.heading = headingFor(car.axis, car.dir);
    }
  }

  // slow for the car ahead (traffic + player)
  const ahead = carAhead(car, world.cars, 16);
  let want = car.targetSpeed;
  if (ahead !== null) want = Math.min(want, Math.max(0, (ahead - 8) * 0.9));
  // slow near the player on foot in front
  const pp = world.player;
  if (pp && pp.onFoot) {
    const f = forwardOf(car.heading);
    const dx = pp.pos.x - car.group.position.x;
    const dz = pp.pos.z - car.group.position.z;
    const along = dx * f.x + dz * f.z;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (along > 0 && along < 12 && side < 3) want = 0;
  }
  car.speed += Math.sign(want - car.speed) * Math.min(Math.abs(want - car.speed), car.accel * 0.6 * dt);

  const f = forwardOf(car.heading);
  car.group.position.x += f.x * car.speed * dt;
  car.group.position.z += f.z * car.speed * dt;
  // keep on its lane
  if (car.axis === 'x') {
    const road = nearestRoad(car.group.position.z);
    car.group.position.z += ((road + laneOffset('x', car.dir)) - car.group.position.z) * Math.min(1, 1.6 * dt);
  } else {
    const road = nearestRoad(car.group.position.x);
    car.group.position.x += ((road + laneOffset('z', car.dir)) - car.group.position.x) * Math.min(1, 1.6 * dt);
  }
  car.group.rotation.y = car.heading;
  // clamp inside the city
  car.group.position.x = Math.max(-HALF - 6, Math.min(HALF + 6, car.group.position.x));
  car.group.position.z = Math.max(-HALF - 6, Math.min(HALF + 6, car.group.position.z));
}

function nearestRoad(v) {
  let best = ROAD_CENTERS[0], bd = 1e9;
  for (const c of ROAD_CENTERS) { const d = Math.abs(v - c); if (d < bd) { bd = d; best = c; } }
  return best;
}

// Player driving: arcade physics. Returns { crashed } when it hit something hard.
export function updatePlayerCar(car, input, dt, world) {
  const fwd = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const handbrake = input.handbrake;

  if (fwd) car.speed += car.accel * dt;
  if (back) {
    if (car.speed > 0.5) car.speed -= car.accel * 1.6 * dt;
    else car.speed -= car.accel * 0.7 * dt;
  }
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-13, Math.min(car.maxSpeed, car.speed));

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 8) * (handbrake ? 1.5 : 1);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.heading += steer * 1.9 * steerAuthority * dirSign * dt;

  const f = forwardOf(car.heading);
  const p = car.group.position;
  p.x += f.x * car.speed * dt;
  p.z += f.z * car.speed * dt;

  // buildings
  let crashed = false;
  if (world.city.resolveCollision(p, 2.1)) {
    if (Math.abs(car.speed) > 12) crashed = true;
    car.speed *= 0.45;
  }
  // city bounds
  p.x = Math.max(-HALF - 4, Math.min(HALF + 26, p.x));
  p.z = Math.max(-HALF - 4, Math.min(HALF + 26, p.z));

  // other cars: circle push
  for (const o of world.cars) {
    if (o === car) continue;
    const dx = o.group.position.x - p.x;
    const dz = o.group.position.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = 3.1;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      p.x -= nx * push; p.z -= nz * push;
      o.group.position.x += nx * push; o.group.position.z += nz * push;
      const rel = Math.abs(car.speed - (o.speed || 0));
      if (rel > 8) crashed = true;
      car.speed *= 0.6;
      if (o.isTraffic) { o.speed *= 0.4; o.targetSpeed = 0; setTimeout(() => { o.targetSpeed = 9 + Math.random() * 5; }, 2500); }
    }
  }
  car.group.rotation.y = car.heading;
  return { crashed };
}
