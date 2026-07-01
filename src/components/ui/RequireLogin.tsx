import { Lock, LogIn } from 'lucide-react';

interface RequireLoginProps {
  tabName: string;
  onGoToLogin: () => void;
}

export default function RequireLogin({ tabName, onGoToLogin }: RequireLoginProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-xl mx-auto my-8 animate-fade-in">
      <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400">
        <Lock className="w-8 h-8" />
      </div>
      
      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
        Akses Terbatas
      </h3>
      
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        Menu <span className="font-semibold text-blue-600 dark:text-blue-400">{tabName}</span> memerlukan autentikasi. Silakan login terlebih dahulu menggunakan akun pegawai Anda untuk melihat dan mengelola data Anda.
      </p>
      
      <button
        onClick={onGoToLogin}
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
      >
        <LogIn className="w-4 h-4" />
        Ke Menu Login Info
      </button>
    </div>
  );
}
