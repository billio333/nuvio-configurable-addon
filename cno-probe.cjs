const fs=require('node:fs');
const TARGET='https://beta.cno.to/watch/show/1434-family-guy/22/1';
function createProbe(fetcher=fetch){
 let cached,expires=0,pending;
 return async function(){
  if(cached&&Date.now()<expires)return cached;if(pending)return pending;
  pending=(async()=>{
   const started=Date.now();try{
    const response=await fetcher(TARGET,{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',Accept:'text/html'}});
    const chunks=[];let size=0,truncated=false;const limit=1048576,reader=response.body?.getReader();
    if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;const remaining=limit-size;chunks.push(Buffer.from(value.subarray(0,remaining)));size+=Math.min(value.length,remaining);if(value.length>=remaining){truncated=true;await reader.cancel();break;}}}finally{reader.releaseLock();}}
    const html=Buffer.concat(chunks).toString('utf8'),$=require('cheerio').load(html),scripts=[];
    $('script[src]').each((_,el)=>{try{const u=new URL($(el).attr('src'),TARGET);if(u.origin===new URL(TARGET).origin){u.search='';u.hash='';if(!scripts.includes(u.href)&&scripts.length<24)scripts.push(u.href);}}catch{}});
    let redirectHost=null;try{if(response.headers.get('location'))redirectHost=new URL(response.headers.get('location'),TARGET).hostname;}catch{}
    return {site:'cno',httpStatus:response.status,httpOk:response.ok,contentType:(response.headers.get('content-type')||'').slice(0,100),challenge:response.headers.get('cf-mitigated')==='challenge',cloudflareRay:response.headers.has('cf-ray'),redirectHost,pageTitle:$('title').first().text().replace(/\s+/g,' ').slice(0,160),bytesInspected:size,truncated,scripts,mediaHints:{hls:/\.m3u8\b/i.test(html),videoTag:$('video').length>0,iframe:$('iframe').length>0},elapsedMs:Date.now()-started,note:'HTTP/page inspection only; no scripts executed and no playback verified. Cached for 60 seconds.'};
   }catch(error){return {site:'cno',fetchError:String(error.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,60),elapsedMs:Date.now()-started,note:'No playback verified. Cached for 60 seconds.'};}
  })().then(result=>{cached=result;expires=Date.now()+60000;return result;}).finally(()=>{pending=null;});return pending;
 };
}
function patchServer(text){
 const marker="path[0]==='site-check'&&path[1]==='cno'";if(text.includes(marker))return text;
 const anchor="if(path.length===1&&path[0]==='health')";if(text.split(anchor).length!==2)throw Error('Cno route integration anchor changed');
 return text.replace(anchor,"if(path.length===2&&path[0]==='site-check'&&path[1]==='cno')return json(200,await require('./cno-probe.cjs').checkCno());\n  "+anchor);
}
if(require.main===module)fs.writeFileSync('server.cjs',patchServer(fs.readFileSync('server.cjs','utf8')));
module.exports={createProbe,checkCno:createProbe(),patchServer};
