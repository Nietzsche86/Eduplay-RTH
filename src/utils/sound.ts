export type SoundEffect = 'correct' | 'wrong' | 'click' | 'countdown' | 'attack' | 'win';

class RetroSoundEngine {
  private ctx: AudioContext | null = null;
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
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
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
        // Bright retro coin/power-up arpeggio (C5 -> E5 -> G5 -> C6)
        this.playTone(ctx, 523.25, now, 0.09, 'square', 0.09);
        this.playTone(ctx, 659.25, now + 0.07, 0.09, 'square', 0.09);
        this.playTone(ctx, 783.99, now + 0.14, 0.1, 'square', 0.1);
        this.playTone(ctx, 1046.5, now + 0.22, 0.22, 'triangle', 0.13);
        break;
      }
      case 'wrong': {
        // Classic retro descending buzzer
        this.playTone(ctx, 260, now, 0.16, 'sawtooth', 0.11, 195);
        this.playTone(ctx, 185, now + 0.15, 0.24, 'sawtooth', 0.11, 120);
        break;
      }
      case 'countdown': {
        // Crisp arcade timer blip
        this.playTone(ctx, 880, now, 0.08, 'square', 0.08, 720);
        break;
      }
      case 'attack': {
        // Retro laser / sword strike + punchy bass impact
        this.playTone(ctx, 920, now, 0.12, 'sawtooth', 0.12, 140);
        this.playTone(ctx, 180, now + 0.04, 0.16, 'square', 0.14, 55);
        break;
      }
      case 'win': {
        // Victory fanfare melody
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
