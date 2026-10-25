# Cloudflare Worker + D1

Target aplikasi: **Reach Your Customer**. Pengguna awal: **tommi.khrisna@fluxoryid.com** (Tommi Khrisna). Ini identitas pengguna aplikasi; email tersebut tidak membuktikan kepemilikan atau autentikasi akun Cloudflare.

## Status

Worker JavaScript menggantikan backend Python untuk deployment ini. UI di `web/` disajikan melalui Workers Static Assets. D1 menyimpan akun, sesi, dan lockout; marketplace masih **demo**. Database Python lama tidak otomatis dimigrasikan. `database_id` nol dalam `wrangler.jsonc` hanyalah placeholder untuk pengujian lokal, bukan database cloud yang sudah dibuat.

## Lokal

Node.js 22+ dan Python 3.12+ untuk helper password:

```sh
npm ci
npm run db:local
npm run password -- --local
npm run dev
```

Helper meminta password tanpa menampilkannya dan menyimpan **hash**, bukan password, di `.dev.vars` yang diabaikan Git. Jika file sudah ada helper menolak menimpanya; pertahankan secret lain dan kelola perubahan dengan aman. Akun Tommi dibuat saat percobaan login pertama dengan hash secret tersebut, lalu diwajibkan mengganti password. Akun ini tidak dapat diambil alih melalui registrasi publik. Akun lain tetap dapat registrasi untuk pengujian.

## Cek paket akun dan akses D1 (read-only)

Environment ini belum memiliki sesi login/token Cloudflare. Masukkan `CLOUDFLARE_API_TOKEN` melalui pengaturan secret environment, **jangan lewat chat atau repository**. Token perlu akses membaca akun/langganan dan D1 pada akun yang dimaksud. Jika token hanya mengizinkan sebagian endpoint, pemeriksaan lain dilaporkan belum terverifikasi. Bila ada lebih dari satu akun, set variabel non-secret `CLOUDFLARE_ACCOUNT_ID` ke akun yang dipilih.

```sh
npx wrangler whoami
node scripts/check-cloudflare.mjs
```

Script hanya membaca daftar akun, `/accounts/{id}/subscriptions` dan daftar D1. Tidak membeli paket atau membuat resource. D1 tersedia pada paket Workers Free maupun Paid dengan kuota berbeda. Paket berbayar DNS/domain atau produk lain tidak membuktikan Workers Paid. Token tanpa izin billing juga tidak membuktikan akun gratis. Konfirmasi di dashboard **Workers & Pages → Plans** dan **Storage & Databases → D1**; UI Cloudflare dapat berubah. Referensi: https://developers.cloudflare.com/d1/platform/pricing/ . Tarif/kuota aktual belum diverifikasi pada sesi ini.

## Deploy ke akun Anda

Akses yang dibutuhkan untuk deployment: Workers Scripts Edit dan D1 Edit pada akun tujuan; jangan menambahkan izin billing write. Gunakan token terbatas pada akun tersebut atau jalankan `npx wrangler login` di terminal pribadi Anda. Untuk pemeriksaan status langganan, token juga perlu izin baca yang sesuai pada endpoint langganan.

1. Jalankan `npm ci`, `npm test`, dan `npm run build`.
2. Setelah akun tujuan dikonfirmasi, buat database: `npx wrangler d1 create ryc-db`. Jika database bernama sama sudah ada, gunakan yang sudah ada setelah memastikan tujuannya. Salin `database_id` hasil Cloudflare ke binding `DB` di `wrangler.jsonc`; jangan gunakan ID nol untuk remote.
3. Jalankan `npm run db:remote` untuk menerapkan migrasi ke database yang dipilih. Migrasi awal hanya menambah tabel/index, tidak menghapus data.
4. Jalankan `npm run deploy`. Saat ini akun awal akan menolak login dengan pesan belum diaktifkan sampai secret diset.
5. Jalankan `npm run password` untuk mengisi secret Worker `INITIAL_PASSWORD_HASH` melalui prompt lokal yang aman. Password tidak dikirim lewat argumen command line dan tidak dicetak. `INITIAL_PASSWORD_HASH` adalah secret **Worker**, berbeda dari token API environment.
6. Buka URL HTTPS yang benar-benar diberikan Wrangler. Cek `/api/health`: `status: ok`, `runtime: cloudflare-workers`, `data_source: demo`. Masuk dengan email Tommi dan password yang Anda atur, lalu ganti password. Pastikan pencarian dan pagination bekerja.
7. Setelah akun awal berhasil dibuat dan password diganti, hapus bootstrap hash: `npx wrangler secret delete INITIAL_PASSWORD_HASH`. Akun yang sudah tersimpan di D1 tidak bergantung lagi pada secret ini. Tidak ada endpoint reset password otomatis.

Tidak perlu atau boleh menulis password/API token di `wrangler.jsonc`. Secret bootstrap tidak menimpa password akun yang sudah ada. Kehilangan D1 berarti kehilangan akun; jangan menghapus database untuk sekadar mereset password.

## Validasi dan batasan

```sh
npm test
npm run build
```

Pengujian menggunakan workerd/Miniflare dan D1 sementara: bootstrap akun, larangan registrasi email pemilik, kebijakan password, cookie Secure/HttpOnly, kewajiban ganti password, lockout pada permintaan paralel, filter dan pagination, logout, serta penolakan origin lain. Migrasi lokal dan static assets juga diuji melalui Wrangler lokal. Ini bukan bukti deployment remote atau status langganan akun Anda.

Password Worker memakai Web Crypto PBKDF2-SHA256 dengan 100.000 iterasi (batas runtime Workers) dan salt acak 256-bit; tidak kompatibel dengan hash scrypt server Python. Untuk kebutuhan risiko tinggi gunakan penyedia identitas terkelola atau tinjau kebijakan hash sebelum produksi. Registrasi masih publik, verifikasi email/Turnstile dan pembatasan abuse berbasis IP belum diterapkan. Tidak ada data marketplace live. Tidak ada pembelian atau upgrade otomatis.

## Rollback

Simpan ID versi dari deployment sukses. Jika login atau `/api/health` gagal setelah perubahan kode, gunakan `npx wrangler rollback <VERSION_ID>` untuk versi sehat sebelumnya, lalu cek kembali login dan pencarian. Jangan menghapus D1 saat rollback kode. Migrasi awal bersifat aditif; rollback Worker tidak mengembalikan isi database. Backup/export D1 sebelum migrasi lanjutan yang mengubah data. Deployment remote dan rollback belum dijalankan dalam sesi ini karena akses akun belum tersedia.
