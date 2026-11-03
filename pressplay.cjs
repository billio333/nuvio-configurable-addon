const {chromium}=require('playwright-core');
let busy=false;
function parseMaster(text,base){
 const lines=text.split('\n').map(x=>x.trim());const out=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
  const height=Number(lines[i].match(/RESOLUTION=\d+x(\d+)/i)?.[1]||0);
  let j=i+1;while(j<lines.length&&(!lines[j]||lines[j].startsWith('#')))j++;
  if(j<lines.length){const url=new URL(lines[j],base);if(['http:','https:'].includes(url.protocol))out.push({url:url.href,height});}
 }
 if(!out.length&&text.includes('#EXTINF:'))out.push({url:base,height:0});
 return out.sort((a,b)=>b.height-a.height).filter((v,i,a)=>a.findIndex(x=>x.height===v.height)===i).slice(0,4);
}
function firstSegment(text,base){const line=text.split('\n').map(x=>x.trim()).find(x=>x&&!x.startsWith('#'));if(!line)return null;const u=new URL(line,base);return ['http:','https:'].includes(u.protocol)?u.href:null;}
async function getStreams(id,type,season,episode,{signal,deadline=Date.now()+60000}={}){
 if(busy||signal?.aborted||!/^\d+$/.test(String(id))||!['movie','tv'].includes(type))return [];
 if(type==='tv'&&(!Number.isInteger(season)||season<1||!Number.isInteger(episode)||episode<1))return [];
 busy=true;let browser;const started=Date.now();const streams=[];
 const log=data=>console.log(JSON.stringify({event:'pressplay_provider',...data,ms:Date.now()-started}));
 const close=()=>{if(browser)browser.close().catch(()=>{});};
 const requestSignal=ms=>{const timer=AbortSignal.timeout(Math.max(1,Math.min(ms,deadline-Date.now())));return signal?AbortSignal.any([timer,signal]):timer;};
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,timeout:15000,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  if(signal?.aborted)return [];
  signal?.addEventListener('abort',close,{once:true});
  const context=await browser.newContext();const page=await context.newPage();
  context.on('page',p=>{if(p!==page)p.close().catch(()=>{});});
  await context.route('**/*',route=>{const r=route.request(),u=r.url();if(['image','font','media'].includes(r.resourceType())&&!u.includes('.m3u8'))return route.abort();if(u.includes('anemonytahua.com')||u.includes('tectrixsnavvle.com'))return route.abort();return route.continue();});
  const budget=Math.min(35000,deadline-Date.now()-15000);if(budget<1000)return [];
  const pending=page.waitForResponse(r=>r.url().includes('.m3u8')||/mpegurl/i.test(r.headers()['content-type']||''),{timeout:budget}).then(r=>r,()=>null);
  const embed='https://moviesapi.to/'+(type==='movie'?'movie/'+id:'tv/'+id+'-'+season+'-'+episode)+'?autoPlay=true&poster=false';
  await page.goto(embed,{waitUntil:'domcontentloaded',timeout:Math.min(15000,budget),referer:'https://pressplayz.top/'}).catch(()=>{});
  const response=await pending;if(!response){log({stage:'playlist_not_found',count:0});return [];}
  const master=response.url(),origin=new URL(master).origin;
  const captured=await response.request().allHeaders();const headers={};
  for(const k of ['referer','origin','user-agent'])if(captured[k])headers[k]=captured[k];
  const cookies=await context.cookies(master);if(cookies.length)headers.cookie=cookies.map(c=>c.name+'='+c.value).join('; ');
  const forUrl=url=>{const h={...headers};if(new URL(url).origin!==origin)delete h.cookie;return h;};
  const r=await fetch(master,{headers:forUrl(master),signal:requestSignal(5000)});const text=await r.text();if(!r.ok||!text.trimStart().startsWith('#EXTM3U')){log({stage:'master_unavailable',status:r.status,count:0});return [];}
  await browser.close();browser=null;
  for(const variant of parseMaster(text,r.url||master)){
   if(signal?.aborted||deadline-Date.now()<1500)break;
   try{
    const h=forUrl(variant.url);const v=await fetch(variant.url,{headers:h,signal:requestSignal(4000)});const body=await v.text();if(!v.ok||!body.trimStart().startsWith('#EXTM3U')||!body.includes('#EXTINF:'))continue;
    const segment=firstSegment(body,v.url||variant.url);if(!segment)continue;
    const sample=await fetch(segment,{headers:{...forUrl(segment),Range:'bytes=0-1023'},signal:requestSignal(4000)});
    if(!sample.ok||!sample.body){await sample.body?.cancel();continue;}
    const reader=sample.body.getReader();let bytes;try{bytes=(await reader.read()).value;}finally{await reader.cancel().catch(()=>{});}
    if(!bytes?.length||/text\/html/i.test(sample.headers.get('content-type')||''))continue;
    const quality=variant.height?variant.height+'p':'unknown';
    streams.push({name:'PressPlay / MoviesAPI',title:'PressPlay / MoviesAPI | '+quality,quality,url:variant.url,headers:h});
   }catch(error){log({stage:'variant_failed',error:error.name});}
  }
  log({stage:'completed',count:streams.length});return streams;
 }catch(error){log({stage:'failed',error:error.name,count:streams.length});return streams;}
 finally{signal?.removeEventListener('abort',close);if(browser)await browser.close().catch(()=>{});busy=false;}
}
module.exports={getStreams,parseMaster,firstSegment};
