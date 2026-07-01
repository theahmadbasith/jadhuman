import React, { useState, useEffect } from 'react';
import { Database, Download, Upload, Search, Copy, Check, Loader2, Plus, X, Edit } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';

import { getPegawaiDatabase } from '../../data/database';
import { useAppContext } from '../../context/AppContext';

export default function TabDatabase() {
  const { setLoginForm } = useAppContext();
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  // States for manual employee addition
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNip, setNewNip] = useState('');
  const [newNama, setNewNama] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // States for manual employee editing
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNip, setEditNip] = useState('');
  const [editNama, setEditNama] = useState('');

  const filteredData = data.filter(item => {
    const term = search.toLowerCase();
    return (item.nip || '').toLowerCase().includes(term) || (item.nama || '').toLowerCase().includes(term);
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      if (visibleCount < filteredData.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  useEffect(() => {
    const loadCustomPegawai = async () => {
      try {
        setIsLoading(true);
        const localData = getPegawaiDatabase();
        
        // Cost saving logic for Firestore reads: Cache pegawai list locally for 1 hour
        const cachedDataStr = localStorage.getItem('jadhuman_cached_pegawai');
        const cachedTimeStr = localStorage.getItem('jadhuman_cached_pegawai_time');
        const cacheExpiryMs = 60 * 60 * 1000; // 1 Jam

        if (cachedDataStr && cachedTimeStr && (Date.now() - Number(cachedTimeStr) < cacheExpiryMs)) {
          try {
            const parsed = JSON.parse(cachedDataStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setData(parsed);
              return; // Skip read from Firebase!
            }
          } catch (e) {
            console.error("Failed to parse cached pegawai, falling back to Firebase:", e);
          }
        }

        // Fetch custom pegawai from Firestore
        const querySnapshot = await getDocs(collection(db, 'pegawai'));
        const fbData: any[] = [];
        querySnapshot.forEach((doc) => {
          fbData.push(doc.data());
        });
        
        // Merge Firestore and local list
        const merged = [...localData];
        fbData.forEach(item => {
          const idx = merged.findIndex(d => d.nip === item.nip);
          if (idx >= 0) {
            merged[idx] = item;
          } else {
            merged.unshift(item); // Put custom added on top for visibility
          }
        });
        
        setData(merged);
        localStorage.setItem('jadhuman_cached_pegawai', JSON.stringify(merged));
        localStorage.setItem('jadhuman_cached_pegawai_time', String(Date.now()));
      } catch (err) {
        console.error("Failed to load custom pegawai", err);
        // Fallback to local data
        const localDataFallback = getPegawaiDatabase();
        setData(localDataFallback);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCustomPegawai();
  }, []);

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Membaca file...');
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        
        const importedData = jsonData.map((row: any) => ({
          nip: row.NIP ? String(row.NIP) : (row.nip ? String(row.nip) : ''),
          nama: row.Nama || row.nama || ''
        })).filter((item: any) => item.nip && item.nama);
        
        if (importedData.length > 0) {
          setImportStatus('Menyimpan ke database...');
          
          // Save to Firebase in batches of 500
          const batches = [];
          for (let i = 0; i < importedData.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = importedData.slice(i, i + 500);
            chunk.forEach((item) => {
              const docRef = doc(collection(db, 'pegawai'), item.nip);
              batch.set(docRef, item);
            });
            batches.push(batch.commit());
          }
          
          await Promise.all(batches);
          
          setData(prev => {
            const newData = [...prev];
            importedData.forEach(item => {
              const idx = newData.findIndex(d => d.nip === item.nip);
              if (idx >= 0) newData[idx] = item;
              else newData.unshift(item);
            });
            localStorage.setItem('jadhuman_cached_pegawai', JSON.stringify(newData));
            localStorage.setItem('jadhuman_cached_pegawai_time', String(Date.now()));
            return newData;
          });
          
          setImportStatus(`✅ Berhasil import & simpan ${importedData.length} data!`);
          setTimeout(() => setImportStatus(''), 5000);
        } else {
          setImportStatus('❌ Format tidak sesuai atau data kosong.');
        }
      } catch (err) {
        console.error(err);
        setImportStatus('❌ Terjadi kesalahan saat memproses data.');
      }
    };
    reader.readAsBinaryString(file);
    // Reset file input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleAddPegawai = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNip = newNip.trim();
    const cleanNama = newNama.trim();

    if (!cleanNip || !cleanNama) {
      alert("NIP dan Nama Pegawai harus diisi!");
      return;
    }
    
    setIsSaving(true);
    setImportStatus('Menyimpan pegawai...');
    
    try {
      const docRef = doc(collection(db, 'pegawai'), cleanNip);
      const newEmployee = { nip: cleanNip, nama: cleanNama };
      await setDoc(docRef, newEmployee);
      
      setData(prev => {
        const newData = [...prev];
        const idx = newData.findIndex(d => d.nip === cleanNip);
        if (idx >= 0) {
          newData[idx] = newEmployee;
        } else {
          newData.unshift(newEmployee);
        }
        localStorage.setItem('jadhuman_cached_pegawai', JSON.stringify(newData));
        localStorage.setItem('jadhuman_cached_pegawai_time', String(Date.now()));
        return newData;
      });
      
      setImportStatus(`✅ Berhasil menambahkan pegawai: "${cleanNama}"`);
      setShowAddModal(false);
      setNewNip('');
      setNewNama('');
      
      setTimeout(() => {
        setImportStatus('');
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setImportStatus('❌ Gagal menyimpan pegawai.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPegawai = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNip = editNip.trim();
    const cleanNama = editNama.trim();

    if (!cleanNip || !cleanNama) {
      alert("Nama Pegawai harus diisi!");
      return;
    }
    
    setIsSaving(true);
    setImportStatus('Menyimpan perubahan pegawai...');
    
    try {
      const docRef = doc(collection(db, 'pegawai'), cleanNip);
      const updatedEmployee = { nip: cleanNip, nama: cleanNama };
      await setDoc(docRef, updatedEmployee);
      
      setData(prev => {
        const newData = [...prev];
        const idx = newData.findIndex(d => d.nip === cleanNip);
        if (idx >= 0) {
          newData[idx] = updatedEmployee;
        } else {
          newData.unshift(updatedEmployee);
        }
        localStorage.setItem('jadhuman_cached_pegawai', JSON.stringify(newData));
        localStorage.setItem('jadhuman_cached_pegawai_time', String(Date.now()));
        return newData;
      });
      
      setImportStatus(`✅ Berhasil memperbarui data pegawai "${cleanNama}"!`);
      setShowEditModal(false);
      setEditNip('');
      setEditNama('');
      
      setTimeout(() => {
        setImportStatus('');
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setImportStatus('❌ Gagal memperbarui data pegawai.');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadExcelTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { NIP: '199001012024011001', Nama: 'JOHN DOE, S.Kom' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Pegawai");
    XLSX.writeFile(wb, "template import data jadhuman.xlsx");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setLoginForm({ username: text, password: '' });
      setImportStatus(`✅ NIP ${text} disalin ke Form Login!`);
      setTimeout(() => {
        setCopiedIndex(null);
        setImportStatus('');
      }, 4000);
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-500" /> Database Pegawai
        </h3>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah Pegawai
          </button>
          <button 
            onClick={downloadExcelTemplate}
            className="flex-1 sm:flex-none bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" /> Template
          </button>
          <label className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
            <Upload className="w-4 h-4" /> Import Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
          </label>
        </div>
      </div>
      
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="w-5 h-5" />
        </span>
        <input 
          type="text" 
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setVisibleCount(50);
          }}
          placeholder="Cari NIP atau Nama Pegawai..." 
          className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white"
        />
      </div>
      
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex flex-col bg-white dark:bg-slate-900">
        <div className="grid grid-cols-[80px_1fr_1.3fr] sm:grid-cols-[120px_200px_1fr] px-1 py-1.5 sm:px-2 sm:py-3 text-[10px] sm:text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
          <div className="text-center uppercase tracking-wider flex items-center justify-center font-bold text-[9px] sm:text-xs">Aksi</div>
          <div className="px-1.5 sm:px-6 text-left tracking-wider flex items-center uppercase sm:normal-case">NIP</div>
          <div className="px-1.5 sm:px-6 text-left tracking-wider flex items-center">Nama Pegawai</div>
        </div>
        
        <div className="overflow-y-auto max-h-[500px] custom-scrollbar bg-white dark:bg-slate-800" onScroll={handleScroll}>
          {isLoading ? (
            <div className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Memuat data pegawai...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 italic">Data tidak ditemukan.</div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredData.slice(0, visibleCount).map((item, index) => (
                <div key={index} className="grid grid-cols-[80px_1fr_1.3fr] sm:grid-cols-[120px_200px_1fr] px-1 py-1.5 sm:px-2 sm:py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors items-center text-[10px] sm:text-sm text-slate-700 dark:text-slate-300">
                  <div className="text-center flex justify-center gap-1.5 sm:gap-2">
                    <button 
                      onClick={() => copyToClipboard(item.nip, index)}
                      className={`p-1 sm:p-1.5 rounded transition-colors ${copiedIndex === index ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                      title="Copy NIP"
                    >
                      {copiedIndex === index ? <Check className="w-3 h-3 sm:w-4 sm:h-4" /> : <Copy className="w-3 h-3 sm:w-4 sm:h-4" />}
                    </button>
                    <button 
                      onClick={() => {
                        setEditNip(item.nip);
                        setEditNama(item.nama);
                        setShowEditModal(true);
                      }}
                      className="p-1 sm:p-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Edit Pegawai"
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                  <div className="px-1.5 sm:px-6 font-mono font-medium truncate select-all">{item.nip}</div>
                  <div className="px-1.5 sm:px-6 font-medium text-slate-800 dark:text-slate-200 truncate">{item.nama}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center px-2">
        <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{importStatus}</div>
        <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-auto">Total: {filteredData.length} pegawai</div>
      </div>

      {/* MODAL TAMBAH PEGAWAI */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" /> Tambah Pegawai Baru
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddPegawai} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">NIP Pegawai</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder="Masukkan NIP (misal: 199001012024011001)"
                  value={newNip}
                  onChange={e => setNewNip(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nama Lengkap & Gelar</label>
                <input 
                  type="text"
                  required
                  placeholder="Masukkan Nama Lengkap"
                  value={newNama}
                  onChange={e => setNewNama(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Pegawai</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT PEGAWAI */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-500" /> Edit Data Pegawai
              </h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditPegawai} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">NIP Pegawai (Tidak dapat diubah)</label>
                <input 
                  type="text"
                  disabled
                  value={editNip}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-100 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-sm cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nama Lengkap & Gelar</label>
                <input 
                  type="text"
                  required
                  placeholder="Masukkan Nama Lengkap"
                  value={editNama}
                  onChange={e => setEditNama(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Perubahan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
