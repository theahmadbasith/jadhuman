# Dokumentasi API Endpoint - JATHILAN (Absensi Ponorogo)

Dokumentasi ini mencantumkan seluruh endpoint API pusat dan lokal yang digunakan oleh aplikasi **JADHUMAN Web Panel** (Sistem Absensi & Produktivitas Kerja ASN Ponorogo). Seluruh request diarahkan melalui server proxy lokal di port `3000` sebelum diteruskan ke server instansi utama guna menghindari masalah CORS (Cross-Origin Resource Sharing) dan mengamankan request.

---

## 1. Arsitektur & Target Backend (Target Backend)

Aplikasi berinteraksi dengan dua server backend utama di jaringan instansi:
* **Server Data Absensi & Aktivitas (Port 8089)**:
  `http://103.109.206.102:8089/Ponorogo-absensApi/index.php`
* **Server Berkas Media & Foto (Port 8087)**:
  `http://103.109.206.102:8087`

---

## 2. Mekanisme Proxy Lokal (CORS Bypass)

Untuk menghindari isu cross-origin, client React SPA tidak menembak IP backend secara langsung. Sebagai gantinya, client mengirimkan request ke server internal di port `3000` (menggunakan handler Express/Vercel):

### A. Proxy Utama (Data API)
* **URL Lokal**: `/api/proxy`
* **Method**: `POST`
* **Header Client**: `Content-Type: application/json`
* **Payload Client (JSON)**:
  ```json
  {
    "endpoint": "/bagian/endpoint_tujuan",
    "payload": {
      "key_1": "value_1",
      "key_2": "value_2"
    }
  }
  ```
* **Proses Server**:
  Proxy menyusun ulang body JSON menjadi format `application/x-www-form-urlencoded` menggunakan `URLSearchParams` dan menembakkannya ke server pusat port 8089 dengan header perangkat seluler asli (`User-Agent: Dart/3.0 (dart:io)`).

### B. Proxy Media (Foto)
* **URL Lokal**: `/api/proxy-image?path=<FILE_PATH>`
* **Method**: `GET`
* **Proses Server**:
  Proxy mengambil data biner gambar dari `http://103.109.206.102:8087<FILE_PATH>` dan mengembalikannya ke client dengan header optimasi cache browser:
  ```http
  Cache-Control: public, max-age=86400
  ```

---

## 3. Rincian API Endpoint (Port 8089)

Seluruh request di bawah ini dikirimkan melalui proxy `/api/proxy` menggunakan metode **POST** dengan data bertipe `application/x-www-form-urlencoded` pada server target pusat.

### A. Login & Autentikasi

#### 1. Verifikasi Kredensial Pegawai
* **Endpoint**: `/login/do_LoginMobile`
* **Deskripsi**: Autentikasi akun pegawai dan penarikan profil lengkap.
* **Payload**:
  * `username` (string, NIP pegawai tanpa spasi)
  * `password` (string, password akun presensi)
  * `versi` (string, versi aplikasi presensi, default `"2.0.0"`)
* **Response Utama**: Mengembalikan objek data profil lengkap pegawai (nama, NIP, instansi, Unor, IMEI terdaftar, id_lokasi, koordinat kantor, dsb.) beserta status keberhasilan.

#### 2. Ganti Password Akun
* **Endpoint**: `/login/Ubah_PasswordMobile`
* **Deskripsi**: Mengubah kata sandi akun presensi pegawai.
* **Payload**:
  * `id_pegawai` (string, GUID unik pegawai)
  * `password_sekarang` (string, password lama)
  * `password_baru` (string, password baru)
* **Response Utama**: Objek berisi status sukses atau pesan kesalahan jika password lama salah.

---

### B. Absensi & Radius

