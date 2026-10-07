// Weekly refresh, applied to the working copy only (the weekly workflow never commits):
//   prune: drop songs YouTube says are gone or no longer embeddable (oEmbed 400/401/403/404), and
//   any song whose `year` is outside 1990-2019. Network errors and 5xx keep the song, so a bad network
//   day never empties the list.
// The featured song (the developer's favourite) is never rotated; if it is dead the script fails so the
// workflow opens an issue instead of silently changing it.
// Dry run by default; pass --write to modify src/songs.js.
// Exits 1 (and changes nothing) if pruning would leave fewer than MIN songs.
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';

const MIN=30,FROM=1990,TO=2019,write=process.argv.includes('--write');
const songsUrl=new URL('../src/songs.js',import.meta.url);
const src=readFileSync(songsUrl,'utf8');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(src,ctx);
const songs=ctx.window.SONGS;

async function status(id){
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),{signal:AbortSignal.timeout(15000)});
      if(r.ok)return'ok';
      if([400,401,403,404].includes(r.status))return'dead';
      if(attempt===2)return'unknown';
    }catch(e){if(attempt===2)return'unknown'}
  }
}

const res=[];
for(let i=0;i<songs.length;i+=5)res.push(...await Promise.all(songs.slice(i,i+5).map(s=>status(s.youtubeId))));
const outOfEra=s=>s.year!==undefined&&!(s.year>=FROM&&s.year<=TO);
const drop=new Map();
songs.forEach((s,i)=>{if(res[i]==='dead')drop.set(s.youtubeId,'unavailable');else if(outOfEra(s))drop.set(s.youtubeId,`year ${s.year} outside ${FROM}-${TO}`)});
drop.forEach((why,id)=>console.log('prune  '+id+'  '+songs.find(s=>s.youtubeId===id).title+'  ('+why+')'));
if(res.includes('unknown'))console.log('note: '+res.filter(r=>r==='unknown').length+' song(s) could not be checked and were kept');
const keep=songs.filter(s=>!drop.has(s.youtubeId));
const fav=songs.find(s=>s.featured);
if(fav&&drop.has(fav.youtubeId)){console.error(`refusing: the featured song "${fav.title}" would be pruned (${drop.get(fav.youtubeId)}); choose a new favourite by hand`);process.exit(1)}
if(keep.length<MIN){console.error(`refusing: only ${keep.length} songs would remain (minimum ${MIN})`);process.exit(1)}
console.log(`${keep.length} songs kept, ${drop.size} pruned, featured: ${fav?fav.title:'(none)'}`);

if(!write){console.log('dry run, nothing written (use --write)');process.exit(0)}
let out=src;
for(const id of drop.keys())out=out.replace(new RegExp(`^\\{[^\\n]*youtubeId:"${id}"[^\\n]*\\},?\\s*$`,'m'),'').replace(/\n{2,}/g,'\n');
writeFileSync(songsUrl,out);
console.log('written');
