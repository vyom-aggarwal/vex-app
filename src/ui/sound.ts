/**
 * Game audio, synthesized with WebAudio (no files to download) plus spoken callouts through the
 * browser's speech synthesis. Every call is a no-op when audio isn't available.
 */

export type Sfx = 'start' | 'end' | 'warn' | 'grab' | 'place' | 'call' | 'load' | 'deny' | 'click' | 'focus' | 'select';

export interface AudioLevels {
  master: number;
  sfx: number;
  voice: number;
}

let ctx: AudioContext | null = null;
let levels: AudioLevels = { master: 0.8, sfx: 1, voice: 1 };
let muted = false;

export function setAudioLevels(l: AudioLevels): void {
  levels = l;
}

/** Top-bar mute: silences sounds and voice without changing the levels. */
export function setMuted(m: boolean): void {
  muted = m;
  if (m) {
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number): void {
  if (muted) return;
  const vol = gain * levels.master * levels.sfx;
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(s: Sfx): void {
  switch (s) {
    case 'start':
      tone(880, 0.12, 'square', 0.12);
      tone(1320, 0.5, 'square', 0.12, 0.12);
      break;
    case 'end':
      tone(220, 0.9, 'sawtooth', 0.16);
      tone(165, 0.9, 'sawtooth', 0.12);
      break;
    case 'warn':
      tone(660, 0.14, 'triangle', 0.14);
      tone(660, 0.14, 'triangle', 0.14, 0.2);
      break;
    case 'grab':
      tone(520, 0.06, 'triangle', 0.1, 0, 780);
      break;
    case 'place':
      tone(300, 0.1, 'sine', 0.2, 0, 190);
      tone(900, 0.08, 'triangle', 0.08, 0.02);
      break;
    case 'call':
      tone(2200, 0.35, 'square', 0.06, 0, 2500);
      break;
    case 'load':
      tone(180, 0.08, 'square', 0.1);
      tone(240, 0.06, 'square', 0.08, 0.07);
      break;
    case 'deny':
      tone(160, 0.18, 'sawtooth', 0.1);
      break;
    case 'click':
      tone(1200, 0.03, 'square', 0.05);
      break;
    case 'focus':
      tone(1800, 0.018, 'sine', 0.035);
      break;
    case 'select':
      tone(1100, 0.03, 'sine', 0.06, 0, 1400);
      break;
  }
}

export function say(text: string): void {
  try {
    const vol = levels.master * levels.voice;
    if (muted || vol <= 0 || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.min(1, vol);
    u.rate = 1.08;
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
