// CI gate: build, then assert the output is complete and the built JS parses.
// STRICT=1 (set on main) also fails while the placeholder takedown email is still in the page.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
const errors=[];
const fail=m=>errors.push(m);

execFileSync(process.execPath,['build.mjs'],{cwd:fileURLToPath(root),stdio:'inherit'});

for(const f of ['index.html','sw.js','manifest.webmanifest','_headers','favicon.ico','apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'])
  if(!existsSync(new URL(f,dist)))fail('missing dist/'+f);

const hashed=readdirSync(dist).filter(f=>/^(app|songs)\.[0-9a-f]{8}\.js$/.test(f));
if(hashed.length!==2)fail('expected hashed app.*.js and songs.*.js, found: '+(hashed.join(', ')||'none'));

for(const f of [...hashed,'sw.js']){
  try{execFileSync(process.execPath,['--check',fileURLToPath(new URL(f,dist))],{stdio:'pipe'})}
  catch(e){fail('syntax error in '+f+': '+String(e.stderr||e.message).split('\n')[0])}
}

for(const f of readdirSync(new URL('scripts/',root)).filter(f=>f.endsWith('.mjs'))){
  try{execFileSync(process.execPath,['--check',fileURLToPath(new URL('scripts/'+f,root))],{stdio:'pipe'})}
  catch(e){fail('syntax error in scripts/'+f+': '+String(e.stderr||e.message).split('\n')[0])}
}

if(existsSync(new URL('index.html',dist))){
  const html=readFileSync(new URL('index.html',dist),'utf8');
  if(html.includes('{{'))fail('index.html still contains a {{placeholder}}');
  for(const id of ['hero','pp','ctl'])if(!html.includes(`id="${id}"`))fail(`index.html is missing id="${id}"`);
  for(const f of hashed)if(!html.includes(f))fail('index.html does not reference '+f);
  if(!html.includes('rel="manifest"'))fail('index.html has no manifest link');
  if(process.env.STRICT==='1'&&html.includes('your-email@example.com'))
    fail('placeholder takedown email (your-email@example.com) is still in the page; set a real address in src/index.html');
}

if(existsSync(new URL('manifest.webmanifest',dist))){
  try{
    const m=JSON.parse(readFileSync(new URL('manifest.webmanifest',dist),'utf8'));
    for(const k of ['name','short_name','start_url','display','icons'])if(!m[k])fail('manifest is missing "'+k+'"');
    for(const i of m.icons||[])if(!existsSync(new URL(i.src,dist)))fail('manifest icon not built: '+i.src);
  }catch(e){fail('manifest.webmanifest is not valid JSON: '+e.message)}
}

if(errors.length){console.error('\ncheck FAILED:\n - '+errors.join('\n - '));process.exit(1)}
console.log('\ncheck passed: build complete, JS parses, manifest and icons present'+(process.env.STRICT==='1'?' (strict)':''));
