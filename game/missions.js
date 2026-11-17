// missions.js — the story of Solmar Bay: three missions with objectives,
// waypoints, progression and rewards. Each mission is a list of objectives;
// an objective is done when the player reaches its waypoint (or does its
// action). Waypoints show as a golden beacon in 3D, a blip on the minimap
// and a line in the HUD objective box.
import * as THREE from './vendor/three.module.min.js';

const BEACON_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 });
const BEACON_RING = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Delivery',
    brief: 'Mara needs a package across town. Get in a car, then drive to the golden marker. No police, no trouble — just drive.',
    reward: 150,
    objectives: [
      { id: 'car', text: 'Get in a car (walk up to one and press E)', kind: 'enterCar' },
      { id: 'drive', text: 'Drive to the delivery point', kind: 'goto', at: 'delivery' },
    ],
  },
  {
    id: 'm2',
    title: 'The Getaway',
    brief: 'A Comet GT is parked by the plaza and its owner left the keys in it. Take it — then lose the cops who come looking.',
    reward: 320,
    objectives: [
      { id: 'steal', text: 'Steal the Comet GT by Solmar Plaza', kind: 'stealCar', carType: 'sport' },
      { id: 'escape', text: 'Lose the police (get your wanted level to 0)', kind: 'loseWanted' },
      { id: 'hide', text: 'Park at the safehouse on the west side', kind: 'goto', at: 'safehouse' },
    ],
  },
  {
    id: 'm3',
    title: 'Harbor Heist',
    brief: 'The crew is waiting at the harbor containers. Pick up the goods, and bring them back through a city that wants you caught.',
    reward: 650,
    objectives: [
      { id: 'crew', text: 'Drive to the harbor container yard', kind: 'goto', at: 'harbor' },
      { id: 'goods', text: 'Grab the goods (stand in the marker)', kind: 'stand', at: 'harbor', secs: 4 },
      { id: 'return', text: 'Escape to the safehouse with the goods', kind: 'goto', at: 'safehouse' },
    ],
  },
];

const SPOTS = {
  delivery: { x: 150, z: -120 },
  safehouse: { x: -150, z: -120 },
  harbor: { x: 150, z: 120 },
  plaza: { x: 0, z: 0 },
};

export function makeMissions(scene, world) {
  // the golden waypoint beacon (a tall pillar + a ground ring)
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 12, 1, true), BEACON_MAT);
  pillar.position.y = 30;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 24), BEACON_RING);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(pillar, ring);
  beacon.visible = false;
  scene.add(beacon);

  const state = {
    index: 0,            // current mission
    objIndex: 0,         // current objective
    done: false,
    standT: 0,
    beacon,
  };

  function spot(name) {
    if (SPOTS[name]) return SPOTS[name];
    const lm = world.city.landmarks[name];
    return lm || { x: 0, z: 0 };
  }

  function current() {
    if (state.index >= MISSIONS.length) return null;
    return MISSIONS[state.index];
  }
  function currentObj() {
    const m = current();
    if (!m) return null;
    return m.objectives[state.objIndex] || null;
  }

  function refreshBeacon() {
    const o = currentObj();
    if (!o || !o.at) { beacon.visible = false; return; }
    const s = spot(o.at);
    beacon.position.set(s.x, 0, s.z);
    beacon.visible = true;
  }

  function objectiveText() {
    const m = current();
    if (!m) return 'All missions complete — free roam. Keep the city yours.';
    const o = currentObj();
    return `${m.title}: ${o ? o.text : ''}`;
  }

  function completeObjective(world) {
    const m = current();
    const o = currentObj();
    if (!m || !o) return;
    state.objIndex++;
    state.standT = 0;
    if (world.audio) world.audio.sfxPickup();
    if (world.hud) world.hud.toast(`Objective done: ${o.text}`);
    if (state.objIndex >= m.objectives.length) {
      world.money += m.reward;
      if (world.audio) world.audio.sfxMissionDone();
      if (world.hud) world.hud.banner('MISSION COMPLETE', `${m.title}  ·  +$${m.reward}`);
      state.index++;
      state.objIndex = 0;
      if (state.index >= MISSIONS.length) {
        state.done = true;
        if (world.hud) world.hud.toast('Story complete! Free roam — the city is yours.');
      }
      world.saveGame && world.saveGame();
    }
    refreshBeacon();
  }

  function waypointPos() {
    const o = currentObj();
    if (!o || !o.at) return null;
    return spot(o.at);
  }

  return {
    state,
    current,
    currentObj,
    objectiveText,
    waypointPos,
    refreshBeacon,
    start() { refreshBeacon(); },
    setProgress(missionIndex, objIndex) {
      state.index = Math.min(missionIndex, MISSIONS.length);
      state.objIndex = objIndex || 0;
      state.done = state.index >= MISSIONS.length;
      refreshBeacon();
    },
    // Called every frame. Handles objective completion.
    update(dt, world) {
      const m = current();
      const o = currentObj();
      if (!m || !o) { beacon.visible = false; return; }
      beacon.rotation.y += dt * 0.8;
      const p = world.player.pos;
      if (o.kind === 'enterCar') {
        if (!world.player.onFoot) completeObjective(world);
      } else if (o.kind === 'goto') {
        const s = spot(o.at);
        if (Math.hypot(p.x - s.x, p.z - s.z) < 7) completeObjective(world);
      } else if (o.kind === 'stealCar') {
        // done when the player is driving a sport car
        if (world.player.car && world.player.car.type === 'sport') completeObjective(world);
      } else if (o.kind === 'loseWanted') {
        if (world.wanted <= 0) completeObjective(world);
      } else if (o.kind === 'stand') {
        const s = spot(o.at);
        if (Math.hypot(p.x - s.x, p.z - s.z) < 6) {
          state.standT += dt;
          if (state.standT >= (o.secs || 3)) completeObjective(world);
        } else state.standT = 0;
      }
    },
  };
}
