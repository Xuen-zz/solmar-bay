// combat.js — on-foot and drive-by combat for Solmar Bay.
// Pistol (hitscan with a tracer + muzzle flash), punch (melee), enemy health,
// and the damage the player takes. No hitscan ever leaves the scene: every
// shot is drawn as a short-lived line in the game's own 3D view.
import * as THREE from './vendor/three.module.min.js';

const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23f });

export function makeCombat(scene, world) {
  const tracers = [];
  const state = {
    shootCooldown: 0,
    punchCooldown: 0,
    muzzleT: 0,
    muzzle: null,
  };

  function addTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    const mesh = new THREE.Mesh(geo, TRACER_MAT);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(mesh);
    tracers.push({ mesh, t: 0.09 });
  }

  function muzzleFlash(at) {
    if (state.muzzle) scene.remove(state.muzzle);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), FLASH_MAT);
    m.position.copy(at);
    scene.add(m);
    state.muzzle = m;
    state.muzzleT = 0.05;
  }

  // Shoot from the camera aim. Returns the thing hit, if any.
  function shoot(origin, dirVec, range, shooterIsPlayer) {
    const o = new THREE.Vector3(origin.x, origin.y, origin.z);
    const d = new THREE.Vector3(dirVec.x, dirVec.y, dirVec.z).normalize();
    let best = null, bestT = range;
    // candidates: peds (not the shooter), police cars, player
    const targets = [];
    for (const ped of world.peds) {
      if (ped.down) continue;
      targets.push({ kind: 'ped', obj: ped, pos: ped.group.position, r: 0.9, y: 1.2 });
    }
    for (const car of world.cars) {
      if (car.isPlayer) continue;
      targets.push({ kind: 'car', obj: car, pos: car.group.position, r: 2.2, y: 1.0 });
    }
    if (!shooterIsPlayer && world.player) {
      targets.push({ kind: 'player', obj: world.player, pos: world.player.pos, r: 0.9, y: 1.2 });
    }
    for (const t of targets) {
      // ray vs vertical cylinder approx: project onto the ray
      const to = new THREE.Vector3(t.pos.x - o.x, t.y - o.y, t.pos.z - o.z);
      const along = to.dot(d);
      if (along < 0.5 || along > bestT) continue;
      const closest = new THREE.Vector3().copy(o).addScaledVector(d, along);
      const dist = Math.hypot(closest.x - t.pos.x, closest.z - t.pos.z);
      if (dist < t.r) { best = t; bestT = along; }
    }
    const end = new THREE.Vector3().copy(o).addScaledVector(d, best ? bestT : range);
    addTracer(o, end);
    muzzleFlash(o);
    if (best) {
      if (best.kind === 'ped') {
        best.obj.down = true; best.obj.downT = 0;
        best.obj.group.rotation.x = Math.PI / 2;
        if (shooterIsPlayer) {
          world.money += 12;
          if (best.obj.isOfficer) world.policeAdd(2, 'shot an officer');
          else world.policeAdd(1, 'shot a pedestrian');
        }
      } else if (best.kind === 'car') {
        if (shooterIsPlayer) world.policeAdd(1, 'shot at a car');
      } else if (best.kind === 'player') {
        damagePlayer(world, 9 + Math.random() * 8);
      }
      return best;
    }
    return null;
  }

  function punch(origin, dirVec) {
    const o = origin;
    const d = dirVec;
    let best = null, bestD = 2.4;
    for (const ped of world.peds) {
      if (ped.down) continue;
      const dx = ped.group.position.x - o.x, dz = ped.group.position.z - o.z;
      const along = dx * d.x + dz * d.z;
      if (along < 0 || along > bestD) continue;
      const side = Math.abs(dx * d.z - dz * d.x);
      if (side < 1.0) { best = ped; bestD = along; }
    }
    if (best) {
      best.down = true; best.downT = 0;
      best.group.rotation.x = Math.PI / 2;
      world.money += 8;
      world.policeAdd(1, 'assault');
      return best;
    }
    return null;
  }

  function damagePlayer(world, amount) {
    if (world.player.invulnT > 0) return;
    world.player.health -= amount;
    world.player.invulnT = 0.5;
    world.player.hurtT = 0.35;
    if (world.audio) world.audio.sfxPunch();
    if (world.player.health <= 0) world.player.health = 0;
  }

  function officerShoot(off, w) {
    const from = new THREE.Vector3(off.group.position.x, 1.4, off.group.position.z);
    const to = new THREE.Vector3(w.player.pos.x - from.x, 1.2 - from.y, w.player.pos.z - from.z);
    shoot(from, to, 30, false);
    if (w.audio) w.audio.sfxShot();
  }

  return {
    update(dt) {
      state.shootCooldown = Math.max(0, state.shootCooldown - dt);
      state.punchCooldown = Math.max(0, state.punchCooldown - dt);
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].t -= dt;
        if (tracers[i].t <= 0) { scene.remove(tracers[i].mesh); tracers.splice(i, 1); }
      }
      if (state.muzzle) {
        state.muzzleT -= dt;
        if (state.muzzleT <= 0) { scene.remove(state.muzzle); state.muzzle = null; }
      }
    },
    // Player fires the pistol from the camera. aimDir is a normalized {x,y,z}.
    playerShoot(origin, aimDir) {
      if (state.shootCooldown > 0) return false;
      state.shootCooldown = 0.32;
      shoot(origin, aimDir, 70, true);
      if (world.audio) world.audio.sfxShot();
      world.gunshotAt = { x: origin.x, z: origin.z };
      return true;
    },
    playerPunch(origin, aimDir) {
      if (state.punchCooldown > 0) return false;
      state.punchCooldown = 0.5;
      const hit = punch(origin, aimDir);
      if (world.audio) world.audio.sfxPunch();
      return !!hit;
    },
    officerShoot,
    damagePlayer,
  };
}
