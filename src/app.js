(()=>{
const $=id=>document.getElementById(id),S=window.SONGS,byId={};
S.forEach(s=>byId[s.youtubeId]=s);
const ym=$('ym'),pa=$('pa'),hero=$('hero'),ctl=$('ctl'),box=$('ytbox'),pp=$('pp'),pv=$('pv'),nx=$('nx'),sb=$('sb'),ti=$('ti'),ar=$('ar'),cu=$('cu'),du=$('du');
if(matchMedia('(display-mode:standalone)').matches||navigator.standalone)document.documentElement.classList.add('app');
const fmt=s=>{s=s|0;return(s/60|0)+':'+String(s%60).padStart(2,'0')};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const F=S.find(s=>s.featured)||S[0],order=()=>[F.youtubeId].concat(shuffle(S.filter(s=>s!==F)).map(s=>s.youtubeId));
ym.href='https://music.youtube.com/watch?v='+F.youtubeId;
pa.href='https://www.youtube.com/watch_videos?video_ids='+order().join(',');
[ym,pa].forEach(a=>a.addEventListener('click',()=>{if(P&&ready)P.pauseVideo()}));
let ids,P,ready,timer,errs=0,drag=0,warmed=0,booting=0,vis=1;

function warm(){
if(warmed)return;warmed=1;
const l=document.createElement('link');l.rel='preconnect';l.href='https://www.youtube.com';document.head.appendChild(l);
}
['pointerenter','focus','touchstart'].forEach(e=>pp.addEventListener(e,warm,{passive:true,once:true}));

function boot(){
if(booting)return;
if(!navigator.onLine){ti.textContent='इन्टरनेट छैन — गीतका लागि अनलाइन हुनुहोस्';ar.textContent='You are offline';return}
booting=1;
box.hidden=false;ctl.classList.add('ld');ti.textContent='लोड हुँदैछ…';
const s=document.createElement('script');
s.src='https://www.youtube.com/iframe_api';
s.onerror=()=>{booting=0;ctl.classList.remove('ld');ti.textContent='YouTube लोड भएन — फेरि थिच्नुहोस्'};
window.onYouTubeIframeAPIReady=()=>{
ids=order();const vars={playsinline:1,controls:0,rel:0,disablekb:1,fs:0,iv_load_policy:3};
if(location.protocol.startsWith('http'))vars.origin=location.origin;
P=new YT.Player('yt',{width:'100%',height:'100%',videoId:ids[0],playerVars:vars,events:{
onReady:e=>{ready=1;e.target.loadPlaylist(ids,0,0);e.target.setLoop(true);
setTimeout(()=>{if(P.getPlayerState()!==1){ctl.classList.remove('ld','on');ti.textContent='प्ले थिच्नुहोस्'}},5000)},
onStateChange:onState,
onError:onError}});
};
document.head.appendChild(s);
}

function meta(){
const v=P.getVideoData&&P.getVideoData(),s=v&&byId[v.video_id];
if(s){ym.href='https://music.youtube.com/watch?v='+s.youtubeId;ti.textContent=s.title;ar.textContent=s.artist;
if('mediaSession'in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:s.title,artist:s.artist,album:'जुना नेपाली गीत'})}
const d=P.getDuration();if(d){sb.max=d;du.textContent=fmt(d)}
}
function upd(){
if(drag||!ready)return;
const t=P.getCurrentTime(),d=P.getDuration();
if(d&&+sb.max!==(d|0))sb.max=d,du.textContent=fmt(d);
sb.value=t;cu.textContent=fmt(t);sb.style.setProperty('--p',(d?t/d*100:0)+'%');
}
let wl,keep=true;
try{keep=localStorage.getItem('jng-wk')!=='0'}catch(e){}
const wk=$('wk'),can='wakeLock'in navigator;
function wkUI(){
wk.textContent=!can?'Keep screen on: not available':'Keep screen on: '+(keep?(wl?'On (active)':'On'):'Off');
wk.setAttribute('aria-pressed',String(can&&keep));
}
async function lock(){
if(wl||!keep||!can||document.hidden)return;
try{wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null;wkUI()});wkUI()}catch(e){wl=null}
}
function unlock(){if(wl){wl.release().catch(()=>{});wl=null;wkUI()}}
wk.onclick=()=>{
if(!can)return say('Keeping the screen on needs a secure (https) page and a recent browser. On iPhone, use Safari on iOS 16.4 or newer.');
keep=!keep;
try{localStorage.setItem('jng-wk',keep?'1':'0')}catch(e){}
if(!keep)unlock();else if(P&&ready){const st=P.getPlayerState();if(st===1||st===3)lock()}
wkUI();
};
wkUI();
function run(){stop();if(!document.hidden)timer=setInterval(upd,500)}
function stop(){clearInterval(timer);timer=0}

function onState(e){
const d=e.data;
ctl.classList.toggle('on',d===1||d===3);
pp.setAttribute('aria-label',d===1||d===3?'Pause':'Play');
if(d===1){errs=0;ctl.classList.remove('ld');sb.disabled=false;meta();upd();run()}
else if(d===2||d===5)stop();
if(d===1||d===3)lock();else if(d===2||d===5)unlock();
}
function onError(){
if(++errs>=S.length){ti.textContent='गीत बजाउन सकिएन';ar.textContent='Please try again later';return}
setTimeout(()=>P.nextVideo(),300);
}

