function mix(x){x>>>=0;x^=x>>>16;x=Math.imul(x,0x85ebca6b)>>>0;x^=x>>>13;x=Math.imul(x,0xc2b2ae35)>>>0;return (x^(x>>>16))>>>0;}
function rot(x,n){x>>>=0;n&=31;return n?((x<<n)|(x>>>(32-n)))>>>0:x;}
function decodePayload(payload,seed,id){
 if(typeof payload!=='string'||!payload.length||payload.length>4000000||!/^[A-Za-z0-9_-]+={0,2}$/.test(payload))throw Error('Invalid Movy payload');
 if(typeof seed!=='string'||!seed.length||!/^\d+$/.test(String(id))||Number(id)<1)throw Error('Invalid Movy seed or media ID');
 const bytes=Buffer.from(payload,'base64url');let h=0x811c9dc5;for(let j=0;j<seed.length;j++)h=Math.imul(h^seed.charCodeAt(j),0x1000193)>>>0;
 let n=mix(mix(h)^mix((Number(id)>>>0)^0x9e3779b9));const table=[];
 for(let j=0;j<8;j++){const i=n%61;n=rot((n+0x9e3779b9)>>>0,7+j);table[i]=(n^mix(n))>>>0;n=mix((n+i)>>>0);}
 let acc=mix(0xa5a5a5a5^n);const out=Buffer.alloc(bytes.length);
 for(let pos=0,block=0;pos<bytes.length;pos+=4,block++){
  const i=acc%61,s=((table[i]>>>0)^(Math.imul(0x9e3779b9,block+1)>>>0))>>>0;
  let b=((acc^s)|(acc&s&(0-Number(i in table))))>>>0;b=(rot((b+acc)>>>0,i)^rot(acc,Math.imul(i,7)))>>>0;
  acc=mix((b+0x9e3779b9)>>>0);table[i]=acc;for(let j=0;j<4&&pos+j<bytes.length;j++)out[pos+j]=bytes[pos+j]^((acc>>>(8*j))&255);
 }
 if(out.subarray(0,4).toString('ascii')!=='mvm1')throw Error('Movy payload verification failed');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out.subarray(4)));if(!data||!Array.isArray(data.sources))throw Error('Movy sources missing');return data;
}
const SITE='https://www.movy.sx/',API='https://api.wecollege.net';
async function getStreams(id,type,season,episode,options={}){
 if(!/^\d+$/.test(String(id))||!['movie','tv'].includes(type))throw Error('Invalid Movy media request');
 if(type==='tv'&&(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1))throw Error('Invalid Movy episode');
 const key=options.apiKey||process.env.TMDB_API_KEY;if(!key)throw Error('Movy requires TMDB_API_KEY for metadata');
 const fetcher=options.fetch||fetch,log=options.log||(()=>{}),headers={Referer:SITE,Origin:SITE.slice(0,-1),'User-Agent':'Mozilla/5.0','Accept':'application/json, text/plain, */*'};
 async function request(url,phase,allow401=false){
  log('movy_phase',{phase});const response=await fetcher(url,{headers,signal:AbortSignal.timeout(6000)});
  if(!response.ok&&!(allow401&&response.status===401)){log('movy_http_error',{phase,status:response.status});throw Error('Movy upstream request failed');}return response;
 }
 const metadataUrl=new URL('https://api.themoviedb.org/3/'+type+'/'+id);metadataUrl.searchParams.set('api_key',key);metadataUrl.searchParams.set('append_to_response','external_ids');
 const meta=await (await request(metadataUrl,'metadata')).json();const title=type==='tv'?meta.name:meta.title;if(typeof title!=='string'||!title)throw Error('Movy title metadata missing');
 const year=String(type==='tv'?meta.first_air_date||'':meta.release_date||'').slice(0,4);
 for(let attempt=0;attempt<2;attempt++){
  const seedUrl=new URL(API+'/seed');seedUrl.searchParams.set('mediaId',String(id));const seedData=await (await request(seedUrl,'seed')).json();
  if(typeof seedData.seed!=='string'||!seedData.seed.length)throw Error('Movy seed response invalid');
  const url=new URL(API+'/miami/sources');const params={title:encodeURIComponent(title),mediaType:type,year:year||undefined,totalSeasons:meta.number_of_seasons,episodeId:type==='tv'?episode:undefined,seasonId:type==='tv'?season:undefined,tmdbId:id,imdbId:meta.external_ids?.imdb_id||meta.imdb_id||undefined,enc:'2',seed:seedData.seed};
  for(const [name,value] of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(name,String(value));
  const response=await request(url,'sources',true);if(response.status===401){log('movy_seed_rejected',{attempt:attempt+1});if(!attempt)continue;throw Error('Movy seed rejected twice');}
  const text=(await response.text()).trim();log('movy_phase',{phase:'decode'});const data=decodePayload(text,seedData.seed,id),seen=new Set(),streams=[];
  for(const source of data.sources){
   if(!source||typeof source.url!=='string')continue;let parsed;try{parsed=new URL(source.url);}catch{continue;}if(!['https:','http:'].includes(parsed.protocol)||seen.has(source.url))continue;seen.add(source.url);
   const quality=String(source.quality||'Unknown').slice(0,40);streams.push({name:'Movy - Miami | '+quality,title:title+(year?' ('+year+')':'')+(type==='tv'?' S'+season+'E'+episode:'')+'\nMovy / Miami | '+quality,url:source.url,quality,headers:{Referer:SITE}});
  }
  log('movy_decoded',{count:streams.length});return streams;
 }
 return [];
}
module.exports={getStreams,decodePayload};
