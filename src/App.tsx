import React, { useState, useEffect, useRef } from 'react';
import { GameStatus, GameHistory } from './types';
import { GAME_CONSTANTS, calculateCrashPoint } from './constants';
import { FlightScene } from './components/FlightScene';
import { musicEngine } from './audio/musicEngine';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  History, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  PlusCircle, 
  Music, 
  Music2, 
  Flame, 
  Sparkles,
  Radio
} from 'lucide-react';

// --- Sound Engine ---
const createAudioContext = () => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  return new AudioContext();
};

const playSinTone = (ctx: AudioContext, freq: number, duration: number, volume = 0.1) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

const playComplexTone = (ctx: AudioContext, freq: number, duration: number, volume = 0.1, type: OscillatorType = 'sine') => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 2, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

const playNoise = (ctx: AudioContext, duration: number, volume = 0.1, type: 'white' | 'brown' = 'white') => {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    if (type === 'white') {
      data[i] = Math.random() * 2 - 1;
    } else {
      // Brownian approximation
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Gain adjustment for brown noise
    }
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start();
};
// --- End Sound Engine ---

export default function App() {
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [multiplier, setMultiplier] = useState(1.0);
  const [isCashedOut, setIsCashedOut] = useState(false);
  const [bet, setBet] = useState(10);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [showMusicMenu, setShowMusicMenu] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.045);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('redline_balance');
    return saved ? parseFloat(saved) : GAME_CONSTANTS.INITIAL_BALANCE;
  });

  const [history, setHistory] = useState<GameHistory[]>(() => {
    const saved = localStorage.getItem('redline_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Recent round crash history - pre-seeded with representative figures (1.12, 1.50, 5.50, etc.)
  const [crashHistory, setCrashHistory] = useState<number[]>(() => {
    const saved = localStorage.getItem('redline_crash_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback to default seeds
      }
    }
    return [5.50, 1.50, 1.12, 3.45, 1.82, 14.20, 2.10, 1.05];
  });

  const [lastResult, setLastResult] = useState<{ multiplier: number; won: boolean } | null>(null);

  const timerRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const crashPointRef = useRef(0);

  // Persistence
  useEffect(() => {
    localStorage.setItem('redline_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('redline_history', JSON.stringify(history.slice(0, 10)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('redline_crash_history', JSON.stringify(crashHistory.slice(0, 25)));
  }, [crashHistory]);

  // Audio Context & BGM Lifecycle
  const getOrCreateAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    musicEngine.setContext(audioCtxRef.current);
    return audioCtxRef.current;
  };

  useEffect(() => {
    if (soundEnabled || musicEnabled) {
      getOrCreateAudioContext();
    }
  }, [soundEnabled, musicEnabled]);

  // Handle music start & volume adjustments
  useEffect(() => {
    if (musicEnabled) {
      const ctx = getOrCreateAudioContext();
      if (ctx) {
        musicEngine.setContext(ctx);
        musicEngine.setVolume(musicVolume);
        musicEngine.setMute(false);
        musicEngine.start();
      }
    } else {
      musicEngine.setMute(true);
    }
  }, [musicEnabled, musicVolume]);

  // Sync music mood with game status
  useEffect(() => {
    if (musicEnabled) {
      musicEngine.handleGameStatus(status);
    }
  }, [status, musicEnabled]);

  // Close music menu on outside click
  useEffect(() => {
    if (!showMusicMenu) return;
    const handleOutside = () => setShowMusicMenu(false);
    const timer = setTimeout(() => {
      window.addEventListener('click', handleOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleOutside);
    };
  }, [showMusicMenu]);

  // Resume audio on first user touch/click
  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getOrCreateAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
      if (musicEnabled && !musicEngine.getIsRunning()) {
        musicEngine.start();
      }
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [musicEnabled]);

  useEffect(() => {
    return () => {
      stopEngine();
      musicEngine.stop();
    };
  }, []);

  const startEngine = () => {
    if (!soundEnabled) return;
    const ctx = getOrCreateAudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, ctx.currentTime);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    engineOscRef.current = osc;
    engineGainRef.current = gain;
  };

  const updateEnginePitch = (mult: number) => {
    if (engineOscRef.current && audioCtxRef.current) {
      const freq = 40 + (mult * 20);
      engineOscRef.current.frequency.setTargetAtTime(freq, audioCtxRef.current.currentTime, 0.1);
    }
  };

  const stopEngine = () => {
    if (engineGainRef.current && audioCtxRef.current) {
      engineGainRef.current.gain.exponentialRampToValueAtTime(0.0001, audioCtxRef.current.currentTime + 0.5);
      setTimeout(() => {
        engineOscRef.current?.stop();
        engineOscRef.current = null;
      }, 600);
    }
  };

  const playSfx = (type: 'start' | 'flight' | 'crash' | 'win') => {
    if (!soundEnabled) return;
    const ctx = getOrCreateAudioContext();

    switch (type) {
      case 'start':
        playComplexTone(ctx, 110, 0.8, 0.1, 'sawtooth');
        setTimeout(() => playComplexTone(ctx, 220, 0.6, 0.1, 'square'), 100);
        setTimeout(() => playSinTone(ctx, 440, 0.4, 0.1), 200);
        break;
      case 'crash':
        playNoise(ctx, 0.2, 0.4, 'white');
        setTimeout(() => playNoise(ctx, 2.5, 0.3, 'brown'), 50);
        playComplexTone(ctx, 60, 2, 0.4, 'sawtooth');
        break;
      case 'win':
        const winVolume = 0.12;
        playSinTone(ctx, 523.25, 0.15, winVolume);
        setTimeout(() => playSinTone(ctx, 587.33, 0.15, winVolume), 100);
        setTimeout(() => playSinTone(ctx, 622.25, 0.15, winVolume), 200);
        setTimeout(() => playSinTone(ctx, 783.99, 0.5, winVolume), 300);
        break;
    }
  };

  const startGame = () => {
    if (balance < bet) return;
    
    // Resume context on play
    getOrCreateAudioContext();
    if (musicEnabled && !musicEngine.getIsRunning()) {
      musicEngine.start();
    }
    
    setBalance(prev => prev - bet);
    const target = calculateCrashPoint();
    crashPointRef.current = target;
    setMultiplier(1.0);
    setStatus(GameStatus.FLYING);
    setIsCashedOut(false);
    setLastResult(null);
    startTimeRef.current = Date.now();
    
    playSfx('start');
    startEngine();

    const updateLoop = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const nextMultiplier = Math.pow(Math.E, GAME_CONSTANTS.GROWTH_RATE * elapsed * (1 + elapsed * 0.1));
      
      updateEnginePitch(nextMultiplier);

      if (nextMultiplier >= crashPointRef.current) {
        setMultiplier(crashPointRef.current);
        crash();
      } else {
        setMultiplier(nextMultiplier);
        timerRef.current = requestAnimationFrame(updateLoop);
      }
    };

    timerRef.current = requestAnimationFrame(updateLoop);
  };

  const crash = () => {
    cancelAnimationFrame(timerRef.current);
    setStatus(GameStatus.CRASHED);
    stopEngine();
    playSfx('crash');
    
    const crashVal = crashPointRef.current;

    // Update round crash history (all crashes)
    setCrashHistory(prev => [crashVal, ...prev].slice(0, 25));

    // Update personal bet history
    setHistory(prev => [{
      id: Date.now().toString(),
      multiplier: crashVal,
      timestamp: Date.now(),
      cashedOut: isCashedOut
    }, ...prev].slice(0, 10));

    setTimeout(() => {
      setStatus(GameStatus.IDLE);
    }, 3500);
  };

  const cashOut = () => {
    if (status !== GameStatus.FLYING || isCashedOut) return;
    
    const winAmount = bet * multiplier;
    setBalance(prev => prev + winAmount);
    setLastResult({ multiplier, won: true });
    setIsCashedOut(true);
    playSfx('win');
  };

  const resetBalance = () => {
    if (balance > 10) return;
    setBalance(GAME_CONSTANTS.INITIAL_BALANCE);
  };

  // Color helper for crash multiplier badges
  const getMultiplierStyle = (val: number) => {
    if (val >= 10.0) {
      return 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]';
    }
    if (val >= 2.0) {
      return 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.2)]';
    }
    return 'bg-sky-500/15 border-sky-500/30 text-sky-400';
  };

  // Take exact last 5 crashes
  const last5Crashes = crashHistory.slice(0, 5);
  const avgLast5 = last5Crashes.length > 0 
    ? (last5Crashes.reduce((a, b) => a + b, 0) / last5Crashes.length).toFixed(2)
    : '0.00';
  const maxLast5 = last5Crashes.length > 0
    ? Math.max(...last5Crashes).toFixed(2)
    : '0.00';

  return (
    <div className="min-h-screen bg-black flex flex-col items-center p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header Bar */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center glass-panel px-4 py-3 sm:px-6 sm:py-4 gap-3 sm:gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-neon-red/20 rounded-lg border border-neon-red/30">
            <TrendingUp className="text-neon-red w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="font-display text-lg sm:text-xl tracking-tighter neon-text leading-tight">
              REDLINE <span className="text-white opacity-50">AVIATOR</span>
            </h1>
            <p className="text-[10px] text-white/40 tracking-widest font-mono">HIGH-STAKES CRASH SIMULATOR</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Lowkey Music Player Control */}
          <div className="relative">
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <button 
                onClick={() => {
                  getOrCreateAudioContext();
                  setMusicEnabled(prev => !prev);
                }}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-mono flex items-center space-x-1.5 sm:space-x-2 transition-all cursor-pointer ${
                  musicEnabled 
                    ? 'bg-neon-red/15 text-white' 
                    : 'text-white/40 hover:text-white'
                }`}
                title={musicEnabled ? "Mute Lowkey Music" : "Play Lowkey Music (Encouraging Ambient Vibe)"}
              >
                <Music size={15} className={musicEnabled ? "text-neon-red animate-pulse" : "text-white/40"} />
                <span className="text-[11px] font-semibold tracking-wider">
                  {musicEnabled ? "BGM ON" : "BGM OFF"}
                </span>
                {musicEnabled && (
                  <span className="flex space-x-0.5 items-end h-3 pl-0.5">
                    <span className="w-0.5 h-1.5 bg-neon-red rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-0.5 h-3 bg-neon-red rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-0.5 h-2 bg-neon-red rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </button>
              
              <button
                onClick={() => setShowMusicMenu(prev => !prev)}
                className={`px-2 py-1.5 hover:bg-white/10 text-white/40 hover:text-white border-l border-white/10 text-[10px] font-mono cursor-pointer transition-colors ${
                  showMusicMenu ? 'bg-white/15 text-white' : ''
                }`}
                title="Adjust Lowkey Volume"
              >
                {musicEnabled ? `${Math.round(musicVolume * 1000)}%` : 'MUTED'}
              </button>
            </div>

            {/* Volume dropdown */}
            {showMusicMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 p-3 rounded-xl bg-black/95 backdrop-blur-xl border border-white/20 shadow-2xl z-50 text-xs space-y-2">
                <div className="flex justify-between items-center text-[10px] text-white/60 uppercase tracking-wider font-mono">
                  <span>Music Volume</span>
                  <span className="text-neon-red font-bold">{Math.round(musicVolume * 1000)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.10"
                  step="0.005"
                  value={musicVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setMusicVolume(v);
                    musicEngine.setVolume(v);
                    if (!musicEnabled) setMusicEnabled(true);
                  }}
                  className="w-full accent-neon-red cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-white/40 font-mono">
                  <span>Whisper (1%)</span>
                  <span>Lowkey (4.5%)</span>
                  <span>Medium (10%)</span>
                </div>
              </div>
            )}
          </div>

          {/* Sound FX Mute Toggle */}
          <button 
            onClick={() => {
              getOrCreateAudioContext();
              setSoundEnabled(!soundEnabled);
            }}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              soundEnabled 
                ? 'bg-white/5 border-white/10 text-white/80 hover:text-white' 
                : 'bg-white/5 border-white/10 text-white/30'
            }`}
            title={soundEnabled ? "Mute SFX" : "Unmute SFX"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          
          {/* Balance Pill */}
          <div className="flex items-center space-x-2 sm:space-x-3 bg-black/50 pr-2 pl-3 sm:pl-4 py-1.5 rounded-full border border-white/10 shadow-inner">
            <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            <span className="font-mono text-emerald-400 font-bold text-sm sm:text-base">₹{balance.toFixed(2)}</span>
            <button 
              onClick={() => setBalance(prev => prev + 1000)}
              className="p-1 text-white/60 hover:text-emerald-400 transition-colors cursor-pointer group relative"
              title="Add ₹1000 Dummy Cash"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-bold pointer-events-none">
                +₹1000
              </span>
            </button>
            {balance < 10 && (
              <button 
                onClick={resetBalance}
                className="p-1 hover:text-white transition-colors"
                title="Reset Balance"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Game Stage */}
      <div className="w-full max-w-4xl relative">
        <FlightScene status={status} multiplier={multiplier} />

        {/* Multiplier Overlay */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none w-full px-4">
          <motion.div 
            key={status === GameStatus.CRASHED ? 'crashed' : 'flying'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-display text-5xl sm:text-7xl md:text-9xl text-center select-none ${status === GameStatus.CRASHED ? 'text-red-600' : 'neon-text'}`}
          >
            {multiplier.toFixed(2)}x
          </motion.div>
          
          <AnimatePresence>
            {status === GameStatus.CRASHED && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-display text-lg sm:text-2xl text-red-500 tracking-[0.3em] sm:tracking-[0.5em] mt-2 sm:mt-4 text-center font-bold"
              >
                CRASHED @ {crashPointRef.current.toFixed(2)}x
              </motion.div>
            )}
            {isCashedOut && status === GameStatus.FLYING && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="font-display text-sm sm:text-xl text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full mt-2 sm:mt-4 backdrop-blur-md whitespace-nowrap shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              >
                SECURED: {lastResult?.multiplier.toFixed(2)}x (+₹{(bet * (lastResult?.multiplier || 0)).toFixed(2)})
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dynamic Flight Multiplier Bar under Stage */}
        <div className="mt-2 w-full flex items-center justify-between px-3 py-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 overflow-hidden">
          <div className="flex items-center space-x-2 shrink-0 pr-3 border-r border-white/10">
            <Radio className="w-3.5 h-3.5 text-neon-red animate-pulse" />
            <span className="text-[10px] uppercase font-display tracking-wider text-white/50">Recent Rounds</span>
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar py-0.5 pl-3">
            {crashHistory.slice(0, 10).map((crashVal, idx) => (
              <span
                key={idx}
                className={`font-mono text-xs px-2.5 py-0.5 rounded-full border transition-all shrink-0 ${getMultiplierStyle(crashVal)} ${
                  idx === 0 ? 'ring-1 ring-white/20' : ''
                }`}
              >
                {crashVal.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Controls & Side History */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Betting Controls (2 Columns) */}
        <div className="md:col-span-2 glass-panel p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <span className="text-xs sm:text-sm uppercase tracking-widest text-white/40 font-semibold">Place Your Bet</span>
            <div className="flex flex-wrap gap-2">
              {[1, 10, 50, 100].map(val => (
                <button
                  key={val}
                  onClick={() => setBet(prev => Math.min(prev + val, balance))}
                  className="px-2.5 sm:px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] sm:text-xs hover:bg-neon-red/20 hover:border-neon-red/40 transition-all font-mono active:scale-95 cursor-pointer"
                >
                  +{val}
                </button>
              ))}
              <button
                onClick={() => setBet(prev => Math.max(1, Math.floor(prev / 2)))}
                className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] sm:text-xs hover:bg-white/10 transition-all font-mono cursor-pointer"
                title="Half Bet"
              >
                ½
              </button>
              <button
                onClick={() => setBet(prev => Math.min(balance, prev * 2))}
                className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] sm:text-xs hover:bg-white/10 transition-all font-mono cursor-pointer"
                title="Double Bet"
              >
                2x
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="bg-black/60 rounded-xl border border-white/10 p-2 flex items-center h-12 sm:h-auto sm:flex-1">
              <span className="text-white/40 pl-2 font-mono text-sm">₹</span>
              <input
                type="number"
                value={bet}
                onChange={(e) => setBet(Math.max(1, parseInt(e.target.value) || 0))}
                className="bg-transparent border-none text-xl sm:text-2xl font-display w-full h-full px-2 sm:px-3 focus:ring-0 text-center font-bold text-white"
                disabled={status === GameStatus.FLYING}
              />
            </div>

            {status === GameStatus.FLYING ? (
              <button
                onClick={cashOut}
                disabled={isCashedOut}
                className={`flex-[2] h-14 sm:h-auto neon-border border-2 rounded-xl flex items-center justify-center space-x-3 transition-all transform active:scale-95 group overflow-hidden relative shadow-[0_0_30px_rgba(16,185,129,0.3)] cursor-pointer ${
                  isCashedOut ? 'bg-white/10 border-white/20 opacity-50' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                <div className="absolute inset-0 bg-white/10 group-hover:translate-x-full transition-transform duration-500 skew-x-12" />
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-display text-lg sm:text-xl font-bold">{isCashedOut ? 'CASHED OUT' : 'CASH OUT'}</span>
                  <span className="text-[10px] sm:text-xs opacity-90 uppercase tracking-tighter font-mono">
                    {isCashedOut ? `Won ₹${(bet * (lastResult?.multiplier || 0)).toFixed(2)}` : `Win ₹${(bet * multiplier).toFixed(2)}`}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={startGame}
                disabled={status !== GameStatus.IDLE || balance < bet}
                className={`flex-[2] h-14 sm:h-auto rounded-xl flex items-center justify-center space-x-3 transition-all transform active:scale-95 group overflow-hidden relative cursor-pointer ${
                  balance < bet || status !== GameStatus.IDLE
                    ? 'bg-white/10 opacity-50 cursor-not-allowed'
                    : 'bg-neon-red hover:bg-[#ff0000] neon-border border-2'
                }`}
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-white" />
                <span className="font-display text-lg sm:text-xl uppercase tracking-wider font-bold text-white">
                  {status === GameStatus.CRASHED ? 'WAITING NEXT ROUND' : 'START FLIGHT'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Side Panel: Flight History & LAST 5 CRASHES AT THE BOTTOM */}
        <div className="glass-panel p-4 sm:p-5 flex flex-col justify-between space-y-4">
          
          {/* Top section: User's Flight Bet History */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-white/50" />
                <span className="text-xs uppercase tracking-tighter text-white/60 font-display font-semibold">
                  My Flight Bets
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/30">
                {history.length} {history.length === 1 ? 'bet' : 'bets'}
              </span>
            </div>
            
            <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-5 text-white/20 text-xs italic">
                  Place a bet and launch flight
                </div>
              ) : (
                history.slice(0, 5).map((record) => (
                  <div 
                    key={record.id}
                    className={`flex justify-between items-center px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                      record.cashedOut 
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                        : 'bg-red-500/10 border-red-500/25 text-red-400'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {record.cashedOut ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3 text-red-400" />}
                      <span className="font-bold">{record.multiplier.toFixed(2)}x</span>
                    </div>
                    <span className="text-[10px] opacity-60">
                      {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* EXACTLY AT THE BOTTOM OF THE SIDE: History of Last 5 Crashes */}
          <div className="pt-3 border-t border-white/10 mt-auto bg-black/30 -mx-4 -mb-4 p-4 rounded-b-2xl border-b border-x border-white/5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-1.5">
                <div className="p-1 rounded bg-neon-red/20 border border-neon-red/30">
                  <Flame className="w-3.5 h-3.5 text-neon-red animate-pulse" />
                </div>
                <span className="text-xs uppercase tracking-wider font-display font-bold text-white flex items-center gap-1.5">
                  Last 5 Crashes
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-neon-red animate-ping" />
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/40">
                Avg: <strong className="text-white/70">{avgLast5}x</strong>
              </span>
            </div>

            {/* Badges of the last 5 crashes (e.g. 1.12, 1.5, 5.5 etc.) */}
            <div className="grid grid-cols-5 gap-1.5">
              {last5Crashes.map((val, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition-all transform hover:scale-105 relative ${getMultiplierStyle(val)}`}
                >
                  {idx === 0 && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-neon-red text-white text-[8px] font-bold px-1 rounded uppercase tracking-tighter scale-90">
                      NEW
                    </span>
                  )}
                  <span className="font-mono text-xs sm:text-sm font-bold tracking-tight">
                    {val.toFixed(2)}x
                  </span>
                  <span className="text-[9px] opacity-60 font-mono mt-0.5">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary statistics bar */}
            <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40 font-mono">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Peak: <span className="text-amber-300 font-bold">{maxLast5}x</span>
              </span>
              <span className="text-white/30 text-[9px]">Auto-updates every round</span>
            </div>
          </div>

        </div>
      </div>

      {/* Footer Instructions & Audio Atmosphere Notes */}
      <div className="text-center text-white/30 text-xs max-w-lg mt-6 leading-relaxed px-4 space-y-1">
        <p>
          Predict how high the plane will fly! Cash out before the Redline Engine fails to secure your multiplier.
        </p>
        <p className="text-[11px] text-white/20 font-mono flex items-center justify-center gap-1.5">
          <Music2 className="w-3 h-3 text-neon-red/50" />
          Lowkey Synthwave BGM dynamically adapts to flight tension
        </p>
      </div>
    </div>
  );
}

