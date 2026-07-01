import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Lock, Save, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { hashPinLayered, verifyPinLayered, encryptAppCredential, decryptAppCredential } from '../lib/encryption';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAppContext } from '../context/AppContext';
import { useBackButton } from '../hooks/useBackButton';

interface PinChangeModalProps {
  onClose: () => void;
}

export default function PinChangeModal({ onClose }: PinChangeModalProps) {
  const { developerMode, setDeveloperMode, datePickerStyle, setDatePickerStyle } = useAppContext();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  // Close/collapse password section if it is open on back press
  useBackButton(() => {
    setIsPasswordOpen(false);
    return true;
  }, isPasswordOpen);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showOldPin, setShowOldPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!oldPin || !newPin || !confirmPin) {
      setError('Semua kolom harus diisi.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('Password baru dan konfirmasi password tidak cocok.');
      return;
    }

    if (newPin.length < 3) {
      setError('Password baru harus minimal 3 karakter.');
      return;
    }

    setIsLoading(true);

    try {
      const authRef = doc(db, 'settings', 'auth');
      const authSnap = await getDoc(authRef);
      let isOldPinValid = false;
      if (authSnap.exists()) {
        const data = authSnap.data();
        if (data.pinEncrypted) {
          try {
            const decryptedPin = decryptAppCredential(data.pinEncrypted);
            if (decryptedPin && decryptedPin === oldPin) {
              isOldPinValid = true;
            }
          } catch (e) {
            console.error("Gagal mendekripsi pin lama:", e);
          }
        }
        if (!isOldPinValid && data.pinHash) {
          if (verifyPinLayered(oldPin, data.pinHash)) {
            isOldPinValid = true;
          }
        }
      } else {
        // Fallback to default hash
        if (verifyPinLayered(oldPin, '$2b$10$cIzcrUeaJ3t34nbndUBWquTpqEizIb.A.4WmdfZTxhaT2bhIXYOE2')) {
          isOldPinValid = true;
        }
      }

      if (!isOldPinValid) {
        setError('Password lama tidak valid.');
        setIsLoading(false);
        return;
      }

      const newHash = hashPinLayered(newPin);
      const encryptedPin = encryptAppCredential(newPin);
      await setDoc(authRef, { 
        pinHash: newHash,
        pinEncrypted: encryptedPin
      }, { merge: true });
      
      setSuccess('Password berhasil diperbarui!');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan sistem saat memperbarui password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-500" />
            Pengaturan Jadhuman
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Section 1: Mode Developer on Top */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                ⚙️ Mode Developer
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal mt-0.5">Aktifkan request & respon JSON</span>
            </div>
            <button
              type="button"
              onClick={() => setDeveloperMode(!developerMode)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                developerMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                  developerMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Section 1b: Gaya Kalender Selector */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60 rounded-2xl flex flex-col gap-3 shadow-sm">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                📅 Gaya Pemilih Tanggal
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal mt-0.5">Pilih tampilan kalender di aplikasi</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setDatePickerStyle('modern')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                  datePickerStyle === 'modern'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Kalender Modern
              </button>
              <button
                type="button"
                onClick={() => setDatePickerStyle('klasik')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                  datePickerStyle === 'klasik'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Klasik Dropdown
              </button>
            </div>
          </div>

          {/* Section 2: Collapsible Password Form */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
            <button
              type="button"
              onClick={() => setIsPasswordOpen(!isPasswordOpen)}
              className="w-full flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-slate-900/10 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors text-left text-slate-700 dark:text-slate-300"
            >
              <div className="flex items-center gap-2.5">
                <Lock className="w-4.5 h-4.5 text-blue-500" />
                <span className="text-sm font-bold">Ganti Password Lockscreen</span>
              </div>
              {isPasswordOpen ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {isPasswordOpen && (
              <form onSubmit={handleSubmit} className="p-5 border-t border-slate-100 dark:border-slate-700/60 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Password Lama</label>
                  <div className="relative">
                    <input
                      type={showOldPin ? "text" : "password"}
                      value={oldPin}
                      onChange={(e) => setOldPin(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Masukkan Password Lama"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPin(!showOldPin)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showOldPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Password Baru</label>
                  <div className="relative">
                    <input
                      type={showNewPin ? "text" : "password"}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Minimal 3 karakter"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showNewPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <input
                      type={showConfirmPin ? "text" : "password"}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Ulangi Password Baru"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPin(!showConfirmPin)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showConfirmPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg text-xs font-semibold">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{success}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Save className="w-4 h-4" /> Simpan Password Baru
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Bottom Close Button */}
          <div className="pt-1 flex">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-bold transition-colors text-center"
            >
              Tutup
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CheckCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
