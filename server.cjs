const http=require('node:http');
const {Worker}=require('node:worker_threads');
const {renderConfig}=require('./config-page.cjs');
const ROOT='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/';
const QUALITIES=['2160','1080','720','480','unknown'];
let cached,cachedAt=0;
async function inventory(){
  if(!cached||Date.now()-cachedAt>600000){
    const r=await fetch(ROOT+'manifest.json',{signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('Upstream manifest unavailable');
    const data=await r.json();
    if(!Array.isArray(data.scrapers))throw new Error('Invalid upstream manifest');
    cached=data.scrapers;cachedAt=Date.now();
  }
  return cached;
}
function manifest(configured){return {id:'community.billio333.nuvio-select',version:'0.1.2',name:'Nuvio Source Select',description:'Experimental configurable All-in-One-Nuvio bridge',resources:['stream'],types:['movie','series'],catalogs:[],behaviorHints:{configurable:true,configurationRequired:!configured}};}
function decode(token){
  if(token.length>12000)throw new Error('Configuration too large');
  const c=JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
  if(!c||!Array.isArray(c.sources)||c.sources.length>100||c.sources.some(x=>typeof x!=='string'))throw new Error('Invalid source selection');
  if(c.resolutions!==undefined&&(!Array.isArray(c.resolutions)||c.resolutions.some(x=>!QUALITIES.includes(x))))throw new Error('Invalid resolution selection');
  return c;
}
function resolution(s){
  function read(value){
    const text=String(value||'').replace(/[\u200B-\u200D\uFEFF]/g,'');
    const match=/(?:^|[^A-Za-z0-9])(2160|1080|720|480)(?:p|i)?(?=$|[^A-Za-z0-9])/i.exec(text);
    if(match)return match[1];
    if(/(?:^|[^A-Za-z0-9])(?:4k|uhd)(?=$|[^A-Za-z0-9])/i.test(text))return '2160';
    return null;
  }
  return read(s.quality)||read(s.title)||read(s.name)||'unknown';
}
function runProvider(entry,args){return new Promise(resolve=>{
  const worker=new Worker(require.resolve('./provider-worker.cjs'),{workerData:{root:ROOT,entry,args},resourceLimits:{maxOldGenerationSizeMb:96}});
  const timer=setTimeout(()=>{worker.terminate();resolve([]);},20000);
  const done=value=>{clearTimeout(timer);worker.terminate();resolve(Array.isArray(value)?value:[]);};
  worker.once('message',done);worker.once('error',()=>done([]));worker.once('exit',()=>done([]));
});}
async function identifier(type,id){
  const pieces=id.split(':');const isTmdb=pieces[0]==='tmdb';let tmdb=isTmdb?pieces[1]:pieces[0];const offset=isTmdb?2:1;
  if(/^tt\d+$/.test(tmdb)){
    if(!process.env.TMDB_API_KEY)throw new Error('IMDb lookup requires TMDB_API_KEY on the service');
    const url=new URL('https://api.themoviedb.org/3/find/'+tmdb);
    url.searchParams.set('api_key',process.env.TMDB_API_KEY);url.searchParams.set('external_source','imdb_id');
    const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('TMDB lookup failed');
    const data=await r.json();const match=(type==='movie'?data.movie_results:data.tv_results)?.[0];
    if(!match)throw new Error('No TMDB mapping found');tmdb=String(match.id);
  }
  if(!/^\d+$/.test(tmdb))throw new Error('Unsupported media identifier');
  const season=type==='series'?Number(pieces[offset]):null;const episode=type==='series'?Number(pieces[offset+1]):null;
  if(type==='series'&&(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1))throw new Error('Invalid episode');
  return [tmdb,type==='series'?'tv':'movie',season,episode];
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','*');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    const path=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if(path.length===1&&path[0]==='health')return json(200,{ok:true,version:'0.1.2'});
    if(!path.length||(path.length===1&&path[0]==='configure')||(path.length===2&&path[1]==='configure')){
      const config=path.length===2?decode(path[0]):{sources:[],resolutions:QUALITIES};
      const html=renderConfig(await inventory(),config);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
    }
    if(path.length===1&&path[0]==='manifest.json')return json(200,manifest(false));
    if(path.length===2&&path[1]==='manifest.json'){decode(path[0]);return json(200,manifest(true));}
    if(path.length===4&&path[1]==='stream'&&['movie','series'].includes(path[2])&&path[3].endsWith('.json')){
      const config=decode(path[0]);const allowed=config.resolutions===undefined?QUALITIES:config.resolutions;
      const entries=(await inventory()).filter(e=>config.sources.includes(e.id)&&(!e.supportedTypes||e.supportedTypes.includes(path[2]==='series'?'tv':'movie')));
      if(!entries.length||!allowed.length)return json(200,{streams:[]});
      const args=await identifier(path[2],path[3].slice(0,-5));const all=[];let index=0;
      await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(index<entries.length){
        const entry=entries[index++];const streams=await runProvider(entry,args);
        for(const s of streams){
          if(!s||typeof s.url!=='string'||!/^https?:\/\//.test(s.url)||!allowed.includes(resolution(s)))continue;
          let host='';try{host=new URL(s.url).hostname;}catch{}
          const hints={...(s.behaviorHints||{}),notWebReady:true};
          if(s.headers&&typeof s.headers==='object')hints.proxyHeaders={...(hints.proxyHeaders||{}),request:{...(hints.proxyHeaders?.request||{}),...s.headers}};
          const item={name:s.name||entry.name+(s.quality?' | '+s.quality:''),title:(s.title||s.name||entry.name)+(host?'\nHost: '+host:''),url:s.url,behaviorHints:hints};
          if(typeof s.filename==='string')item.filename=s.filename;
          all.push(item);
        }
      }}));
      return json(200,{streams:all});
    }
    return json(404,{error:'Not found'});
  }catch(error){console.error(error.message);return json(502,{error:error.message});}
});
server.listen(Number(process.env.PORT||7000),'0.0.0.0');
