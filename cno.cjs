const BASE='https://beta.cno.to';
async function getStreams(id,type,season,episode,options={}){
 if(!/^\d+$/.test(String(id))||!['movie','tv'].includes(type))throw Error('Invalid Cno media request');
 if(type==='tv'&&(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1))throw Error('Invalid Cno episode');
 const path=type==='tv'?'/screen-api/tv/'+id+'/episode/'+season+'/'+episode:'/screen-api/movie/'+id;
 const log=options.log||(()=>{});log('cno_phase',{phase:'sources'});
 const response=await (options.fetch||fetch)(BASE+path,{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json',Referer:BASE+'/',Origin:BASE,'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'}});
 if(!response.ok){log('cno_http_error',{phase:'sources',status:response.status,contentType:(response.headers.get('content-type')||'').slice(0,100),challenge:response.headers.get('cf-mitigated')==='challenge',cloudflareRay:response.headers.has('cf-ray')});throw Error('Cno source API request failed');}
 let data;try{data=await response.json();}catch{log('cno_parse_error',{contentType:(response.headers.get('content-type')||'').slice(0,100)});throw Error('Cno source API did not return JSON');}
 if(!data||!Array.isArray(data.sources))throw Error('Cno sources array missing');
 const streams=[],seen=new Set();for(const source of data.sources.slice(0,100)){
  if(!source||source.kind!=='hls'||typeof source.url!=='string'||!source.url.trim())continue;
  let url;try{url=new URL(source.url,BASE);}catch{continue;}if(!['https:','http:'].includes(url.protocol)||seen.has(url.href))continue;seen.add(url.href);
  const label=String(source.label||'HLS').replace(/[\r\n]/g,' ').slice(0,80),quality=String(source.quality||'Auto').slice(0,40);
  streams.push({name:'Cno | '+label+' | '+quality,title:'TMDB '+type+' '+id+(type==='tv'?' | S'+season+'E'+episode:'')+'\n'+label+' | '+quality,url:url.href,quality,headers:{Referer:BASE+'/',Origin:BASE}});
 }
 log('cno_sources',{reported:data.sources.length,hls:streams.length,embeds:data.sources.filter(s=>s&&s.kind==='embed').length});return streams;
}
module.exports={getStreams};
