"""Optional browser smoke test: requires Playwright and system Chromium."""
import os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
 env=dict(os.environ,RYC_DB=d+'/browser.db',PORT='3001')
 proc=subprocess.Popen(['python3',str(root/'server.py')],env=env,stdout=subprocess.DEVNULL)
 try:
  for _ in range(50):
   try: urllib.request.urlopen('http://127.0.0.1:3001/api/health');break
   except OSError:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   page=b.new_page(viewport={'width':1440,'height':1100});errors=[]
   page.on('pageerror',lambda e: errors.append(str(e)))
   page.goto('http://127.0.0.1:3001')
   page.get_by_role('button',name='Daftar sekarang').click()
   page.get_by_label('Nama lengkap').fill('Pemilik Usaha')
   page.get_by_label('Alamat email').fill('browser@example.com')
   page.get_by_label('Password',exact=True).fill('OriginalPass!123')
   page.get_by_label('Konfirmasi password').fill('OriginalPass!123')
   page.get_by_role('button',name='Buat akun').click()
   page.get_by_role('heading',name='Selamat datang kembali').wait_for()
   page.get_by_label('Alamat email').fill('browser@example.com')
   page.get_by_label('Password',exact=True).fill('OriginalPass!123')
   page.get_by_role('button',name='Masuk ke workspace').click()
   page.get_by_label('Password baru').fill('NewSecurePass!123')
   page.get_by_label('Konfirmasi password').fill('NewSecurePass!123')
   page.get_by_role('button',name='Simpan password').click()
   page.get_by_role('button',name='Tampilkan penjual').click()
   assert page.get_by_text('Pilih minimal satu kategori terlebih dahulu.').is_visible()
   page.get_by_role('button',name='Pilih semua kategori').click()
   page.get_by_role('button',name='Tampilkan penjual').click()
   page.wait_for_selector('.seller-card'); assert page.locator('.seller-card').count()==50
   page.get_by_role('button',name='Berikutnya').click();page.wait_for_function("document.querySelector('.pagination')?.textContent.includes('51–100')")
   page.get_by_role('button',name='Lihat detail penjual').first.click();assert page.get_by_role('dialog').is_visible()
   page.get_by_role('button',name='Tutup detail').click()
   page.screenshot(path='/tmp/ryc-desktop.png',full_page=True)
   page.get_by_label('Cari nama atau kota').fill('not-found-xyz');page.get_by_role('button',name='Cari',exact=True).click()
   page.get_by_role('heading',name='Belum ada penjual yang cocok').wait_for()
   page.set_viewport_size({'width':390,'height':844})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
   page.screenshot(path='/tmp/ryc-mobile.png',full_page=True)
   page.get_by_role('button',name='Keluar',exact=True).click()
   page.get_by_role('button',name='Masuk ke workspace').wait_for()
   assert not errors,errors
   b.close();print('PASS: registration, first password change, required category, 50-item pagination, details, empty search, mobile overflow, logout; no JS errors')
 finally:proc.terminate();proc.wait()
