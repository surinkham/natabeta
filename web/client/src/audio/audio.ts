// Game audio, all synthesised with WebAudio: no sound files to download, and every sound can be tuned in code.
// Three buses (music / sfx / voice) under one master, each switchable in Options and remembered per browser.
// Browsers only allow audio after a user gesture, so the context is created on the first pointer/key press.

type Bus = "music" | "sfx" | "voice";
export interface AudioPrefs { music: boolean; sfx: boolean; voice: boolean; volume: number }
const PREFS_KEY = "bk.audio";
let prefs: AudioPrefs = { music: true, sfx: true, voice: true, volume: 0.7 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") }; } catch {}

let ctx: AudioContext | null = null, master: GainNode, buses: Record<Bus, GainNode>, noiseBuf: AudioBuffer;
function boot() {
  if (ctx) return;
  try { ctx = new AudioContext(); } catch { return; }
  master = ctx.createGain(); master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  buses = { music: ctx.createGain(), sfx: ctx.createGain(), voice: ctx.createGain() };
  for (const b of Object.values(buses)) b.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyPrefs();
}
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => { boot(); ctx?.resume(); }, { capture: true });

function applyPrefs() {
  if (!ctx) return;
  master.gain.value = prefs.volume;
  if (title && !title.paused) title.volume = titleVol();
  buses.music.gain.value = prefs.music ? 0.32 : 0; buses.sfx.gain.value = prefs.sfx ? 0.9 : 0; buses.voice.gain.value = prefs.voice ? 0.55 : 0;
}
export const audioPrefs = () => prefs;
// ---------------------------------------------------------------- the title song (นักผจญภัยตัวเล็ก), a real recording on the entrance screens
let title: HTMLAudioElement | null = null, titleFade = 0;
const titleVol = () => (prefs.music ? Math.min(1, prefs.volume * 0.85) : 0);
/** Play (or keep playing) the title song; browsers only allow it after a tap or key press, so it is called again on those. */
export function playTitleMusic() {
  if (!title) { title = new Audio("audio/title.mp3"); title.loop = true; title.preload = "auto"; }
  clearInterval(titleFade); title.volume = titleVol(); if (title.paused && prefs.music) title.play().catch(() => {});
}
/** Fade the title song out (entering the world). */
export function stopTitleMusic(seconds = 1.6) {
  const t = title; if (!t || t.paused) return; clearInterval(titleFade);
  const step = t.volume / (seconds * 20); titleFade = window.setInterval(() => { t.volume = Math.max(0, t.volume - step); if (t.volume <= 0) { clearInterval(titleFade); t.pause(); } }, 50);
}
export function setAudioPrefs(p: Partial<AudioPrefs>) { prefs = { ...prefs, ...p }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} applyPrefs(); }

// ---------------------------------------------------------------- building blocks
const now = () => ctx!.currentTime;
function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  // exponential ramps throw on 0 (a far-away sound has distance falloff 0): floor the peak instead of crashing the caller
  peak = Math.max(0.0001, Number.isFinite(peak) ? peak : 0);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function tone(bus: Bus, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.005) {
  const o = ctx!.createOscillator(), g = ctx!.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, peak, attack, dur); o.connect(g).connect(buses[bus]); o.start(t); o.stop(t + attack + dur + 0.05);
}
function noise(bus: Bus, t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, attack = 0.004) {
  const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, peak, attack, dur); s.connect(f).connect(g).connect(buses[bus]); s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
}
const ready = (bus: Bus) => !!ctx && ctx.state === "running" && prefs[bus];

