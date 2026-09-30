// Post-deploy smoke test: BASE_URL=https://your-site.netlify.app node scripts/smoke.mjs
// Checks the files a visitor (and the installed PWA) depends on, plus the cache/security headers.
const base=(process.env.BASE_URL||'').replace(/\/$/,'');
if(!base){console.error('Set BASE_URL, e.g. BASE_URL=http://localhost:8090');process.exit(2)}

const isLocal=/^https?:\/\/(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(base);   // plain dev servers do not apply dist/_headers
const errors=[];
const get=async(path,tries=3)=>{
  for(let i=1;;i++){
    try{
      const r=await fetch(base+path,{signal:AbortSignal.timeout(20000),redirect:'follow'});
      if(r.ok||i===tries)return r;
    }catch(e){if(i===tries)return{ok:false,status:'ERR '+e.message,headers:new Headers(),text:async()=>''}}
    await new Promise(x=>setTimeout(x,3000*i));   // a fresh deploy can take a few seconds to propagate
  }
};
const expect=(cond,msg)=>{console.log((cond?'PASS ':'FAIL ')+msg);if(!cond)errors.push(msg)};

const home=await get('/');
expect(home.ok,`GET / -> ${home.status}`);
const html=await home.text();
expect(html.includes('id="hero"')&&html.includes('id="pp"'),'home page contains the hero and the play button');
expect(/rel="manifest"/.test(html),'home page links the manifest');

const hashed=[...html.matchAll(/(?:src|href)="((?:app|songs)\.[0-9a-f]{8}\.js)"/g)].map(m=>m[1]);
expect(hashed.length===2,`home page references both hashed scripts (${hashed.join(', ')||'none'})`);

for(const f of [...hashed,'manifest.webmanifest','sw.js','favicon.ico','apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png']){
  const r=await get('/'+f);
  expect(r.ok,`GET /${f} -> ${r.status}`);
  if(r.ok&&!isLocal&&f==='sw.js')expect(/no-cache|no-store|max-age=0/.test(r.headers.get('cache-control')||''),'sw.js is not cached long-term (cache-control: '+r.headers.get('cache-control')+')');
  if(r.ok&&!isLocal&&hashed.includes(f))expect(/immutable/.test(r.headers.get('cache-control')||''),f+' is cached as immutable (cache-control: '+r.headers.get('cache-control')+')');
}

// Headers from dist/_headers are applied by Netlify; a plain local server will not send them.
if(!isLocal){
  expect((home.headers.get('x-content-type-options')||'')==='nosniff','x-content-type-options: nosniff');
  expect(!!home.headers.get('referrer-policy'),'referrer-policy is set (YouTube embeds need a referrer)');
  expect(base.startsWith('https://'),'site is served over HTTPS');
}else console.log('SKIP cache/security header checks on a local server (only Netlify applies dist/_headers)');

if(errors.length){console.error(`\nsmoke FAILED (${errors.length}):\n - `+errors.join('\n - '));process.exit(1)}
console.log('\nsmoke passed for '+base);
