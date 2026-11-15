import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Lock,
  RotateCcw,
  Shield,
  ShoppingBag,
  Sprout,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { soundEngine } from './game/audio';
import {
  DIFFICULTIES,
  MAX_LEVEL,
  STONE_PROFILES,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from './game/constants';
import { createInitialWorld, stepMenuDemo, stepWorld } from './game/engine';
import { renderGameWorld } from './game/renderer';
import type {
  AppScreenState,
  DifficultyId,
  GameMode,
  GameWorld,
  InputSnapshot,
  RunStats,
  StoneKind,
} from './game/types';

interface HudSnapshot {
  mode: GameMode;
  level: number;
  skips: number;
  perfectSkips: number;
  distanceMeters: number;
  wind: number;
  phase: GameWorld['phase'];
  shieldCharges: number;
  bamboosEarned: number;
  lastEventText: string;
}

interface PersistedProgress {
  bamboos: number;
  unlockedMaps: DifficultyId[];
  unlockedStones: StoneKind[];
  highestLevelReached: number;
  bestScores: Record<DifficultyId, { skips: number; distance: number }>;
}

const DIFFICULTY_ORDER: DifficultyId[] = [
  'CALM_CREEK',
  'CHOPPY_BAY',
  'RAGE_RAPIDS',
  'TEMPEST_REEF',
  'DAVIN_SLUMBER',
];
const STONE_ORDER: StoneKind[] = ['FLAT_SLATE', 'ROUND_PEBBLE', 'THE_BRICK'];
const STONE_COSTS: Record<StoneKind, number> = {
  FLAT_SLATE: 0,
  ROUND_PEBBLE: 80,
  THE_BRICK: 180,
};
const PROGRESS_STORAGE_KEY = 'skip_or_sink_progress_v2';
const LEGACY_STORAGE_KEY = 'skip_or_sink_best_v1';

function createDefaultProgress(): PersistedProgress {
  const bestScores: Record<DifficultyId, { skips: number; distance: number }> = {
    CALM_CREEK: { skips: 0, distance: 0 },
    CHOPPY_BAY: { skips: 0, distance: 0 },
    RAGE_RAPIDS: { skips: 0, distance: 0 },
    TEMPEST_REEF: { skips: 0, distance: 0 },
    DAVIN_SLUMBER: { skips: 0, distance: 0 },
  };

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<
        Record<DifficultyId, { skips: number; distance: number }>
      >;
      if (parsed.CALM_CREEK) bestScores.CALM_CREEK = parsed.CALM_CREEK;
    }
  } catch {
    // Ignore legacy storage read issues
  }

  return {
    bamboos: 0,
    unlockedMaps: ['CALM_CREEK', 'DAVIN_SLUMBER'],
    unlockedStones: ['FLAT_SLATE'],
    highestLevelReached: 1,
    bestScores,
  };
}

function loadProgress(): PersistedProgress {
  const fallback = createDefaultProgress();
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedProgress>;
    const unlockedSet = new Set<DifficultyId>(
      Array.isArray(parsed.unlockedMaps) ? parsed.unlockedMaps : ['CALM_CREEK', 'DAVIN_SLUMBER']
    );
    unlockedSet.add('CALM_CREEK');
    unlockedSet.add('DAVIN_SLUMBER');

    return {
      bamboos: typeof parsed.bamboos === 'number' && parsed.bamboos >= 0 ? parsed.bamboos : 0,
      unlockedMaps: Array.from(unlockedSet),
      unlockedStones: Array.from(
        new Set<StoneKind>(
          Array.isArray(parsed.unlockedStones) ? parsed.unlockedStones : ['FLAT_SLATE']
        )
      ),
      highestLevelReached:
        typeof parsed.highestLevelReached === 'number'
          ? Math.max(1, Math.min(MAX_LEVEL, parsed.highestLevelReached))
          : 1,
      bestScores: {
        ...fallback.bestScores,
        ...(parsed.bestScores ?? {}),
      },
    };
  } catch {
    return fallback;
  }
}

function saveProgress(progress: PersistedProgress) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage write issues
  }
}

