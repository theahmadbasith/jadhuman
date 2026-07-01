import React, { useState } from 'react';
import { Activity, Search, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { sendRequest } from '../../api';
import DatePicker from '../ui/DatePicker';
import DevLogSection from '../DevLogSection';
import { formatBeautifulDateTime, getTodayWIB, getTodayWIBWithOffset } from '../../lib/dateFormatter';
import ImageLightbox from '../ui/ImageLightbox';
import RequireLogin from '../ui/RequireLogin';
import { useBackButton } from '../../hooks/useBackButton';
import LazyImage from '../ui/LazyImage';

export default function TabAktivitas() {
  const { pegawai, config, setActiveTab, developerMode } = useAppContext();
  
  const [tglAwal, setTglAwal] = useState(getTodayWIBWithOffset(-1));
  const [tglAkhir, setTglAkhir] = useState(getTodayWIB());
  
  const [loading, setLoading] = useState(false);
  const [dataJam, setDataJam] = useState<any>(null);
  const [dataAkt, setDataAkt] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [modalImg, setModalImg] = useState<{ src: string; title: string; images?: { src: string; title: string }[]; currentIndex?: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const [aktivitasLog, setAktivitasLog] = useState<{ request: any; response: any } | null>(null);

  // Pre-calculate all images in dataAkt
  const allImages = React.useMemo(() => {
    if (!dataAkt) return [];
    return dataAkt.slice(0, visibleCount).map((item) => {
      let lamp = item.lampiran || item.foto || item.file_lampiran;
      let hasImage = false;
      let imgUrl = '';
      
      if (lamp && lamp !== 'no_image.png' && !lamp.includes('no_image')) {
        hasImage = true;
        if (lamp.startsWith('/9j/') || lamp.startsWith('iVBOR')) {
          imgUrl = `data:image/jpeg;base64,${lamp}`;
        } else if (lamp.startsWith('http')) {
          imgUrl = lamp;
        } else {
          imgUrl = `/api/proxy-image?path=${encodeURIComponent(lamp)}`;
        }
      }

      if (!hasImage) return null;

      return {
        src: imgUrl,
        title: item.tugas || 'Foto Aktivitas'
      };
    }).filter((img): img is { src: string; title: string } => img !== null);
  }, [dataAkt, visibleCount]);

  // Hook up back button to close lightbox
  useBackButton(() => {
    setModalImg(null);
    return true;
  }, !!modalImg);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      if (dataAkt && visibleCount < dataAkt.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  const fetchAktivitas = async () => {
    setLoading(true);
    setError('');
    setDataJam(null);
    setDataAkt(null);
    setAktivitasLog(null);
    setVisibleCount(50);
    const pJam = { id_pegawai: config.idPegawai, tgl_awal: tglAwal, tgl_akhir: tglAkhir };
    const pAkt = { id_pegawai: config.idPegawai, tgl_mulai: tglAwal, tgl_akhir: tglAkhir };
    try {
      const resJam = await sendRequest("/Tupoksi/ambil_jam_aktifitas", pJam);
      
      if (resJam?.success && resJam?.jumlah?.length) {
        setDataJam(resJam.jumlah[0]);
      }
      
      const resAkt = await sendRequest("/Tupoksi/ambilDataAktivitas", pAkt);
      setAktivitasLog({
        request: {
          ambil_jam_aktifitas: pJam,
          ambilDataAktivitas: pAkt
        },
        response: {
          ambil_jam_aktifitas: resJam,
          ambilDataAktivitas: resAkt
        }
      });
      
      if (resAkt?.success && resAkt?.data?.length) {
        setDataAkt(resAkt.data);
      } else {
        setError('Detail aktivitas kosong.');
      }
    } catch (err: any) {
      setAktivitasLog({
        request: {
          ambil_jam_aktifitas: pJam,
          ambilDataAktivitas: pAkt
        },
        response: { error: err.message }
      });
      setError(`Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!pegawai) {
    return <RequireLogin tabName="Cek Aktivitas" onGoToLogin={() => setActiveTab('tabLogin')} />;
  }

  return (
    <div className="w-full mx-auto space-y-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 dark:text-white border-b-2 border-orange-500 pb-2 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-orange-500" /> Tarik Log Aktivitas
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DatePicker label="Tanggal Awal" value={tglAwal} onChange={setTglAwal} />
        <DatePicker label="Tanggal Akhir" value={tglAkhir} onChange={setTglAkhir} />
      </div>
      <button 
        onClick={fetchAktivitas}
        disabled={loading}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors mt-6 flex items-center justify-center gap-2"
      >
        <Search className="w-5 h-5" /> {loading ? 'Menarik Data...' : 'Tarik Data'}
      </button>

      {(dataJam || dataAkt || error) && (
        <div 
          className="mt-6 p-4 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800/80 text-sm rounded-xl overflow-x-auto max-h-[500px] custom-scrollbar shadow-sm"
          onScroll={handleScroll}
        >
          {dataJam && (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl mb-4 border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center text-sm shadow-sm">
              <div><div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Durasi</div><div className="font-bold text-blue-600 dark:text-blue-400">{dataJam.total_aktivitas}</div></div>
              <div><div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Disetujui</div><div className="font-bold text-emerald-600 dark:text-emerald-400">{dataJam.total_disetujui}</div></div>
              <div><div className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">Batal</div><div className="font-bold text-red-600 dark:text-red-400">{dataJam.total_batal}</div></div>
            </div>
          )}

          {error ? (
             <div className="p-4 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20 font-medium text-sm rounded-xl flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 shrink-0" />
               <span className="leading-relaxed">{error}</span>
             </div>
          ) : dataAkt ? (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] sm:text-sm">
                <tr>
                  <th className="p-1.5 sm:p-3 font-semibold rounded-tl-lg whitespace-nowrap">Waktu Pelaksanaan</th>
                  <th className="p-1.5 sm:p-3 font-semibold whitespace-nowrap">Jenis & Tugas</th>
                  <th className="p-1.5 sm:p-3 font-semibold whitespace-nowrap">Keterangan</th>
                  <th className="p-1.5 sm:p-3 font-semibold whitespace-nowrap">Status</th>
                  <th className="p-1.5 sm:p-3 font-semibold text-center rounded-tr-lg whitespace-nowrap">Foto Lampiran</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300">
                {dataAkt.slice(0, visibleCount).map((item, i) => {
                  let statusClass = 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400';
                  if (item.status === 'DISETUJUI') statusClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
                  else if (item.status === 'BELUM DIAKHIRI') statusClass = 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400';
                  
                  let lamp = item.lampiran || item.foto || item.file_lampiran;
                  let hasImage = false;
                  let imgUrl = '';
                  
                  if (lamp && lamp !== 'no_image.png' && !lamp.includes('no_image')) {
                    hasImage = true;
                    if (lamp.startsWith('/9j/') || lamp.startsWith('iVBOR')) {
                      imgUrl = `data:image/jpeg;base64,${lamp}`;
                    } else if (lamp.startsWith('http')) {
                      imgUrl = lamp;
                    } else {
                      imgUrl = `/api/proxy-image?path=${encodeURIComponent(lamp)}`;
                    }
                  }

                  return (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] sm:text-sm transition-colors">
                      <td className="p-1.5 sm:p-3 align-top whitespace-nowrap leading-tight">
                        <span className="block text-slate-800 dark:text-slate-300 font-medium">Mulai: {formatBeautifulDateTime(item.tgl_mulai)}</span>
                        <span className="block text-slate-500 dark:text-slate-500 text-[9px] sm:text-xs mt-1">Selesai: {item.tgl_selesai ? formatBeautifulDateTime(item.tgl_selesai) : '-'}</span>
                      </td>
                      <td className="p-1.5 sm:p-3 align-top text-slate-800 dark:text-slate-300 font-medium min-w-[120px] sm:min-w-[150px] max-w-[200px] whitespace-normal break-words leading-tight">
                        <span className="text-[9px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 block mb-1">[{item.jenis || 'TUPOKSI'}]</span>
                        <div className="line-clamp-3">{item.tugas || '-'}</div>
                      </td>
                      <td className="p-1.5 sm:p-3 align-top text-slate-600 dark:text-slate-300 min-w-[120px] sm:min-w-[150px] whitespace-normal break-words leading-tight">
                        {item.keterangan || item.ket || item.deskripsi || item.uraian || '-'}
                      </td>
                      <td className="p-1.5 sm:p-3 align-top">
                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[9px] sm:text-xs font-bold whitespace-nowrap inline-block leading-none ${statusClass}`}>{item.status}</span>
                      </td>
                      <td className="p-1.5 sm:p-3 align-top text-center">
                        <div className="flex justify-center items-center">
                           {hasImage ? (
                            <LazyImage 
                              src={imgUrl} 
                              alt="Aktivitas"
                              onClick={() => {
                                const idx = allImages.findIndex((img) => img.src === imgUrl);
                                setModalImg({
                                  src: imgUrl,
                                  title: item.tugas || 'Foto Aktivitas',
                                  images: allImages,
                                  currentIndex: idx !== -1 ? idx : 0
                                });
                              }}
                              containerClassName="w-12 h-12 sm:w-24 sm:h-24 min-w-[3rem] min-h-[3rem] sm:min-w-[6rem] sm:min-h-[6rem] max-w-[3rem] max-h-[3rem] sm:max-w-[6rem] sm:max-h-[6rem] rounded-lg cursor-pointer border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:scale-105 transition-all shadow-md shrink-0"
                              className="w-full h-full object-cover aspect-square"
                            />
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic text-[10px] sm:text-xs">No Image</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      )}

      {developerMode && aktivitasLog && (
        <DevLogSection 
          title="API: ambilDataAktivitas & ambil_jam_aktifitas" 
          filename="log_activity_reqrespon.txt" 
          request={aktivitasLog.request} 
          response={aktivitasLog.response} 
        />
      )}

      {modalImg && (
        <ImageLightbox 
          src={modalImg.src} 
          title={modalImg.title} 
          images={modalImg.images} 
          currentIndex={modalImg.currentIndex} 
          onClose={() => setModalImg(null)} 
        />
      )}
    </div>
  );
}
