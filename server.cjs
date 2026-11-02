const http=require('node:http');
const {Worker}=require('node:worker_threads');
const {renderConfig}=require('./config-page.cjs');
const {createPool}=require('./pool.cjs');
const ROOT='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/';
const QUALITIES=['2160','1080','720','480','unknown'];
const mappings=new Map(),resultsCache=new Map(),stats=new Map();
let cached,cachedAt=0;
const log=data=>console.log(JSON.stringify(data));
function put(map,key,value,ttl,limit){map.delete(key);map.set(key,{value,until:Date.now()+ttl});while(map.size>limit)map.delete(map.keys().next().value);}
function get(map,key){const hit=map.get(key);if(!hit)return null;if(hit.until<=Date.now()){map.delete(key);return null;}return hit.value;}
function netSignal(deadline,signal){const timer=AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())));return signal?AbortSignal.any([timer,signal]):timer;}
async function inventory(deadline=Date.now()+15000,signal){
  if(!cached||Date.now()-cachedAt>600000){
    const r=await fetch(ROOT+'manifest.json',{signal:netSignal(deadline,signal)});if(!r.ok)throw new Error('Upstream manifest unavailable');
    const data=await r.json();if(!Array.isArray(data.scrapers))throw new Error('Invalid upstream manifest');cached=data.scrapers;cachedAt=Date.now();
  }return cached;
}
function manifest(configured){return {id:'community.billio333.nuvio-select',version:'0.1.3',name:'Nuvio Source Select',description:'Experimental configurable All-in-One-Nuvio bridge',resources:['stream'],types:['movie','series'],catalogs:[],behaviorHints:{configurable:true,configurationRequired:!configured}};}
function decode(token){
  if(token.length>12000)throw new Error('Configuration too large');const c=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
  if(!c||!Array.isArray(c.sources)||c.sources.length>100||c.sources.some(x=>typeof x!=='string'))throw new Error('Invalid source selection');
  if(c.resolutions!==undefined&&(!Array.isArray(c.resolutions)||c.resolutions.some(x=>!QUALITIES.includes(x))))throw new Error('Invalid resolution selection');return c;
}
function resolution(s){
  function read(value){const text=String(value||'').replace(/[\u200B-\u200D\uFEFF]/g,'');const match=/(?:^|[^A-Za-z0-9])(2160|1080|720|480)(?:p|i)?(?=$|[^A-Za-z0-9])/i.exec(text);if(match)return match[1];if(/(?:^|[^A-Za-z0-9])(?:4k|uhd)(?=$|[^A-Za-z0-9])/i.test(text))return '2160';return null;}
  return read(s.quality)||read(s.title)||read(s.name)||'unknown';
}
function execute(entry,args,signal,deadline){return new Promise(resolve=>{
  if(signal.aborted||Date.now()>=deadline)return resolve([]);let worker,settled=false,timer;const started=Date.now();
  const finish=(streams,reason)=>{
    if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);
    const done=()=>{const value=Array.isArray(streams)?streams:[];stats.set(entry.id,{ms:Date.now()-started,count:value.length});log({event:'provider_timing',provider:entry.id,reason,ms:Date.now()-started,count:value.length});resolve(value);};
    if(worker)worker.terminate().then(done,done);else done();
  };
  const cancel=()=>finish([],'cancelled');
  try{worker=new Worker(require.resolve('./provider-worker.cjs'),{workerData:{root:ROOT,entry,args},resourceLimits:{maxOldGenerationSizeMb:96}});}catch{return finish([],'start_failed');}
  signal.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish([],'provider_timeout'),Math.max(1,Math.min(20000,deadline-Date.now())));
  worker.once('message',value=>finish(value,'completed'));worker.once('error',()=>finish([],'worker_error'));worker.once('exit',()=>finish([],'worker_exit'));if(signal.aborted)cancel();
});}
const runSources=createPool(2,execute);
async function identifier(type,id,deadline,signal){
  const pieces=id.split(':');const isTmdb=pieces[0]==='tmdb';let tmdb=isTmdb?pieces[1]:pieces[0];const offset=isTmdb?2:1;
  if(/^tt\d+$/.test(tmdb)){
    const key=type+':'+tmdb;const hit=get(mappings,key);
    if(hit)tmdb=hit;else{
      if(!process.env.TMDB_API_KEY)throw new Error('IMDb lookup requires TMDB_API_KEY on the service');
      const url=new URL('https://api.themoviedb.org/3/find/'+tmdb);url.searchParams.set('api_key',process.env.TMDB_API_KEY);url.searchParams.set('external_source','imdb_id');
      const r=await fetch(url,{signal:netSignal(deadline,signal)});if(!r.ok)throw new Error('TMDB lookup failed');const data=await r.json();const match=(type==='movie'?data.movie_results:data.tv_results)?.[0];
      if(!match)throw new Error('No TMDB mapping found');tmdb=String(match.id);put(mappings,key,tmdb,21600000,256);
    }
  }
  if(!/^\d+$/.test(tmdb))throw new Error('Unsupported media identifier');const season=type==='series'?Number(pieces[offset]):null;const episode=type==='series'?Number(pieces[offset+1]):null;
  if(type==='series'&&(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1))throw new Error('Invalid episode');return [tmdb,type==='series'?'tv':'movie',season,episode];
}
function cacheSafe(streams){return streams.every(s=>{try{const p=new URL(s.url).searchParams;const date=p.get('X-Amz-Date'),duration=p.get('X-Amz-Expires');if(!date||!duration)return true;const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);if(!m)return false;const expiry=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])+Number(duration)*1000;return expiry>Date.now()+45000;}catch{return false;}});}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','*');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const json=(status,data)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  let controller,deadline=Infinity;const disconnected=()=>{if(!res.writableEnded)controller?.abort();};
  try{
    const path=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if(path.length===1&&path[0]==='health')return json(200,{ok:true,version:'0.1.3',globalWorkers:2,requestBudgetMs:18000});
    if(!path.length||(path.length===1&&path[0]==='configure')||(path.length===2&&path[1]==='configure')){const config=path.length===2?decode(path[0]):{sources:[],resolutions:QUALITIES};const html=renderConfig(await inventory(),config);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
    if(path.length===1&&path[0]==='manifest.json')return json(200,manifest(false));
    if(path.length===2&&path[1]==='manifest.json'){decode(path[0]);return json(200,manifest(true));}
    if(path.length===4&&path[1]==='stream'&&['movie','series'].includes(path[2])&&path[3].endsWith('.json')){
      const started=Date.now();deadline=started+18000;controller=new AbortController();res.once('close',disconnected);
      const config=decode(path[0]);const allowed=config.resolutions===undefined?QUALITIES:config.resolutions;
      const cacheKey=JSON.stringify([path[2],path[3],[...new Set(config.sources)].sort(),[...new Set(allowed)].sort()]);
      const hit=get(resultsCache,cacheKey);if(hit){log({event:'stream_cache_hit',count:hit.length});return json(200,{streams:hit});}
      const entries=(await inventory(deadline,controller.signal)).filter(e=>config.sources.includes(e.id)&&(!e.supportedTypes||e.supportedTypes.includes(path[2]==='series'?'tv':'movie')));
      if(!entries.length||!allowed.length)return json(200,{streams:[]});
      const rank=e=>e.id==='4khdhub'?100000:stats.get(e.id)?.count>0?10000-stats.get(e.id).ms/1000:0;entries.sort((a,b)=>rank(b)-rank(a));
      const args=await identifier(path[2],path[3].slice(0,-5),deadline,controller.signal);
      const completed=await runSources(entries,args,{deadline,signal:controller.signal});const all=[];const seen=new Set();
      for(const {entry,streams} of completed)for(const s of streams){
        if(!s||typeof s.url!=='string'||!/^https?:\/\//.test(s.url)||!allowed.includes(resolution(s)))continue;
        const duplicate=JSON.stringify([s.url,s.title,s.headers,s.behaviorHints]);if(seen.has(duplicate))continue;seen.add(duplicate);
        let host='';try{host=new URL(s.url).hostname;}catch{}const hints={...(s.behaviorHints||{}),notWebReady:true};
        if(s.headers&&typeof s.headers==='object')hints.proxyHeaders={...(hints.proxyHeaders||{}),request:{...(hints.proxyHeaders?.request||{}),...s.headers}};
        const item={name:s.name||entry.name+(s.quality?' | '+s.quality:''),title:(s.title||s.name||entry.name)+(host?'\nHost: '+host:''),url:s.url,behaviorHints:hints};if(typeof s.filename==='string')item.filename=s.filename;all.push(item);
      }
      if(all.length&&cacheSafe(all))put(resultsCache,cacheKey,all,15000,32);
      log({event:'stream_request_finished',ms:Date.now()-started,selected:entries.length,completed:completed.length,streams:all.length});return json(200,{streams:all});
    }return json(404,{error:'Not found'});
  }catch(error){if(controller?.signal.aborted||Date.now()>=deadline){log({event:'request_cancelled_or_deadline'});return json(200,{streams:[]});}console.error(error.message);return json(error.message==='Service busy; retry shortly'?503:502,{error:error.message});}
  finally{res.removeListener('close',disconnected);controller?.abort();}
});
server.listen(Number(process.env.PORT||7000),'0.0.0.0');
