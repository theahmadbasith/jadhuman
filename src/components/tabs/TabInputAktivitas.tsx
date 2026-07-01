import React, { useState, useEffect } from 'react';
import { Activity, Plus, Save, Clock, CheckCircle, XCircle, Search, X, ChevronDown, Camera, Trash2, Play, FileText, Edit3 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { sendRequest } from '../../api';
import DevLogSection from '../DevLogSection';
import RequireLogin from '../ui/RequireLogin';
import { useBackButton } from '../../hooks/useBackButton';
import { getTodayWIB, getTodayWIBWithDaysOffset } from '../../lib/dateFormatter';

export default function TabInputAktivitas() {
  const { pegawai, config, setActiveTab, developerMode } = useAppContext();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devLog, setDevLog] = useState<{ request: any; response: any } | null>(null);

  // Status aktivitas berjalan
  const [ongoingTask, setOngoingTask] = useState<any>(null);

  // Data tupoksi
  const [tupoksiList, setTupoksiList] = useState<any[]>([]);

  // Sub-tab switcher: 'list' (Daftar Tupoksi) or 'form' (Mulai Baru)
  const [activeSubTab, setActiveSubTab] = useState<'form' | 'list'>('list');

  // Photo state (Base64) for ending activity
  const [photo, setPhoto] = useState<string | null>(null);

  // Form state
  const [jenis, setJenis] = useState<'TUPOKSI' | 'NON_TUPOKSI'>('TUPOKSI');
  const [idTupoksi, setIdTupoksi] = useState('');
  const [tugasNonTupoksi, setTugasNonTupoksi] = useState('');
  const [keterangan, setKeterangan] = useState('');

  // Modal State
  const [showTupoksiModal, setShowTupoksiModal] = useState(false);
  const [searchTupoksi, setSearchTupoksi] = useState('');

  // Hook up back button to close Tupoksi modal
  useBackButton(() => {
    setShowTupoksiModal(false);
    return true;
  }, showTupoksiModal);

  useEffect(() => {
    if (!pegawai) return;
    fetchCekAktivitas();
    fetchTupoksi();
  }, [pegawai]);

  const fetchCekAktivitas = async () => {
    try {
      const p = { id_pegawai: config.idPegawai };
      const res = await sendRequest("/Tupoksi/cekaktifitas", p);
      
      let activeTask = null;
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        activeTask = res.data[0];
      } else if (res?.data && typeof res.data === 'object' && Object.keys(res.data).length > 0) {
        activeTask = res.data;
      }
      
      if (activeTask) {
        setOngoingTask(activeTask);
        setDevLog({ request: p, response: { cekaktifitas: res, using: 'data_from_cekaktifitas' } });
      } else if (res?.success === false && res?.message && res.message.toLowerCase().includes("selesaikan aktifitas sebelumnya")) {
        // Find the active activity from the last 7 days
        const today = getTodayWIB();
        const pastWeek = getTodayWIBWithDaysOffset(-7);

        const resAkt = await sendRequest("/Tupoksi/ambilDataAktivitas", {
           id_pegawai: config.idPegawai,
           tgl_mulai: pastWeek,
           tgl_akhir: today
        });
        
        let found = false;
        if (resAkt?.success && resAkt?.data?.length) {
           const active = resAkt.data.find((x: any) => 
             x.status === 'BELUM DIAKHIRI' || 
             x.status === 'Proses' || 
             !x.tgl_selesai || 
             (x.jam_mulai && (!x.jam_akhir || x.jam_akhir === '00:00:00' || x.jam_akhir === ''))
           );
           if (active) {
             setOngoingTask(active);
             found = true;
             setDevLog({ request: p, response: { cekaktifitas: res, fallback_ambilDataAktivitas: resAkt, found_active: active } });
           }
        }
        
        if (!found) {
          setOngoingTask({ isDummy: true, status: 'Proses', tugas: 'Aktivitas Sebelumnya Belum Diakhiri' });
          setDevLog({ request: p, response: { cekaktifitas: res, using: 'dummy' } });
        }
      } else {
        setOngoingTask(null);
        setDevLog({ request: p, response: res });
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchTupoksi = async () => {
    try {
      const p = { id_pegawai: config.idPegawai };
      let res1 = await sendRequest("/Tupoksi/get_data_tupoksi", p);
      let res2 = await sendRequest("/Tupoksi/get_aktifitas", p);
      
      setDevLog({ request: p, response: { get_data_tupoksi: res1, get_aktifitas: res2 } });
      
      let items: any[] = [];
      const sources = [res1, res2];
      
      for (const res of sources) {
        if (Array.isArray(res)) items = [...items, ...res];
        else if (res?.data && Array.isArray(res.data)) items = [...items, ...res.data];
        else if (res?.tugas && Array.isArray(res.tugas)) items = [...items, ...res.tugas];
        else if (res?.tupoksi && Array.isArray(res.tupoksi)) items = [...items, ...res.tupoksi];
        else if (res?.aktifitas && Array.isArray(res.aktifitas)) items = [...items, ...res.aktifitas];
      }

      setTupoksiList(items);
    } catch (err: any) {
      console.error(err);
      setError('Gagal memuat daftar tupoksi: ' + err.message);
    }
  };

  const handleMulaiAktivitas = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      let endpoint = jenis === 'TUPOKSI' ? '/Tupoksi/simpanTupoksi' : '/Tupoksi/simpanNonTupoksi';
      
      const payload: any = {
        id_pegawai: config.idPegawai,
        keterangan: keterangan,
        deskr_tupoksi: keterangan, // Map keterangan to deskr_tupoksi (required by API)
        lokasi: ''
      };

      if (jenis === 'TUPOKSI') {
        if (!idTupoksi) {
          throw new Error('Pilih Tupoksi terlebih dahulu');
        }
        payload.id_tupoksi = idTupoksi;
        payload.id_aktifitas = idTupoksi; // Just in case it uses id_aktifitas
      } else {
        if (!tugasNonTupoksi) {
          throw new Error('Nama tugas tidak boleh kosong');
        }
        payload.tugas = tugasNonTupoksi;
      }

      const res = await sendRequest(endpoint, payload);
      setDevLog({ request: payload, response: res });

      if (res?.success) {
        setSuccess('Aktivitas berhasil dimulai.');
        setKeterangan('');
        setTugasNonTupoksi('');
        setIdTupoksi('');
        fetchCekAktivitas(); // Re-check segera agar card ongoing muncul
        setTimeout(() => fetchCekAktivitas(), 1500); // Fallback re-check
      } else {
        setError(res?.message || 'Gagal memulai aktivitas.');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleAkhiriAktivitas = async () => {
    if (!ongoingTask) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const cleanBase64 = photo ? photo.replace(/^data:image\/[a-z]+;base64,/, '') : '';
      const payload: any = {
        id_pegawai: config.idPegawai,
        lampiran: cleanBase64,
        lokasi: ''
      };
      
      const taskId = ongoingTask.id_log || ongoingTask.id || ongoingTask.id_aktifitas;
      payload.id_aktifitas = taskId;
      payload.id_log = taskId;
      payload.id = taskId;
      
      const res = await sendRequest("/Tupoksi/akhiriAktivitas", payload);
      setDevLog({ request: payload, response: res });

      if (res?.success) {
        setSuccess('Aktivitas berhasil diakhiri.');
        setOngoingTask(null);
        setPhoto(null);
        // Delay re-check agar server sempat memproses perubahan status
        setTimeout(() => fetchCekAktivitas(), 3000);
      } else {
        // Coba endpoint alternatif jika gagal
        const altRes = await sendRequest("/Tupoksi/selesaiAktivitas", payload);
        if (altRes?.success) {
          setSuccess('Aktivitas berhasil diakhiri.');
          setOngoingTask(null);
          setPhoto(null);
          setTimeout(() => fetchCekAktivitas(), 3000);
        } else {
          setError(res?.message || 'Gagal mengakhiri aktivitas.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  if (!pegawai) {
    return <RequireLogin tabName="Input Aktivitas" onGoToLogin={() => setActiveTab('tabLogin')} />;
  }

  const compressPhoto = (dataUrl: string, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const raw = evt.target?.result as string;
        const compressed = await compressPhoto(raw);
        setPhoto(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLanjutkan = (item: any) => {
    const idValue = item.id_tupoksi || item.id_aktifitas || item.id;
    setJenis('TUPOKSI');
    setIdTupoksi(idValue);
    setActiveSubTab('form');
  };

  return (
    <div className="w-full mx-auto bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden flex flex-col p-6 sm:p-8 relative">
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Edit3 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Input Aktivitas</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Catat log tugas harian dan kinerja</p>
        </div>
      </div>

      <div className="relative z-10 space-y-4">
        {error && (
          <div className="p-4 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20 font-medium text-sm rounded-xl flex items-start gap-3 shadow-sm animate-fade-in-up">
            <XCircle className="w-5 h-5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium text-sm rounded-xl flex items-start gap-3 shadow-sm animate-fade-in-up">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span className="leading-relaxed">{success}</span>
          </div>
        )}

      {ongoingTask ? (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 rounded-2xl p-5 sm:p-6 mb-4 space-y-5 relative overflow-hidden">
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-orange-800 dark:text-orange-400 tracking-wide uppercase">Aktivitas Sedang Berjalan</h4>
              <p className="text-xs text-orange-600/80 dark:text-orange-500/80 font-medium">Catat waktu penyelesaian & lampirkan foto</p>
            </div>
          </div>
          
          <div className="bg-white/60 dark:bg-slate-900/40 p-4 rounded-xl border border-orange-100/50 dark:border-orange-900/30 space-y-3 relative z-10 backdrop-blur-sm">
            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-4 items-start">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tugas</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{ongoingTask.tugas || ongoingTask.nama_tugas || ongoingTask.jenis || 'Tugas Aktif'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-4 items-start border-t border-slate-200/50 dark:border-slate-700/50 pt-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Waktu Mulai</span>
              <span className="text-sm font-mono text-slate-800 dark:text-slate-200">{ongoingTask.tgl_mulai || ongoingTask.jam_mulai || '-'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-4 items-start border-t border-slate-200/50 dark:border-slate-700/50 pt-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Keterangan</span>
              <span className="text-sm text-slate-700 dark:text-slate-300 italic">{ongoingTask.keterangan || '-'}</span>
            </div>
          </div>

          {/* Lampiran Foto Widget */}
          <div className="pt-2 relative z-10">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
              Lampiran Foto (Opsional)
            </label>
            {photo ? (
              <div className="relative inline-block group">
                <img 
                  src={photo} 
                  alt="Preview Lampiran" 
                  className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-scale-up"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute -top-3 -right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-[0_4px_10px_rgba(239,68,68,0.3)] transition-all cursor-pointer hover:scale-110 active:scale-95"
                  title="Hapus Foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label 
                className="flex flex-col items-center justify-center gap-3 w-full sm:w-64 h-32 px-4 py-4 bg-white/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-2 border-dashed border-orange-200 dark:border-orange-900/50 hover:border-orange-400 dark:hover:border-orange-700 rounded-xl cursor-pointer transition-all shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-orange-500 transition-colors">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold">Ambil / Unggah Foto</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                  onChange={handlePhotoChange} 
                />
              </label>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-4 relative z-10 pt-4 border-t border-orange-200/50 dark:border-orange-900/30">
            <button
              onClick={handleAkhiriAktivitas}
              disabled={loading}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_4px_12px_rgba(234,88,12,0.2)] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              {loading ? 'Menyimpan...' : 'Akhiri Aktivitas Ini'}
            </button>
            <button
              onClick={() => {
                setOngoingTask(null);
                setSuccess('Status aktivitas di-reset di layar.');
                setTimeout(() => setSuccess(''), 4000);
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold px-6 py-3 rounded-xl transition-colors cursor-pointer text-sm shadow-sm active:scale-95"
              type="button"
              title="Reset tampilan jika status stuck"
            >
              Reset Tampilan
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sub-tab Swapper */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl relative">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 font-bold text-sm rounded-lg transition-all cursor-pointer z-10 ${
                activeSubTab === 'list' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" /> Daftar Tupoksi
            </button>
            <button
              onClick={() => setActiveSubTab('form')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 font-bold text-sm rounded-lg transition-all cursor-pointer z-10 ${
                activeSubTab === 'form' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Plus className="w-4 h-4" /> Mulai Baru
            </button>
          </div>

          {activeSubTab === 'list' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari dalam daftar tupoksi..."
                  value={searchTupoksi}
                  onChange={(e) => setSearchTupoksi(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-200 transition-all"
                />
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs divide-y divide-slate-150 dark:divide-slate-700/50 bg-white dark:bg-slate-900 max-h-[450px] overflow-y-auto custom-scrollbar">
                {tupoksiList.filter(item => {
                  const text = (item.nama_tupoksi || item.tugas || item.nama_tugas || item.aktifitas || item.nama_aktifitas || item.jenis || '').toLowerCase();
                  return text.includes(searchTupoksi.toLowerCase());
                }).map((item, i) => (
                  <div key={i} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-normal">
                        {item.nama_tupoksi || item.tugas || item.nama_tugas || item.aktifitas || item.nama_aktifitas || item.jenis}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLanjutkan(item)}
                      className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-xs font-bold rounded-lg flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" /> Lanjutkan
                    </button>
                  </div>
                ))}

                {tupoksiList.length === 0 && (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3 animate-pulse" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Data tupoksi kosong atau belum dimuat.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleMulaiAktivitas} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jenis Aktivitas
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setJenis('TUPOKSI')}
                    className={`py-2 px-4 rounded-lg font-medium text-sm transition-colors border cursor-pointer ${
                      jenis === 'TUPOKSI' 
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-500 dark:text-emerald-400' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-750'
                    }`}
                  >
                    Tupoksi
                  </button>
                  <button
                    type="button"
                    onClick={() => setJenis('NON_TUPOKSI')}
                    className={`py-2 px-4 rounded-lg font-medium text-sm transition-colors border cursor-pointer ${
                      jenis === 'NON_TUPOKSI' 
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-500 dark:text-emerald-400' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-750'
                    }`}
                  >
                    Non Tupoksi
                  </button>
                </div>
              </div>

              {jenis === 'TUPOKSI' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Pilih Tupoksi
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTupoksiModal(true)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm text-left flex justify-between items-center cursor-pointer"
                  >
                    <span className="truncate pr-2">
                      {idTupoksi 
                        ? (() => {
                            const sel = tupoksiList.find(x => (x.id_tupoksi || x.id_aktifitas || x.id) === idTupoksi);
                            return sel ? (sel.nama_tupoksi || sel.tugas || sel.nama_tugas || sel.aktifitas || sel.nama_aktifitas || sel.jenis) : 'Pilih Tupoksi...';
                          })()
                        : '-- Pilih Tupoksi --'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tugas Non Tupoksi
                  </label>
                  <input
                    type="text"
                    value={tugasNonTupoksi}
                    onChange={(e) => setTugasNonTupoksi(e.target.value)}
                    placeholder="Deskripsi tugas tambahan..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Keterangan / Uraian Kegiatan
                </label>
                <textarea
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Jelaskan detail kegiatan yang dilakukan..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all min-h-[100px] text-sm custom-scrollbar"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors mt-2 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-5 h-5" /> {loading ? 'Menyimpan...' : 'Mulai Aktivitas'}
              </button>
            </form>
          )}
        </div>
      )}

      {developerMode && devLog && (
        <DevLogSection 
          title="Log Data Aktivitas" 
          filename="input_aktivitas_log.txt" 
          request={devLog.request} 
          response={devLog.response} 
        />
      )}

      {/* Modal Pilih Tupoksi */}
      {showTupoksiModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-white dark:bg-slate-800">
              <h4 className="font-bold text-lg text-slate-800 dark:text-white">Pilih Tupoksi</h4>
              <button 
                onClick={() => setShowTupoksiModal(false)} 
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 relative z-10 shadow-[0_4px_10px_-4px_rgba(0,0,0,0.05)] dark:shadow-none">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari tupoksi..."
                  value={searchTupoksi}
                  onChange={(e) => setSearchTupoksi(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-200 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800 flex-1">
              <div className="flex flex-col">
                {tupoksiList.filter(item => {
                  const text = (item.nama_tupoksi || item.tugas || item.nama_tugas || item.aktifitas || item.nama_aktifitas || item.jenis || '').toLowerCase();
                  return text.includes(searchTupoksi.toLowerCase());
                }).map((item, i) => {
                  const idValue = item.id_tupoksi || item.id_aktifitas || item.id;
                  const isSelected = idValue === idTupoksi;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setIdTupoksi(idValue);
                        setShowTupoksiModal(false);
                        setSearchTupoksi('');
                      }}
                      className={`w-full text-left px-5 py-4 transition-colors flex items-start gap-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 group cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 dark:bg-emerald-900/20' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors ${
                        isSelected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-emerald-400'
                      }`} />
                      <p className={`text-sm leading-relaxed ${
                        isSelected ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                      }`}>
                        {item.nama_tupoksi || item.tugas || item.nama_tugas || item.aktifitas || item.nama_aktifitas || item.jenis}
                      </p>
                    </button>
                  );
                })}
                {tupoksiList.length === 0 && (
                  <div className="p-10 text-center flex flex-col items-center justify-center">
                    <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">Data tupoksi tidak ditemukan.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
