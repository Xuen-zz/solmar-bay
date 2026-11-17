// audio.js — synthesized sound effects for Solmar Bay.
// Everything is generated with the Web Audio API; no audio files, no network.
// Call init() from a user gesture (the Start button) so the context is allowed.

let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenTimer = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

function now() { return ctx ? ctx.currentTime : 0; }

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass) {
  if (!ctx || muted) return;
  const t = now();
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  let node = src;
  if (lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    src.connect(f); node = f;
  }
  node.connect(g); g.connect(master);
  src.start(t);
}

export function sfxClick() { blip(660, 0.07, 'square', 0.12); }
export function sfxPickup() { blip(523, 0.09, 'sine', 0.2); setTimeout(() => blip(784, 0.14, 'sine', 0.2), 90); }
export function sfxMissionDone() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
}
export function sfxPunch() { noiseBurst(0.12, 0.35, 900); blip(140, 0.1, 'sine', 0.25, 60); }
export function sfxShot() { noiseBurst(0.16, 0.5, 3200); blip(220, 0.08, 'square', 0.2, 55); }
export function sfxCrash() { noiseBurst(0.35, 0.5, 700); blip(90, 0.3, 'sine', 0.3, 40); }
export function sfxBusted() { blip(392, 0.3, 'sawtooth', 0.2, 196); setTimeout(() => blip(311, 0.5, 'sawtooth', 0.2, 233), 280); }
export function sfxWasted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.18), i * 160)); }
export function sfxSirenStart() { /* siren is driven by updateSiren */ }
export function sfxHorn() { blip(370, 0.18, 'square', 0.16); setTimeout(() => blip(370, 0.18, 'square', 0.16), 220); }

// Continuous engine hum. Call every frame with speed 0..1 (0 = off / idling low).
export function updateEngine(speed01, on) {
  if (!ctx) return;
  if (!on || muted) {
    if (engineGain) engineGain.gain.setTargetAtTime(0, now(), 0.1);
    return;
  }
  if (!engineOsc) {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  const freq = 55 + speed01 * 145;
  engineOsc.frequency.setTargetAtTime(freq, now(), 0.08);
  engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.075, now(), 0.1);
}

// Police siren: a looping two-tone wail while any police unit is close.
export function updateSiren(active) {
  if (!ctx) return;
  if (!active) {
    if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
    return;
  }
  if (sirenTimer) return;
  let hi = false;
  sirenTimer = setInterval(() => {
    if (muted) return;
    hi = !hi;
    blip(hi ? 960 : 720, 0.42, 'sine', 0.055);
  }, 430);
}
