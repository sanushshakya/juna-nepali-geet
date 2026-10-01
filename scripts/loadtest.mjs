// Moderate load test for the deployed site. Every virtual user opens its own keep-alive connections (cold TLS),
// loads the page like a browser (HTML, then JS + manifest + favicon in parallel), thinks, and repeats.
//
//   BASE_URL=https://your-site.netlify.app node scripts/loadtest.mjs
//
// Env: LEVELS="10,25,50" (users per stage, max 200)  DURATION=15 (seconds per stage, max 60)  SPIKE=100 (users at once, 0 = skip, max 300)
//      SPIKE_WINDOW=1000 (ms over which the spike users arrive)  HTTP_VERSION=2|1 (default 2 for https, like a browser: one connection per user)
//      THINK_MIN=500 THINK_MAX=1500 (ms)  MAX_ERROR_RATE=0.01  MAX_P95_PAGE_MS=3000  (the spike gets twice the latency allowance)
// Safety: only *.netlify.app and localhost are allowed, and the numbers above are capped, so this cannot be pointed at someone else's site.
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import {performance} from 'node:perf_hooks';
import {writeFileSync,appendFileSync} from 'node:fs';

const raw=process.env.BASE_URL;
if(!raw){console.error('Set BASE_URL, e.g. BASE_URL=https://your-site.netlify.app');process.exit(2)}
const BASE=new URL(raw);
if(!/(^|\.)netlify\.app$/.test(BASE.hostname)&&!['localhost','127.0.0.1'].includes(BASE.hostname)){
  console.error(`Refusing to load-test ${BASE.hostname}: only *.netlify.app and localhost are allowed.`);process.exit(2);
}
const num=(k,d,max)=>Math.min(max,Math.max(0,Number.parseInt(process.env[k]??d,10)||0));
const LEVELS=(process.env.LEVELS||'10,25,50').split(',').map(x=>Math.min(200,Math.max(1,Number.parseInt(x,10)||0))).filter(Boolean).slice(0,6);
const DURATION=Math.max(1,num('DURATION',15,60)),SPIKE=num('SPIKE',100,300);
const THINK_MIN=num('THINK_MIN',500,10000),THINK_MAX=Math.max(THINK_MIN,num('THINK_MAX',1500,10000));
const SPIKE_WINDOW=num('SPIKE_WINDOW',1000,10000);
const H2=BASE.protocol==='https:'&&process.env.HTTP_VERSION!=='1';
const MAX_ERR=Number.parseFloat(process.env.MAX_ERROR_RATE??'0.01'),MAX_P95=Number.parseInt(process.env.MAX_P95_PAGE_MS??'3000',10);

const lib=BASE.protocol==='http:'?http:https;
const port=BASE.port||(BASE.protocol==='http:'?80:443);
let wireBytes=0;
const diag={goaway:{},errors:{}};   // why connections died: server GOAWAY codes and distinct low-level errors
const note=(k,m)=>{diag[k][m]=(diag[k][m]||0)+1};

function getH1(agent,path){
  return new Promise(resolve=>{
    const t0=performance.now();let ttfb=null,bytes=0,done=false;
    const fin=r=>{if(done)return;done=true;resolve({path,ttfb,total:performance.now()-t0,bytes,...r})};
    const req=lib.request({host:BASE.hostname,port,path,method:'GET',agent,timeout:20000,headers:{'accept-encoding':'br, gzip','user-agent':'loadtest/1.0 (github-actions)'}},res=>{
      ttfb=performance.now()-t0;
      res.on('data',c=>{bytes+=c.length;wireBytes+=c.length});
      res.on('end',()=>fin({status:res.statusCode}));
      res.on('error',e=>fin({status:0,err:e.code||e.message}));
    });
    req.on('timeout',()=>{req.destroy();fin({status:0,err:'timeout'})});
    req.on('error',e=>fin({status:0,err:e.code||e.message}));
    req.end();
  });
}

