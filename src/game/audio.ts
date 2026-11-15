class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private splashPool: HTMLAudioElement[] = [];
  private splashPoolIndex = 0;

  private menuWavesAudio: HTMLAudioElement | null = null;
  private gameBgmAudio: HTMLAudioElement | null = null;
  private gameBgmHighAudio: HTMLAudioElement | null = null;
  private rageFailureAudio: HTMLAudioElement | null = null;
  private normalFailureAudio: HTMLAudioElement | null = null;
  private targetSuccessAudio: HTMLAudioElement | null = null;
  private currentBgm: HTMLAudioElement | null = null;
  private currentBgmType: 'MENU' | 'GAME' | 'GAME_HIGH' | null = null;
  private initialized = false;

  private initAudioElements() {
    if (this.initialized || typeof Audio === 'undefined') return;
    this.initialized = true;

    try {
      for (let i = 0; i < 6; i++) {
        const a = new Audio('/assets/audio/splash.mp3');
        a.preload = 'auto';
        a.volume = 0.2;
        this.splashPool.push(a);
      }

      this.menuWavesAudio = new Audio('/assets/audio/ocean_waves.m4a');
      this.menuWavesAudio.preload = 'auto';
      this.menuWavesAudio.loop = true;
      this.menuWavesAudio.volume = 0.62;

      this.gameBgmAudio = new Audio('/assets/audio/gameplay_bgm.mp3');
      this.gameBgmAudio.preload = 'auto';
      this.gameBgmAudio.loop = true;
      this.gameBgmAudio.volume = 0.68;

      this.gameBgmHighAudio = new Audio('/assets/audio/attached_gameplay_high_bgm.m4a');
      this.gameBgmHighAudio.preload = 'auto';
      this.gameBgmHighAudio.loop = true;
      this.gameBgmHighAudio.volume = 0.72;

      this.rageFailureAudio = new Audio('/assets/audio/rage_emotional_damage.mp3');
      this.rageFailureAudio.preload = 'auto';
      this.rageFailureAudio.volume = 0.9;

      this.normalFailureAudio = new Audio('/assets/audio/normal_emotional_damage.mp3');
      this.normalFailureAudio.preload = 'auto';
      this.normalFailureAudio.volume = 0.9;

      this.targetSuccessAudio = new Audio('/assets/audio/target_congratulations.mp3');
      this.targetSuccessAudio.preload = 'auto';
      this.targetSuccessAudio.volume = 0.9;

      for (const [name, audio] of [
        ['menu', this.menuWavesAudio],
        ['game', this.gameBgmAudio],
        ['high-intensity game', this.gameBgmHighAudio],
      ] as const) {
        audio.addEventListener('error', () => {
          console.warn(`Unable to load ${name} background audio.`);
        });
      }
    } catch {
      // Audio element creation fallback
    }
  }

  public ensureContext(): AudioContext | null {
    this.initAudioElements();
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playSplash() {
    if (this.muted) return;
    this.initAudioElements();
    if (this.splashPool.length > 0) {
      const sound = this.splashPool[this.splashPoolIndex];
      this.splashPoolIndex = (this.splashPoolIndex + 1) % this.splashPool.length;
      try {
        sound.currentTime = 0;
        sound.volume = 0.2;
        sound.play().catch((error: unknown) => {
          console.warn('Unable to play splash audio.', error);
        });
      } catch {
        // Fallback
      }
    }
  }

  public startMenuMusic() {
    this.initAudioElements();
    this.currentBgmType = 'MENU';

    // Pause gameplay BGM
    if (this.gameBgmAudio) {
      this.gameBgmAudio.pause();
      this.gameBgmAudio.currentTime = 0;
    }
    if (this.gameBgmHighAudio) {
      this.gameBgmHighAudio.pause();
      this.gameBgmHighAudio.currentTime = 0;
    }

    this.currentBgm = this.menuWavesAudio;
    if (!this.muted && this.menuWavesAudio) {
      this.menuWavesAudio.volume = 0.62;
      this.menuWavesAudio.play().catch((error: unknown) => {
        console.warn('Unable to play menu background audio.', error);
      });
    }
  }

  public startGameMusic(isHighIntensity = false) {
    this.initAudioElements();
    this.currentBgmType = isHighIntensity ? 'GAME_HIGH' : 'GAME';

    // Pause menu waves
    if (this.menuWavesAudio) {
      this.menuWavesAudio.pause();
      this.menuWavesAudio.currentTime = 0;
    }

    const nextBgm = isHighIntensity ? this.gameBgmHighAudio : this.gameBgmAudio;
    const prevBgm = isHighIntensity ? this.gameBgmAudio : this.gameBgmHighAudio;

    if (prevBgm) {
      prevBgm.pause();
      prevBgm.currentTime = 0;
    }

    this.currentBgm = nextBgm;
    if (!this.muted && nextBgm) {
      nextBgm.volume = isHighIntensity ? 0.72 : 0.68;
      nextBgm.play().catch((error: unknown) => {
        console.warn('Unable to play game background audio.', error);
      });
    }
  }

  public stopAllMusic() {
    this.stopBackgroundMusic();
    this.stopOneShots();
  }

  public stopBackgroundMusic() {
    if (this.menuWavesAudio) this.menuWavesAudio.pause();
    if (this.gameBgmAudio) this.gameBgmAudio.pause();
    if (this.gameBgmHighAudio) this.gameBgmHighAudio.pause();
    this.currentBgm = null;
    this.currentBgmType = null;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      if (this.menuWavesAudio) this.menuWavesAudio.pause();
      if (this.gameBgmAudio) this.gameBgmAudio.pause();
      if (this.gameBgmHighAudio) this.gameBgmHighAudio.pause();
    } else {
      if (this.currentBgm) {
        this.currentBgm.play().catch((error: unknown) => {
          console.warn('Unable to resume background audio.', error);
        });
      } else if (this.currentBgmType === 'MENU') {
        this.startMenuMusic();
      } else if (this.currentBgmType === 'GAME' || this.currentBgmType === 'GAME_HIGH') {
        this.startGameMusic(this.currentBgmType === 'GAME_HIGH');
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public stopOneShots() {
    for (const sound of [
      this.rageFailureAudio,
      this.normalFailureAudio,
      this.targetSuccessAudio,
    ]) {
      if (sound) {
        sound.pause();
        sound.currentTime = 0;
      }
    }
  }

  public playFailure(isRageMode: boolean) {
    if (this.muted) return;
    this.initAudioElements();
    const sound = isRageMode ? this.rageFailureAudio : this.normalFailureAudio;
    if (!sound) return;
    try {
      sound.currentTime = 0;
      sound.play().catch((error: unknown) => {
        console.warn('Unable to play failure audio.', error);
      });
    } catch (error) {
      console.warn('Unable to start failure audio.', error);
    }
  }

  public playTargetSuccess() {
    if (this.muted) return;
    this.initAudioElements();
    if (!this.targetSuccessAudio) return;
    try {
      this.targetSuccessAudio.currentTime = 0;
      this.targetSuccessAudio.play().catch((error: unknown) => {
        console.warn('Unable to play target success audio.', error);
      });
    } catch (error) {
      console.warn('Unable to start target success audio.', error);
    }
  }

  public playChargeTick(charge: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180 + charge * 260, now);
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playThrow(power: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(480 + power * 280, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playSkip(combo: number, isPerfect: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const baseFreq = isPerfect ? 440 : 320;
    const pitchStep = Math.min(combo, 16) * 28;
    const freq = baseFreq + pitchStep;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isPerfect ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + 0.075);

    gain.gain.setValueAtTime(isPerfect ? 0.18 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    if (isPerfect) {
      const harmonic = ctx.createOscillator();
      const hGain = ctx.createGain();
      harmonic.type = 'square';
      harmonic.frequency.setValueAtTime(freq * 2, now + 0.02);
      hGain.gain.setValueAtTime(0.05, now + 0.02);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      harmonic.connect(hGain);
      hGain.connect(ctx.destination);
      harmonic.start(now + 0.02);
      harmonic.stop(now + 0.13);
    }
  }

  public playFlinch() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.linearRampToValueAtTime(125, now + 0.1);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playQuack() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(420, now + 0.05);
    osc.frequency.linearRampToValueAtTime(340, now + 0.16);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playBonk() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playSplashSink() {
    this.playSplash();
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // White noise splash burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.24);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.07, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // Comedic downward bloop
    const bloop = ctx.createOscillator();
    const bGain = ctx.createGain();
    bloop.type = 'sine';
    bloop.frequency.setValueAtTime(260, now + 0.08);
    bloop.frequency.exponentialRampToValueAtTime(95, now + 0.28);
    bGain.gain.setValueAtTime(0.05, now + 0.08);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    bloop.connect(bGain);
    bGain.connect(ctx.destination);
    bloop.start(now + 0.08);
    bloop.stop(now + 0.31);
  }

  public playSpring() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.24);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playPowerBuoy() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 554, 659].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.12, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.15);
    });
  }

  public playBamboo() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.11, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.12);
    });
  }

  public playUnlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [392, 523, 659, 784].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.13, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.19);
    });
  }

  public playVictory() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523, 659, 784, 1046].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.15, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.26);
    });
  }

  public playSnoreExhale() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep resonant vibration
    const rumble = ctx.createOscillator();
    const rGain = ctx.createGain();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(130, now);
    rumble.frequency.linearRampToValueAtTime(75, now + 0.35);
    rGain.gain.setValueAtTime(0.12, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    rumble.connect(rGain);
    rGain.connect(ctx.destination);
    rumble.start(now);
    rumble.stop(now + 0.39);

    // Whistling snore harmonic
    const whistle = ctx.createOscillator();
    const wGain = ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(680, now + 0.05);
    whistle.frequency.exponentialRampToValueAtTime(820, now + 0.2);
    whistle.frequency.linearRampToValueAtTime(540, now + 0.35);
    wGain.gain.setValueAtTime(0.06, now + 0.05);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    whistle.connect(wGain);
    wGain.connect(ctx.destination);
    whistle.start(now + 0.05);
    whistle.stop(now + 0.37);
  }

  public playBubblePop() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(1150, now + 0.06);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playRageChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 415, 370, 293].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.12, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.23);
    });
  }
}

export const soundEngine = new SoundEngine();
