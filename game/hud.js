// hud.js — the on-screen HUD: wanted stars, money, health, mission
// objective, minimap (a top-down canvas of the city), speed, prompts,
// banners and toasts. All DOM; the minimap is a 2D canvas redrawn each frame.
import { ROAD_CENTERS, HALF, BLOCK, ROAD } from './city.js';

export function makeHud(world) {
  const el = (id) => document.getElementById(id);
  const starsEl = el('stars');
  const moneyEl = el('money');
  const healthEl = el('health');
  const objEl = el('objText');
  const mapEl = el('minimap');
  const mapCtx = mapEl.getContext('2d');
  const speedVal = el('speedVal');
  const carNameEl = el('carName');
  const promptEl = el('prompt');
  const crossEl = el('crosshair');
  const bannerEl = el('banner');
  const bannerTitle = el('bannerTitle');
  const bannerSub = el('bannerSub');
  const toastEl = el('toast');
  const clockEl = el('clock');
  const damageEl = el('damage');
  const hudRoot = el('hud');
  let bannerT = 0;
  let toastT = 0;
  let wantedFlashT = 0;

  function drawMinimap() {
    const W = 220, S = W / (HALF * 2 + 40);
    const toMap = (x, z) => [W / 2 + x * S, W / 2 + z * S];
    mapCtx.clearRect(0, 0, W, W);
    // water + land
    mapCtx.fillStyle = '#1d5f8a';
    mapCtx.fillRect(0, 0, W, W);
    mapCtx.fillStyle = '#8a9a7a';
    const [bx0, bz0] = toMap(-HALF - 16, -HALF - 16);
    mapCtx.fillRect(bx0, bz0, (HALF + 16) * 2 * S, (HALF + 16) * 2 * S);
    // blocks
    mapCtx.fillStyle = '#5a6a72';
    for (let i = 0; i < ROAD_CENTERS.length - 1; i++) {
      for (let j = 0; j < ROAD_CENTERS.length - 1; j++) {
        const x0 = ROAD_CENTERS[i] + ROAD / 2, z0 = ROAD_CENTERS[j] + ROAD / 2;
        const [px, pz] = toMap(x0, z0);
        mapCtx.fillRect(px, pz, BLOCK * S, BLOCK * S);
      }
    }
    // roads
    mapCtx.strokeStyle = '#2c2f33';
    mapCtx.lineWidth = ROAD * S;
    for (const c of ROAD_CENTERS) {
      const [x1] = toMap(c, 0);
      mapCtx.beginPath(); mapCtx.moveTo(x1, 0); mapCtx.lineTo(x1, W); mapCtx.stroke();
      const [, z1] = toMap(0, c);
      mapCtx.beginPath(); mapCtx.moveTo(0, z1); mapCtx.lineTo(W, z1); mapCtx.stroke();
    }
    // harbor
    mapCtx.fillStyle = '#2f7fc2';
    const [hx, hz] = toMap(HALF + 16, 60);
    mapCtx.fillRect(hx - 8, hz - 6, 16, 12);
    // mission waypoint
    const wp = world.missions && world.missions.waypointPos();
    if (wp) {
      const [wx, wz] = toMap(wp.x, wp.z);
      const pulse = 5 + Math.sin(world.time * 5) * 2;
      mapCtx.fillStyle = '#ffd23f';
      mapCtx.beginPath(); mapCtx.arc(wx, wz, pulse, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(wx, wz, pulse + 3, 0, Math.PI * 2); mapCtx.stroke();
    }
    // traffic cars (white dots)
    mapCtx.fillStyle = '#e8e8e8';
    for (const c of world.cars) {
      if (c.isPlayer) continue;
      const [cx, cz] = toMap(c.group.position.x, c.group.position.z);
      mapCtx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // police (blue flashing dots)
    const blink = Math.sin(world.time * 8) > 0;
    mapCtx.fillStyle = blink ? '#3a86ff' : '#ff3b30';
    for (const u of world.police) {
      const up = u.group ? u.group.position : u.pos;
      const [ux, uz] = toMap(up.x, up.z);
      mapCtx.beginPath(); mapCtx.arc(ux, uz, 3.5, 0, Math.PI * 2); mapCtx.fill();
    }
    // player arrow (yellow, rotated by heading)
    const p = world.player;
    const [px, pz] = toMap(p.pos.x, p.pos.z);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(-p.heading + Math.PI);
    mapCtx.fillStyle = '#ffd23f';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6); mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    // north + view cone
    mapCtx.fillStyle = 'rgba(255,255,255,0.85)';
    mapCtx.font = 'bold 11px sans-serif';
    mapCtx.fillText('N', 6, 13);
  }

  function renderStars() {
    let s = '';
    for (let i = 0; i < 5; i++) {
      s += `<span class="${i < world.wanted ? '' : 'off'}">★</span>`;
    }
    starsEl.innerHTML = s;
  }

  return {
    show() { hudRoot.classList.remove('hidden'); },
    hide() { hudRoot.classList.add('hidden'); },
    flashWanted() { wantedFlashT = 0.6; },
    toast(msg) {
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      toastT = 2.6;
    },
    banner(title, sub) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub || '';
      bannerEl.style.display = 'block';
      bannerT = 3.2;
    },
    hideBanner() { bannerEl.style.display = 'none'; bannerT = 0; },
    setPrompt(html) {
      if (!html) { promptEl.classList.add('hidden'); return; }
      promptEl.innerHTML = html;
      promptEl.classList.remove('hidden');
    },
    setCrosshair(on) { crossEl.style.display = on ? 'block' : 'none'; },
    update(dt) {
      // stars
      renderStars();
      if (wantedFlashT > 0) {
        wantedFlashT -= dt;
        starsEl.style.opacity = (Math.sin(world.time * 18) > 0) ? '1' : '0.35';
      } else starsEl.style.opacity = '1';
      moneyEl.textContent = '$' + Math.floor(world.money).toLocaleString('en-US');
      const hp = Math.max(0, world.player.health);
      healthEl.style.width = hp + '%';
      healthEl.style.background = hp > 50 ? 'linear-gradient(90deg,#37d67a,#a5e34a)'
        : hp > 25 ? 'linear-gradient(90deg,#f39c12,#f5d76e)' : 'linear-gradient(90deg,#e74c3c,#ff6b6b)';
      objEl.textContent = world.missions ? world.missions.objectiveText() : '';
      // clock: 1 game-hour per 150 real seconds, starting 09:00
      const mins = 9 * 60 + Math.floor(world.time / 2.5);
      const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      clockEl.textContent = `DAY 1 · ${hh}:${mm}`;
      // speed
      const spd = world.player.car ? Math.abs(world.player.car.speed) * 3.6 : Math.abs(world.player.speed) * 3.6;
      speedVal.textContent = String(Math.round(spd));
      carNameEl.textContent = world.player.car ? world.player.car.name : (world.player.onFoot ? 'ON FOOT' : '');
      // damage vignette
      const hurt = world.player.hurtT > 0 ? Math.min(1, world.player.hurtT * 3) : 0;
      damageEl.style.opacity = String(hurt);
      // banner / toast timers
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.style.display = 'none'; }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.display = 'none'; }
      drawMinimap();
    },
  };
}