// HTTP/2: one TLS connection per virtual user, requests multiplexed over it (what a browser does).
function getH2(client,path){
  return new Promise(resolve=>{
    const t0=performance.now();let ttfb=null,bytes=0,status=0,done=false;
    const fin=r=>{if(done)return;done=true;resolve({path,ttfb,total:performance.now()-t0,bytes,...r})};
    if(client.destroyed||client.closed){fin({status:0,err:'connection closed'});return}
    let req;
    try{req=client.request({':path':path,'accept-encoding':'br, gzip','user-agent':'loadtest/1.0 (github-actions)'})}
    catch(e){fin({status:0,err:e.code||e.message});return}
    req.setTimeout(20000,()=>{req.close(http2.constants.NGHTTP2_CANCEL);fin({status:0,err:'timeout'})});
    req.on('response',h=>{ttfb=performance.now()-t0;status=h[':status']});
    req.on('data',c=>{bytes+=c.length;wireBytes+=c.length});
    req.on('end',()=>fin({status}));
    req.on('error',e=>{note('errors',`stream ${e.code||e.name}: ${String(e.message).slice(0,80)}`);fin({status:0,err:e.code||e.message})});
    client.once('error',e=>fin({status:0,err:e.code||e.message}));
    req.end();
  });
}

function connect(){
  if(H2){const c=http2.connect(BASE.origin);c.on('error',e=>note('errors',`${e.code||e.name}: ${String(e.message).slice(0,80)}`));c.on('goaway',code=>note('goaway','code '+code));c.setTimeout(20000,()=>c.destroy());return{get:p=>getH2(c,p),close:()=>c.close()}}
  const agent=new lib.Agent({keepAlive:true,maxSockets:6});
  return{get:p=>getH1(agent,p),close:()=>agent.destroy()};
}

let ASSETS=[];
async function session(){
  const conn=connect();
  const s0=performance.now();
  const page=await conn.get('/');
  const rest=await Promise.all(ASSETS.map(p=>conn.get(p)));
  conn.close();
  const all=[page,...rest];
  return{page,all,total:performance.now()-s0,ok:all.every(r=>r.status===200)};
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p/100))]:NaN;
const ms=n=>Number.isFinite(n)?Math.round(n):null;

function summarize(name,sessions,secs,maxP95){
  const reqs=sessions.flatMap(s=>s.all);
  const codes={};for(const r of reqs){const k=r.status||('ERR:'+r.err);codes[k]=(codes[k]||0)+1}
  const failed=sessions.filter(s=>!s.ok).length;
  const html=sessions.map(s=>s.page.total),ttfb=sessions.map(s=>s.page.ttfb).filter(x=>x!=null),load=sessions.map(s=>s.total);
  const errRate=sessions.length?failed/sessions.length:1;
  const p95=pct(load,95);
  const pass=errRate<=MAX_ERR&&p95<=maxP95;
  return{stage:name,sessions:sessions.length,failed,requests:reqs.length,reqPerSec:+(reqs.length/secs).toFixed(1),
    htmlTtfbP50:ms(pct(ttfb,50)),htmlP50:ms(pct(html,50)),htmlP95:ms(pct(html,95)),
    loadP50:ms(pct(load,50)),loadP95:ms(p95),loadP99:ms(pct(load,99)),loadMax:ms(Math.max(...load)),errRate:+(errRate*100).toFixed(2),codes,maxP95,pass};
}

// Discover the hashed assets exactly like a browser would.
const html=await new Promise((res,rej)=>{
  lib.get({host:BASE.hostname,port,path:'/',agent:new lib.Agent(),headers:{'accept-encoding':'identity'}},r=>{
    if(r.statusCode!==200){rej(new Error('GET / returned '+r.statusCode));return}
    let b='';r.setEncoding('utf8');r.on('data',c=>b+=c);r.on('end',()=>res(b));
  }).on('error',rej);
}).catch(e=>{console.error('Cannot reach the site: '+e.message);process.exit(2)});
ASSETS=[...html.matchAll(/(?:src|href)="((?:app|songs)\.[0-9a-f]{8}\.js)"/g)].map(m=>'/'+m[1]).concat('/manifest.webmanifest','/favicon.ico');
console.log(`Target ${BASE.origin} | ${H2?'HTTP/2 (1 connection per user)':'HTTP/1.1'} | stages: ${LEVELS.join(', ')} users x ${DURATION}s | spike: ${SPIKE?SPIKE+' users within '+SPIKE_WINDOW+' ms':'off'} | requests/session: ${ASSETS.length+1}\n`);

