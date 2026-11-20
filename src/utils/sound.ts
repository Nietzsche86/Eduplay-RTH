export type SoundEffect =
  | 'correct'
  | 'wrong'
  | 'click'
  | 'countdown'
  | 'attack'
  | 'win'
  | 'slash'
  | 'fireball'
  | 'arrow'
  | 'crit'
  | 'heal'
  | 'shield'
  | 'boss_alarm'
  | 'boss_stun'
  | 'boss_ult'
  | 'mega_beam'
  | 'victory_8bit'
  | 'defeat_8bit';

class RetroSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem('eduplay_muted') === 'true';
      } catch {
        this.muted = false;
      }
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const length = Math.floor(ctx.sampleRate * 0.6);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        // Stepped 8-bit style LFSR-like noise
        data[i] = i % 3 === 0 ? Math.random() * 2 - 1 : data[i - 1] ?? 0;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('eduplay_muted', String(mute));
      } catch {
        // Ignore storage restrictions
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.play('click');
    }
    return this.muted;
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'square',
    volume: number = 0.12,
    endFreq?: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private playNoise(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    volume: number = 0.14,
    filterFreq: number = 1400,
    endFilterFreq?: number
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    if (endFilterFreq !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFilterFreq), startTime + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(startTime);
    src.stop(startTime + duration + 0.03);
  }

  public play(effect: SoundEffect): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (effect) {
      case 'click': {
        this.playTone(ctx, 560, now, 0.05, 'triangle', 0.1, 780);
        break;
      }
      case 'correct': {
        this.playTone(ctx, 523.25, now, 0.09, 'square', 0.09);
        this.playTone(ctx, 659.25, now + 0.07, 0.09, 'square', 0.09);
        this.playTone(ctx, 783.99, now + 0.14, 0.1, 'square', 0.1);
        this.playTone(ctx, 1046.5, now + 0.22, 0.22, 'triangle', 0.13);
        break;
      }
      case 'wrong': {
        this.playTone(ctx, 260, now, 0.16, 'sawtooth', 0.11, 195);
        this.playTone(ctx, 185, now + 0.15, 0.24, 'sawtooth', 0.11, 120);
        break;
      }
      case 'countdown': {
        this.playTone(ctx, 880, now, 0.08, 'square', 0.08, 720);
        break;
      }
      case 'attack': {
        this.playTone(ctx, 920, now, 0.12, 'sawtooth', 0.12, 140);
        this.playTone(ctx, 180, now + 0.04, 0.16, 'square', 0.14, 55);
        break;
      }
      case 'slash': {
        // Crisp 8-bit sword/kunai slash + metallic glint
        this.playNoise(ctx, now, 0.11, 0.15, 3200, 700);
        this.playTone(ctx, 1180, now, 0.08, 'sawtooth', 0.1, 220);
        this.playTone(ctx, 420, now + 0.05, 0.09, 'square', 0.09, 110);
        break;
      }
      case 'fireball': {
        // Retro magic fireball launch + flame crackle
        this.playTone(ctx, 320, now, 0.18, 'sawtooth', 0.11, 880);
        this.playNoise(ctx, now + 0.05, 0.22, 0.13, 1800, 320);
        this.playTone(ctx, 220, now + 0.14, 0.16, 'square', 0.12, 75);
        break;
      }
      case 'arrow': {
        // Quick bow twang + luminous zip
        this.playTone(ctx, 440, now, 0.06, 'triangle', 0.12, 1320);
        this.playTone(ctx, 1480, now + 0.04, 0.1, 'square', 0.08, 660);
        break;
      }
      case 'crit': {
        // Punchy 8-bit critical explosion
        this.playNoise(ctx, now, 0.26, 0.2, 2200, 180);
        this.playTone(ctx, 880, now, 0.08, 'square', 0.13, 1760);
        this.playTone(ctx, 260, now + 0.04, 0.22, 'sawtooth', 0.15, 55);
        this.playTone(ctx, 1320, now + 0.09, 0.14, 'square', 0.1, 440);
        break;
      }
      case 'heal': {
        // Shimmering 8-bit RPG cure arpeggio (C5-E5-G5-B5-C6)
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
        notes.forEach((f, idx) => {
          this.playTone(ctx, f, now + idx * 0.055, 0.14, 'triangle', 0.12);
          this.playTone(ctx, f * 2, now + idx * 0.055, 0.08, 'sine', 0.05);
        });
        break;
      }
      case 'shield': {
        // Resonant 8-bit barrier power-up
        this.playTone(ctx, 330, now, 0.12, 'square', 0.09, 660);
        this.playTone(ctx, 495, now + 0.08, 0.14, 'square', 0.1, 990);
        this.playTone(ctx, 660, now + 0.16, 0.2, 'triangle', 0.12);
        break;
      }
      case 'boss_alarm': {
        // Urgent retro red-alert siren double-beep
        for (let i = 0; i < 3; i++) {
          const offset = i * 0.22;
          this.playTone(ctx, 740, now + offset, 0.1, 'sawtooth', 0.11, 980);
          this.playTone(ctx, 520, now + offset + 0.1, 0.1, 'square', 0.1, 420);
        }
        break;
      }
      case 'boss_stun': {
        // Shattering break impact + descending 8-bit dizzy warble
        this.playNoise(ctx, now, 0.22, 0.18, 2800, 400);
        this.playTone(ctx, 1046.5, now, 0.08, 'square', 0.12, 1568);
        const dizzy = [784, 659, 587, 494, 392];
        dizzy.forEach((f, idx) => {
          this.playTone(ctx, f, now + 0.1 + idx * 0.07, 0.1, 'triangle', 0.11);
        });
        break;
      }
      case 'boss_ult': {
        // Heavy rumbling 8-bit Boss laser / dragon breath blast
        this.playNoise(ctx, now, 0.55, 0.22, 1600, 120);
        this.playTone(ctx, 190, now, 0.5, 'sawtooth', 0.16, 48);
        this.playTone(ctx, 110, now + 0.05, 0.45, 'square', 0.14, 38);
        break;
      }
      case 'mega_beam': {
        // Triumphant charging sweep + roaring 8-bit hyper-beam chord
        this.playTone(ctx, 261.63, now, 0.22, 'sawtooth', 0.1, 1046.5);
        this.playTone(ctx, 329.63, now, 0.22, 'square', 0.09, 1318.5);
        this.playNoise(ctx, now + 0.18, 0.42, 0.18, 2600, 600);
        this.playTone(ctx, 523.25, now + 0.2, 0.4, 'square', 0.12, 783.99);
        this.playTone(ctx, 1046.5, now + 0.2, 0.42, 'triangle', 0.13);
        break;
      }
      case 'victory_8bit': {
        // Classic 8-bit RPG boss victory fanfare!
        const melody = [
          { f: 523.25, t: 0.0, d: 0.1 },
          { f: 523.25, t: 0.11, d: 0.1 },
          { f: 523.25, t: 0.22, d: 0.1 },
          { f: 523.25, t: 0.33, d: 0.26 },
          { f: 415.3, t: 0.62, d: 0.24 },
          { f: 466.16, t: 0.88, d: 0.24 },
          { f: 523.25, t: 1.14, d: 0.16 },
          { f: 466.16, t: 1.32, d: 0.12 },
          { f: 523.25, t: 1.46, d: 0.55 },
        ];
        melody.forEach((n) => {
          this.playTone(ctx, n.f, now + n.t, n.d, 'square', 0.1);
          this.playTone(ctx, n.f * 0.5, now + n.t, n.d, 'triangle', 0.09);
        });
        break;
      }
      case 'defeat_8bit': {
        const sad = [
          { f: 392.0, t: 0.0, d: 0.22 },
          { f: 369.99, t: 0.24, d: 0.22 },
          { f: 349.23, t: 0.48, d: 0.22 },
          { f: 329.63, t: 0.72, d: 0.55 },
        ];
        sad.forEach((n) => {
          this.playTone(ctx, n.f, now + n.t, n.d, 'sawtooth', 0.09, n.f * 0.96);
        });
        break;
      }
      case 'win': {
        const notes = [
          { f: 523.25, t: 0, d: 0.12 },
          { f: 659.25, t: 0.12, d: 0.12 },
          { f: 783.99, t: 0.24, d: 0.12 },
          { f: 1046.5, t: 0.36, d: 0.26 },
          { f: 783.99, t: 0.64, d: 0.12 },
          { f: 1046.5, t: 0.78, d: 0.45 },
        ];
        notes.forEach((n) => {
          this.playTone(ctx, n.f, now + n.t, n.d, 'square', 0.09);
          this.playTone(ctx, n.f * 0.5, now + n.t, n.d, 'triangle', 0.08);
        });
        break;
      }
    }
  }
}

export const sound = new RetroSoundEngine();
