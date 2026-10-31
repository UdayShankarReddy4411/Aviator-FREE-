import React, { useState, useEffect, useRef } from 'react';
import { GameStatus, GameHistory } from './types';
import { GAME_CONSTANTS, calculateCrashPoint } from './constants';
import { FlightScene } from './components/FlightScene';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, History, Play, CheckCircle2, AlertTriangle, TrendingUp, RotateCcw, Volume2, VolumeX, PlusCircle } from 'lucide-react';

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
    if (soundEnabled && !audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    return () => {
      stopEngine();
    };
  }, [soundEnabled]);

  const startEngine = () => {
    if (!soundEnabled || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

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
    if (!soundEnabled || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    switch (type) {
      case 'start':
        // Modern "Engine Engage" sound
        playComplexTone(ctx, 110, 0.8, 0.1, 'sawtooth');
        setTimeout(() => playComplexTone(ctx, 220, 0.6, 0.1, 'square'), 100);
        setTimeout(() => playSinTone(ctx, 440, 0.4, 0.1), 200);
        break;
      case 'crash':
        // Layered explosion: white noise snap + brown noise rumble + low pitch drop
        playNoise(ctx, 0.2, 0.4, 'white'); // Initial snap
        setTimeout(() => playNoise(ctx, 2.5, 0.3, 'brown'), 50); // Sustained rumble
        playComplexTone(ctx, 60, 2, 0.4, 'sawtooth'); // Deep structural failure sound
        break;
      case 'win':
        // Triumphant melodic minor sequence
        const winVolume = 0.12;
        playSinTone(ctx, 523.25, 0.15, winVolume); // C5
        setTimeout(() => playSinTone(ctx, 587.33, 0.15, winVolume), 100); // D5
        setTimeout(() => playSinTone(ctx, 622.25, 0.15, winVolume), 200); // Eb5
        setTimeout(() => playSinTone(ctx, 783.99, 0.5, winVolume), 300); // G5
        break;
    }
  };

  const startGame = () => {
    if (balance < bet) return;
    
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
    
    setHistory(prev => [{
      id: Date.now().toString(),
      multiplier: crashPointRef.current,
      timestamp: Date.now(),
      cashedOut: isCashedOut
    }, ...prev].slice(0, 10));

    setTimeout(() => setStatus(GameStatus.IDLE), 3500);
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

  return (
    <div className="min-h-screen bg-black flex flex-col items-center p-4 md:p-8 space-y-6">
      {/* Header Bar */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center glass-panel px-4 py-3 sm:px-6 sm:py-4 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-neon-red/20 rounded-lg border border-neon-red/30">
            <TrendingUp className="text-neon-red w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h1 className="font-display text-lg sm:text-xl tracking-tighter neon-text">REDLINE <span className="text-white opacity-50">AVIATOR</span></h1>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto justify-between sm:justify-end">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          
          <div className="flex items-center space-x-2 sm:space-x-3 bg-black/40 pr-2 pl-3 sm:pl-4 py-1.5 sm:py-2 rounded-full border border-white/10">
            <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            <span className="font-mono text-emerald-400 font-bold text-sm sm:text-base">₹{balance.toFixed(2)}</span>
            <button 
              onClick={() => setBalance(prev => prev + 1000)}
              className="p-1 hover:text-emerald-400 transition-colors cursor-pointer group relative"
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
            className={`font-display text-5xl sm:text-7xl md:text-9xl text-center ${status === GameStatus.CRASHED ? 'text-red-600' : 'neon-text'}`}
          >
            {multiplier.toFixed(2)}x
          </motion.div>
          
          <AnimatePresence>
            {status === GameStatus.CRASHED && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-display text-lg sm:text-2xl text-red-500 tracking-[0.3em] sm:tracking-[0.5em] mt-2 sm:mt-4 text-center"
              >
                CRASHED
              </motion.div>
            )}
            {isCashedOut && status === GameStatus.FLYING && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="font-display text-sm sm:text-xl text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full mt-2 sm:mt-4 backdrop-blur-md whitespace-nowrap"
              >
                SECURED: {lastResult?.multiplier.toFixed(2)}x
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls & History */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Betting Controls */}
        <div className="md:col-span-2 glass-panel p-4 sm:p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
            <span className="text-xs sm:text-sm uppercase tracking-widest text-white/40 font-semibold">Place Your Bet</span>
            <div className="flex flex-wrap gap-2">
              {[1, 10, 50, 100].map(val => (
                <button
                  key={val}
                  onClick={() => setBet(prev => Math.min(prev + val, balance))}
                  className="px-2 sm:px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] sm:text-xs hover:bg-neon-red/20 hover:border-neon-red/40 transition-all font-mono"
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="bg-black/60 rounded-xl border border-white/10 p-2 flex items-center h-12 sm:h-auto sm:flex-1">
              <input
                type="number"
                value={bet}
                onChange={(e) => setBet(Math.max(1, parseInt(e.target.value) || 0))}
                className="bg-transparent border-none text-xl sm:text-2xl font-display w-full h-full px-2 sm:px-4 focus:ring-0 text-center"
                disabled={status === GameStatus.FLYING}
              />
            </div>

            {status === GameStatus.FLYING ? (
              <button
                onClick={cashOut}
                disabled={isCashedOut}
                className={`flex-[2] h-14 sm:h-auto neon-border border-2 rounded-xl flex items-center justify-center space-x-3 transition-all transform active:scale-95 group overflow-hidden relative shadow-[0_0_30px_rgba(16,185,129,0.3)] ${
                  isCashedOut ? 'bg-white/10 border-white/20 opacity-50' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                <div className="absolute inset-0 bg-white/10 group-hover:translate-x-full transition-transform duration-500 skew-x-12" />
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-display text-lg sm:text-xl">{isCashedOut ? 'CASHED OUT' : 'CASH OUT'}</span>
                  <span className="text-[10px] sm:text-xs opacity-80 uppercase tracking-tighter">
                    {isCashedOut ? `Won ₹${(bet * (lastResult?.multiplier || 0)).toFixed(2)}` : `Win ₹${(bet * multiplier).toFixed(2)}`}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={startGame}
                disabled={status !== GameStatus.IDLE || balance < bet}
                className={`flex-[2] h-14 sm:h-auto rounded-xl flex items-center justify-center space-x-3 transition-all transform active:scale-95 group overflow-hidden relative ${
                  balance < bet || status !== GameStatus.IDLE
                    ? 'bg-white/10 opacity-50 cursor-not-allowed'
                    : 'bg-neon-red hover:bg-[#ff0000] neon-border border-2'
                }`}
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                <span className="font-display text-lg sm:text-xl uppercase tracking-wider">Start Flight</span>
              </button>
            )}
          </div>
        </div>

        {/* History */}
        <div className="glass-panel p-6">
          <div className="flex items-center space-x-2 mb-4 border-b border-white/10 pb-2">
            <History className="w-4 h-4 text-white/40" />
            <span className="text-xs uppercase tracking-tighter text-white/40 font-display">Flight History</span>
          </div>
          
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
            {history.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-xs italic">No flights yet</div>
            ) : (
              history.map((record) => (
                <div 
                  key={record.id}
                  className={`flex justify-between items-center p-2 rounded-lg border text-sm font-mono transition-all ${
                    record.cashedOut 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {record.cashedOut ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    <span>{record.multiplier.toFixed(2)}x</span>
                  </div>
                  <span className="text-[10px] opacity-50">
                    {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer Instructions */}
      <p className="text-center text-white/20 text-xs max-w-lg mt-8 leading-relaxed px-4">
        Predict how high the plane will fly! Cash out before the Redline Engine fails to secure your multiplier. Higher altitudes mean higher rewards, but don't wait too long.
      </p>
    </div>
  );
}
