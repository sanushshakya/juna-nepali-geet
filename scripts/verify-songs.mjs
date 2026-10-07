// Verifies every song in src/songs.js against YouTube oEmbed:
//   200 = exists and embeddable, 401/403 = embedding disabled, 404 = removed/private.
// Exits 1 on any problem so CI (and the weekly job) can flag it.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/songs.js',import.meta.url),'utf8'),ctx);
const songs=ctx.window.SONGS;
const problems=[];

if(!Array.isArray(songs)||!songs.length){console.error('src/songs.js must define a non-empty window.SONGS array');process.exit(1)}

const seen=new Set();
for(const s of songs){
  if(!s.title||!s.artist)problems.push(`missing title/artist: ${JSON.stringify(s)}`);
  if(s.year!==undefined&&!(Number.isInteger(s.year)&&s.year>=1990&&s.year<=2019))problems.push(`outside the 1990-2019 era: ${s.title} (year ${s.year})`);
  if(!/^[\w-]{11}$/.test(s.youtubeId||''))problems.push(`bad video ID format: ${s.title} -> ${s.youtubeId}`);
  if(seen.has(s.youtubeId))problems.push(`duplicate video ID: ${s.youtubeId} (${s.title})`);
  seen.add(s.youtubeId);
}
const featured=songs.filter(s=>s.featured);
if(featured.length!==1)problems.push(`expected exactly 1 featured song, found ${featured.length}`);

async function check(s){
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+s.youtubeId),{signal:AbortSignal.timeout(15000)});
      if(r.ok){const d=await r.json();return{ok:true,channel:d.author_name}}
      if(attempt===2||r.status<500)return{ok:false,why:`HTTP ${r.status}`+(r.status===401||r.status===403?' (embedding disabled)':r.status===404?' (removed or private)':'')};
    }catch(e){if(attempt===2)return{ok:false,why:'network error: '+e.message}}
  }
}

const rows=[];
for(let i=0;i<songs.length;i+=5){
  const batch=songs.slice(i,i+5);
  const res=await Promise.all(batch.map(check));
  batch.forEach((s,j)=>rows.push({s,r:res[j]}));
}
for(const {s,r} of rows){
  console.log((r.ok?'OK   ':'FAIL ')+`${s.youtubeId}  ${s.artist} - ${s.title}  ${r.ok?'['+r.channel+']':r.why}`);
  if(!r.ok)problems.push(`${s.artist} - ${s.title} (${s.youtubeId}): ${r.why}`);
}
console.log(`\n${songs.length} songs checked, ${problems.length} problem(s).`);
if(problems.length){console.error('\nProblems:\n - '+problems.join('\n - '));process.exit(1)}
