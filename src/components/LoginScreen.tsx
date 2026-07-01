import React, { useState, useEffect, useReducer } from 'react';
import { 
  Lock, LogIn, AlertCircle, 
  Eye, EyeOff, Clock, Key, CheckCircle2, XCircle,
  Sun, Moon
} from 'lucide-react';
import { verifyPinLayered, decryptAppCredential } from '../lib/encryption';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface LoginScreenProps {
  onLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

type AuthStatus = 'IDLE' | 'AUTHENTICATING' | 'LOCKED' | 'SUCCESS';

interface AuthState {
  status: AuthStatus;
  pin: string;
  attempts: number;
  cooldownUntil: number | null;
  errorMessage: string | null;
}

type AuthAction = 
  | { type: 'SET_PIN'; payload: string }
  | { type: 'START_AUTH' }
  | { type: 'AUTH_SUCCESS' }
  | { type: 'AUTH_FAILED'; payload: { attempts: number; cooldownUntil?: number; errorMsg: string } }
  | { type: 'UPDATE_COOLDOWN'; payload: number | null };

const MAX_ATTEMPTS = 5;
const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5 Menit
const MAX_PIN_LENGTH = 16;
const DEFAULT_HASH = '$2b$10$cIzcrUeaJ3t34nbndUBWquTpqEizIb.A.4WmdfZTxhaT2bhIXYOE2';

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_PIN':
      return { ...state, pin: action.payload.substring(0, MAX_PIN_LENGTH) };
    case 'START_AUTH':
      return { ...state, status: 'AUTHENTICATING', errorMessage: null };
    case 'AUTH_SUCCESS':
      return { ...state, status: 'SUCCESS', pin: '', errorMessage: null };
    case 'AUTH_FAILED':
      return { 
        ...state, 
        status: action.payload.cooldownUntil ? 'LOCKED' : 'IDLE',
        attempts: action.payload.attempts,
        cooldownUntil: action.payload.cooldownUntil || state.cooldownUntil,
        errorMessage: action.payload.errorMsg,
        pin: ''
      };
    case 'UPDATE_COOLDOWN':
      return { 
        ...state, 
        cooldownUntil: action.payload,
        status: action.payload && action.payload > Date.now() ? 'LOCKED' : 'IDLE'
      };
    default:
      return state;
  }
}