export default function App() {
  const [screen, setScreen] = useState<AppScreenState>('TITLE_MENU');
  const [menuStage, setMenuStage] = useState<'HOME' | 'SETUP'>('HOME');
  const [mode, setMode] = useState<GameMode>('LEVELS');
  const [startLevel, setStartLevel] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<DifficultyId>('CALM_CREEK');
  const [stoneKind, setStoneKind] = useState<StoneKind>('FLAT_SLATE');
  const [targetMeters, setTargetMeters] = useState(() => 500 + Math.floor(Math.random() * 501));
  const [shopOpen, setShopOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState<PersistedProgress>(loadProgress);
  const [summaryStats, setSummaryStats] = useState<RunStats | null>(null);
  const [shopNotice, setShopNotice] = useState<string | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    mode: 'LEVELS',
    level: 1,
    skips: 0,
    perfectSkips: 0,
    distanceMeters: 0,
    wind: 0,
    phase: 'READY',
    shieldCharges: 0,
    bamboosEarned: 0,
    lastEventText: 'Hold SPACE or click water to throw.',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<GameWorld>(
    createInitialWorld(difficulty, stoneKind, mode, startLevel)
  );
  const screenRef = useRef<AppScreenState>(screen);
  screenRef.current = screen;

  const progressRef = useRef<PersistedProgress>(progress);
  progressRef.current = progress;

  const inputRef = useRef<{
    spaceHeld: boolean;
    spaceJustPressed: boolean;
    spaceJustReleased: boolean;
    leftHeld: boolean;
    rightHeld: boolean;
  }>({
    spaceHeld: false,
    spaceJustPressed: false,
    spaceJustReleased: false,
    leftHeld: false,
    rightHeld: false,
  });

  const resetRound = useCallback(
    (
      nextDiff: DifficultyId = difficulty,
      nextStone: StoneKind = stoneKind,
      nextMode: GameMode = mode,
      nextStartLevel: number = startLevel,
      nextTargetMeters: number = targetMeters
    ) => {
      soundEngine.stopOneShots();
      const safeDiff = progressRef.current.unlockedMaps.includes(nextDiff)
        ? nextDiff
        : 'CALM_CREEK';
      const safeLevel =
        nextMode === 'LEVELS'
          ? Math.max(1, Math.min(progressRef.current.highestLevelReached, nextStartLevel))
          : 1;

      worldRef.current = createInitialWorld(
        safeDiff,
        nextStone,
        nextMode,
        safeLevel,
        nextMode === 'LEVELS' ? nextTargetMeters : 0
      );
      inputRef.current.spaceHeld = false;
      inputRef.current.spaceJustPressed = false;
      inputRef.current.spaceJustReleased = false;
      setSummaryStats(null);
      setShopNotice(null);
      setHud({
        mode: nextMode,
        level: safeLevel,
        skips: 0,
        perfectSkips: 0,
        distanceMeters: 0,
        wind: worldRef.current.wind,
        phase: 'READY',
        shieldCharges: 0,
        bamboosEarned: 0,
        lastEventText: worldRef.current.lastEventText,
      });
    },
    [difficulty, stoneKind, mode, startLevel, targetMeters]
  );

  const handleStartGame = useCallback(() => {
    const safeDiff = progressRef.current.unlockedMaps.includes(difficulty)
      ? difficulty
      : 'CALM_CREEK';
    if (safeDiff !== difficulty) {
      setDifficulty(safeDiff);
    }
    const nextTarget = mode === 'LEVELS' ? targetMeters : 0;
    resetRound(safeDiff, stoneKind, mode, 1, nextTarget);
    setScreen('PLAYING');
  }, [difficulty, stoneKind, mode, targetMeters, resetRound]);

  const handleSelectMode = useCallback(
    (nextMode: GameMode) => {
      setMode(nextMode);
      if (screenRef.current !== 'PLAYING' || worldRef.current.phase === 'READY') {
        if (nextMode === 'LEVELS') {
          const nextTarget = 500 + Math.floor(Math.random() * 501);
          setTargetMeters(nextTarget);
          resetRound(difficulty, stoneKind, nextMode, 1, nextTarget);
        } else {
          resetRound(difficulty, stoneKind, nextMode, 1, 0);
        }
      }
    },
    [difficulty, stoneKind, resetRound]
  );

  const handleSelectStartLevel = useCallback(
    (lvl: number) => {
      setStartLevel(lvl);
      if (screenRef.current !== 'PLAYING' || worldRef.current.phase === 'READY') {
        resetRound(difficulty, stoneKind, 'LEVELS', lvl);
      }
    },
    [difficulty, stoneKind, resetRound]
  );

  const handleMapClick = useCallback(
    (nextDiff: DifficultyId) => {
      const cur = progressRef.current;
      const isUnlocked = cur.unlockedMaps.includes(nextDiff);

      if (isUnlocked) {
        setDifficulty(nextDiff);
        setShopNotice(null);
        if (screenRef.current !== 'PLAYING' || worldRef.current.phase === 'READY') {
          resetRound(nextDiff, stoneKind, mode, startLevel);
        }
        return;
      }

      const cost = DIFFICULTIES[nextDiff].unlockCost;
      if (cur.bamboos >= cost) {
        const updated: PersistedProgress = {
          ...cur,
          bamboos: cur.bamboos - cost,
          unlockedMaps: [...cur.unlockedMaps, nextDiff],
        };
        setProgress(updated);
        progressRef.current = updated;
        saveProgress(updated);
        soundEngine.playUnlock();
        setDifficulty(nextDiff);
        setShopNotice(`Unlocked ${DIFFICULTIES[nextDiff].label} for ${cost} Bamboos!`);
        if (screenRef.current !== 'PLAYING' || worldRef.current.phase === 'READY') {
          worldRef.current = createInitialWorld(nextDiff, stoneKind, mode, startLevel);
          setHud((prev) => ({
            ...prev,
            wind: worldRef.current.wind,
            lastEventText: `Unlocked ${DIFFICULTIES[nextDiff].label}! Earn ${DIFFICULTIES[nextDiff].bamboosPer100m} Bamboos/100m.`,
          }));
        }
      } else {
        const needed = cost - cur.bamboos;
        setShopNotice(
          `${DIFFICULTIES[nextDiff].label} costs ${cost} Bamboos (${needed} more needed).`
        );
      }
    },
    [stoneKind, mode, startLevel, resetRound]
  );

  const handleSelectStone = useCallback(
    (nextStone: StoneKind) => {
      const cur = progressRef.current;
      if (!cur.unlockedStones.includes(nextStone)) {
        const cost = STONE_COSTS[nextStone];
        if (cur.bamboos < cost) {
          setShopNotice(`${STONE_PROFILES[nextStone].name} costs ${cost} Bamboos.`);
          return;
        }
        const updated = {
          ...cur,
          bamboos: cur.bamboos - cost,
          unlockedStones: [...cur.unlockedStones, nextStone],
        };
        setProgress(updated);
        progressRef.current = updated;
        saveProgress(updated);
        soundEngine.playUnlock();
      }
      setStoneKind(nextStone);
      if (screenRef.current !== 'PLAYING' || worldRef.current.phase === 'READY') {
        resetRound(difficulty, nextStone, mode, startLevel);
      }
    },
    [difficulty, mode, startLevel, resetRound]
  );

  const handleRageMode = useCallback(() => {
    const nextTarget = 500 + Math.floor(Math.random() * 501);
    setDifficulty('DAVIN_SLUMBER');
    setMode('LEVELS');
    setTargetMeters(nextTarget);
    resetRound('DAVIN_SLUMBER', stoneKind, 'LEVELS', 1, nextTarget);
    setScreen('PLAYING');
  }, [resetRound, stoneKind]);

  const handleTargetedMode = useCallback(() => {
    const nextTarget = 500 + Math.floor(Math.random() * 501);
    setMode('LEVELS');
    setTargetMeters(nextTarget);
    resetRound(difficulty, stoneKind, 'LEVELS', 1, nextTarget);
    setScreen('PLAYING');
  }, [difficulty, resetRound, stoneKind]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  // Background music management across screens (menu ocean waves vs in-game loop)
  useEffect(() => {
    if (screen === 'TITLE_MENU') {
      soundEngine.startMenuMusic();
    } else if (screen === 'PLAYING') {
      soundEngine.startGameMusic(difficulty === 'DAVIN_SLUMBER');
    } else if (screen === 'ROUND_SUMMARY') {
      soundEngine.stopBackgroundMusic();
    }
  }, [screen, difficulty]);

  // First user interaction audio unlock (for browsers requiring gesture before autoplay)
  useEffect(() => {
    const unlockAudio = () => {
      soundEngine.ensureContext();
      if (screenRef.current === 'TITLE_MENU') {
        soundEngine.startMenuMusic();
      } else if (screenRef.current === 'PLAYING') {
        soundEngine.startGameMusic(difficulty === 'DAVIN_SLUMBER');
      }
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [difficulty]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        soundEngine.playSplash();
        if (e.repeat) return;

        if (screenRef.current === 'TITLE_MENU') {
          if (menuStage === 'HOME') {
            setMenuStage('SETUP');
          } else {
            handleStartGame();
          }
          return;
        }
        if (screenRef.current === 'ROUND_SUMMARY') {
          resetRound();
          setScreen('PLAYING');
          return;
        }

        if (!inputRef.current.spaceHeld) {
          inputRef.current.spaceJustPressed = true;
        }
        inputRef.current.spaceHeld = true;
      } else if (e.code === 'KeyA') {
        e.preventDefault();
        inputRef.current.leftHeld = true;
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        inputRef.current.rightHeld = true;
      } else if (e.code === 'KeyR' && screenRef.current !== 'TITLE_MENU') {
        e.preventDefault();
        resetRound();
        setScreen('PLAYING');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (inputRef.current.spaceHeld) {
          inputRef.current.spaceJustReleased = true;
        }
        inputRef.current.spaceHeld = false;
      } else if (e.code === 'KeyA') {
        inputRef.current.leftHeld = false;
      } else if (e.code === 'KeyD') {
        inputRef.current.rightHeld = false;
      }
    };

    const onBlur = () => {
      inputRef.current.spaceHeld = false;
      inputRef.current.leftHeld = false;
      inputRef.current.rightHeld = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleStartGame, menuStage, resetRound]);

  // Fixed-timestep simulation + render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let hudTimer = 0;
    const FIXED_DT = 1 / 60;

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      if (rawDt > 0.25) {
        accumulator = 0;
        rafId = requestAnimationFrame(loop);
        return;
      }
      const frameDt = Math.min(0.05, Math.max(0, rawDt));
      accumulator += frameDt;

      const world = worldRef.current;

      while (accumulator >= FIXED_DT) {
        if (screenRef.current === 'TITLE_MENU') {
          inputRef.current.spaceJustPressed = false;
          inputRef.current.spaceJustReleased = false;
          stepMenuDemo(world, FIXED_DT);
          accumulator -= FIXED_DT;
          continue;
        }

        const snapshot: InputSnapshot =
          screenRef.current === 'PLAYING'
            ? {
                spaceHeld: inputRef.current.spaceHeld,
                spaceJustPressed: inputRef.current.spaceJustPressed,
                spaceJustReleased: inputRef.current.spaceJustReleased,
                leftHeld: inputRef.current.leftHeld,
                rightHeld: inputRef.current.rightHeld,
              }
            : {
                spaceHeld: false,
                spaceJustPressed: false,
                spaceJustReleased: false,
                leftHeld: false,
                rightHeld: false,
              };

        inputRef.current.spaceJustPressed = false;
        inputRef.current.spaceJustReleased = false;

        const { finished } = stepWorld(world, snapshot, FIXED_DT);

        if (finished && screenRef.current === 'PLAYING') {
          const finalStats = { ...world.stats };
          if (finalStats.clearedLevels && finalStats.mode === 'LEVELS' && world.difficulty !== 'DAVIN_SLUMBER') {
            soundEngine.playTargetSuccess();
          } else if (!finalStats.clearedLevels) {
            soundEngine.playFailure(world.difficulty === 'DAVIN_SLUMBER');
            if (world.difficulty === 'DAVIN_SLUMBER') {
              setDifficulty('CALM_CREEK');
              setMode('LEVELS');
            }
          }
          setSummaryStats(finalStats);
          setProgress((prev) => {
            const curBest = prev.bestScores[world.difficulty];
            const nextHighestLevel =
              finalStats.mode === 'LEVELS'
                ? Math.max(prev.highestLevelReached, Math.min(MAX_LEVEL, finalStats.level))
                : prev.highestLevelReached;

            const updated: PersistedProgress = {
              ...prev,
              bamboos: prev.bamboos + finalStats.bamboosEarned,
              highestLevelReached: nextHighestLevel,
              bestScores: {
                ...prev.bestScores,
                [world.difficulty]: {
                  skips: Math.max(curBest.skips, finalStats.skips),
                  distance: Math.max(curBest.distance, finalStats.distanceMeters),
                },
              },
            };
            progressRef.current = updated;
            saveProgress(updated);
            return updated;
          });
          setScreen('ROUND_SUMMARY');
        }

        accumulator -= FIXED_DT;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          renderGameWorld(ctx, world, { isMenu: screenRef.current === 'TITLE_MENU' });
        }
      }

      hudTimer += frameDt;
      if (hudTimer >= 0.06) {
        hudTimer = 0;
        setHud({
          mode: world.mode,
          level: world.stats.level,
          skips: world.stats.skips,
          perfectSkips: world.stats.perfectSkips,
          distanceMeters: world.stats.distanceMeters,
          wind: world.wind,
          phase: world.phase,
          shieldCharges: world.shieldCharges,
          bamboosEarned: world.stats.bamboosEarned,
          lastEventText: world.lastEventText,
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleCanvasPointerDown = () => {
    soundEngine.playSplash();
    if (screen !== 'PLAYING') return;
    if (!inputRef.current.spaceHeld) {
      inputRef.current.spaceJustPressed = true;
    }
    inputRef.current.spaceHeld = true;
  };

  const handleCanvasPointerUp = () => {
    if (screen !== 'PLAYING') return;
    if (inputRef.current.spaceHeld) {
      inputRef.current.spaceJustReleased = true;
    }
    inputRef.current.spaceHeld = false;
  };

  const activeBest = progress.bestScores[difficulty];
  const activeMapCfg = DIFFICULTIES[difficulty];
  const windSpeedKmh = Math.round(Math.abs(hud.wind) * 1.4);
  const windDirectionLabel = Math.abs(hud.wind) < 1.5 ? 'Calm' : hud.wind > 0 ? 'Right' : 'Left';
  const canSwitchLoadout = screen !== 'PLAYING' || hud.phase === 'READY';
  const liveBamboos = progress.bamboos + (screen === 'PLAYING' ? hud.bamboosEarned : 0);
  const shouldBlurCanvas = screen !== 'PLAYING' || shopOpen;

  return (
    <div className="min-h-screen bg-[#0b131e] text-slate-100 flex flex-col">
      {/* Compact Header HUD */}
      <header className="absolute inset-x-0 top-0 z-30 pointer-events-none">
        <div className="w-full px-3 sm:px-5 py-3 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              resetRound();
              setScreen('TITLE_MENU');
            }}
            className="pointer-events-auto flex items-center gap-2 group cursor-pointer shrink-0 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 backdrop-blur-sm shadow-lg"
          >
            <span className="font-pixel text-base sm:text-lg tracking-tight text-amber-300 group-hover:text-amber-200 transition-colors whitespace-nowrap">
              Daven Slaps
            </span>
          </button>

          <div className="pointer-events-auto flex items-center gap-3 sm:gap-5 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs sm:text-sm font-mono-tabular backdrop-blur-sm shadow-lg">
            <div className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-slate-400">Skips</span>
              <span className="text-base font-bold text-white">{hud.skips}</span>
            </div>
            <span className="text-slate-700 hidden sm:inline" aria-hidden="true">/</span>
            <div className="hidden sm:flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-slate-400">Dist</span>
              <span className="text-base font-bold text-sky-300">{hud.distanceMeters}m</span>
            </div>
            <span className="text-slate-700" aria-hidden="true">/</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap" title="Bamboo currency">
              <Sprout className="w-3.5 h-3.5 text-lime-400" />
              <span className="text-base font-bold text-lime-300">{liveBamboos}</span>
              <span className="text-slate-400 hidden sm:inline">Bamboos</span>
            </div>
            {hud.shieldCharges > 0 && screen === 'PLAYING' && (
              <>
                <span className="text-slate-700" aria-hidden="true">/</span>
                <div className="flex items-center gap-1 text-emerald-300 whitespace-nowrap">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-bold">x{hud.shieldCharges}</span>
                </div>
              </>
            )}
            <span className="text-slate-700 hidden lg:inline" aria-hidden="true">/</span>
            <div className="hidden lg:flex items-center gap-1.5 text-slate-300 whitespace-nowrap">
              <Wind className="w-3.5 h-3.5 text-sky-400" />
              <span>{windSpeedKmh} km/h {windDirectionLabel}</span>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 shrink-0 rounded-xl border border-white/10 bg-slate-950/30 p-1.5 backdrop-blur-sm shadow-lg">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="h-9 w-9 flex items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleRageMode}
              className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded border border-pink-500/40 bg-pink-950/40 text-pink-200 text-xs font-semibold hover:bg-pink-900/60 transition-colors cursor-pointer"
            >
              <img src="/assets/davin.webp" alt="" className="w-5 h-5 rounded-full object-contain" />
              Rage
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShopOpen((open) => !open)}
                className="h-9 px-2.5 flex items-center gap-1.5 rounded border border-lime-500/30 bg-lime-950/30 text-lime-200 text-xs font-semibold hover:bg-lime-900/50 transition-colors cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Shop
                <ChevronDown className="w-3 h-3" />
              </button>
              {shopOpen && (
                <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-slate-700 bg-[#0d1826] p-3 shadow-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-pixel text-xs text-lime-300">Bamboo Shop</span>
                    <span className="text-xs font-mono text-lime-200">{progress.bamboos} 🌱</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Maps</div>
                  <div className="grid gap-1">
                    {DIFFICULTY_ORDER.filter((id) => id !== 'DAVIN_SLUMBER').map((id) => {
                      const cfg = DIFFICULTIES[id];
                      const unlocked = progress.unlockedMaps.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleMapClick(id)}
                          className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                        >
                          <span>{cfg.label}</span>
                          <span className={unlocked ? 'text-emerald-300' : 'text-amber-300'}>
                            {unlocked ? 'Owned' : `${cfg.unlockCost} 🌱`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 mt-3">Pebble skins</div>
                  <div className="grid gap-1">
                    {STONE_ORDER.map((id) => {
                      const unlocked = progress.unlockedStones.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleSelectStone(id)}
                          className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                        >
                          <span>{STONE_PROFILES[id].name}</span>
                          <span className={unlocked ? 'text-emerald-300' : 'text-amber-300'}>
                            {unlocked ? 'Owned' : `${STONE_COSTS[id]} 🌱`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {screen !== 'TITLE_MENU' && (
              <button
                type="button"
                onClick={() => {
                  resetRound();
                  setScreen('PLAYING');
                }}
                className="h-9 px-3 flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 text-xs font-medium text-slate-200 hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="relative min-h-screen w-full overflow-hidden p-0">
        <div className="relative h-screen w-full">
          {/* Pixel Viewport Container */}
          <div className="absolute inset-0 h-full w-full overflow-hidden bg-[#080f18] select-none">
            <canvas
              ref={canvasRef}
              width={VIRTUAL_WIDTH * 2}
              height={VIRTUAL_HEIGHT * 2}
              onPointerDown={handleCanvasPointerDown}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className={`block h-full w-full pixelated touch-none cursor-crosshair transition-[filter,transform] duration-300 ${
                shouldBlurCanvas ? 'blur-[7px] scale-[1.01]' : ''
              }`}
            />

            {/* Minimal Home Menu */}
            {screen === 'TITLE_MENU' && menuStage === 'HOME' && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#08111d]/35 p-4">
                <div className="relative flex flex-col items-center gap-5 text-center">
                  <img
                    src="/assets/davin.webp"
                    alt=""
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 w-72 sm:w-[28rem] -translate-x-1/2 -translate-y-1/2 opacity-30 pointer-events-none"
                  />
                  <h1 className="font-pixel text-5xl sm:text-7xl font-bold tracking-tight text-amber-300 drop-shadow-lg">
                    Daven Slaps
                  </h1>
                  <button
                    type="button"
                    onClick={() => setMenuStage('SETUP')}
                    className="px-12 py-4 rounded-lg bg-amber-300 text-slate-950 font-pixel text-base hover:bg-amber-200 active:scale-95 transition-all cursor-pointer shadow-xl"
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreditsOpen((open) => !open)}
                    className="text-sm text-sky-200/80 hover:text-white cursor-pointer"
                  >
                    {creditsOpen ? 'Close Credits' : 'Credits'}
                  </button>
                  {creditsOpen && (
                    <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[min(90vw,420px)] rounded-xl border border-amber-200/20 bg-slate-950/90 p-4 shadow-2xl">
                      <div className="mb-3 font-pixel text-xs text-amber-200">A tiny bear easter egg</div>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          ['panda.svg', 'Panda'],
                          ['boyurut-codeworth.svg', 'Boyurut Codeworth'],
                          ['chinmey.svg', 'Chinmey'],
                        ].map(([image, name]) => (
                          <div key={name} className="flex flex-col items-center gap-1">
                            <img
                              src={`/assets/credits/${image}`}
                              alt={name}
                              className="h-16 w-16 image-pixelated"
                            />
                            <span className="text-[10px] text-slate-200">{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Setup Menu Overlay */}
            {screen === 'TITLE_MENU' && menuStage === 'SETUP' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3 sm:p-5">
                <div className="pointer-events-auto flex w-full max-w-[420px] flex-col gap-3 rounded-xl border border-teal-200/20 bg-[#0e1c2b]/90 p-4 shadow-2xl">
                  <button
                    type="button"
                    onClick={handleTargetedMode}
                    className="rounded-lg bg-amber-300 px-5 py-4 font-pixel text-sm text-slate-950 hover:bg-amber-200 cursor-pointer"
                  >
                    Targeted Run
                  </button>
                  <button
                    type="button"
                    onClick={handleRageMode}
                    className="rounded-lg bg-pink-600 px-5 py-4 font-pixel text-sm text-white hover:bg-pink-500 cursor-pointer"
                  >
                    Rage Mode
                  </button>
                </div>
              </div>
            )}

            {/* Round Summary Overlay */}
            {screen === 'ROUND_SUMMARY' && summaryStats && (() => {
              const isDavinRound =
                worldRef.current.difficulty === 'DAVIN_SLUMBER' ||
                summaryStats.causeOfSink.includes('Daven') ||
                summaryStats.causeOfSink.includes('pabble') ||
                summaryStats.causeOfSink.includes('slept');

              return (
                <div className="absolute inset-0 bg-slate-950/78 flex items-center justify-center p-4">
                  <div className="w-full max-w-md p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <div
                        className={`text-xs font-medium ${
                          summaryStats.clearedLevels ? 'text-emerald-300' : 'text-rose-400'
                        }`}
                      >
                        {summaryStats.causeOfSink}
                      </div>
                      <h2 className="font-pixel text-xl sm:text-2xl text-white">
                        {summaryStats.skips} {summaryStats.skips === 1 ? 'Skip' : 'Skips'}
                      </h2>
                      <p className="text-lg sm:text-xl text-amber-200/90 leading-snug mt-0.5">
                        “{summaryStats.quip}”
                      </p>
                    </div>

                    {isDavinRound && (
                        <img
                          src="/assets/davin.webp"
                          alt="Daven"
                          className="mx-auto w-24 h-24 object-contain drop-shadow-md animate-pulse"
                        />
                    )}

                    <div className="grid grid-cols-2 gap-y-2.5 gap-x-6 border-y border-slate-800 py-3.5 text-xs font-mono-tabular">
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {summaryStats.mode === 'ENDLESS' ? 'Endless' : 'Level'}
                        </span>
                        <span className="text-emerald-300 font-bold">
                          Level {summaryStats.level}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Distance</span>
                        <span className="text-white font-bold">{summaryStats.distanceMeters}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Perfect Hits</span>
                        <span className="text-amber-300 font-bold">{summaryStats.perfectSkips}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {summaryStats.mode === 'ENDLESS' ? 'Powerups' : 'Ducks Bonked'}
                        </span>
                        <span className="text-sky-300 font-bold">
                          {summaryStats.mode === 'ENDLESS'
                            ? summaryStats.powerupsHit
                            : summaryStats.ducksBonked}
                        </span>
                      </div>
                    </div>

                    {/* Bamboo Earnings Summary */}
                    <div className="flex items-center justify-between text-xs font-mono-tabular bg-slate-900/80 border border-slate-800 rounded px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Sprout className="w-4 h-4 text-lime-400" />
                        <span className="text-slate-200">
                          Earned <strong className="text-lime-300">+{summaryStats.bamboosEarned}</strong>
                        </span>
                        {(summaryStats.bamboosFromPickups > 0 || summaryStats.bamboosFromClear > 0) && (
                          <span className="text-slate-400">
                            ({summaryStats.bamboosFromDistance} dist +{' '}
                            {summaryStats.bamboosFromPickups + summaryStats.bamboosFromClear} bonus)
                          </span>
                        )}
                      </div>
                      <span className="text-lime-300 font-bold">Total {progress.bamboos}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          resetRound();
                          setScreen('TITLE_MENU');
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Maps &amp; Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetRound();
                          setScreen('PLAYING');
                        }}
                        className={`ml-auto px-5 py-2.5 font-pixel text-xs sm:text-sm rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isDavinRound
                            ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-md'
                            : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                        }`}
                      >
                        {isDavinRound ? 'Slap Again 🔥' : 'Play Again'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Below-Canvas Control Strip & Map Unlock Shop / Loadout */}
          <div className="hidden">
            <div className="flex items-center justify-between gap-4 min-w-0">
              <p className="text-xs sm:text-sm text-slate-300 truncate">
                {shopNotice ?? hud.lastEventText}
              </p>
              {screen === 'PLAYING' && (
                <button
                  type="button"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  className="lg:hidden px-4 py-2 bg-amber-400 active:bg-amber-300 text-slate-950 font-pixel text-xs rounded whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {hud.phase === 'IN_FLIGHT' ? 'Tap Skip' : 'Hold Throw'}
                </button>
              )}
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              {/* Map Selector & Unlock Shop */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800">
                {DIFFICULTY_ORDER.map((id) => {
                  const cfg = DIFFICULTIES[id];
                  const unlocked = progress.unlockedMaps.includes(id);
                  const active = difficulty === id;
                  const canAfford = progress.bamboos >= cfg.unlockCost;
                  const isDavin = id === 'DAVIN_SLUMBER';

                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canSwitchLoadout}
                      onClick={() => handleMapClick(id)}
                      title={
                        unlocked
                          ? `${cfg.label} · ${cfg.bamboosPer100m} Bamboos/100m`
                          : `Buy ${cfg.label} for ${cfg.unlockCost} Bamboos · Earns ${cfg.bamboosPer100m}/100m`
                      }
                      className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? isDavin
                            ? 'bg-pink-600 text-white font-bold shadow-sm'
                            : 'bg-slate-700 text-white font-bold'
                          : unlocked
                            ? isDavin
                              ? 'text-pink-300 hover:text-white hover:bg-pink-950/60 border border-pink-500/30'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                            : canAfford
                              ? 'text-lime-300 hover:bg-lime-950/50 border border-lime-500/35'
                              : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {!unlocked && <Lock className="w-3 h-3 shrink-0" />}
                      <span>{isDavin ? '🔥 ' + cfg.label : cfg.label}</span>
                      <span
                        className={`font-mono-tabular text-[11px] ${
                          isDavin
                            ? 'text-pink-200'
                            : unlocked
                              ? 'text-lime-300/90'
                              : canAfford
                                ? 'text-amber-300 font-semibold'
                                : 'text-slate-500'
                        }`}
                      >
                        {unlocked ? `${cfg.bamboosPer100m}/100m` : `${cfg.unlockCost}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stone Selector */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800 self-start lg:self-auto">
                {STONE_ORDER.map((id) => {
                  const active = stoneKind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canSwitchLoadout}
                      onClick={() => handleSelectStone(id)}
                      title={STONE_PROFILES[id].description}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {STONE_PROFILES[id].name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