const results=[];
const show=r=>console.log(`${r.pass?'PASS':'FAIL'}  ${r.stage.padEnd(20)} sessions ${String(r.sessions).padStart(4)}  failed ${String(r.failed).padStart(3)}  req/s ${String(r.reqPerSec).padStart(6)}  html p50/p95 ${r.htmlP50}/${r.htmlP95} ms  page-load p50/p95/max ${r.loadP50}/${r.loadP95}/${r.loadMax} ms  codes ${JSON.stringify(r.codes)}`);

{const t0=performance.now(),ss=[];for(let i=0;i<5;i++){ss.push(await session());await sleep(300)}
 const r=summarize('baseline (1 user)',ss,(performance.now()-t0)/1000,MAX_P95);results.push(r);show(r)}

for(const users of LEVELS){
  const end=performance.now()+DURATION*1000,ss=[];
  await Promise.all(Array.from({length:users},async(_,i)=>{
    await sleep((i/users)*1000);
    while(performance.now()<end){ss.push(await session());await sleep(THINK_MIN+Math.random()*(THINK_MAX-THINK_MIN))}
  }));
  const r=summarize(`steady ${users} users`,ss,DURATION,MAX_P95);results.push(r);show(r);
  await sleep(1500);
}

if(SPIKE){
  const t0=performance.now();
  const ss=await Promise.all(Array.from({length:SPIKE},async()=>{await sleep(Math.random()*SPIKE_WINDOW);return session()}));
  const r=summarize(`spike ${SPIKE} in ${SPIKE_WINDOW/1000}s`,ss,(performance.now()-t0)/1000,MAX_P95*2);results.push(r);show(r);
}

const hasDiag=Object.keys(diag.goaway).length||Object.keys(diag.errors).length;
if(hasDiag)console.log('\nConnection diagnostics: '+JSON.stringify(diag));
const mb=+(wireBytes/1048576).toFixed(1),allPass=results.every(r=>r.pass);
console.log(`\nData received: ${mb} MB | thresholds: error rate <= ${MAX_ERR*100}%, p95 page load <= ${MAX_P95} ms (x2 for the spike)\n${allPass?'LOAD TEST PASSED':'LOAD TEST FAILED'}`);

writeFileSync('loadtest-results.json',JSON.stringify({diagnostics:diag,target:BASE.origin,when:new Date().toISOString(),dataMB:mb,thresholds:{maxErrorRate:MAX_ERR,maxP95PageMs:MAX_P95},results},null,1));
if(process.env.GITHUB_STEP_SUMMARY){
  const rows=results.map(r=>`| ${r.pass?'✅':'❌'} | ${r.stage} | ${r.sessions} | ${r.failed} | ${r.reqPerSec} | ${r.htmlP50} / ${r.htmlP95} | ${r.loadP50} / ${r.loadP95} / ${r.loadMax} |`).join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Load test: ${BASE.origin}\n\n| | Stage | Page loads | Failed | Requests/s | HTML p50 / p95 (ms) | Full page p50 / p95 / max (ms) |\n|---|---|---|---|---|---|---|\n${rows}\n\n**${allPass?'Passed':'Failed'}** (error rate <= ${MAX_ERR*100}%, p95 page load <= ${MAX_P95} ms, spike x2). Data received: ${mb} MB.\n\nA "page load" is the HTML followed by ${ASSETS.length} parallel requests (2 scripts, manifest, favicon) over a fresh connection per user (${H2?'HTTP/2':'HTTP/1.1'}). It measures network and server time, not browser rendering.\n`);
}
process.exit(allPass?0:1);
