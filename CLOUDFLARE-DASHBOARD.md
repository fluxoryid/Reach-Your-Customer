# Jalankan langsung di Cloudflare (tanpa terminal laptop)

Seluruh langkah dilakukan melalui browser: dashboard Cloudflare dan website GitHub. Tidak perlu mengunduh ZIP, Node.js, atau Python.

## 1. Buat database D1

Masuk https://dash.cloudflare.com dan pilih akun tujuan. Buka **Storage & Databases → D1 → Create database** (nama menu dapat berubah). Buat database `ryc-db`; bila sudah ada, periksa dahulu apakah memang database aplikasi ini. Salin **Database ID**, bukan Account ID. D1 tersedia pada Free dan Paid dengan kuota berbeda; tidak perlu membeli paket hanya untuk mengikuti langkah ini. Paket akun belum diverifikasi oleh agen.

## 2. Masukkan ID database lewat GitHub

Buka `wrangler.jsonc` pada branch `main` repository `fluxoryid/Reach-Your-Customer`. Klik ikon pensil/Edit. Ganti hanya `database_id` berisi nol dengan Database ID langkah 1. Pertahankan binding `DB` dan nama `ryc-db`. Klik **Commit changes**, simpan ke `main`. ID database bukan password/token.

## 3. Buat tabel

Buka `migrations/0001_accounts.sql` di GitHub dan salin isi SQL. Di dashboard D1, buka database `ryc-db` → **Console**, tempel SQL dan jalankan. Jika console hanya menerima satu statement, jalankan setiap statement `CREATE ...;` satu per satu. File ini membuat tabel `users`, `sessions` dan index tanpa menghapus data. Jangan menaruh password atau token di console.

## 4. Hubungkan GitHub ke Workers

Buka **Workers & Pages → Create application**, pilih opsi mengimpor/menghubungkan repository GitHub (bukan upload ZIP dan bukan proyek Pages statis). Izinkan Cloudflare mengakses `fluxoryid/Reach-Your-Customer`, lalu pilih repository tersebut dan branch `main`.

Pengaturan build:

- Worker/project name: `reach-your-customer` (harus sesuai `name` di `wrangler.jsonc`).
- Root directory: root repository; kosong atau `/`, sesuai UI.
- Build command: kosong. Wrangler akan membundel Worker sekaligus mengunggah folder `web/`.
- Deploy command: `npm run deploy` (atau `npx wrangler deploy`).
- Dependency installation: otomatis berdasarkan `package-lock.json`; jika ada kolom install command, gunakan `npm ci`.
- Jika perlu memilih Node, gunakan 22 atau 24.

Pilih akun Cloudflare yang sama dengan akun tempat D1 dibuat. Klik **Deploy**. Binding D1 `DB` sudah dideklarasikan dalam `wrangler.jsonc`; tidak perlu menaruh API token di repository. Bila muncul error ID nol atau database tidak ditemukan, periksa commit langkah 2 dan akun tujuan.

Jika UI tidak menyediakan impor repository pada halaman awal: buat Worker terlebih dahulu, lalu buka **Settings → Builds → Connect** untuk menghubungkan GitHub dan mengatur build. Nama menu dapat berbeda. Pastikan Worker terhubung ke repository sebelum melanjutkan.

## 5. Atur password awal sebagai Secret

Setelah deployment berhasil, buka Worker **reach-your-customer → Settings → Variables and Secrets → Add**:

- Type: **Secret** (bukan Text/plain variable).
- Name: `INITIAL_PASSWORD`.
- Value: password awal pilihan Anda, minimal 12 karakter, berisi huruf kapital, huruf kecil, angka, dan simbol.

Simpan dan **Deploy/Apply** perubahan jika diminta. Jangan memasukkan password ke GitHub atau chat. `INITIAL_USER_EMAIL` sudah diset ke `tommi.khrisna@fluxoryid.com` dalam konfigurasi.

Secret dibaca hanya saat akun awal belum ada. Worker menyimpan hash bersalt dalam D1, bukan password asli. Mengganti secret tidak mereset password akun yang sudah terbentuk.

## 6. Buka aplikasi

Gunakan **Visit** atau URL HTTPS `workers.dev` yang benar-benar ditampilkan dashboard. Jangan menebak subdomain. Cek `/api/health`; hasil harus berisi `status: ok`, `runtime: cloudflare-workers`, `data_source: demo`.

Masuk dengan email `tommi.khrisna@fluxoryid.com` dan password langkah 5. Login pertama wajib mengganti password dengan password baru yang berbeda. Selanjutnya pilih kategori dan klik **Tampilkan penjual**. Semua hasil masih data demo.

## 7. Hapus secret awal setelah akun berhasil dibuat

Sesudah login dan ganti password berhasil, kembali ke **Settings → Variables and Secrets**, hapus `INITIAL_PASSWORD`, lalu deploy/apply perubahan. Akun sudah tersimpan di D1 dan tetap bisa login dengan password baru. Jika memakai bootstrap lama `INITIAL_PASSWORD_HASH`, hapus juga secret itu setelah memastikan akun sudah aktif.

## Masalah umum

- **Akun awal belum diaktifkan**: pastikan Secret `INITIAL_PASSWORD` ada pada Worker yang benar, memenuhi kebijakan password, dan perubahan sudah di-deploy.
- **Layanan belum tersedia / health 503**: cek database ID, binding `DB`, dan apakah SQL sudah dijalankan di D1 cloud.
- **Database tidak ditemukan**: Worker dan D1 harus dalam akun Cloudflare yang sama.
- **Login terkunci**: tiga password salah membuat akun terkunci 10 menit. Tunggu countdown; menghapus secret tidak membuka lockout.
- **Password awal tidak lagi bekerja**: setelah penggantian pertama gunakan password baru. Secret tidak menimpa akun yang sudah ada.
- **Registrasi email Tommi ditolak**: benar; email ini dicadangkan. Gunakan formulir **Masuk**, bukan daftar.

Panduan ini menyiapkan deployment Anda; agen belum mengakses akun Cloudflare Anda, belum memverifikasi paket berbayar, dan belum melakukan deployment remote. Aplikasi belum memiliki pencarian marketplace live, reset password atau verifikasi email. Jangan menganggapnya siap produksi hanya karena deploy berhasil.
