import hashlib, hmac, json, os, re, secrets, sqlite3, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlsplit, parse_qs
from pathlib import Path

ROOT = Path(__file__).parent
DB = os.environ.get('RYC_DB', str(ROOT / '.local/app.db'))
CATEGORIES = ['Baju Anak-Anak', 'Baju Bayi', 'Perlengkapan Anak-Anak', 'Perlengkapan Bayi', 'Baju Muslim', 'Baju Pria', 'Baju Wanita', 'Alat Kecantikan', 'Accessories Wanita']

def connect():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    return c

def init():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, first_login INTEGER DEFAULT 1, failures INTEGER DEFAULT 0, locked_until REAL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, email TEXT NOT NULL, expires REAL NOT NULL);''')

def password_hash(value, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(value.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()

def valid_password(p):
    return isinstance(p, str) and 12 <= len(p) <= 256 and all(re.search(x, p) for x in [r'[A-Z]', r'[a-z]', r'[0-9]', r'[^A-Za-z0-9\s]'])

def sellers(categories, query='', sort='rating'):
    # Deliberately synthetic fixtures; never represent these as live marketplace data.
    cities = ['Bandung', 'Jakarta', 'Surabaya', 'Yogyakarta', 'Semarang', 'Tangerang']
    brands = ['Nusa', 'Ruang', 'Loka', 'Kirana', 'Sora', 'Aruna', 'Bumi', 'Senja']
    rows=[]
    for cat in categories:
        k=CATEGORIES.index(cat)
        for i in range(57):
            rating=[5.0,4.9,4.8][i%3]; reviews=320+i*37
            if rating < 4.9 or reviews < 500: continue
            ident=k*100+i
            rows.append(dict(id=ident,name=f'{brands[i%8]} {cat} {i+1:02}', category=cat,city=cities[i%6],rating=rating,reviews=reviews,marketplace=['Tokopedia','Shopee'][i%2],email=None,phone=None,shipping=['JNE','J&T','SiCepat'],catalog=[dict(name=f'{cat} · Koleksi {j+1}',price=45000+((ident+j)%12)*17500,photo=None) for j in range(3)]))
    rows=[r for r in rows if query.lower() in (r['name']+' '+r['city']).lower()]
    return sorted(rows,key=lambda r:(-r['reviews'] if sort=='reviews' else -r['rating'],r['id']))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT/'web'),**kw)
    def log_message(self,fmt,*args): pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        super().end_headers()
    def send_json(self,data,status=200,cookie=None):
        b=json.dumps(data).encode(); self.send_response(status)
        self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
        if cookie: self.send_header('Set-Cookie',cookie)
        self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def user(self):
        cookie=SimpleCookie()
        try: cookie.load(self.headers.get('Cookie',''))
        except Exception: return None
        token=cookie.get('ryc_session')
        if not token: return None
        with connect() as c:
            return c.execute('SELECT users.* FROM users JOIN sessions USING(email) WHERE token=? AND expires>?',(hashlib.sha256(token.value.encode()).hexdigest(),time.time())).fetchone()
    def do_GET(self):
        p=urlsplit(self.path)
        if not p.path.startswith('/api/'): return super().do_GET()
        if p.path=='/api/health': return self.send_json({'status':'ok','data_source':'demo'})
        if p.path=='/api/categories': return self.send_json({'categories':CATEGORIES})
        u=self.user()
        if not u: return self.send_json({'error':'Silakan masuk terlebih dahulu.'},401)
        if p.path=='/api/me': return self.send_json({'name':u['name'],'email':u['email'],'first_login':bool(u['first_login'])})
        if u['first_login']: return self.send_json({'error':'Ganti password sebelum melanjutkan.'},403)
        if p.path=='/api/sellers':
            q=parse_qs(p.query); cats=q.get('category',[])
            if not cats or any(x not in CATEGORIES for x in cats): return self.send_json({'error':'Pilih minimal satu kategori yang valid.'},400)
            try: page=max(1,int(q.get('page',['1'])[0]))
            except ValueError: return self.send_json({'error':'Halaman tidak valid.'},400)
            rows=sellers(cats,q.get('q',[''])[0],q.get('sort',['rating'])[0]); total=len(rows)
            return self.send_json({'items':rows[(page-1)*50:page*50],'total':total,'page':page,'page_size':50,'source':'demo'})
        self.send_json({'error':'Tidak ditemukan.'},404)
    def do_POST(self):
        # Same-origin JSON requests only; browsers cannot submit cross-origin forms.
        if self.headers.get('Sec-Fetch-Site')=='cross-site' or self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.send_json({'error':'Permintaan tidak diizinkan.'},403)
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'): return self.send_json({'error':'Origin tidak diizinkan.'},403)
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=8192: raise ValueError()
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict): raise ValueError()
        except (ValueError,TypeError): return self.send_json({'error':'Data tidak valid.'},400)
        path=urlsplit(self.path).path
        if path in ['/api/register','/api/login']:
            email=data.get('email',''); pw=data.get('password',''); name=data.get('name','')
            if not isinstance(email,str) or not isinstance(pw,str) or len(pw)>256 or len(email)>254: return self.send_json({'error':'Data login tidak valid.'},400)
            email=email.strip().lower()
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): return self.send_json({'error':'Masukkan alamat email yang valid.'},400)
            with connect() as c:
                c.execute('BEGIN IMMEDIATE')
                u=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                if path=='/api/register':
                    if not isinstance(name,str) or not name.strip() or len(name)>100 or not valid_password(pw): return self.send_json({'error':'Isi nama dan gunakan password minimal 12 karakter: kapital, kecil, angka, dan simbol.'},400)
                    if u: return self.send_json({'error':'Email sudah terdaftar. Silakan masuk.'},409)
                    c.execute('INSERT INTO users(email,name,password) VALUES(?,?,?)',(email,name.strip(),password_hash(pw)))
                    return self.send_json({'message':'Registrasi berhasil. Silakan masuk.'},201)
                if not u: return self.send_json({'error':'Email belum terdaftar. Silakan registrasi.','register':True},404)
                now=time.time()
                if u['locked_until']>now: return self.send_json({'error':'Login terkunci sementara.','retry_after':int(u['locked_until']-now)+1},429)
                salt=u['password'].split(':')[0]
                if not hmac.compare_digest(password_hash(pw,salt),u['password']):
                    failures=(u['failures'] if u['locked_until']==0 else 0)+1
                    wait=600 if failures>=3 else 0
                    c.execute('UPDATE users SET failures=?,locked_until=? WHERE email=?',(failures,now+wait if wait else 0,email))
                    c.commit()
                    return self.send_json({'error':'Password salah.' if not wait else 'Tiga percobaan gagal. Tunggu 10 menit.','retry_after':wait},429 if wait else 401)
                c.execute('UPDATE users SET failures=0,locked_until=0 WHERE email=?',(email,))
                c.execute('DELETE FROM sessions WHERE expires<?',(now,))
                token=secrets.token_urlsafe(32)
                c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),email,now+28800))
                secure='; Secure' if os.environ.get('RYC_COOKIE_SECURE')=='1' else ''
                return self.send_json({'first_login':bool(u['first_login'])},cookie=f'ryc_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}')
        u=self.user()
        if not u: return self.send_json({'error':'Silakan masuk.'},401)
        if path=='/api/change-password':
            pw=data.get('password','')
            if not valid_password(pw): return self.send_json({'error':'Password harus minimal 12 karakter dengan kapital, kecil, angka, dan simbol.'},400)
            if hmac.compare_digest(password_hash(pw,u['password'].split(':')[0]),u['password']): return self.send_json({'error':'Gunakan password yang berbeda dari password awal.'},400)
            with connect() as c: c.execute('UPDATE users SET password=?,first_login=0 WHERE email=?',(password_hash(pw),u['email']))
            return self.send_json({'message':'Password berhasil diperbarui.'})
        if path=='/api/logout':
            with connect() as c: c.execute('DELETE FROM sessions WHERE email=?',(u['email'],))
            return self.send_json({'message':'Berhasil keluar.'},cookie='ryc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
        self.send_json({'error':'Tidak ditemukan.'},404)

if __name__=='__main__':
    init()
    server=ThreadingHTTPServer((os.environ.get('HOST','127.0.0.1'),int(os.environ.get('PORT','3000'))),Handler)
    print('Reach Your Customer berjalan pada port',server.server_port,flush=True)
    server.serve_forever()
