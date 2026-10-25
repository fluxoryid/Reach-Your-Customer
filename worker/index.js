import {randomToken,digest,validPassword,hashPassword,verifyPassword,validHash} from './security.js';
import {CATEGORIES,findSellers} from './catalog.js';
const sessionLifetime=8*60*60;
const headers={
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'same-origin',
 'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function json(body,status=200,extra={}) { return Response.json(body,{status,headers:{...headers,...extra}}); }
function cookie(token,request,age=sessionLifetime) {
 return `ryc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
function getToken(request){return request.headers.get('Cookie')?.match(/(?:^|;\s*)ryc_session=([a-f0-9]{64})(?:;|$)/)?.[1];}
async function currentUser(request,db){
 const token=getToken(request); if(!token)return null;
 return db.prepare('SELECT u.*, s.token AS session_token FROM users u JOIN sessions s ON s.email=u.email WHERE s.token=? AND s.expires>?').bind(await digest(token),Math.floor(Date.now()/1000)).first();
}
async function api(request,env){
 const url=new URL(request.url),path=url.pathname,now=Math.floor(Date.now()/1000);
 if(request.method==='GET' && path==='/api/health'){
  if(!env.DB)return json({status:'not_ready',error:'Binding database D1 belum tersedia.'},503);
  await env.DB.prepare('SELECT email FROM users LIMIT 1').first();
  return json({status:'ok',data_source:'demo',runtime:'cloudflare-workers'});
 }
 if(request.method==='GET' && path==='/api/categories')return json({categories:CATEGORIES});
 if(!env.DB)return json({error:'Binding D1 belum dikonfigurasi.'},503);
 if(request.method==='GET'){
  const u=await currentUser(request,env.DB);
  if(!u)return json({error:'Silakan masuk terlebih dahulu.'},401);
  if(path==='/api/me')return json({name:u.name,email:u.email,first_login:!!u.first_login});
  if(u.first_login)return json({error:'Ganti password sebelum melanjutkan.'},403);
  if(path==='/api/sellers'){
   const categories=[...new Set(url.searchParams.getAll('category'))];
   if(!categories.length||categories.some(x=>!CATEGORIES.includes(x)))return json({error:'Pilih minimal satu kategori yang valid.'},400);
   const page=Number(url.searchParams.get('page')||1),query=url.searchParams.get('q')||'',sort=url.searchParams.get('sort')||'rating';
   if(!Number.isSafeInteger(page)||page<1||query.length>200||!['rating','reviews'].includes(sort))return json({error:'Parameter pencarian tidak valid.'},400);
   const rows=findSellers(categories,query,sort);
   return json({items:rows.slice((page-1)*50,page*50),total:rows.length,page,page_size:50,source:'demo'});
  }
  return json({error:'Tidak ditemukan.'},404);
 }
 if(request.method!=='POST')return json({error:'Metode tidak diizinkan.'},405,{Allow:'GET, POST'});
 const origin=request.headers.get('Origin');
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==url.origin)||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Permintaan tidak diizinkan.'},403);
 // Bound actual streamed bytes too; Content-Length alone is not trusted.
 const reader=request.body?.getReader();if(!reader)return json({error:'Data tidak valid.'},400);
 let data,bytes=0,chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return json({error:'Data terlalu besar.'},413);}chunks.push(value);}
 try{const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}data=JSON.parse(new TextDecoder().decode(body));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();}
 catch{return json({error:'Data tidak valid.'},400);}
 if(['/api/register','/api/login'].includes(path)){
  if(typeof data.email!=='string'||data.email.length>254||typeof data.password!=='string'||data.password.length>256)return json({error:'Data login tidak valid.'},400);
  const email=data.email.trim().toLowerCase(),password=data.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Masukkan alamat email yang valid.'},400);
  const initialEmail=(env.INITIAL_USER_EMAIL||'').trim().toLowerCase();
  let u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if(path==='/api/register'){
   // Reserved owner identity cannot be claimed through public registration.
   if(email===initialEmail)return json({error:'Akun ini disiapkan oleh pengelola. Gunakan password awal yang diatur melalui secret Cloudflare.'},403);
   if(typeof data.name!=='string'||!data.name.trim()||data.name.length>100||!validPassword(password))return json({error:'Isi nama dan gunakan password minimal 12 karakter: kapital, kecil, angka, dan simbol.'},400);
   if(u)return json({error:'Email sudah terdaftar. Silakan masuk.'},409);
   const result=await env.DB.prepare('INSERT OR IGNORE INTO users(email,name,password) VALUES(?,?,?)').bind(email,data.name.trim(),await hashPassword(password)).run();
   return result.meta.changes?json({message:'Registrasi berhasil. Silakan masuk.'},201):json({error:'Email sudah terdaftar. Silakan masuk.'},409);
  }
  if(!u&&email===initialEmail){
   // Dashboard-only setup: the initial password is a Worker Secret, never a public var.
   // Persist only its salted hash in D1; existing accounts are never overwritten.
   let initialHash=env.INITIAL_PASSWORD_HASH;
   if(!validHash(initialHash)) {
    if(!validPassword(env.INITIAL_PASSWORD))return json({error:'Akun awal belum diaktifkan. Atur secret INITIAL_PASSWORD di Cloudflare dengan minimal 12 karakter: kapital, kecil, angka, dan simbol.'},503);
    initialHash=await hashPassword(env.INITIAL_PASSWORD);
   }
   await env.DB.prepare('INSERT OR IGNORE INTO users(email,name,password) VALUES(?,?,?)').bind(email,env.INITIAL_USER_NAME||'Tommi Khrisna',initialHash).run();
   u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  }
  if(!u)return json({error:'Email belum terdaftar. Silakan registrasi.',register:true},404);
  if(u.locked_until>now)return json({error:'Login terkunci sementara.',retry_after:u.locked_until-now},429);
  if(!await verifyPassword(password,u.password)){
   // Atomic SQL prevents lost updates when concurrent failures arrive at different Workers.
   const state=await env.DB.prepare(`UPDATE users SET
    failures=CASE WHEN locked_until>0 AND locked_until<=? THEN 1 ELSE failures+1 END,
    locked_until=CASE WHEN locked_until>? THEN locked_until WHEN locked_until>0 THEN 0 WHEN failures+1>=3 THEN ? ELSE 0 END
    WHERE email=? AND password=? RETURNING failures,locked_until`).bind(now,now,now+600,email,u.password).first();
   const wait=state?Math.max(0,state.locked_until-now):0;
   return json({error:wait?'Tiga percobaan gagal. Tunggu 10 menit.':'Password salah.',retry_after:wait},wait?429:401);
  }
  const token=randomToken();
  // Recheck the lock and password atomically after the potentially slow password verification.
  const inserted=await env.DB.prepare(`INSERT INTO sessions(token,email,expires) SELECT ?,email,? FROM users WHERE email=? AND password=? AND locked_until<=? RETURNING token`).bind(await digest(token),now+sessionLifetime,email,u.password,now).first();
  if(!inserted)return json({error:'Status akun berubah. Silakan coba lagi.'},409);
  await env.DB.prepare('UPDATE users SET failures=0,locked_until=0 WHERE email=? AND locked_until<=? AND password=?').bind(email,now,u.password).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(now).run();
  return json({first_login:!!u.first_login},200,{'Set-Cookie':cookie(token,request)});
 }
 const u=await currentUser(request,env.DB);if(!u)return json({error:'Silakan masuk.'},401);
 if(path==='/api/change-password'){
  if(!validPassword(data.password))return json({error:'Password harus minimal 12 karakter dengan kapital, kecil, angka, dan simbol.'},400);
  if(await verifyPassword(data.password,u.password))return json({error:'Gunakan password yang berbeda dari password awal.'},400);
  const hash=await hashPassword(data.password);
  const changed=await env.DB.prepare('UPDATE users SET password=?,first_login=0 WHERE email=? AND password=? RETURNING email').bind(hash,u.email,u.password).first();
  if(!changed)return json({error:'Status akun berubah. Silakan masuk kembali.'},409);
  await env.DB.prepare('DELETE FROM sessions WHERE email=? AND token<>?').bind(u.email,u.session_token).run();
  return json({message:'Password berhasil diperbarui.'});
 }
 if(path==='/api/logout'){
  await env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(u.email).run();
  return json({message:'Berhasil keluar.'},200,{'Set-Cookie':cookie('',request,0)});
 }
 return json({error:'Tidak ditemukan.'},404);
}
export default {
 async fetch(request,env){
  try{
   if(new URL(request.url).pathname.startsWith('/api/'))return await api(request,env);
   const asset=await env.ASSETS.fetch(request);
   const response=new Response(asset.body,asset);
   for(const [k,v] of Object.entries(headers))if(k!=='Cache-Control')response.headers.set(k,v);
   return response;
  }catch(error){
   // Never log request bodies, cookies, passwords, or database exception text.
   console.error('Request failed',error?.name||'Error');
   return json({error:'Layanan belum tersedia. Periksa binding D1 dan migrasi database.'},503);
  }
 }
};
