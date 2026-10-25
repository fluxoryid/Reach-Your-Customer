"""Prompt securely; only a derived hash is sent to wrangler, never the password."""
import getpass,hashlib,re,secrets,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
local='--local' in sys.argv
p=getpass.getpass('Password awal untuk tommi.khrisna@fluxoryid.com: ')
if not (12<=len(p)<=256 and all(re.search(x,p) for x in [r'[A-Z]',r'[a-z]',r'[0-9]',r'[^A-Za-z0-9\s]'])):
 sys.exit('Gunakan 12–256 karakter dengan kapital, kecil, angka, dan simbol.')
if p!=getpass.getpass('Konfirmasi password awal: '):sys.exit('Konfirmasi berbeda.')
salt=secrets.token_hex(32)
derived=hashlib.pbkdf2_hmac('sha256',p.encode(),salt.encode(),100000).hex()
value=f'pbkdf2-sha256$100000${salt}${derived}'
if local:
 path=root/'.dev.vars'
 # Exclusive create preserves existing local secrets; do not overwrite blindly.
 with path.open('x') as f:f.write('INITIAL_PASSWORD_HASH="'+value+'"\n')
 path.chmod(0o600)
 print('Hash disimpan ke .dev.vars yang diabaikan Git. Jalankan npm run dev.')
else:
 subprocess.run([str(root/'node_modules/.bin/wrangler'),'secret','put','INITIAL_PASSWORD_HASH'],input=value+'\n',text=True,cwd=root,check=True)
 print('Secret hash tersimpan. Password wajib diganti setelah login pertama.')
