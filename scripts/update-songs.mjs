// Weekly refresh, applied to the working copy only (the weekly workflow never commits):
//   1. prune: drop songs YouTube says are gone (404) or no longer embeddable (401/403) via oEmbed.
//      (400 = ID does not exist.) Network errors and 5xx keep the song, so a bad network day never empties the list.
//   2. rotate: pick this week's featured song deterministically (week number), so reruns agree.
//      The "Developer's favourite" label in src/index.html is reworded to "Featured this week".
// Dry run by default; pass --write to modify src/songs.js and src/index.html.
// Exits 1 (and changes nothing) if pruning would leave fewer than MIN songs.
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';

const MIN=30,write=process.argv.includes('--write');
const songsUrl=new URL('../src/songs.js',import.meta.url),htmlUrl=new URL('../src/index.html',import.meta.url);
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
const dead=new Set(songs.filter((s,i)=>res[i]==='dead').map(s=>s.youtubeId));
const keep=songs.filter(s=>!dead.has(s.youtubeId));
dead.forEach(id=>console.log('prune  '+id+'  '+songs.find(s=>s.youtubeId===id).title));
if(res.includes('unknown'))console.log('note: '+res.filter(r=>r==='unknown').length+' song(s) could not be checked and were kept');
if(keep.length<MIN){console.error(`refusing: only ${keep.length} songs would remain (minimum ${MIN})`);process.exit(1)}

const week=Math.floor(Date.now()/(7*24*3600*1000)),cur=keep.find(s=>s.featured);
const pool=keep.filter(s=>s!==cur),next=pool[week%pool.length];
console.log(`featured: ${cur?cur.title:'(none)'} -> ${next.title}  (week ${week}, ${keep.length} songs)`);

if(!write){console.log('dry run, nothing written (use --write)');process.exit(0)}

const line=s=>new RegExp(`^\\{[^\\n]*youtubeId:"${s.youtubeId}"[^\\n]*\\},?\\s*$`,'m');
let out=src;
for(const id of dead)out=out.replace(line({youtubeId:id}),'').replace(/\n{2,}/g,'\n');
if(cur)out=out.replace(line(cur),m=>m.replace(',featured:true',''));
out=out.replace(line(next),m=>m.replace(/\}(,?\s*)$/,',featured:true}$1'));
writeFileSync(songsUrl,out);

let html=readFileSync(htmlUrl,'utf8');
html=html.replace(/(<button class="pick"[^>]*><small>)[^<]*(<\/small><span>)[^<]*(<\/span>)/,(m,a,b,c)=>`${a}★ Featured this week${b}${next.title} · ${next.artist}${c}`);
writeFileSync(htmlUrl,html);
console.log('written');
