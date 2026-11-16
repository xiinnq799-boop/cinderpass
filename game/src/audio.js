// audio.js — every sound is synthesised with WebAudio: no audio assets,
// nothing to load, nothing over the network. The context is created lazily
// on the first user gesture (the click that starts the match).

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, muted = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function env(gain, t0, peak, dur) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  }

  function noise(t0, dur, peak, freq, q = 1, type = 'bandpass') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t0, peak, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  function tone(t0, dur, peak, freq, freqEnd, type = 'square') {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain(); env(g, t0, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // vol scales with distance at the call site (1 = at the listener).
  function play(name, vol = 1) {
    if (!ctx || muted || vol <= 0.01) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'shot_pistol': noise(t, 0.11, 0.5 * vol, 1900, 0.7); tone(t, 0.07, 0.22 * vol, 220, 60); break;
      case 'shot_scatter': noise(t, 0.24, 0.8 * vol, 900, 0.5); tone(t, 0.16, 0.3 * vol, 130, 45); break;
      case 'shot_carbine': noise(t, 0.09, 0.42 * vol, 2400, 0.8); tone(t, 0.05, 0.18 * vol, 260, 70); break;
      case 'shot_longshot': noise(t, 0.4, 0.9 * vol, 1200, 0.4); tone(t, 0.3, 0.4 * vol, 90, 32); break;
      case 'dry': tone(t, 0.04, 0.15 * vol, 1200, 900); break;
      case 'reload': tone(t, 0.03, 0.2 * vol, 700, 500); tone(t + 0.14, 0.03, 0.22 * vol, 950, 700); tone(t + 0.3, 0.04, 0.26 * vol, 600, 420); break;
      case 'hit': tone(t, 0.05, 0.25 * vol, 1560, 1400, 'sine'); break;
      case 'kill': tone(t, 0.07, 0.3 * vol, 1180, 1180, 'sine'); tone(t + 0.07, 0.1, 0.3 * vol, 1560, 1560, 'sine'); break;
      case 'hurt': noise(t, 0.12, 0.3 * vol, 500, 0.8, 'lowpass'); break;
      case 'throw': noise(t, 0.16, 0.12 * vol, 700, 0.6); break;
      case 'bounce': tone(t, 0.04, 0.14 * vol, 340, 240); break;
      case 'flash': tone(t, 0.5, 0.3 * vol, 5200, 4800, 'sine'); noise(t, 0.2, 0.3 * vol, 4000, 0.5, 'highpass'); break;
      case 'explosion':
        noise(t, 1.1, 1.0 * vol, 160, 0.4, 'lowpass');
        tone(t, 0.9, 0.7 * vol, 70, 26, 'sine');
        noise(t + 0.03, 0.3, 0.5 * vol, 900, 0.5);
        break;
      case 'beep': tone(t, 0.06, 0.22 * vol, 1320, 1320, 'sine'); break;
      case 'planted': tone(t, 0.08, 0.25 * vol, 990, 990, 'sine'); tone(t + 0.12, 0.08, 0.25 * vol, 990, 990, 'sine'); tone(t + 0.24, 0.14, 0.3 * vol, 1320, 1320, 'sine'); break;
      case 'defused': tone(t, 0.1, 0.28 * vol, 1320, 1320, 'sine'); tone(t + 0.13, 0.16, 0.28 * vol, 1760, 1760, 'sine'); break;
      case 'buy': tone(t, 0.05, 0.2 * vol, 880, 880, 'sine'); tone(t + 0.05, 0.08, 0.2 * vol, 1320, 1320, 'sine'); break;
      case 'denied': tone(t, 0.09, 0.2 * vol, 220, 180); break;
      case 'roundwin': tone(t, 0.14, 0.26, 660, 660, 'triangle'); tone(t + 0.13, 0.14, 0.26, 880, 880, 'triangle'); tone(t + 0.26, 0.24, 0.3, 1100, 1100, 'triangle'); break;
      case 'roundlose': tone(t, 0.16, 0.26, 520, 520, 'triangle'); tone(t + 0.15, 0.16, 0.26, 415, 415, 'triangle'); tone(t + 0.3, 0.28, 0.28, 330, 330, 'triangle'); break;
      case 'planting': tone(t, 0.05, 0.15 * vol, 1040, 1040, 'sine'); break;
    }
  }

  return {
    unlock,
    play,
    setMuted(m) { muted = !!m; },
    get ready() { return !!ctx; },
  };
}

// Volume of a sound at `pos` heard from `ear` (the player's eye).
export function volAt(pos, ear) {
  if (!pos || !ear) return 1;
  const d = Math.hypot(pos.x - ear.x, pos.z - ear.z);
  return Math.max(0, Math.min(1, 14 / (6 + d)));
}
