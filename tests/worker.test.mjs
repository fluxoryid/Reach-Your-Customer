import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {hashPassword,verifyPassword,validPassword} from '../worker/security.js';
let mf,db;
const email='tommi.khrisna@fluxoryid.com', initial='InitialSecure!123', next='ChangedSecure!123';
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:['index.js','security.js','catalog.js'].map(name=>({type:'ESModule',path:new URL('../worker/'+name,import.meta.url).pathname})),compatibilityDate:'2026-10-25',d1Databases:['DB'],bindings:{INITIAL_USER_EMAIL:email,INITIAL_USER_NAME:'Tommi Khrisna',INITIAL_PASSWORD:initial}}));
 db=await mf.getD1Database('DB');
 for(const sql of (await readFile(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
});
after(async()=>{await mf?.dispose()});
function client(){let cookie='';return async(path,data,extra={})=>{const r=await mf.dispatchFetch('https://example.com/api/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...extra},body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json(),headers:r.headers}}}
test('password hashing, policy and verification',async()=>{assert(validPassword(initial));assert(!validPassword('weak'));const h=await hashPassword(initial);assert(!h.includes(initial));assert(await verifyPassword(initial,h));assert(!await verifyPassword('wrong',h));});
test('reserved owner cannot be registered; dashboard-secret bootstrap, password change, catalog, session revocation',async()=>{
 const c=client();assert.equal((await c('health')).body.status,'ok');assert.equal((await c('me')).status,401);
 assert.equal((await c('register',{email,name:'Imposter',password:initial})).status,403);
 const login=await c('login',{email,password:initial});assert.equal(login.status,200);assert(login.body.first_login);const stored=await db.prepare('SELECT password FROM users WHERE email=?').bind(email).first();assert.notEqual(stored.password,initial);assert.match(stored.password,/^pbkdf2-sha256/);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(login.headers.get('set-cookie'),/Secure/);
 assert.equal((await c('sellers?category=Baju+Pria')).status,403);
 assert.equal((await c('change-password',{password:initial})).status,400);assert.equal((await c('change-password',{password:'weak'})).status,400);
 assert.equal((await c('change-password',{password:next})).status,200);assert.equal((await c('me')).body.first_login,false);
 assert.equal((await c('sellers')).status,400);assert.equal((await c('sellers?category=Bad')).status,400);
 const query='sellers?category=Baju+Pria&category=Baju+Wanita';const a=await c(query),b=await c(query+'&page=2');
 assert.equal(a.body.items.length,50);assert(b.body.items.length>0);assert(!a.body.items.some(x=>b.body.items.some(y=>x.id===y.id)));assert(a.body.items.every(x=>x.rating>=4.9&&x.reviews>=500));
 assert.equal((await c(query+'&q=zzzz')).body.total,0);assert.equal((await c(query+'&page=abc')).status,400);
 assert.equal((await c('logout',{})).status,200);assert.equal((await c('me')).status,401);
 assert.equal((await c('login',{email,password:initial})).status,401);assert.equal((await c('login',{email,password:next})).status,200);
});
test('public registration, atomic lockout and expiration',async()=>{
 const c=client(),email='new@example.com';assert.equal((await c('register',{email,name:'Test',password:initial})).status,201);
 assert.equal((await c('register',{email,name:'Test',password:initial})).status,409);
 const failures=await Promise.all([1,2,3].map(()=>c('login',{email,password:'wrong'})));
 assert(failures.some(r=>r.status===429));const locked=await c('login',{email,password:initial});assert.equal(locked.status,429);assert(locked.body.retry_after>=599);
 await db.prepare('UPDATE users SET locked_until=1 WHERE email=?').bind(email).run();assert.equal((await c('login',{email,password:initial})).status,200);
});
test('rejects cross-origin mutations and invalid JSON, unknown account directs registration',async()=>{
 const c=client();assert.equal((await c('login',{email,password:initial},{Origin:'https://evil.example'})).status,403);
 assert.equal((await c('login',{email,password:initial},{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await c('register',{email:'bad',name:'Test',password:initial})).status,400);
 assert.equal((await c('login',{email:'missing@example.com',password:initial})).body.register,true);
 const r=await mf.dispatchFetch('https://example.com/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(r.status,400);
});
