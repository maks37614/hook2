// Web Audio API Sound Generator for Scalper DOM Density Alerts
// Synthesizes pleasant notification chimes without external mp3 files

let audioCtx: AudioContext | null = null;
let lastSoundTime = 0;
const SOUND_COOLDOWN_MS = 4000; // 4 seconds cooldown between density chimes

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    console.warn('AudioContext not available:', e);
    return null;
  }
}

/**
 * Play a high-contrast pleasant 2-tone melodic chime for DOM density detection
 * @param force If true, bypasses cooldown (useful for preview button)
 */
export function playDensityChime(force: boolean = false): void {
  const now = Date.now();
  if (!force && now - lastSoundTime < SOUND_COOLDOWN_MS) {
    return;
  }
  lastSoundTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;

    // Tone 1: 987.77 Hz (B5 note)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(988, startTime);
    gain1.gain.setValueAtTime(0.001, startTime);
    gain1.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(startTime);
    osc1.stop(startTime + 0.19);

    // Tone 2: 1318.51 Hz (E6 note)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318, startTime + 0.09);
    gain2.gain.setValueAtTime(0.001, startTime + 0.09);
    gain2.gain.linearRampToValueAtTime(0.3, startTime + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(startTime + 0.09);
    osc2.stop(startTime + 0.39);
  } catch (e) {
    console.warn('Failed to play density chime:', e);
  }
}