#### 1. Pengiriman Presensi Mobile (Masuk / Pulang)
* **Endpoint**: `/login/absen_mobile`
* **Deskripsi**: Mengirimkan data kehadiran (check-in/check-out) lengkap dengan foto selfie (face recognition) dan koordinat GPS.
* **Payload**:
  * `id_pegawai` (string, GUID unik pegawai)
  * `tanggal` (string, tanggal absen `YYYY-MM-DD HH:mm:ss` atau `YYYY-MM-DD`)
  * `keterangan` (string, keterangan kehadiran seperti `"Presensi Reguler"`)
  * `lampiran` (string, Base64 murni foto selfie wajah pegawai tanpa prefix data URI)
  * `sim_serial` (string, nomor serial SIM / IMEI terdaftar)
  * `lattitude` (string, koordinat lintang GPS — *catatan: typo sesuai API asli*)
  * `longitude` (string, koordinat bujur GPS)
  * `imei` (string, nomor IMEI perangkat terdaftar)
  * `id_lokasi` (string, GUID lokasi kantor presensi)
  * `kode_instansi` (string, kode instansi daerah)
  * `work_mode` (string, mode kerja — `"1"` untuk WFO, `"2"` untuk WFH)
  * `bedgenumber` (string, badge number / IMEI perangkat)
  * `versi` (string, versi aplikasi presensi)
* **Response Utama**: `{"success": true, "message": "Absen Berhasil"}` (atau respons penolakan jika di luar radius).

---

### C. Log & Riwayat Presensi

#### 1. Rekapitulasi Riwayat Bulanan
* **Endpoint**: `/logActivity/log`
* **Deskripsi**: Mendapatkan daftar riwayat presensi masuk dan pulang pegawai dalam rentang tanggal tertentu.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tgl_awal` (string, format `YYYY-MM-DD`)
  * `tgl_akhir` (string, format `YYYY-MM-DD`)
* **Response Utama**: Array histori log absen masuk & pulang per tanggal lengkap dengan nama file lampiran foto.

#### 2. Rincian Detail Log Harian
* **Endpoint**: `/logActivity/log_detail`
* **Deskripsi**: Mendapatkan rincian detail log presensi pada satu tanggal tertentu.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tanggal` (string, format `YYYY-MM-DD`)
* **Response Utama**: Objek detail jam masuk, jam pulang, koordinat presensi, dan status kehadiran harian.

---

### D. Histori Izin & Cuti

#### 1. Riwayat Surat Izin / Dinas Luar
* **Endpoint**: `/izin/history_Izin`
* **Deskripsi**: Menarik riwayat pengajuan surat izin, dinas luar, sakit, atau cuti pegawai.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tgl_awal` (string, format `YYYY-MM-DD`)
  * `tgl_akhir` (string, format `YYYY-MM-DD`)
* **Response Utama**: Daftar berkas status pengajuan izin/cuti beserta jenis, keterangan, tanggal mulai-selesai, dan url lampiran dokumen pendukung.

---

### E. Pengelolaan Tugas Harian & Aktivitas

#### 1. Cek Aktivitas Sedang Berjalan
* **Endpoint**: `/Tupoksi/cekaktifitas`
* **Deskripsi**: Mengecek apakah pegawai saat ini memiliki tugas/aktivitas yang sedang berjalan (aktif) dan belum diakhiri.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
* **Response Utama**: Detail objek aktivitas yang sedang aktif (ID tugas, nama tugas, deskripsi, waktu mulai), atau `{"success": false}` jika tidak ada tugas berjalan.

#### 2. Dapatkan Daftar Tupoksi Pegawai
* **Endpoint**: `/Tupoksi/get_data_tupoksi`
* **Deskripsi**: Mengambil daftar tugas pokok dan fungsi (Tupoksi) yang sah untuk jabatan pegawai bersangkutan.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
* **Response Utama**: Array daftar tugas pokok/Tupoksi resmi yang dapat dipilih saat memulai aktivitas baru.

#### 3. Dapatkan Daftar Aktivitas Tambahan
* **Endpoint**: `/Tupoksi/get_aktifitas`
* **Deskripsi**: Mengambil daftar aktivitas atau tugas-tugas tambahan di luar tupoksi standar pegawai yang dapat dipilih untuk pelaporan kinerja harian.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
* **Response Utama**: Array/objek berisi alternatif daftar tugas tambahan atau aktivitas umum.

#### 4. Mulai Tugas Tupoksi Baru
* **Endpoint**: `/Tupoksi/simpanTupoksi`
* **Deskripsi**: Memulai pencatatan durasi tugas baru berdasarkan salah satu pilihan Tupoksi resmi.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `id_tupoksi` (string, ID tugas pokok yang dipilih dari get_data_tupoksi)
  * `keterangan` (string, uraian detail kegiatan/rencana kerja)
  * `deskr_tupoksi` (string, deskripsi pendukung kegiatan, disamakan dengan keterangan)
  * `lokasi` (string, nama lokasi kegiatan, opsional)
* **Response Utama**: Objek konfirmasi sukses beserta ID aktivitas yang baru dibuat (`id_aktifitas`).

#### 5. Mulai Tugas Non-Tupoksi Baru (Aktivitas Umum)
* **Endpoint**: `/Tupoksi/simpanNonTupoksi`
* **Deskripsi**: Memulai pencatatan durasi kegiatan umum di luar daftar Tupoksi resmi.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tugas` (string, judul tugas tambahan secara bebas)
  * `keterangan` (string, uraian detail rencana kegiatan)
  * `deskr_tupoksi` (string, deskripsi pendukung kegiatan, disamakan dengan keterangan)
  * `lokasi` (string, nama lokasi kegiatan, opsional)
