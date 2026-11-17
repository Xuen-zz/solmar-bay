// city.js — builds the 3D city of Solmar Bay: roads, blocks, buildings,
// parks, trees, streetlights, beach, water and a small harbor pier.
// Exports buildCity(scene) -> { bounds, buildings, roadCenters, block, road,
//   isOnRoad(x,z), resolveCollision(pos, radius), randomRoadPoint(), landmarks }
import * as THREE from './vendor/three.module.min.js';

export const BLOCK = 46;      // city block size
export const ROAD = 14;       // road width
export const N = 6;           // blocks per side
export const HALF = (N * BLOCK + (N + 1) * ROAD) / 2; // 187, city half-extent

// Road centerlines, -180 .. 180 step 60.
export const ROAD_CENTERS = [];
for (let i = 0; i <= N; i++) ROAD_CENTERS.push(-HALF + ROAD / 2 + i * (BLOCK + ROAD));

const BUILDING_COLORS = [0xe8b04b, 0xd96c4f, 0x7fb3d5, 0x9b8ec4, 0xe6e0d4, 0x5fa08a, 0xc96f6f, 0x6fa8a0];
const ROOF_COLORS = [0x5a5a60, 0x7a6a5a, 0x4a5560, 0x8a7a6a];

function makeWindowTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  // window grid
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(20,30,50,0.85)';
      g.fillRect(10 + col * 23, 12 + row * 20, 15, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 128, 128);
  // asphalt speckle
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // edge lines
  g.fillStyle = '#e8e8e8';
  g.fillRect(4, 0, 3, 128);
  g.fillRect(121, 0, 3, 128);
  // dashed center line (runs along local x)
  g.fillStyle = '#ffd23f';
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 62, 18, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function box(w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function buildCity(scene) {
  const buildings = [];   // {minX,maxX,minZ,maxZ,h}
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- ground: big sand/grass island, water beyond it ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x9db98a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ color: 0x2f7fc2, roughness: 0.25, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  group.add(water);

  // sand beach ring just outside the city grid
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 46, HALF * 2 + 46),
    new THREE.MeshStandardMaterial({ color: 0xe8d8a8, roughness: 1 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = 0.0;
  beach.receiveShadow = true;
  group.add(beach);

  // ---- city base slab ----
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 8, HALF * 2 + 8),
    new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = 0.02;
  slab.receiveShadow = true;
  group.add(slab);

  // ---- roads (dark strips with dashes) ----
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const span = HALF * 2 + 8;
  for (const c of ROAD_CENTERS) {
    // road along x
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD), roadMat.clone());
    rx.material.map = roadTex.clone();
    rx.material.map.repeat.set(span / 16, 1);
    rx.material.map.needsUpdate = true;
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.06, c);
    rx.receiveShadow = true;
    group.add(rx);
    // road along z
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD), roadMat.clone());
    rz.material.map = roadTex.clone();
    rz.material.map.repeat.set(span / 16, 1);
    rz.material.map.needsUpdate = true;
    rz.rotation.x = -Math.PI / 2;
    rz.rotation.z = Math.PI / 2;
    rz.position.set(c, 0.06, 0);
    rz.receiveShadow = true;
    group.add(rz);
  }

  // ---- blocks: slabs, buildings, parks ----
  const winTexes = BUILDING_COLORS.map((col) => {
    const hex = '#' + col.toString(16).padStart(6, '0');
    return makeWindowTexture(hex, 0.28);
  });
  const roofMats = ROOF_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 1 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x6fae62, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5cb85c, roughness: 1 });

  const landmarks = {};
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function addTree(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.4 * s, 2.6 * s, 6), trunkMat);
    trunk.position.y = 1.3 * s; trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0 * s, 1), rnd() < 0.5 ? leafMat : leafMat2);
    crown.position.y = 3.6 * s; crown.castShadow = true;
    t.add(trunk, crown);
    t.position.set(x, 0, z);
    group.add(t);
  }

  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const x0 = ROAD_CENTERS[bi] + ROAD / 2;
      const z0 = ROAD_CENTERS[bj] + ROAD / 2;
      const cx = x0 + BLOCK / 2;
      const cz = z0 + BLOCK / 2;
      const isPark = (bi === 2 && bj === 2) || (bi === 4 && bj === 3) || (bi === 1 && bj === 4);
      const isPlaza = (bi === 3 && bj === 3);
      const slabB = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.5, BLOCK), isPark ? parkMat : blockMat);
      slabB.position.set(cx, 0.25, cz);
      slabB.receiveShadow = true;
      group.add(slabB);

      if (isPark) {
        for (let k = 0; k < 7; k++) addTree(x0 + 5 + rnd() * (BLOCK - 10), z0 + 5 + rnd() * (BLOCK - 10), 0.9 + rnd() * 0.7);
        // park bench + fountain pad
        group.add(box(6, 0.6, 6, new THREE.MeshStandardMaterial({ color: 0x9fd8ef, roughness: 0.4 }), cx, 0.8, cz));
        continue;
      }
      if (isPlaza) {
        // Solmar Plaza: the mission start / story hub
        landmarks.plaza = { x: cx, z: cz };
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.2, 20),
          new THREE.MeshStandardMaterial({ color: 0x7fc4e8, roughness: 0.3 }));
        fountain.position.set(cx, 1.1, cz);
        fountain.castShadow = true;
        group.add(fountain);
        for (let k = 0; k < 4; k++) addTree(x0 + 6 + rnd() * (BLOCK - 12), z0 + 6 + rnd() * (BLOCK - 12));
        continue;
      }
      // buildings: 2x2 grid of towers, some blocks 1 big tower
      const big = rnd() < 0.25;
      const cells = big ? [{ dx: 0, dz: 0, w: BLOCK - 12, d: BLOCK - 12 }] : [
        { dx: -BLOCK / 4, dz: -BLOCK / 4, w: BLOCK / 2 - 4, d: BLOCK / 2 - 4 },
        { dx: BLOCK / 4, dz: -BLOCK / 4, w: BLOCK / 2 - 4, d: BLOCK / 2 - 4 },
        { dx: -BLOCK / 4, dz: BLOCK / 4, w: BLOCK / 2 - 4, d: BLOCK / 2 - 4 },
        { dx: BLOCK / 4, dz: BLOCK / 4, w: BLOCK / 2 - 4, d: BLOCK / 2 - 4 },
      ];
      for (const cell of cells) {
        if (rnd() < 0.12) continue; // empty lot
        const h = 8 + rnd() * rnd() * 34;
        const ti = Math.floor(rnd() * winTexes.length);
        const side = new THREE.MeshStandardMaterial({ map: winTexes[ti], roughness: 0.85 });
        const roof = roofMats[Math.floor(rnd() * roofMats.length)];
        const mats = [side, side, roof, roof, side, side];
        const b = new THREE.Mesh(new THREE.BoxGeometry(cell.w, h, cell.d), mats);
        const bx = cx + cell.dx, bz = cz + cell.dz;
        b.position.set(bx, 0.5 + h / 2, bz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        // rooftop AC unit
        if (rnd() < 0.6) group.add(box(2.4, 1.2, 2.4, roofMats[0], bx + (rnd() - 0.5) * 4, 0.5 + h + 0.6, bz + (rnd() - 0.5) * 4));
        buildings.push({ minX: bx - cell.w / 2, maxX: bx + cell.w / 2, minZ: bz - cell.d / 2, maxZ: bz + cell.d / 2, h });
      }
      // a couple of trees on the block corners
      if (rnd() < 0.7) addTree(x0 + 3, z0 + 3, 0.8);
      if (rnd() < 0.5) addTree(x0 + BLOCK - 3, z0 + BLOCK - 3, 0.8);
    }
  }

  // ---- harbor pier on the east edge + boats ----
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 1 });
  const pier = box(34, 1.2, 10, pierMat, HALF + 16, 0.4, 60);
  group.add(pier);
  landmarks.harbor = { x: HALF + 16, z: 60 };
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const boatMat2 = new THREE.MeshStandardMaterial({ color: 0x2f6fb2, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const boat = new THREE.Group();
    const hull = box(10, 2.2, 4, i % 2 ? boatMat2 : boatMat, 0, 0.4, 0);
    const cabin = box(4, 2, 3, boatMat, -1, 2.4, 0);
    boat.add(hull, cabin);
    boat.position.set(HALF + 30 + i * 4, -0.4, 46 + i * 16);
    boat.rotation.y = (rnd() - 0.5) * 0.3;
    group.add(boat);
  }
  // container yard near the harbor (the heist target)
  const contColors = [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d];
  for (let i = 0; i < 8; i++) {
    const cm = new THREE.MeshStandardMaterial({ color: contColors[i % 4], roughness: 0.8 });
    const cont = box(8, 3, 3, cm, HALF - 30 + (i % 4) * 10, 2.0, 120 + Math.floor(i / 4) * 6);
    cont.rotation.y = (i % 2) * 0.12;
    group.add(cont);
    buildings.push({ minX: HALF - 34 + (i % 4) * 10, maxX: HALF - 26 + (i % 4) * 10, minZ: 118.5 + Math.floor(i / 4) * 6, maxZ: 121.5 + Math.floor(i / 4) * 6, h: 3.5 });
  }
  landmarks.safehouse = { x: -150, z: -150 };

  // ---- streetlights at intersections ----
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.9 });
  for (const cx of ROAD_CENTERS) {
    for (const cz of ROAD_CENTERS) {
      if ((cx + cz) % 120 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
      pole.position.set(cx + ROAD / 2 - 1, 3.5, cz + ROAD / 2 - 1);
      pole.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(cx + ROAD / 2 - 1, 7.2, cz + ROAD / 2 - 1);
      group.add(pole, lamp);
    }
  }

  // ---- sun + clouds ----
  const sun = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sun.position.set(320, 260, -420);
  scene.add(sun);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(9 + rnd() * 8, 10, 8), cloudMat);
      s.position.set(k * 10 - 10 + rnd() * 4, rnd() * 3, rnd() * 5);
      s.scale.y = 0.45;
      cl.add(s);
    }
    cl.position.set(-320 + rnd() * 640, 150 + rnd() * 60, -320 + rnd() * 640);
    scene.add(cl);
  }

  return {
    bounds: HALF,
    buildings,
    roadCenters: ROAD_CENTERS,
    block: BLOCK,
    road: ROAD,
    landmarks,
    isOnRoad(x, z) {
      for (const c of ROAD_CENTERS) {
        if (Math.abs(x - c) < ROAD / 2 + 1 || Math.abs(z - c) < ROAD / 2 + 1) return true;
      }
      return false;
    },
    // Push a circle (x,z,radius) out of building AABBs. Returns true if it hit.
    resolveCollision(p, radius) {
      let hit = false;
      for (const b of buildings) {
        const nx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x = nx + (dx / d) * radius;
            p.z = nz + (dz / d) * radius;
          } else {
            // center inside the box: push out along the smallest penetration axis
            const pl = p.x - b.minX, pr = b.maxX - p.x, pt = p.z - b.minZ, pb = b.maxZ - p.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) p.x = b.minX - radius;
            else if (m === pr) p.x = b.maxX + radius;
            else if (m === pt) p.z = b.minZ - radius;
            else p.z = b.maxZ + radius;
          }
        }
      }
      return hit;
    },
    randomRoadPoint() {
      const c = ROAD_CENTERS[Math.floor(Math.random() * ROAD_CENTERS.length)];
      const along = (Math.random() * 2 - 1) * (HALF - 20);
      if (Math.random() < 0.5) return { x: c + (Math.random() < 0.5 ? -3.2 : 3.2), z: along };
      return { x: along, z: c + (Math.random() < 0.5 ? -3.2 : 3.2) };
    },
  };
}
