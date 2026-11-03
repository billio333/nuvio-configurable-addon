const http=require('node:http');
const {Worker}=require('node:worker_threads');
const {renderConfig}=require('./config-page.cjs');
const {createPool}=require('./pool.cjs');
const policy=require('./source-policy.cjs').createPolicy();
const {formatStream}=require('./stream-format.cjs');
let logoPng=null;try{logoPng=require('node:fs').readFileSync(require('node:path').join(__dirname,'B2.png'));}catch{}
const ROOT='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/';
const mappings=new Map(),resultsCache=new Map(),stats=new Map();let cached,cachedAt=0;
const log=data=>console.log(JSON.stringify(data));
let sourceProbePromise=null,sourceProbeUntil=0;
function probeSources(){
 if(sourceProbePromise&&Date.now()<sourceProbeUntil)return sourceProbePromise;
 sourceProbeUntil=Date.now()+60000;
 sourceProbePromise=Promise.all([
  ['Nepu','https://nepu.io/'],
  ['PressPlay','https://pressplayz.top/watch/tv-family-guy-fjboc?season=22&episode=1']
 ].map(async([source,url])=>{
  const started=Date.now();
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'}});
   const html=await response.text();
   return {source,status:response.status,finalHost:new URL(response.url).hostname,milliseconds:Date.now()-started,characters:html.length,title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim().slice(0,160)||null,challengeDetected:/just a moment|security verification|challenge-platform|cf-chl-/i.test(html),embedMarkerFound:/data-embed\s*=/i.test(html),playlistMarkerFound:/\.m3u8|relayManifestUrl/i.test(html)};
  }catch(error){return {source,milliseconds:Date.now()-started,error:error.name};}
 }));
 return sourceProbePromise;
}
function put(map,key,value,ttl,limit){map.delete(key);map.set(key,{value,until:Date.now()+ttl});while(map.size>limit)map.delete(map.keys().next().value);}
function get(map,key){const hit=map.get(key);if(!hit)return null;if(hit.until<=Date.now()){map.delete(key);return null;}return hit.value;}
function netSignal(deadline,signal){const timer=AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())));return signal?AbortSignal.any([timer,signal]):timer;}
async function inventory(deadline=Date.now()+15000,signal){if(!cached||Date.now()-cachedAt>600000){const r=await fetch(ROOT+'manifest.json',{signal:netSignal(deadline,signal)});if(!r.ok)throw new Error('Upstream manifest unavailable');const data=await r.json();if(!Array.isArray(data.scrapers))throw new Error('Invalid upstream manifest');cached=data.scrapers;cachedAt=Date.now();}return cached;}
function baseUrl(req){const proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()||'http';const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();return /^[A-Za-z0-9.:-]+$/.test(host)?proto+'://'+host:'';}
function manifest(configured,base){return {...(base&&logoPng?{logo:base+'/logo.png'}:{}),id:'community.billio333.nuvio-select',version:'0.1.5',name:(process.env.ADDON_NAME||'').trim().slice(0,80)||"BiLL's Plugin",description:'Experimental source bridge with configurable quality controls',resources:['stream'],types:['movie','series'],catalogs:[],behaviorHints:{configurable:true,configurationRequired:!configured}};}
function decode(token){if(token.length>12000)throw new Error('Configuration too large');return policy.normalize(JSON.parse(Buffer.from(token,'base64url').toString('utf8')));}
function resolution(s){function read(value){const text=String(value||'').replace(/[\u200B-\u200D\uFEFF]/g,'');const m=/(?:^|[^A-Za-z0-9])(2160|1080|720|480)(?:p|i)?(?=$|[^A-Za-z0-9])/i.exec(text);if(m)return m[1];if(/(?:^|[^A-Za-z0-9])(?:4k|uhd)(?=$|[^A-Za-z0-9])/i.test(text))return '2160';return null;}return read(s.quality)||read(s.title)||read(s.name)||'unknown';}
function execute(entry,args,signal,deadline){return new Promise(resolve=>{
 if(entry.id==='netmirror'||signal.aborted||Date.now()>=deadline)return resolve([]);let worker,settled=false,timer;const started=Date.now();
 const finish=(streams,reason)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);const done=()=>{const value=Array.isArray(streams)?streams:[];stats.set(entry.id,{ms:Date.now()-started,count:value.length});log({event:'provider_timing',provider:entry.id,reason,ms:Date.now()-started,count:value.length});resolve(value);};if(worker)worker.terminate().then(done,done);else done();};
 const cancel=()=>finish([],'cancelled');try{worker=new Worker(require.resolve('./provider-worker.cjs'),{workerData:{root:ROOT,entry,args},resourceLimits:{maxOldGenerationSizeMb:96}});}catch{return finish([],'start_failed');}
 signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish([],'provider_timeout'),Math.max(1,Math.min(20000,deadline-Date.now())));worker.once('message',v=>finish(v,'completed'));worker.once('error',()=>finish([],'worker_error'));worker.once('exit',()=>finish([],'worker_exit'));if(signal.aborted)cancel();
});}
const runSources=createPool(2,execute);
async function identifier(type,id,deadline,signal){
 const pieces=id.split(':');const isTmdb=pieces[0]==='tmdb';let tmdb=isTmdb?pieces[1]:pieces[0];const offset=isTmdb?2:1;
 if(/^tt\d+$/.test(tmdb)){const key=type+':'+tmdb;const hit=get(mappings,key);if(hit)tmdb=hit;else{if(!process.env.TMDB_API_KEY)throw new Error('IMDb lookup requires TMDB_API_KEY');const url=new URL('https://api.themoviedb.org/3/find/'+tmdb);url.searchParams.set('api_key',process.env.TMDB_API_KEY);url.searchParams.set('external_source','imdb_id');const r=await fetch(url,{signal:netSignal(deadline,signal)});if(!r.ok)throw new Error('TMDB lookup failed');const data=await r.json();const match=(type==='movie'?data.movie_results:data.tv_results)?.[0];if(!match)throw new Error('No TMDB mapping');tmdb=String(match.id);put(mappings,key,tmdb,21600000,256);}}
 if(!/^\d+$/.test(tmdb))throw new Error('Unsupported media identifier');const season=type==='series'?Number(pieces[offset]):null;const episode=type==='series'?Number(pieces[offset+1]):null;if(type==='series'&&(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1))throw new Error('Invalid episode');return [tmdb,type==='series'?'tv':'movie',season,episode];
}
function cacheSafe(streams){return streams.every(s=>{try{const p=new URL(s.url).searchParams;const d=p.get('X-Amz-Date'),duration=p.get('X-Amz-Expires');if(!d||!duration)return true;const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(d);return !!m&&Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])+Number(duration)*1000>Date.now()+45000;}catch{return false;}});}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const json=(status,data)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};let controller,deadline=Infinity;const disconnected=()=>{if(!res.writableEnded)controller?.abort();};
 try{
  const path=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if(path.length===1&&path[0]==='source-probe')return json(200,{note:'Reachability test only; not proof of working playback. Results cached for 60 seconds.',results:await probeSources()});
  if(path.length===1&&path[0]==='health')return json(200,{ok:true,version:'0.1.5',globalWorkers:2,requestBudgetMs:18000,netmirror:{phase:'unavailable',reason:'upstream_http_403'}});
  if(!path.length||(path.length===1&&path[0]==='configure')||(path.length===2&&path[1]==='configure')){const c=path.length===2?decode(path[0]):policy.normalize({sources:[]});const html=renderConfig(await inventory(),c);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
  if(path.length===1&&path[0]==='logo.png'){if(!logoPng)return json(404,{error:'Not found'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','Content-Length':logoPng.length});return res.end(logoPng);}
  if(path.length===1&&path[0]==='manifest.json')return json(200,manifest(false,baseUrl(req)));if(path.length===2&&path[1]==='manifest.json'){decode(path[0]);return json(200,manifest(true,baseUrl(req)));}
  if(path.length===4&&path[1]==='stream'&&['movie','series'].includes(path[2])&&path[3].endsWith('.json')){
   const started=Date.now();deadline=started+18000;controller=new AbortController();res.once('close',disconnected);const c=decode(path[0]);const cacheKey=JSON.stringify([path[2],path[3],c]);const hit=get(resultsCache,cacheKey);if(hit)return json(200,{streams:hit});
   if(!c.sources.length||!c.resolutions.length)return json(200,{streams:[]});const args=await identifier(path[2],path[3].slice(0,-5),deadline,controller.signal);const raw=path[3].slice(0,-5).split(':');const media=raw[0]==='tmdb'?'tmdb:'+raw[1]:/^tt\d+$/.test(raw[0])?raw[0]:'tmdb:'+raw[0];const target={type:path[2],ids:[media,'tmdb:'+args[0]],season:args[2],episode:args[3]};
   const entries=(await inventory(deadline,controller.signal)).filter(e=>c.sources.includes(e.id)&&!policy.blocked(c,e.id,target)&&(!e.supportedTypes||e.supportedTypes.includes(args[1])));
   const rank=e=>(policy.state(c,e.id).low?-100000:0)+(e.id==='4khdhub'?10000:stats.get(e.id)?.count>0?1000-stats.get(e.id).ms/1000:0);entries.sort((a,b)=>rank(b)-rank(a));const completed=await runSources(entries,args,{deadline,signal:controller.signal});const records=[],seen=new Set();
   for(const {entry,streams} of completed)for(const s of streams){if(!s||typeof s.url!=='string'||!/^https?:\/\//.test(s.url)||!c.resolutions.includes(resolution(s)))continue;const key=JSON.stringify([s.url,s.title,s.headers,s.behaviorHints]);if(seen.has(key))continue;seen.add(key);let host='';try{host=new URL(s.url).hostname;}catch{}const state=policy.state(c,entry.id);const hints={...(s.behaviorHints||{}),notWebReady:true};if(s.headers&&typeof s.headers==='object')hints.proxyHeaders={...(hints.proxyHeaders||{}),request:{...(hints.proxyHeaders?.request||{}),...s.headers}};const f=formatStream({entry,stream:s,request:{type:path[2],season:args[2],episode:args[3]},lowConfidence:state.low});if(f.filename)hints.filename=f.filename;const item={name:f.name,title:f.title,url:s.url,behaviorHints:hints};if(typeof s.filename==='string')item.filename=s.filename;records.push({low:state.low,count:state.count,item});}
   records.sort((a,b)=>Number(a.low)-Number(b.low)||a.count-b.count);const all=records.map(x=>x.item);if(all.length&&cacheSafe(all))put(resultsCache,cacheKey,all,15000,32);log({event:'stream_request_finished',ms:Date.now()-started,eligible:entries.length,completed:completed.length,streams:all.length});return json(200,{streams:all});
  }return json(404,{error:'Not found'});
 }catch(error){if(controller?.signal.aborted||Date.now()>=deadline)return json(200,{streams:[]});console.error(error.message);return json(error.message==='Service busy; retry shortly'?503:502,{error:error.message});}finally{res.removeListener('close',disconnected);controller?.abort();}
});
server.listen(Number(process.env.PORT||7000),'0.0.0.0');
