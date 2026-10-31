/**
 * Lowkey Procedural Synthwave BGM Engine
 * Generates an ambient, chill retro-futuristic synthwave soundtrack in real-time
 * using the Web Audio API. Zero external audio dependencies, low volume by default,
 * and dynamically adapts to the flight state to provide encouragement without distraction.
 */

import { GameStatus } from '../types';

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private schedulerTimer: number | null = null;
  private currentStep = 0;
  private nextNoteTime = 0;
  private tempo = 96; // Chill 96 BPM
  private volume = 0.045; // Subtle, lowkey background volume
  private isMuted = false;

  // Chord progression in D minor: Dm9 -> Bbmaj7 -> Fmaj7 -> Gm7
  private chords = [
    [146.83, 174.61, 220.0, 261.63, 329.63], // D3, F3, A3, C4, E4 (Dm9)
    [116.54, 174.61, 220.0, 293.66, 349.23], // Bb2, F3, A3, D4, F4 (Bbmaj7)
    [130.81, 196.0, 261.63, 329.63, 392.0],  // C3, G3, C4, E4, G4 (C / Fmaj)
    [98.0, 146.83, 196.0, 233.08, 293.66],   // G2, D3, G3, Bb3, D4 (Gm7)
  ];

  // Arpeggio melodic pitches (D minor pentatonic / Dorian)
  private arpPitches = [
    293.66, 349.23, 440.0, 523.25, 587.33, 659.25, 523.25, 440.0,
    349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 587.33, 523.25,
  ];

  constructor(existingCtx?: AudioContext | null) {
    if (existingCtx) {
      this.ctx = existingCtx;
    }
  }

  public setContext(ctx: AudioContext) {
    this.ctx = ctx;
  }

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(420, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.filterNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
  }

  public start() {
    this.init();
    if (this.isRunning || !this.ctx) return;

    this.isRunning = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduleLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.schedulerTimer !== null) {
      window.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.1);
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Dynamically alters the filter and vibe based on whether the game is flying, crashed, or idle
   */
  public handleGameStatus(status: GameStatus) {
    if (!this.filterNode || !this.ctx) return;
    const now = this.ctx.currentTime;

    switch (status) {
      case GameStatus.FLYING:
        // Gently open the lowpass filter to create rising suspense and energy
        this.filterNode.frequency.setTargetAtTime(780, now, 0.4);
        this.filterNode.Q.setTargetAtTime(2.2, now, 0.4);
        break;
      case GameStatus.CRASHED:
        // Brief deep muffled drop
        this.filterNode.frequency.setTargetAtTime(200, now, 0.1);
        this.filterNode.frequency.setTargetAtTime(400, now + 1.2, 0.6);
        this.filterNode.Q.setTargetAtTime(1.0, now, 0.3);
        break;
      case GameStatus.IDLE:
      case GameStatus.READY:
      default:
        // Warm, chill ambient lounge
        this.filterNode.frequency.setTargetAtTime(420, now, 0.5);
        this.filterNode.Q.setTargetAtTime(1.5, now, 0.5);
        break;
    }
  }

  private scheduleLoop = () => {
    if (!this.isRunning || !this.ctx) return;

    const secondsPer16th = (60 / this.tempo) / 4;
    const lookahead = 0.12;

    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += secondsPer16th;
      this.currentStep = (this.currentStep + 1) % 64; // 4 bars of 16 steps
    }

    this.schedulerTimer = window.setTimeout(this.scheduleLoop, 40);
  };

  private playStep(step: number, time: number) {
    if (!this.ctx || !this.filterNode) return;

    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const chord = this.chords[bar % this.chords.length];

    // 1. Warm Chord Pad on beat 1 of each 2 bars, or gentle swell
    if (stepInBar === 0) {
      this.triggerPadChord(chord, time, 3.5);
    } else if (stepInBar === 8) {
      this.triggerSubChord(chord, time, 1.8);
    }

    // 2. Soft Bass Drone / Pulse on 1st and 3rd beats (steps 0, 6, 8, 14)
    if (stepInBar === 0 || stepInBar === 8 || stepInBar === 6) {
      const rootPitch = chord[0];
      this.triggerSubBass(rootPitch, time, 0.6);
    }

    // 3. Ambient Arpeggio Notes on selected syncopated 16th steps
    // A chill, relaxing sequence that isn't too busy
    if ([0, 3, 6, 8, 10, 12, 14].includes(stepInBar)) {
      const pitchIndex = (step + bar * 3) % this.arpPitches.length;
      const pitch = this.arpPitches[pitchIndex];
      this.triggerArpPluck(pitch, time, 0.28);
    }

    // 4. Subtle, super-soft filtered percussion tick for encouraging rhythm (every 4th step)
    if (stepInBar % 4 === 0) {
      this.triggerSoftPulse(time, stepInBar === 0 ? 0.03 : 0.015);
    }
  }

  private triggerPadChord(frequencies: number[], time: number, duration: number) {
    if (!this.ctx || !this.filterNode) return;

    // Pick 3 harmonic layers for a warm, gentle synth pad
    const selectedFreqs = [frequencies[1], frequencies[2], frequencies[3]];

    selectedFreqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      // Slight slow detuning for analog shimmer
      const detuneAmount = (idx - 1) * 4;
      osc.detune.setValueAtTime(detuneAmount, time);

      // Smooth slow attack and release
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.025, time + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(this.filterNode!);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  private triggerSubChord(frequencies: number[], time: number, duration: number) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequencies[2], time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.018, time + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration);
  }

  private triggerSubBass(freq: number, time: number, duration: number) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Deep octave down
    const subFreq = freq > 120 ? freq / 2 : freq;
    osc.frequency.setValueAtTime(subFreq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration);
  }

  private triggerArpPluck(freq: number, time: number, duration: number) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Mellow rounded tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.035, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration);
  }

  private triggerSoftPulse(time: number, volume: number) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.08);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + 0.09);
  }
}

export const musicEngine = new MusicEngine();
