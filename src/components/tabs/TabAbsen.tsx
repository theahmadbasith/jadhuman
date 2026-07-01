import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, Clock, UploadCloud, Camera as CameraIcon, Image as ImageIcon, Send, CheckCircle, AlertTriangle, X, Search } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { sendRequest } from '../../api';
import DevLogSection from '../DevLogSection';
import ImageLightbox from '../ui/ImageLightbox';
import RequireLogin from '../ui/RequireLogin';
import { useBackButton } from '../../hooks/useBackButton';
import { getTodayWIB } from '../../lib/dateFormatter';

export default function TabAbsen() {
  const { pegawai, config, setActiveTab, developerMode } = useAppContext();
  const [tanggal, setTanggal] = useState(() => getTodayWIB());
  const [displayTanggal, setDisplayTanggal] = useState('');
  const [timeStr, setTimeStr] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB';
  });
  const [fileInfo, setFileInfo] = useState('');
  const [base64Image, setBase64Image] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<{ type: 'success'|'error', text: string } | null>(null);
  const [absenLog, setAbsenLog] = useState<{ request: any; response: any } | null>(null);
  const [modalImg, setModalImg] = useState<{ src: string, title: string } | null>(null);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Hook up back button to close lightbox
  useBackButton(() => {
    setModalImg(null);
    return true;
  }, !!modalImg);

  // Hook up back button to stop camera
  useBackButton(() => {
    stopCamera();
    return true;
  }, isCameraActive);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tanggal) {
      const [year, month, day] = tanggal.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      setDisplayTanggal(d.toLocaleDateString('id-ID', options));
    }
  }, [tanggal]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB');
    };
    tick(); // run once immediately
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup camera when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.match(/image.*/)) {
      alert("Pilih file gambar!");
      return;
    }
    
    setFileInfo("🔄 Memproses & kompresi foto...");
    setBase64Image('');
    setOutput(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxW = 800;
        
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          let quality = 0.9;
          let dataUrl = '';
          let byteLength = 0;
          
          do {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            byteLength = Math.round((dataUrl.length * 3) / 4);
            quality -= 0.1;
          } while (byteLength > 200 * 1024 && quality > 0.1);
          
          setBase64Image(dataUrl);
          setFileInfo(`✅ Selesai (${(byteLength / 1024).toFixed(1)} KB)`);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }
    
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      streamRef.current = mediaStream;
      setIsCameraActive(true);
      
      // We need a slight delay to ensure the video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (err) {
      alert("Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.");
      console.error(err);
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            processFile(file);
            stopCamera();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const submitAbsen = async () => {
    if (!base64Image) return;
    
    setLoading(true);
    setOutput(null);
    setAbsenLog(null);
    
    const payload = {
      tanggal: tanggal,
      keterangan: "Presensi Reguler",
      lampiran: base64Image.split(',')[1],
      sim_serial: config.deviceId,
      lattitude: config.latitude,
      longitude: config.longitude,
      imei: config.deviceId,
      kode_instansi: config.kodeInstansi,
      id_lokasi: config.idLokasi,
      work_mode: config.workMode,
      id_pegawai: config.idPegawai,
      bedgenumber: config.deviceId,
      versi: config.versi
    };

    try {
      const data = await sendRequest("/login/absen_mobile", payload);
      setAbsenLog({ request: payload, response: data });
      
      if (data.success) {
        setOutput({ type: 'success', text: `✅ PRESENSI BERHASIL!\n${data.message || 'Sukses'}` });
      } else {
        setOutput({ type: 'error', text: `❌ GAGAL PRESENSI\n${data.message || 'Error'}` });
      }
    } catch (err: any) {
      setAbsenLog({ request: payload, response: { error: err.message } });
      setOutput({ type: 'error', text: `❌ Network Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  if (!pegawai) {
    return <RequireLogin tabName="Submit Presensi" onGoToLogin={() => setActiveTab('tabLogin')} />;
  }

  return (
    <>
      <div className="w-full mx-auto bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700/60 relative z-20">
      
      <div className="flex items-center gap-3 mb-8 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Formulir Presensi</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Silakan unggah atau ambil foto untuk presensi</p>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-30">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="flex-1 sm:flex-initial">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Tanggal</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">{displayTanggal}</div>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Waktu</div>
            <div className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-200">{timeStr}</div>
          </div>
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Foto Presensi</label>
          
          <div 
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 sm:p-12 text-center bg-slate-50 dark:bg-slate-900/30 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all cursor-pointer group"
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <div className="mb-6 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Tarik & lepas foto di sini</p>
                <p className="text-xs text-slate-400 mt-1">Ukuran akan otomatis dikompres &lt; 200KB</p>
              </div>
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              <button type="button" onClick={startCamera} className="bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-95">
                <CameraIcon className="w-4 h-4" /> Buka Kamera
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-95">
                <ImageIcon className="w-4 h-4" /> Pilih File
              </button>
            </div>
          </div>
        </div>
        
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
        <input type="file" ref={cameraInputRef} accept="image/*" capture="user" className="hidden" onChange={handleFileChange} />
        
        {/* Live Camera View */}
        {isCameraActive && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <div className="flex justify-between items-center p-4 bg-black text-white">
              <span className="font-medium">Ambil Foto Presensi</span>
              <button onClick={stopCamera} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
              <video 
                ref={videoRef} 
                playsInline 
                autoPlay 
                muted
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="p-8 bg-black flex justify-center items-center pb-12">
              <button 
                onClick={capturePhoto} 
                className="w-20 h-20 bg-white rounded-full border-4 border-slate-300 shadow-lg active:scale-95 transition-transform flex items-center justify-center"
              >
                <div className="w-16 h-16 bg-white border-2 border-slate-200 rounded-full"></div>
              </button>
            </div>
          </div>
        )}

        {base64Image && !isCameraActive && (
          <div className="mt-8 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-900/30 flex flex-col items-center justify-center animate-fade-in-up">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Pratinjau Foto Presensi</h4>
            
            <div className="relative rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-700 max-w-full max-h-[300px] flex justify-center bg-slate-100 dark:bg-slate-950">
              <img 
                src={base64Image} 
                alt="Pratinjau Foto" 
                className="max-w-full max-h-[300px] object-contain cursor-pointer transition-transform duration-300 hover:scale-[1.01]" 
                onClick={() => setModalImg({ src: base64Image, title: 'Pratinjau Foto Presensi' })}
              />
            </div>

            {/* Controls directly under photo */}
            <div className="flex justify-center gap-3 mt-4 w-full max-w-xs">
              <button 
                type="button" 
                onClick={() => setModalImg({ src: base64Image, title: 'Pratinjau Foto Presensi' })}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-200/40 dark:border-slate-700/40 cursor-pointer"
              >
                <Search className="w-4 h-4" /> Lihat Detail
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setBase64Image('');
                  setFileInfo('');
                  setOutput(null);
                }}
                className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-rose-100 dark:border-rose-950/30 cursor-pointer"
              >
                <X className="w-4 h-4" /> Hapus Foto
              </button>
            </div>

            {/* Keterangan sukses dan berapa ukurannya di bawah fotonya (jangan di sampingnya!) */}
            <div className="mt-4 flex flex-col items-center text-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20 text-xs font-bold">
                <CheckCircle className="w-3.5 h-3.5" /> Foto Berhasil Diproses
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {fileInfo}
              </span>
            </div>
          </div>
        )}
        
        {/* Card Section for Kirim Presensi */}
        <div className="mt-8 p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 shadow-md flex flex-col gap-4">
          <button 
            onClick={submitAbsen}
            disabled={!base64Image || loading} 
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-xl transition-all text-base flex items-center justify-center gap-2 active:scale-[0.98] shadow-md cursor-pointer border border-blue-700 dark:border-blue-400"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
            {loading ? 'Mengirim Data Presensi...' : 'Kirim Presensi Sekarang'}
          </button>
        </div>
        
        {output && (
          <div className={`mt-6 p-4 rounded-xl text-sm font-semibold shadow-sm ${output.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'}`}>
            <div className="flex items-center gap-3">
              {output.type === 'success' ? <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />}
              <span className="font-sans whitespace-pre-wrap leading-relaxed">{output.text}</span>
            </div>
          </div>
        )}

        {developerMode && absenLog && (
          <DevLogSection 
            title="API: absen_mobile" 
            filename="absen_reqrespon.txt" 
            request={absenLog.request} 
            response={absenLog.response} 
          />
        )}
      </div>
    </div>
      
    {modalImg && (
      <ImageLightbox src={modalImg.src} title={modalImg.title} onClose={() => setModalImg(null)} />
    )}
  </>
  );
}