pp.onclick=()=>{
if(!P)return boot();
if(!ready)return;
const s=P.getPlayerState();
s===1||s===3?P.pauseVideo():P.playVideo();
};
nx.onclick=()=>{if(!P)boot();else if(ready)P.nextVideo()};
$('pick').onclick=()=>{
if(!P)return boot();
if(ready){ids=order();P.loadPlaylist(ids,0,0);P.setLoop(true)}
};
$('yc').onclick=()=>box.classList.add('open');
$('yx').onclick=()=>box.classList.remove('open');
pv.onclick=()=>{if(!P)boot();else if(ready)P.previousVideo()};
sb.oninput=()=>{drag=1;cu.textContent=fmt(sb.value)};
sb.onchange=()=>{if(ready)P.seekTo(+sb.value,true);drag=0;setTimeout(upd,200)};

function visits(){
const h=location.hostname;
if(h==='localhost'||/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)||h.includes('--'))return;   // dev servers and Netlify previews (pr-1--site.netlify.app) must not change the live count
let seen;try{seen=localStorage.getItem('jng')}catch(e){}
fetch('https://abacus.jasoncameron.dev/'+(seen?'get':'hit')+'/juna-nepali-geet-50e43ef65a/visitors').then(r=>r.ok?r.json():Promise.reject()).then(d=>{
$('vn').textContent=(+d.value).toLocaleString('en-IN');$('vl').textContent=+d.value===1?' visitor':' visitors';$('vc').hidden=false;
if(!seen)try{localStorage.setItem('jng','1')}catch(e){}
}).catch(()=>{});
}
addEventListener('load',()=>setTimeout(visits,1200));

let dip=window.dip;
const ua=navigator.userAgent,ios=/iphone|ipad|ipod/i.test(ua)||(/macintosh/i.test(ua)&&navigator.maxTouchPoints>1),app=matchMedia('(display-mode:standalone)').matches||navigator.standalone,tip=$('tip');
let tt;
function say(t){$('tt').textContent=t;tip.hidden=false;clearTimeout(tt);tt=setTimeout(()=>{tip.hidden=true},Math.max(7000,t.length*90))}
function how(){
if(ios)return'On iPhone or iPad: open this page in Safari, tap the Share button, then choose Add to Home Screen.';
if(/android/i.test(ua))return'Open the browser menu (three dots) and tap Install app or Add to Home screen. If you already installed it, open it from your app list.';
if(/firefox/i.test(ua))return'Firefox on desktop cannot install web apps. Open this page in Chrome or Edge, or use Firefox on Android.';
if(/safari/i.test(ua)&&!/chrome|chromium|edg/i.test(ua))return'In Safari on Mac, choose File, then Add to Dock.';
return'Click the install icon at the right end of the address bar, or open the browser menu and choose Install. If you already installed it, open it from your apps.';
}
if(!app)$('ins').hidden=false;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dip=e});
addEventListener('appinstalled',()=>{dip=null;$('ins').hidden=true;say('Installed! Find "90s Nepali" on your home screen or app list. It opens full-screen, and the app itself works offline.')});
$('tx').onclick=()=>{tip.hidden=true;clearTimeout(tt)};
$('ins').onclick=async()=>{
if(!dip)return say(how());
const d=dip;dip=null;window.dip=null;
d.prompt();
const c=await d.userChoice;
if(c.outcome==='accepted'){$('ins').hidden=true;say('Installing... Find "90s Nepali" on your home screen or app list. It opens full-screen.')}
else say('No problem. Tap Install app any time to save it on your device.');
};
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

if('mediaSession'in navigator){
const m=navigator.mediaSession;
m.setActionHandler('play',()=>pp.onclick());
m.setActionHandler('pause',()=>pp.onclick());
m.setActionHandler('nexttrack',()=>nx.onclick());
m.setActionHandler('previoustrack',()=>pv.onclick());
}

const nep=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kathmandu',hour:'numeric',minute:'numeric',second:'numeric',hour12:false});
const rot=(id,a)=>$(id).setAttribute('transform','rotate('+a+' 24 24)');
let clk;
function clock(){
const p=nep.formatToParts(new Date()),g=t=>+p.find(x=>x.type===t).value,h=g('hour')%24,m=g('minute'),c=g('second');
rot('hh',(h%12+m/60)*30);rot('mh',(m+c/60)*6);rot('sh',c*6);
$('dg').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function sync(){
hero.classList.toggle('z',document.hidden||!vis);
clock();clearInterval(clk);if(!document.hidden&&vis)clk=setInterval(clock,1000);
if(P&&ready){const s=P.getPlayerState();if(!document.hidden&&(s===1||s===3)){run();lock()}else if(document.hidden)stop()}
}
new IntersectionObserver(([e])=>{vis=e.isIntersecting;sync()}).observe(hero);
document.addEventListener('visibilitychange',sync);
sync();

if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
const L=[...hero.querySelectorAll('[data-d]')];
let x=0,y=0,raf=0;
const paint=()=>{raf=0;const sc=Math.min(scrollY/innerHeight,1);
L.forEach(l=>{const d=+l.dataset.d;l.style.transform=`translate(${-x*d}px,${-y*d/2+sc*(30-d)*1.2}px)`})};
const go=()=>raf||(raf=requestAnimationFrame(paint));
hero.addEventListener('pointermove',e=>{x=e.clientX/innerWidth-.5;y=e.clientY/innerHeight-.5;go()},{passive:true});
addEventListener('scroll',go,{passive:true});
}
})();