// ---------------------------------------------------------------- sound effects
/** `k`: loudness 0..1 — callers pass distance falloff so a fight across the field is quieter than your own swing. */
export const sfx = {
  swing(k = 1) { if (!ready("sfx")) return; noise("sfx", now(), 0.16, 0.5 * k, "bandpass", 900, 3200, 1.4, 0.02); },
  hit(k = 1, crit = false) {
    if (!ready("sfx")) return; const t = now();
    tone("sfx", "sine", 170, 55, t, 0.16, 0.9 * k); noise("sfx", t, 0.08, 0.5 * k, "lowpass", 2400, 400);
    if (crit) { tone("sfx", "triangle", 1320, 1320, t + 0.02, 0.22, 0.25 * k); tone("sfx", "triangle", 1980, 1980, t + 0.05, 0.25, 0.18 * k); }
  },
  miss(k = 1) { if (ready("sfx")) noise("sfx", now(), 0.12, 0.25 * k, "highpass", 2500, 5000, 0.8, 0.03); },
  hurt() { if (!ready("sfx")) return; const t = now(); tone("sfx", "square", 220, 110, t, 0.14, 0.18); noise("sfx", t, 0.1, 0.35, "lowpass", 1400, 300); },
  twang(k = 1) {
    if (!ready("sfx")) return; const t = now();
    tone("sfx", "triangle", 392, 380, t, 0.28, 0.45 * k); tone("sfx", "sawtooth", 196, 190, t, 0.12, 0.12 * k);
    noise("sfx", t + 0.01, 0.22, 0.2 * k, "bandpass", 3000, 1200, 2, 0.02);
  },
  thunk(k = 1) { if (!ready("sfx")) return; const t = now(); tone("sfx", "sine", 320, 120, t, 0.09, 0.5 * k); noise("sfx", t, 0.05, 0.25 * k, "bandpass", 1800, 900, 2); },
  zap(k = 1) {
    if (!ready("sfx")) return; const t = now();
    tone("sfx", "sawtooth", 260, 820, t, 0.28, 0.16 * k, 0.03); noise("sfx", t, 0.35, 0.3 * k, "bandpass", 1200, 4200, 3, 0.04);
  },
  frostBurst(k = 1) { if (!ready("sfx")) return; const t = now(); noise("sfx", t, 0.4, 0.5 * k, "bandpass", 5000, 900, 1.5); tone("sfx", "sine", 880, 440, t, 0.3, 0.2 * k); },
  boom(k = 1) {
    if (!ready("sfx")) return; const t = now();
    tone("sfx", "sine", 110, 30, t, 0.9, 1.0 * k); noise("sfx", t, 1.1, 0.8 * k, "lowpass", 1800, 120, 0.7); noise("sfx", t + 0.05, 0.5, 0.35 * k, "bandpass", 2400, 600, 1);
  },
  rumble(k = 1) { if (ready("sfx")) noise("sfx", now(), 1.0, 0.35 * k, "lowpass", 180, 600, 1, 0.5); },
  rain(k = 1) { if (!ready("sfx")) return; const t = now(); for (let i = 0; i < 10; i++) noise("sfx", t + i * 0.06 + Math.random() * 0.04, 0.08, 0.22 * k, "bandpass", 2600 + Math.random() * 1500, 1200, 3, 0.01); },
  chime(k = 1) { if (!ready("sfx")) return; const t = now(); [784, 988, 1175, 1568].forEach((f, i) => tone("sfx", "sine", f, f, t + i * 0.08, 0.6, 0.22 * k, 0.01)); },
  dash(k = 1) { if (ready("sfx")) noise("sfx", now(), 0.22, 0.45 * k, "bandpass", 600, 2600, 1.2, 0.03); },
  coin() { if (!ready("sfx")) return; const t = now(); tone("sfx", "square", 988, 988, t, 0.06, 0.12); tone("sfx", "square", 1319, 1319, t + 0.07, 0.16, 0.12); },
  pickup() { if (!ready("sfx")) return; const t = now(); tone("sfx", "triangle", 523, 784, t, 0.12, 0.25); },
  levelUp() { if (!ready("sfx")) return; const t = now(); [523, 659, 784, 1047, 1319].forEach((f, i) => { tone("sfx", "triangle", f, f, t + i * 0.09, 0.4, 0.3, 0.01); tone("sfx", "sine", f / 2, f / 2, t + i * 0.09, 0.4, 0.15); }); },
  death(k = 1) { if (!ready("sfx")) return; const t = now(); tone("sfx", "triangle", 440, 110, t, 0.5, 0.35 * k); noise("sfx", t, 0.3, 0.2 * k, "lowpass", 900, 200); },
  click() { if (ready("sfx")) tone("sfx", "triangle", 660, 660, now(), 0.04, 0.12); },
};

// ---------------------------------------------------------------- NPC voices
// Animal-Crossing style babble: one short formant blip per syllable, pitched by species, a little rise at the end.
const VOICE: Record<string, { base: number; spread: number; wave: OscillatorType }> = {
  dog: { base: 190, spread: 60, wave: "square" }, cat: { base: 330, spread: 90, wave: "triangle" }, mouse: { base: 560, spread: 140, wave: "square" },
};
const VOWELS = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]];   // a i u e o — two formants each
let talking = 0;
export function speak(text: string, species = "dog") {
  if (!ready("voice")) return;
  const v = VOICE[species] ?? VOICE.dog, t0 = now(), n = Math.min(22, Math.max(4, Math.round(text.replace(/\s/g, "").length / 3)));
  const id = ++talking;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.075, [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const pitch = v.base + (Math.random() - 0.5) * v.spread + (i === n - 1 ? v.spread * 0.6 : 0);
    const o = ctx!.createOscillator(), g = ctx!.createGain(); o.type = v.wave; o.frequency.setValueAtTime(pitch, t);
    const mix = ctx!.createGain(); mix.gain.value = 1;
    for (const [f, amp] of [[f1, 1], [f2, 0.5]]) { const bp = ctx!.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6; const a = ctx!.createGain(); a.gain.value = amp; o.connect(bp).connect(a).connect(mix); }
    env(g, t, 0.9, 0.01, 0.06); mix.connect(g).connect(buses.voice); o.start(t); o.stop(t + 0.09);
  }
  return id;
}

