const http = require('node:http');
const { Worker } = require('node:worker_threads');
const ROOT = 'https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/';
let cached, cachedAt = 0;
async function inventory() {
  if (!cached || Date.now() - cachedAt > 600000) {
    const r = await fetch(ROOT + 'manifest.json', {signal: AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error('Upstream manifest unavailable');
    const data = await r.json();
    if (!Array.isArray(data.scrapers)) throw new Error('Invalid upstream manifest');
    cached = data.scrapers; cachedAt = Date.now();
  }
  return cached;
}
function manifest(configured) {
  return {id:'community.billio333.nuvio-select', version:'0.1.0', name:'Nuvio Source Select', description:'Experimental configurable All-in-One-Nuvio bridge', resources:['stream'], types:['movie','series'], catalogs:[], behaviorHints:{configurable:true,configurationRequired:!configured}};
}
function decode(token) {
  if (token.length > 12000) throw new Error('Configuration too large');
  const c = JSON.parse(Buffer.from(token,'base64url').toString('utf8'));
  if (!Array.isArray(c.sources) || c.sources.length > 100 || c.sources.some(x => typeof x !== 'string')) throw new Error('Invalid source selection');
  return c;
}
function runProvider(entry, args) {
  return new Promise(resolve => {
    const worker = new Worker(require.resolve('./provider-worker.cjs'), {workerData:{root:ROOT,entry,args},resourceLimits:{maxOldGenerationSizeMb:96}});
    const timer = setTimeout(() => {worker.terminate(); resolve([]);},20000);
    const done = value => {clearTimeout(timer); worker.terminate(); resolve(Array.isArray(value)?value:[]);};
    worker.once('message',done); worker.once('error',() => done([])); worker.once('exit',() => done([]));
  });
}
async function identifier(type,id) {
  const pieces = id.split(':');
  const isTmdb = pieces[0] === 'tmdb';
  let tmdb = isTmdb ? pieces[1] : pieces[0];
  const offset = isTmdb ? 2 : 1;
  if (/^tt\d+$/.test(tmdb)) {
    if (!process.env.TMDB_API_KEY) throw new Error('IMDb lookup requires TMDB_API_KEY on the service');
    const url = new URL('https://api.themoviedb.org/3/find/' + tmdb);
    url.searchParams.set('api_key',process.env.TMDB_API_KEY); url.searchParams.set('external_source','imdb_id');
    const r = await fetch(url,{signal:AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error('TMDB lookup failed');
    const data = await r.json();
    const match = (type === 'movie' ? data.movie_results : data.tv_results)?.[0];
    if (!match) throw new Error('No TMDB mapping found');
    tmdb = String(match.id);
  }
  if (!/^\d+$/.test(tmdb)) throw new Error('Unsupported media identifier');
  const season = type === 'series' ? Number(pieces[offset]) : null;
  const episode = type === 'series' ? Number(pieces[offset+1]) : null;
  if (type === 'series' && (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1)) throw new Error('Invalid episode');
  return [tmdb,type === 'series' ? 'tv':'movie',season,episode];
}
function escapeHtml(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function configure(token) {
  const entries = await inventory();
  const selected = token ? decode(token).sources : [];
  const boxes = entries.map(e=>'<label><input type="checkbox" value="'+escapeHtml(e.id)+'" '+(selected.includes(e.id)?'checked':'')+'>'+escapeHtml(e.name)+'</label>').join('');
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nuvio Source Select</title><style>body{font:16px system-ui;max-width:750px;margin:30px auto;padding:16px}label{display:block;padding:8px}textarea{width:100%;height:100px}button{margin:12px;padding:10px}</style><h1>Nuvio Source Select</h1><p>Select sources, generate a URL, then install that URL in Nuvio Addons. To change sources, generate a new URL and replace the installed addon. Provider compatibility is experimental.</p><button id="all">Select all</button><button id="none">Clear</button><form>'+boxes+'<button>Generate install URL</button></form><textarea readonly placeholder="Your manifest URL appears here"></textarea><script>document.querySelector("#all").onclick=()=>document.querySelectorAll("input").forEach(x=>x.checked=true);document.querySelector("#none").onclick=()=>document.querySelectorAll("input").forEach(x=>x.checked=false);document.querySelector("form").onsubmit=e=>{e.preventDefault();const sources=Array.from(document.querySelectorAll("input:checked")).map(x=>x.value);const bytes=new TextEncoder().encode(JSON.stringify({sources}));const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");document.querySelector("textarea").value=location.origin+"/"+token+"/manifest.json";};</script>';
}
const server = http.createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','*');
  if (req.method === 'OPTIONS') {res.writeHead(204); return res.end();}
  if (req.method !== 'GET') {res.writeHead(405); return res.end();}
  const json = (status,data) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    const path = new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (path.length === 1 && path[0] === 'health') return json(200,{ok:true});
    if (!path.length || (path.length === 1 && path[0] === 'configure') || (path.length === 2 && path[1] === 'configure')) {
      const html = await configure(path.length === 2 ? path[0]:null);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
    }
    if (path.length === 1 && path[0] === 'manifest.json') return json(200,manifest(false));
    if (path.length === 2 && path[1] === 'manifest.json') {decode(path[0]);return json(200,manifest(true));}
    if (path.length === 4 && path[1] === 'stream' && ['movie','series'].includes(path[2]) && path[3].endsWith('.json')) {
      const config = decode(path[0]);
      const entries = (await inventory()).filter(e=>config.sources.includes(e.id) && (!e.supportedTypes || e.supportedTypes.includes(path[2] === 'series'?'tv':'movie')));
      if (!entries.length) return json(200,{streams:[]});
      const args = await identifier(path[2],path[3].slice(0,-5));
      const all = [];
      let index = 0;
      await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(index<entries.length){const entry=entries[index++];const streams=await runProvider(entry,args);for(const s of streams){if(!s || typeof s.url !== 'string' || !/^https?:\/\//.test(s.url))continue;const item={name:entry.name+(s.quality?' | '+s.quality:''),title:s.title||s.name||entry.name,url:s.url,behaviorHints:{notWebReady:true}};if(s.headers && typeof s.headers==='object')item.behaviorHints.proxyHeaders={request:s.headers};all.push(item);}}}));
      return json(200,{streams:all});
    }
    return json(404,{error:'Not found'});
  } catch(error) {console.error(error.message);return json(502,{error:error.message});}
});
server.listen(Number(process.env.PORT || 7000),'0.0.0.0');
