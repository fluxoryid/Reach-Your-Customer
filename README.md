# Reach Your Customer

Website Bahasa Indonesia berdasarkan `Process Flow.xlsx` (sheet Process Flow, A1:B19).

## Jalankan

Memerlukan Python 3.12+; tidak ada dependency tambahan.

```sh
cd /workspace/Reach-Your-Customer
python3 server.py
```

Port default 3000, bind default 127.0.0.1. Override `PORT` dan `HOST` bila diperlukan. Database SQLite dibuat otomatis di `.local/app.db` (diabaikan Git). `RYC_DB` dapat menentukan lokasi database lain. Jangan commit database atau kredensial.

## Alur yang diterapkan

- Registrasi dengan nama, email unik, password minimal 12 karakter (kapital, kecil, angka, simbol).
- Email belum terdaftar diberi petunjuk registrasi.
- Login pertama memerlukan password baru yang berbeda sebelum akses pencarian diizinkan server.
- Tiga password salah berturut-turut mengunci akun 600 detik; UI menampilkan countdown. Status disimpan di SQLite sehingga restart server tidak menghapus lockout.
- Sembilan kategori persis sesuai Excel; minimal satu kategori diperlukan.
- Hasil hanya rating ≥4,9 dan ≥500 ulasan; 50 penjual per halaman. Pencarian nama/kota, urutan rating/ulasan, detail katalog dan pengiriman.
- Password menggunakan scrypt + salt; session token acak disimpan sebagai hash, cookie HttpOnly/SameSite=Strict, masa berlaku 8 jam. API mutasi menerima JSON dengan pemeriksaan origin. Tidak ada kredensial default.

## Batas versi awal

**Semua penjual, ulasan, harga, marketplace, dan pengiriman merupakan data demo sintetis**, bukan hasil pencarian internet atau klaim afiliasi marketplace. Foto ditampilkan sebagai ilustrasi; email dan telepon tidak direkayasa. Pengguna belum memiliki akses API. Integrasi data asli (Excel B18) belum dilakukan dan memerlukan API/penyedia data resmi beserta hak penggunaan data, foto, dan kontak. Adapter demo berada di fungsi `sellers` pada `server.py`.

Belum untuk produksi: belum ada verifikasi email, reset password, proteksi abuse terdistribusi, pengelolaan akun, audit operasional, atau konektor marketplace. Sebelum deployment gunakan hosting terkelola/TLS, set `RYC_COOKIE_SECURE=1`, ganti development HTTP server dengan server aplikasi produksi, dan lakukan tinjauan keamanan. Jangan mengandalkan header forwarded dari sumber tidak terpercaya.

## Validasi

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
```

Gunakan checkout yang sudah ada; task cloud sudah terisolasi sehingga tidak perlu worktree baru. Tidak ada pengiriman pesan atau permintaan data eksternal otomatis.

Uji browser opsional: `python3 tests/browser_smoke.py` memerlukan Playwright dan Chromium di `/usr/bin/chromium`. Uji menggunakan database sementara terpisah dan port 3001. Validasi awal: 3 uji integrasi lulus, perjalanan browser desktop dan viewport ponsel 390px lulus tanpa error JavaScript atau overflow horizontal.

## Cloudflare Workers

Untuk deployment Cloudflare gunakan Worker JavaScript + D1, bukan `server.py`. Lihat [CLOUDFLARE.md](CLOUDFLARE.md) untuk akun awal Tommi, setup secret password, pengecekan paket, migrasi database, dan deployment. `npm test` menguji Worker pada runtime workerd dengan database D1 sementara.

**Tanpa terminal/laptop:** ikuti [panduan Cloudflare Dashboard](CLOUDFLARE-DASHBOARD.md) untuk menghubungkan GitHub, membuat D1, dan mengatur password melalui Worker Secret.
