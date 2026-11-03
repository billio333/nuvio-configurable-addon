const fs=require('node:fs');
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('Source tester layout anchor changed');return text.replace(anchor,replacement);}
function installTester(){
 let text=fs.readFileSync('source-tester.cjs','utf8');
 if(!text.includes('id="source-tester-section"')){
  text=once(text,'<section><h2>Source tester — revision 1</h2>','<details id="source-tester-section" open style="border:1px solid #aaa;border-radius:6px;padding:0 12px;margin:18px 0"><summary style="font-size:1.1rem;padding:10px 0">Source tester</summary><section style="padding-bottom:12px">');
  text=once(text,'</section><script>','</section></details><script>');
 }
 const assert=require('node:assert/strict');assert.ok(text.includes('id="source-tester-section" open'));new (require('node:vm').Script)(text);fs.writeFileSync('source-tester.cjs',text);
}
async function probe(){
 const base='https://streamingunity.fun',watch=base+'/en/watch/976?e=89463';const jar=new Map();
 const clean=value=>{try{const u=new URL(value,base);return u.origin+u.pathname.split('/').map(x=>x.length>80?'[redacted]':x).join('/');}catch{return null;}};
 async function get(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'text/html,application/json','User-Agent':'Mozilla/5.0',Referer:watch,...(jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{})}});
  for(const cookie of r.headers.getSetCookie?.()||[]){const part=cookie.split(';')[0],at=part.indexOf('=');if(at>0)jar.set(part.slice(0,at),part.slice(at+1));}
  return {status:r.status,body:await r.text()};
 }
 function inspect(result){
  const $=require('cheerio').load(result.body);let props={};
  try{props=JSON.parse($('#app').attr('data-page')||'{}').props||{};}catch{}
  const shape=v=>Array.isArray(v)?{type:'array',length:v.length}:v&&typeof v==='object'?{type:'object',keys:Object.keys(v).slice(0,20)}:{type:typeof v};
  const title=props.title&&typeof props.title==='object'?Object.fromEntries(['id','tmdbId','tmdb_id','name','slug','type'].filter(k=>['string','number'].includes(typeof props.title[k])).map(k=>[k,String(props.title[k]).slice(0,120)])):null;
  return {status:result.status,pageTitle:$('title').text().trim().slice(0,120),challengeDetected:/just a moment|security verification|challenge-platform|cf-chl-/i.test(result.body),inertiaProps:Object.fromEntries(Object.entries(props).slice(0,25).map(([k,v])=>[k,shape(v)])),title,frames:$('iframe[src]').map((i,e)=>clean($(e).attr('src'))).get().slice(0,8),scripts:$('script[src]').map((i,e)=>clean($(e).attr('src'))).get().slice(0,12),playlistMarkerFound:result.body.includes('.m3u8')};
 }
 const started=Date.now(),output={event:'streamingunity_probe',target:'Family Guy S22E1 (user-supplied URL)'};
 try{output.watch=inspect(await get(watch));}catch(error){output.watch={error:error.name};}
 try{output.iframe=inspect(await get(base+'/en/iframe/976?episode_id=89463&canPlayFHD=1'));}catch(error){output.iframe={error:error.name};}
 console.log(JSON.stringify({...output,ms:Date.now()-started}));
}
if(require.main===module&&process.argv.includes('--install'))installTester();
module.exports={installTester,probe};
