import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.https_proxy||process.env.http_proxy)setGlobalDispatcher(new EnvHttpProxyAgent());
// Read-only: never creates resources, changes subscriptions, or prints token values.
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){console.error('CLOUDFLARE_API_TOKEN belum tersedia. Masukkan melalui secret environment, jangan melalui chat.');process.exit(2)}
async function api(path){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
 let data;try{data=await r.json()}catch{throw new Error(`Cloudflare HTTP ${r.status}; periksa izin jaringan.`)}
 if(!r.ok||!data.success)throw new Error(`HTTP ${r.status}; kode Cloudflare ${(data.errors||[]).map(e=>e.code).join(', ')||'unknown'}. Periksa izin token untuk endpoint ini.`);
 return data.result;
}
try{
 let account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!account){const accounts=await api('/accounts?per_page=50');if(accounts.length!==1){console.log('Pilih CLOUDFLARE_ACCOUNT_ID dari akun berikut:',accounts.map(a=>({id:a.id,name:a.name})));process.exit(2)}account=accounts[0].id;}
 if(!/^[a-f0-9]{32}$/i.test(account))throw new Error('CLOUDFLARE_ACCOUNT_ID tidak valid.');
 console.log('Account ID:',account);
 // Success proves API permission for D1, not a paid Workers subscription.
 let partial=false;
 try{const dbs=await api(`/accounts/${account}/d1/database?per_page=1`);console.log('D1: API dapat diakses. Database yang ditemukan pada halaman pertama:',dbs.length)}catch(e){partial=true;console.error('D1 belum terverifikasi:',e.message)}
 try{
  const subscriptions=await api(`/accounts/${account}/subscriptions`);
  console.log('Langganan akun (tanpa detail pembayaran):',JSON.stringify(subscriptions.map(s=>({product:s.rate_plan?.public_name||s.rate_plan?.id||'unknown',service:s.rate_plan?.scope||s.name||null,state:s.state||null})),null,2));
  console.log('Periksa entri Workers secara khusus; paket berbayar domain/produk lain tidak membuktikan Workers Paid.');
 }catch(e){partial=true;console.error('Status paket belum terverifikasi:',e.message)}
 if(partial)process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=2}