export default function LoginScreen({ onLogin, isDarkMode, toggleDarkMode }: LoginScreenProps) {
  const [state, dispatch] = useReducer(authReducer, {
    status: 'IDLE',
    pin: '',
    attempts: 0,
    cooldownUntil: null,
    errorMessage: null,
  });

  const [showPin, setShowPin] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Load initial lock stats to prevent bypass by refreshing
  useEffect(() => {
    const savedAttempts = parseInt(localStorage.getItem('jadhuman_login_attempts') || '0', 10);
    const savedCooldown = parseInt(localStorage.getItem('jadhuman_cooldown_until') || '0', 10);
    
    if (savedCooldown && savedCooldown > Date.now()) {
      dispatch({ 
        type: 'AUTH_FAILED', 
        payload: { 
          attempts: savedAttempts, 
          cooldownUntil: savedCooldown, 
          errorMsg: 'Sistem terkunci sementara akibat batas percobaan terlampaui.' 
        } 
      });
    } else if (savedAttempts > 0) {
      localStorage.setItem('jadhuman_login_attempts', '0');
      localStorage.removeItem('jadhuman_cooldown_until');
    }
  }, []);

  // Cooldown timer countdown engine
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.cooldownUntil && state.cooldownUntil > Date.now()) {
      interval = setInterval(() => {
        const remaining = Math.ceil((state.cooldownUntil! - Date.now()) / 1000);
        if (remaining <= 0) {
          setTimeLeft(0);
          dispatch({ type: 'UPDATE_COOLDOWN', payload: null });
          localStorage.removeItem('jadhuman_cooldown_until');
          localStorage.setItem('jadhuman_login_attempts', '0');
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state.cooldownUntil]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sanitizeInput = (val: string): string => {
    if (!val) return '';
    return val.replace(/['"`;\\()=<>]/g, '').trim().substring(0, MAX_PIN_LENGTH);
  };

  const handleAuthentication = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (state.status === 'LOCKED' || state.cooldownUntil) {
      dispatch({ 
        type: 'AUTH_FAILED', 
        payload: { 
          attempts: state.attempts, 
          errorMsg: `Akses ditolak. Tunggu ${formatTime(timeLeft)}.` 
        }
      });
      return;
    }

    const sanitizedPin = sanitizeInput(state.pin);
    if (!sanitizedPin) {
      dispatch({ 
        type: 'AUTH_FAILED', 
        payload: { 
          attempts: state.attempts, 
          errorMsg: 'Kata sandi tidak boleh kosong.' 
        }
      });
      return;
    }

    dispatch({ type: 'START_AUTH' });

    try {
      const authRef = doc(db, 'settings', 'auth');
      const authSnap = await getDoc(authRef);
      
      let isAuthenticatedPin = false;
      if (authSnap.exists()) {
        const data = authSnap.data();
        if (data.pinEncrypted) {
          try {
            const decryptedPin = decryptAppCredential(data.pinEncrypted);
            if (decryptedPin && decryptedPin === sanitizedPin) {
              isAuthenticatedPin = true;
            }
          } catch (e) {
            console.error("Gagal mendekripsi pin dari Firebase:", e);
          }
        }
        
        // Fallback to pinHash check if not authenticated via pinEncrypted
        if (!isAuthenticatedPin && data.pinHash) {
          if (verifyPinLayered(sanitizedPin, data.pinHash)) {
            isAuthenticatedPin = true;
          }
        }
      } else {
        // Fallback to default hash
        if (verifyPinLayered(sanitizedPin, DEFAULT_HASH)) {
          isAuthenticatedPin = true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 800));

      if (isAuthenticatedPin) {
        localStorage.setItem('jadhuman_login_attempts', '0');
        localStorage.removeItem('jadhuman_cooldown_until');
        dispatch({ type: 'AUTH_SUCCESS' });
        
        setTimeout(() => {
          onLogin();
        }, 1000);
      } else {
        throw new Error('Sandi salah');
      }

    } catch (err) {
      const nextAttempts = state.attempts + 1;
      localStorage.setItem('jadhuman_login_attempts', nextAttempts.toString());
      
      if (nextAttempts >= MAX_ATTEMPTS) {
        const lockUntil = Date.now() + COOLDOWN_DURATION_MS;
        localStorage.setItem('jadhuman_cooldown_until', lockUntil.toString());
        dispatch({ 
          type: 'AUTH_FAILED', 
          payload: { 
            attempts: nextAttempts, 
            cooldownUntil: lockUntil, 
            errorMsg: `Percobaan gagal terlampaui. Sistem dikunci selama 5 menit.` 
          }
        });
      } else {
        dispatch({ 
          type: 'AUTH_FAILED', 
          payload: { 
            attempts: nextAttempts, 
            errorMsg: `Sandi salah. Tersisa ${MAX_ATTEMPTS - nextAttempts} kali percobaan.` 
          }
        });
      }
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-center items-center p-6 transition-colors duration-700 font-sans overflow-hidden bg-slate-100 dark:bg-slate-950">
      
      {/* Floating Theme Toggle Button */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={toggleDarkMode}
          className="p-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
          title="Ubah Tema"
        >
          {isDarkMode ? <Sun className="w-5 h-5 text-amber-500 animate-pulse" /> : <Moon className="w-5 h-5 text-slate-600" />}
        </button>
      </div>
      
      {/* Ambient Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/10 dark:bg-blue-600/10 blur-[120px] animate-pulse" 
          style={{ animationDuration: '8s' }} 
        />
        <div 
          className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-[120px] animate-pulse" 
          style={{ animationDuration: '10s' }} 
        />
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Main Container */}
      <div className="w-full max-w-[26rem] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-100 dark:border-slate-800 transition-all duration-300 z-10 relative flex flex-col overflow-hidden">
        
        {/* ================= HEADER BRANDING ================= */}
        <div className="px-8 pt-12 pb-8 text-center relative">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-indigo-50 dark:from-slate-700 dark:to-slate-600 rounded-full transform rotate-3 scale-105 opacity-50 transition-transform duration-500 group-hover:rotate-6"></div>
            <div className="relative w-full h-full bg-white rounded-full shadow-xl flex items-center justify-center border border-slate-100 dark:border-slate-700/50 p-4">
              <img src="/assets/jadhuman.png" alt="Jadhuman Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 tracking-tight">
            JADHUMAN
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="h-px w-6 bg-slate-200 dark:bg-slate-700"></span>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-[0.25em]">
              Sistem Presensi
            </p>
            <span className="h-px w-6 bg-slate-200 dark:bg-slate-700"></span>
          </div>
        </div>

        {/* ================= AREA FORM ================= */}
        <div className="px-8 pb-12 relative">
          
          {/* Overlay Sukses */}
          {state.status === 'SUCCESS' && (
            <div 
              className="absolute inset-0 z-20 bg-white dark:bg-slate-900 flex flex-col justify-center items-center rounded-b-[2.5rem]" 
              style={{ animation: 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
            >
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Akses Diberikan</h2>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin"></div>
                <p className="text-sm font-medium">Mengalihkan ke dasbor...</p>
              </div>
            </div>
          )}

          <form onSubmit={handleAuthentication} className="space-y-6">
            
            {/* Box Notifikasi / Peringatan Sistem */}
            {state.errorMessage && (
              <div 
                className={`flex items-start gap-3 p-4 rounded-2xl text-sm font-medium shadow-sm border-l-4 ${
                  state.status === 'LOCKED' 
                    ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500 dark:text-rose-400' 
                    : 'bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500 dark:text-amber-400'
                }`} 
                style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
              >
                {state.status === 'LOCKED' ? (
                  <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{state.errorMessage}</span>
              </div>
            )}

            {/* Input Kredensial */}
            <div className="space-y-3">
              <div className="flex justify-between items-end px-1">
                <label htmlFor="pin-input" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  Kata Sandi Sistem
                </label>
                
                {/* Visualisasi sisa waktu jika terkunci */}
                {state.status === 'LOCKED' && (
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 bg-rose-100 dark:bg-rose-500/20 px-2 py-0.5 rounded-full animate-pulse">
                    <Clock className="w-3.5 h-3.5" /> {formatTime(timeLeft)}
                  </span>
                )}
              </div>
              
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-300 ${state.pin ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'}`}>
                  <Lock className="h-5 w-5" />
                </div>
                
                <input
                  id="pin-input"
                  type={showPin ? "text" : "password"}
                  value={state.pin}
                  disabled={state.status === 'LOCKED' || state.status === 'AUTHENTICATING'}
                  onChange={(e) => dispatch({ type: 'SET_PIN', payload: e.target.value })}
                  className={`block w-full pl-12 pr-12 py-4 rounded-2xl font-mono text-lg tracking-[0.3em] font-medium transition-all duration-300 ${
                    state.status === 'LOCKED' 
                      ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-400 cursor-not-allowed' 
                      : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300 dark:hover:border-slate-700'
                  } border`}
                  placeholder={state.status === 'LOCKED' ? "TERKUNCI" : "••••••••"}
                  autoComplete="off"
                />
                
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    disabled={state.status === 'LOCKED' || state.status === 'AUTHENTICATING'}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Tombol Aksi Utama */}
            <button
              type="submit"
              disabled={state.status === 'AUTHENTICATING' || state.status === 'LOCKED' || state.pin.length === 0}
              className={`w-full relative overflow-hidden group flex justify-center items-center gap-2 py-4 px-6 rounded-2xl text-base font-bold text-white transition-all duration-300 disabled:cursor-not-allowed ${
                state.status === 'AUTHENTICATING'
                  ? 'bg-blue-600'
                  : state.status === 'LOCKED'
                    ? 'bg-slate-800 dark:bg-slate-800 text-slate-400'
                    : state.pin.length === 0
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
              }`}
            >
              {state.status === 'AUTHENTICATING' ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Memverifikasi...</span>
                </>
              ) : state.status === 'LOCKED' ? (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Akses Tertutup</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Sistem</span>
                  <LogIn className={`w-5 h-5 transition-transform duration-300 ${state.pin.length > 0 ? 'group-hover:translate-x-1' : ''}`} />
                </>
              )}
            </button>
          </form>
          
        </div>
      </div>
    </div>
  );
}