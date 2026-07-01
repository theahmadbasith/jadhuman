import React, { createContext, useContext, useState, ReactNode } from 'react';
import { encryptAppCredential, decryptAppCredential } from '../lib/encryption';

interface PegawaiData {
  id?: string;
  nama?: string;
  nip?: string;
  nama_jabatan?: string;
  kelas_jabatan?: string;
  nama_instansi?: string;
  nama_lokasi?: string;
  foto?: string;
  password?: string;
  kode_unor?: string;
  alamat_kantor?: string;
  alamat?: string;
  unor?: string;
  nama_unit_kerja?: string;
}

interface KredensialConfig {
  idPegawai: string;
  deviceId: string;
  latitude: string;
  longitude: string;
  idLokasi: string;
  kodeInstansi: string;
  kodeUnor: string;
  workMode: string;
  versi: string;
}

interface AppContextType {
  pegawai: PegawaiData | null;
  setPegawai: (data: PegawaiData | null) => void;
  config: KredensialConfig;
  setConfig: React.Dispatch<React.SetStateAction<KredensialConfig>>;
  loginForm: { username: string, password: string };
  setLoginForm: React.Dispatch<React.SetStateAction<{ username: string, password: string }>>;
  developerMode: boolean;
  setDeveloperMode: (val: boolean) => void;
  datePickerStyle: 'modern' | 'klasik';
  setDatePickerStyle: (val: 'modern' | 'klasik') => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [pegawai, setPegawaiState] = useState<PegawaiData | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jadhuman_pegawai');
      if (saved) {
        try {
          const decrypted = decryptAppCredential(saved);
          return decrypted ? JSON.parse(decrypted) : JSON.parse(saved);
        } catch (e) {
          try {
            return JSON.parse(saved);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  });

  const setPegawai = (data: PegawaiData | null) => {
    setPegawaiState(data);
    if (typeof window !== 'undefined') {
      if (data) {
        localStorage.setItem('jadhuman_pegawai', encryptAppCredential(JSON.stringify(data)));
      } else {
        localStorage.removeItem('jadhuman_pegawai');
      }
    }
  };
  
  const [loginForm, setLoginFormState] = useState(() => {
    const defaultForm = { username: '', password: '' };
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jadhuman_login_form');
      if (saved) {
        try {
          const decrypted = decryptAppCredential(saved);
          return decrypted ? JSON.parse(decrypted) : JSON.parse(saved);
        } catch (e) {
          try {
            return JSON.parse(saved);
          } catch {
            return defaultForm;
          }
        }
      }
    }
    return defaultForm;
  });

  const setLoginForm: React.Dispatch<React.SetStateAction<{ username: string, password: string }>> = (value) => {
    setLoginFormState((prev: any) => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      if (typeof window !== 'undefined') {
        localStorage.setItem('jadhuman_login_form', encryptAppCredential(JSON.stringify(next)));
      }
      return next;
    });
  };
  
  const PATH_MAP: Record<string, string> = {
    'tabLogin': '/login-info',
    'tabAbsen': '/submit-presensi',
    'tabLog': '/log-presensi',
    'tabInputAktivitas': '/input-aktivitas',
    'tabAktivitas': '/cek-aktivitas',
    'tabIzin': '/cek-izin',
    'tabReview': '/review',
    'tabDatabase': '/database'
  };

  const getTabFromPath = (path: string): string => {
    for (const [tabId, p] of Object.entries(PATH_MAP)) {
      if (path === p) return tabId;
    }
    return 'tabLogin';
  };

  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getTabFromPath(window.location.pathname);
    }
    return 'tabLogin';
  });

  const setActiveTab = (tabId: string) => {
    setActiveTabState(tabId);
    if (typeof window !== 'undefined') {
      const path = PATH_MAP[tabId] || '/login-info';
      if (window.location.pathname !== path) {
        window.history.pushState(null, '', path);
      }
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleLocationChange = () => {
      const tabId = getTabFromPath(window.location.pathname);
      setActiveTabState(tabId);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);
  
  const [developerMode, setDeveloperModeState] = useState<boolean>(() => {
    return localStorage.getItem('developerMode') === 'true';
  });

  const setDeveloperMode = (val: boolean) => {
    setDeveloperModeState(val);
    localStorage.setItem('developerMode', val ? 'true' : 'false');
  };

  const [datePickerStyle, setDatePickerStyleState] = useState<'modern' | 'klasik'>(() => {
    const saved = localStorage.getItem('datePickerStyle');
    return (saved === 'klasik' || saved === 'modern') ? saved : 'modern';
  });

  const setDatePickerStyle = (val: 'modern' | 'klasik') => {
    setDatePickerStyleState(val);
    localStorage.setItem('datePickerStyle', val);
  };
  
  const [config, setConfigState] = useState<KredensialConfig>(() => {
    const defaultConfig = {
      idPegawai: '',
      deviceId: '',
      latitude: '',
      longitude: '',
      idLokasi: '',
      kodeInstansi: '',
      kodeUnor: '',
      workMode: '1',
      versi: '2.0.0'
    };
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jadhuman_config');
      if (saved) {
        try {
          const decrypted = decryptAppCredential(saved);
          return decrypted ? JSON.parse(decrypted) : JSON.parse(saved);
        } catch (e) {
          try {
            return JSON.parse(saved);
          } catch {
            return defaultConfig;
          }
        }
      }
    }
    return defaultConfig;
  });

  const setConfig: React.Dispatch<React.SetStateAction<KredensialConfig>> = (value) => {
    setConfigState((prev: any) => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      if (typeof window !== 'undefined') {
        localStorage.setItem('jadhuman_config', encryptAppCredential(JSON.stringify(next)));
      }
      return next;
    });
  };

  return (
    <AppContext.Provider value={{ pegawai, setPegawai, config, setConfig, loginForm, setLoginForm, developerMode, setDeveloperMode, datePickerStyle, setDatePickerStyle, activeTab, setActiveTab }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
