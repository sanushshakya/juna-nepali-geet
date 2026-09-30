const C='{{CACHE}}',F={{FILES}},FONTS='jng-fonts';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C&&n!==FONTS).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
const r=e.request,u=new URL(r.url);
if(r.method!=='GET')return;
if(r.mode==='navigate'){e.respondWith(caches.match('./').then(m=>m||fetch(r)));return}
if(u.origin===location.origin){e.respondWith(caches.match(r).then(m=>m||fetch(r)));return}
if(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com'){
e.respondWith(caches.open(FONTS).then(c=>c.match(r).then(m=>{
const n=fetch(r).then(x=>{if(x.ok)c.put(r,x.clone());return x}).catch(()=>m);
return m||n;
})));
}
});