// ---------------------------------------------------------------- music
// Three moods scheduled a bar at a time with a short lookahead; switching crossfades by fading the old bus stem out.
export type Mood = "town" | "field" | "battle" | "silent";
interface Song { bpm: number; chords: number[][]; scale: number[]; lead: OscillatorType; drums: boolean; bass: OscillatorType; density: number }
const SONGS: Record<Exclude<Mood, "silent">, Song> = {
  // warm pentatonic lute over I–vi–IV–V
  town: { bpm: 84, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [0, 2, 4, 7, 9], lead: "triangle", drums: false, bass: "sine", density: 0.55 },
  // open fields: minor-leaning, sparser, a little wind
  field: { bpm: 92, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], scale: [0, 3, 5, 7, 10], lead: "triangle", drums: false, bass: "triangle", density: 0.4 },
  // fights: driving bass, kick/hat, busier lead
  battle: { bpm: 138, chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 55, 59]], scale: [0, 2, 3, 7, 8], lead: "sawtooth", drums: true, bass: "sawtooth", density: 0.8 },
};
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
let mood: Mood = "silent", stem: GainNode | null = null, nextBar = 0, bar = 0, timer = 0;
export function setMood(m: Mood) {
  if (m === mood && stem) return; mood = m; if (!ctx) return;   // before the first gesture: remember, start once audio exists
  if (stem) { const old = stem; old.gain.setTargetAtTime(0, now(), 0.6); setTimeout(() => old.disconnect(), 3000); }
  stem = ctx.createGain(); stem.gain.value = 0; stem.gain.setTargetAtTime(1, now(), 0.8); stem.connect(buses.music);
  nextBar = now() + 0.1; bar = 0;
}
function note(dst: GainNode, type: OscillatorType, n: number, t: number, dur: number, peak: number, cutoff = 2400) {
  const o = ctx!.createOscillator(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
  o.type = type; o.frequency.value = midi(n); f.type = "lowpass"; f.frequency.value = cutoff;
  env(g, t, peak, 0.012, dur); o.connect(f).connect(g).connect(dst); o.start(t); o.stop(t + dur + 0.1);
}
function scheduleBar(s: Song, t: number) {
  const beat = 60 / s.bpm, chord = s.chords[bar % s.chords.length], dst = stem!;
  for (const n of chord) note(dst, "sine", n, t, beat * 3.6, 0.07, 1200);                        // pad
  for (let b = 0; b < 4; b++) note(dst, s.bass, chord[0] - 24 + (b === 2 ? 7 : 0), t + b * beat, beat * 0.8, s.drums ? 0.16 : 0.12, s.drums ? 700 : 500);
  for (let e = 0; e < 8; e++) {                                                                  // lead: eighths over the chord's scale
    if (Math.random() > s.density) continue;
    const deg = s.scale[Math.floor(Math.random() * s.scale.length)], oct = Math.random() < 0.3 ? 12 : 0;
    note(dst, s.lead, chord[0] + 12 + deg + oct, t + e * beat / 2, beat * (s.drums ? 0.35 : 0.9), s.drums ? 0.045 : 0.07, s.drums ? 2600 : 3200);
  }
  if (s.drums) for (let b = 0; b < 4; b++) {
    const kt = t + b * beat;
    const o = ctx!.createOscillator(), g = ctx!.createGain(); o.frequency.setValueAtTime(140, kt); o.frequency.exponentialRampToValueAtTime(40, kt + 0.12);
    env(g, kt, 0.35, 0.003, 0.14); o.connect(g).connect(dst); o.start(kt); o.stop(kt + 0.2);
    for (const h of [0, 0.5]) { const s2 = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g2 = ctx!.createGain(); s2.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 7000; env(g2, kt + h * beat, 0.05, 0.002, 0.04); s2.connect(f).connect(g2).connect(dst); s2.start(kt + h * beat, Math.random()); s2.stop(kt + h * beat + 0.08); }
  }
  bar++;
  return beat * 4;
}
/** Call every frame; keeps ~0.5 s of music scheduled ahead. */
export function updateMusic() {
  if (!ctx || mood === "silent" || !stem || ctx.state !== "running") return;
  if (++timer % 6) return;
  const s = SONGS[mood];
  while (nextBar < now() + 0.5) nextBar += scheduleBar(s, Math.max(nextBar, now() + 0.02));
}