* **Response Utama**: Objek konfirmasi sukses beserta ID aktivitas baru yang dibuat.

#### 6. Akhiri Tugas Sedang Berjalan
* **Endpoint**: `/Tupoksi/akhiriAktivitas` (dengan `/Tupoksi/selesaiAktivitas` sebagai endpoint cadangan fallback)
* **Deskripsi**: Menghentikan pencatatan durasi aktivitas berjalan, sekaligus melampirkan foto hasil pengerjaan sebagai bukti penyelesaian.
* **Payload**:
  * `id_aktifitas` (string, ID log tugas berjalan yang didapat dari cekaktifitas)
  * `lampiran` (string, Base64 murni dari berkas foto hasil pengerjaan - tanpa format prefix)
  * `lokasi` (string, lokasi akhir pengerjaan, opsional)
* **Response Utama**: `{"success": true, "message": "Aktivitas berhasil diakhiri"}`.

#### 7. Tarik Laporan Jam Kerja
* **Endpoint**: `/Tupoksi/ambil_jam_aktifitas`
* **Deskripsi**: Menarik total kalkulasi jumlah jam kerja produktifitas dalam rentang tanggal tertentu.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tgl_awal` (string, format `YYYY-MM-DD`)
  * `tgl_akhir` (string, format `YYYY-MM-DD`)
* **Response Utama**: Akumulasi jam kerja harian, mingguan, atau bulanan pegawai.

#### 8. Tarik Detail Seluruh Tugas (Log Aktivitas)
* **Endpoint**: `/Tupoksi/ambilDataAktivitas`
* **Deskripsi**: Mengambil histori laporan seluruh aktivitas yang pernah dikerjakan (baik Tupoksi maupun Non-Tupoksi) dalam rentang tanggal tertentu.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai)
  * `tgl_mulai` (string, format `YYYY-MM-DD`)
  * `tgl_akhir` (string, format `YYYY-MM-DD`)
* **Response Utama**: Array kegiatan harian lengkap dengan status review dari atasan (PENDING, DISETUJUI, BATAL), durasi pengerjaan, dan tautan lampiran foto.

---

### F. Verifikasi Produktivitas (Atasan / Reviewer)

#### 1. Dapatkan Daftar Anggota Bawahan
* **Endpoint**: `/Tupoksi/get_unor1`
* **Deskripsi**: Mengambil daftar bawahan di unit organisasi (Unor) yang berada di bawah wewenang persetujuan atasan/reviewer tersebut.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai atasan)
  * `kode_instansi` (string, kode instansi instansi reviewer)
  * `nomor` (string, nomor identifikasi unik, opsional)
* **Response Utama**: Daftar pegawai bawahan lengkap dengan foto, nama, NIP, jabatan, dan id_pegawai mereka.

#### 2. Jumlah Antrean Review Bawahan
* **Endpoint**: `/Tupoksi/ambil_data_dashboard`
* **Deskripsi**: Mengambil statistik jumlah kegiatan bawahan yang berstatus pending dan membutuhkan tinjauan/review.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai atasan)
  * `kode_instansi` (string, kode instansi instansi reviewer)
  * `nomor` (string, nomor identifikasi unik, opsional)
* **Response Utama**: Jumlah antrean tugas pending, jumlah kegiatan yang disetujui, dan ditolak.

#### 3. Dapatkan Daftar Review Aktivitas Bawahan
* **Endpoint**: `/Tupoksi/get_aktifitas`
* **Deskripsi**: Mengambil antrean aktivitas seluruh bawahan yang memerlukan persetujuan dari atasan.
* **Payload**:
  * `id_pegawai` (string, GUID pegawai atasan)
  * `kode_instansi` (string, kode instansi instansi reviewer)
  * `nomor` (string, nomor identifikasi unik, opsional)
* **Response Utama**: Daftar riwayat pengajuan kegiatan bawahan lengkap dengan status persetujuannya.

#### 4. Detail Usulan Kegiatan Bawahan
* **Endpoint**: `/Tupoksi/detailKegiatan`
* **Deskripsi**: Menarik rincian spesifik satu usulan kegiatan dari seorang bawahan.
* **Payload**:
  * `id_pegawai` (string, GUID bawahan yang dicek)
  * `tgl_awal` (string, format `YYYY-MM-DD`)
  * `tgl_akhir` (string, format `YYYY-MM-DD`)
* **Response Utama**: Objek detail kegiatan spesifik bawahan termasuk foto lampiran hasil kegiatan.

#### 5. Persetujuan / Pembatalan Usulan Bawahan
* **Endpoint**: `/Tupoksi/updateStatus`
* **Deskripsi**: Mengubah status review kegiatan bawahan menjadi disetujui atau ditolak/batal.
* **Payload**:
  * `id` (string, ID kegiatan bawahan yang direview)
  * `status` (string, `'DISETUJUI'` atau `'BATAL'`)
* **Response Utama**: `{"success": true, "message": "Status berhasil diperbarui"}`.

---

## 4. Penyimpanan Lokal & Sinkronisasi Database Firestore

Selain endpoint di atas, aplikasi **JADHUMAN Web Panel** juga menggunakan database **Cloud Firestore** untuk melakukan pencatatan dan sinkronisasi data sekunder:

### A. Koleksi Firestore `pegawai`
* **Fungsi**: Sinkronisasi database lokal profil pegawai, pencarian NIP, pengenalan IMEI/badge number, serta modifikasi data profile pegawai kustom yang diunggah via Excel.
* **Mekanisme Cache**: Aplikasi menerapkan strategi optimasi pembacaan database (Cost Saving) dengan menyimpan data pegawai di `localStorage` selama 1 jam (`jadhuman_cached_pegawai`), sehingga meminimalkan operasi pembacaan Firestore berulang.

---

## 5. Contoh Implementasi Client-Side (React/TypeScript)

Berikut adalah contoh utilitas pengiriman request yang digunakan dalam aplikasi menggunakan browser Fetch API bawaan:

```typescript
// src/api/index.ts
export const sendRequest = async (endpoint: string, payload: Record<string, any>): Promise<any> => {
  const url = "/api/proxy";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint, payload }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
};
```

Contoh pemanggilan untuk melakukan login:
```typescript
import { sendRequest } from './api';

const doLogin = async () => {
  try {
    const userProfile = await sendRequest("/login/do_LoginMobile", {
      username: "19950101XXXXXXXXXX",
      password: "password_anda",
      versi: "2.0.0"
    });
    console.log("Profil Pegawai:", userProfile);
  } catch (error) {
    console.error("Login gagal:", error.message);
  }
};
```
