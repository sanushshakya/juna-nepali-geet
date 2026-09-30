// Zero-dependency build: inlines CSS + SVG into index.html, writes JS with content-hashed names to dist/.
import {readFileSync,writeFileSync,mkdirSync,rmSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';

const src=f=>readFileSync(new URL('src/'+f,import.meta.url),'utf8');
const out=new URL('dist/',import.meta.url);
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,8);
const squash=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/<!--[\s\S]*?-->/g,'').replace(/\s*\n\s*/g,' ').replace(/>\s+</g,'><').trim();

rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});

const made={};
const asset=name=>{
const bin=/\.(webp|png|jpg)$/.test(name),code=bin?readFileSync(new URL('src/'+name,import.meta.url)):src(name);
const file=name.split('/').pop().replace(/\.(\w+)$/,`.${hash(code)}.$1`);
writeFileSync(new URL(file,out),code);
return made[name]=file;
};

// Only request the glyphs the page can show: ASCII + every non-ASCII char in the HTML/JS (Devanagari strings).
const chars=[...new Set([...Array(95)].map((_,i)=>String.fromCharCode(32+i)).concat([...(src('index.html')+src('app.js'))].filter(c=>c.charCodeAt(0)>127&&!/[\u2000-\u27FF]/.test(c))))].join('');
const font='https://fonts.googleapis.com/css2?family=Mukta:wght@500&display=swap&text='+encodeURIComponent(chars);

const html=src('index.html')
.replaceAll('{{FONT}}',font)
.replace('{{CSS}}',()=>squash(src('style.css')))
.replace('{{HERO}}',()=>squash(src('hero.svg')))
.replace('{{SONGS}}',asset('songs.js'))
.replace('{{APP}}',asset('app.js'));
writeFileSync(new URL('index.html',out),html);

// PWA: manifest, icons, and a service worker that precaches the app shell (cache name changes with the content).
cpSync(new URL('src/icons/',import.meta.url),new URL('icons/',out),{recursive:true});
writeFileSync(new URL('manifest.webmanifest',out),src('manifest.webmanifest'));
// Default lookups: iOS and Chrome fetch these root paths on their own when a page has no (or cached) icon links.
for(const [from,to] of [['icons/favicon.ico','favicon.ico'],['icons/apple-touch-icon.png','apple-touch-icon.png'],['icons/apple-touch-icon.png','apple-touch-icon-precomposed.png']])cpSync(new URL('src/'+from,import.meta.url),new URL(to,out));
const shell=['./','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png',made['songs.js'],made['app.js']];
writeFileSync(new URL('sw.js',out),src('sw.js').replace('{{CACHE}}','jng-'+hash(html+shell.join()+shell.filter(f=>/\.(png|webmanifest)$/.test(f)).map(f=>readFileSync(new URL(f,out)).toString('latin1')).join())).replace('{{FILES}}',JSON.stringify(shell)));

writeFileSync(new URL('_headers',out),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/app.*.js
  Cache-Control: public, max-age=31536000, immutable
/songs.*.js
  Cache-Control: public, max-age=31536000, immutable
`);

console.log('dist/index.html',(Buffer.byteLength(html)/1024).toFixed(1)+' KB');
