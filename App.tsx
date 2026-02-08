
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TimerStatus, TimerState, ProductivityTip } from './types';
import { getWorkdayTip } from './services/geminiService';

const DEFAULT_DURATION_MS = 8 * 60 * 60 * 1000; // 8 Hours

const App: React.FC = () => {
  const [totalDurationMs, setTotalDurationMs] = useState<number>(() => {
    const saved = localStorage.getItem('zen_total_duration');
    return saved ? parseInt(saved, 10) : DEFAULT_DURATION_MS;
  });

  const [timer, setTimer] = useState<TimerState>(() => {
    const saved = localStorage.getItem('zen_timer_state');
    const lastDate = localStorage.getItem('zen_last_active_day');
    const today = new Date().toDateString();

    // If it's a new day, reset to IDLE so it can start fresh
    if (lastDate && lastDate !== today) {
      localStorage.setItem('zen_last_active_day', today);
      return { startTime: null, endTime: null, status: TimerStatus.IDLE };
    }

    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.endTime && Date.now() > parsed.endTime) {
        return { startTime: null, endTime: null, status: TimerStatus.FINISHED };
      }
      return parsed;
    }
    
    localStorage.setItem('zen_last_active_day', today);
    return { startTime: null, endTime: null, status: TimerStatus.IDLE };
  });

  const [autoStartEnabled, setAutoStartEnabled] = useState(() => {
    const saved = localStorage.getItem('zen_auto_start');
    return saved === null ? true : saved === 'true'; // Default to true for this requirement
  });
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [tip, setTip] = useState<ProductivityTip | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [focusTask, setFocusTask] = useState(() => localStorage.getItem('zen_focus_task') || '');
  
  // Duration inputs
  const [inputHours, setInputHours] = useState(Math.floor(totalDurationMs / (1000 * 60 * 60)));
  const [inputMinutes, setInputMinutes] = useState(Math.floor((totalDurationMs % (1000 * 60 * 60)) / (1000 * 60)));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('zen_timer_state', JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    localStorage.setItem('zen_auto_start', autoStartEnabled.toString());
    if (autoStartEnabled && timer.status === TimerStatus.IDLE) {
      setTimer(prev => ({...prev, status: TimerStatus.LISTENING}));
    }
  }, [autoStartEnabled, timer.status]);

  useEffect(() => {
    localStorage.setItem('zen_total_duration', totalDurationMs.toString());
  }, [totalDurationMs]);

  useEffect(() => {
    localStorage.setItem('zen_focus_task', focusTask);
  }, [focusTask]);

  // Notification Permission Check
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
    }
  };

  // OS Integration: Tab Title and Taskbar Badge
  useEffect(() => {
    if (timer.status === TimerStatus.RUNNING) {
      const time = formatTime(timeLeft);
      const titleStr = `${time.h}:${time.m} Left • Zen`;
      document.title = titleStr;

      if ('setAppBadge' in navigator) {
        const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
        (navigator as any).setAppBadge(hoursLeft).catch((e: any) => console.debug("Badge API error", e));
      }
    } else if (timer.status === TimerStatus.FINISHED) {
      document.title = "Day Complete! 🎉";
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge().catch((e: any) => console.debug("Badge API error", e));
      }
    } else {
      document.title = "WorkDay Zen Timer";
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge().catch((e: any) => console.debug("Badge API error", e));
      }
    }
  }, [timeLeft, timer.status]);

  // Screen Wake Lock
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false));
      } catch (err: any) {
        console.warn(`Wake Lock unavailable: ${err.message}`);
        setWakeLockActive(false);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch (err) {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Initial Tip
  useEffect(() => {
    const fetchInitialTip = async () => {
      const totalHours = totalDurationMs / (60 * 60 * 1000);
      const remaining = timeLeft / (60 * 60 * 1000);
      const newTip = await getWorkdayTip(remaining || totalHours);
      setTip(newTip);
    };
    fetchInitialTip();
  }, [totalDurationMs]);

  // Day change check (Midnight Reset)
  useEffect(() => {
    const checkDayChange = () => {
      const lastDate = localStorage.getItem('zen_last_active_day');
      const today = new Date().toDateString();
      
      if (lastDate && lastDate !== today) {
        localStorage.setItem('zen_last_active_day', today);
        reset(); // Resets timer to IDLE
        // If auto-start is on, it will automatically transition to LISTENING via the other effect
      }
    };

    const interval = setInterval(checkDayChange, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const startTimer = useCallback(() => {
    const start = Date.now();
    const end = start + totalDurationMs;
    setTimer({ startTime: start, endTime: end, status: TimerStatus.RUNNING });
    requestWakeLock();
    
    if (notificationsEnabled) {
      new Notification("WorkDay Zen Started", {
        body: `Your session has officially begun.`,
        icon: "https://cdn-icons-png.flaticon.com/512/3563/3563395.png"
      });
    }
  }, [notificationsEnabled, totalDurationMs]);

  // Activity detection
  useEffect(() => {
    if (timer.status === TimerStatus.LISTENING) {
      const handleActivity = () => {
        startTimer();
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('mousedown', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
      };
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('mousedown', handleActivity);
      window.addEventListener('touchstart', handleActivity);
      return () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('mousedown', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
      };
    }
  }, [timer.status, startTimer]);

  // Tick logic
  useEffect(() => {
    let interval: number;
    if (timer.status === TimerStatus.RUNNING && timer.endTime) {
      interval = window.setInterval(() => {
        const now = Date.now();
        const diff = timer.endTime! - now;
        if (diff <= 0) {
          setTimeLeft(0);
          setTimer(prev => ({ ...prev, status: TimerStatus.FINISHED }));
          handleCompletion();
          window.clearInterval(interval);
        } else {
          setTimeLeft(diff);
        }
      }, 1000);
    }
    return () => window.clearInterval(interval);
  }, [timer.status, timer.endTime]);

  const handleCompletion = () => {
    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(e => console.error("Audio playback failed", e));
    }
    if (notificationsEnabled) {
      new Notification("WorkDay Complete!", {
        body: "The closing bell has rung. Time to log off and recharge.",
        icon: "https://cdn-icons-png.flaticon.com/512/3563/3563395.png",
        requireInteraction: true
      });
    }
    releaseWakeLock();
  };

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return {
      h: hours.toString().padStart(2, '0'),
      m: minutes.toString().padStart(2, '0'),
      s: seconds.toString().padStart(2, '0')
    };
  };

  const saveDuration = () => {
    const newMs = (inputHours * 60 * 60 * 1000) + (inputMinutes * 60 * 1000);
    if (newMs > 0) {
      setTotalDurationMs(newMs);
      setShowSettings(false);
      if (timer.status === TimerStatus.RUNNING && timer.startTime) {
        // Adjust existing timer
        setTimer(prev => ({ ...prev, endTime: timer.startTime! + newMs }));
      }
    }
  };

  const reset = () => {
    setTimer({ startTime: null, endTime: null, status: TimerStatus.IDLE });
    setTimeLeft(0);
    releaseWakeLock();
  };

  const progress = timer.endTime ? Math.max(0, Math.min(100, (1 - timeLeft / totalDurationMs) * 100)) : 0;
  const time = formatTime(timeLeft);

  const handleMinimize = () => {
    (window as any).electron?.minimize();
  };

  const handleClose = () => {
    (window as any).electron?.close();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 pt-16 bg-[#0a0a0a] text-zinc-100 selection:bg-indigo-500/30">
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />

      {/* Window Controls */}
      <div className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-[60] select-none cursor-default" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-zinc-800"></div>
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">WorkDay Zen</span>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button 
            onClick={handleMinimize}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
          </button>
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
            title="Close to Tray"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Persistent Settings Bar */}
      <div className="fixed top-16 right-6 flex items-center gap-3 z-50">
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-full bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 transition-all text-zinc-400 hover:text-white"
          title="Session Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <button 
          onClick={requestNotificationPermission}
          className={`p-2.5 rounded-full border transition-all ${notificationsEnabled ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white'}`}
          title={notificationsEnabled ? "Notifications Active" : "Enable Desktop Notifications"}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        </button>
        <button 
          onClick={() => setShowGuide(true)}
          className="p-2.5 rounded-full bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 transition-all text-zinc-400 hover:text-white"
          title="Startup Guide"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
        <button 
          onClick={() => setAutoStartEnabled(!autoStartEnabled)}
          className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${autoStartEnabled ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'}`}
        >
          <div className={`w-2 h-2 rounded-full ${autoStartEnabled ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-700'}`}></div>
          {autoStartEnabled ? 'Auto-Start: ON' : 'Auto-Start: OFF'}
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass max-w-sm w-full rounded-3xl p-8 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Session Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white">&times;</button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Workday Duration</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input 
                      type="number" 
                      min="0" 
                      max="24"
                      value={inputHours} 
                      placeholder="00"
                      onChange={(e) => setInputHours(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-center text-xl font-mono focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
                    />
                    <span className="block text-center text-[10px] text-zinc-600 mt-1 uppercase font-bold">Hours</span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-700">:</div>
                  <div className="flex-1">
                    <input 
                      type="number" 
                      min="0" 
                      max="59"
                      value={inputMinutes} 
                      placeholder="00"
                      onChange={(e) => setInputMinutes(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-center text-xl font-mono focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
                    />
                    <span className="block text-center text-[10px] text-zinc-600 mt-1 uppercase font-bold">Minutes</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-zinc-900 text-zinc-400 font-bold rounded-xl hover:bg-zinc-800 transition-all border border-zinc-800"
              >
                Cancel
              </button>
              <button 
                onClick={saveDuration}
                className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass max-w-lg w-full rounded-3xl p-8 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Native System Integration</h3>
              <button onClick={() => setShowGuide(false)} className="text-zinc-400 hover:text-white">&times;</button>
            </div>
            <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
              <section>
                <h4 className="text-zinc-100 font-semibold mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px]">1</span>
                  Notification Area & Taskbar
                </h4>
                <p>When running, the <strong>remaining time</strong> appears in the browser tab title and as a <strong>numeric badge</strong> on the application icon in your taskbar or dock.</p>
              </section>
              <section>
                <h4 className="text-zinc-100 font-semibold mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px]">2</span>
                  Startup on Login
                </h4>
                <p><strong>Windows:</strong> Press <kbd className="bg-zinc-800 px-1 rounded text-zinc-200">Win+R</kbd>, type <code className="text-indigo-400">shell:startup</code>, and add the app shortcut.</p>
                <p className="mt-2"><strong>macOS:</strong> Add the installed app to <strong>System Settings &gt; General &gt; Login Items</strong>.</p>
              </section>
              <section>
                <h4 className="text-zinc-100 font-semibold mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center text-[10px]">3</span>
                  PWA Installation
                </h4>
                <p>Use the <strong>Install</strong> button in your address bar to run Zen Timer as a native desktop application with full system integration support.</p>
              </section>
            </div>
            <button 
              onClick={() => setShowGuide(false)}
              className="mt-8 w-full py-3 bg-zinc-100 text-black font-bold rounded-xl hover:bg-white transition-all"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl relative">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-600/10 blur-[100px] rounded-full pointer-events-none"></div>

        <header className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            WorkDay Zen
          </h1>
          <p className="text-zinc-400 text-sm font-medium uppercase tracking-widest">
            {timer.status === TimerStatus.RUNNING ? 'Focus Mode Active' : 'Waiting for Activity'}
          </p>
        </header>

        <main className="bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-xl rounded-3xl p-10 md:p-16 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800/50">
            <div 
              className="h-full bg-indigo-500 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(99,102,241,0.6)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {(timer.status === TimerStatus.IDLE || timer.status === TimerStatus.LISTENING) && (
            <div className="mb-8 max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-500">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-3 text-left">What are you focusing on?</label>
              <input 
                type="text"
                value={focusTask}
                onChange={(e) => setFocusTask(e.target.value)}
                placeholder="e.g. Refactoring the API, Writing documentation..."
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl py-4 px-6 text-zinc-200 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-zinc-700 shadow-inner"
              />
            </div>
          )}

          {timer.status === TimerStatus.IDLE && (
            <div className="py-6 animate-in fade-in zoom-in duration-500">
              <h2 className="text-2xl font-semibold mb-2">Ready to start?</h2>
              <p className="text-indigo-400 font-mono mb-8 uppercase tracking-widest text-xs">Session: {formatTime(totalDurationMs).h}h {formatTime(totalDurationMs).m}m</p>
              <button 
                onClick={() => setTimer(prev => ({...prev, status: TimerStatus.LISTENING}))}
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-600/20"
              >
                Listen for Activity
              </button>
              <p className="mt-6 text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
                The countdown begins the moment you interact with your computer.
              </p>
            </div>
          )}

          {timer.status === TimerStatus.LISTENING && (
            <div className="py-6 flex flex-col items-center">
              <div className="relative mb-8">
                <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 bg-indigo-500 rounded-full animate-pulse"></div>
                </div>
              </div>
              <h2 className="text-2xl font-semibold mb-2 tracking-tight italic">Waiting...</h2>
              <p className="text-zinc-400">Clock starts on your first move.</p>
              <button onClick={reset} className="mt-8 text-zinc-400 hover:text-white transition-colors text-sm underline underline-offset-4">
                Cancel
              </button>
            </div>
          )}

          {timer.status === TimerStatus.RUNNING && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {focusTask && (
                <div className="mb-8">
                  <span className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-[0.2em] block mb-2">Current Focus</span>
                  <h3 className="text-xl font-medium text-zinc-200">{focusTask}</h3>
                </div>
              )}
              <div className="flex justify-center items-baseline gap-2 font-mono text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tighter text-white">
                <span className="tabular-nums">{time.h}</span>
                <span className="text-zinc-800 animate-pulse">:</span>
                <span className="tabular-nums">{time.m}</span>
                <span className="text-zinc-800 animate-pulse text-5xl md:text-6xl">:</span>
                <span className="text-indigo-400 text-5xl md:text-6xl tabular-nums">{time.s}</span>
              </div>
              
              <div className="mt-12 flex justify-center gap-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3 rounded-xl border transition-all ${isMuted ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-800/50 border-zinc-700 text-indigo-400'}`}
                >
                  {isMuted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
                <button 
                  onClick={reset}
                  className="px-6 py-3 bg-zinc-800 hover:bg-red-900/20 hover:text-red-400 rounded-xl transition-all font-semibold border border-zinc-700"
                >
                  Reset Session
                </button>
              </div>
            </div>
          )}

          {timer.status === TimerStatus.FINISHED && (
            <div className="py-12 animate-in bounce-in duration-700">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/10">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-4xl font-bold mb-4 tracking-tight">Time to Log Off</h2>
              <p className="text-zinc-400 mb-8 max-w-sm mx-auto leading-relaxed">
                Your session is complete. The system has notified your notification center.
              </p>
              <button 
                onClick={reset}
                className="px-8 py-4 bg-zinc-100 text-black rounded-2xl font-bold transition-all hover:scale-105"
              >
                Reset for Tomorrow
              </button>
            </div>
          )}
        </main>

        {tip && (timer.status === TimerStatus.RUNNING || timer.status === TimerStatus.IDLE || timer.status === TimerStatus.LISTENING) && (
          <div className="mt-8 p-6 glass rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top-4 delay-500 shadow-lg">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h4 className="font-bold text-zinc-100 text-sm mb-1">{tip.title}</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">{tip.advice}</p>
            </div>
          </div>
        )}

        <footer className="mt-12 text-center text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${wakeLockActive ? 'bg-indigo-400 shadow-[0_0_5px_rgba(129,140,248,0.5)]' : 'bg-zinc-800'}`}></div>
            <span>Wake Lock</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${notificationsEnabled ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-zinc-800'}`}></div>
            <span>OS Alerts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_5px_rgba(129,140,248,0.5)]`}></div>
            <span>App Badge API</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
