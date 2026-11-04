'use strict';
// Reusable stream-result formatter. Display only: never alters url, headers, or content identity.
// Only shows metadata that is actually present in the provider result or its filename.
const PROVIDERS={'4khdhub':'4KHDHub',cno:'CNO',pressplay:'PressPlay',castle:'Castle','movy-miami':'Movy',vidfast:'VidFast'};
const HOSTS=[[/pixeldrain/i,'Pixeldrain'],[/r2\.cloudflarestorage\.com$/i,'Cloudflare R2'],[/hubcloud/i,'HubCloud'],[/hubdrive/i,'HubDrive'],[/workers\.dev$/i,'Cloudflare Worker'],[/googleusercontent|drive\.google/i,'Google Drive'],[/mega\.nz$/i,'Mega'],[/gofile/i,'GoFile']];
const clean=v=>String(v==null?'':v).replace(/[\u200B-\u200D\uFEFF\r]/g,'').trim();
function providerLabel(entry){const id=entry&&entry.id;if(PROVIDERS[id])return PROVIDERS[id];const n=clean(entry&&entry.name).replace(/\s*[-(–].*$/,'').trim();return n||clean(id)||'Source';}
function hostLabel(url){let h='';try{h=new URL(url).hostname;}catch{return '';}for(const [re,l] of HOSTS)if(re.test(h))return l;const parts=h.replace(/^www\./,'').split('.');const base=parts.length>1?parts[parts.length-2]:parts[0];return base?base[0].toUpperCase()+base.slice(1):'';}
function looksLikeFilename(t){return /\.(mkv|mp4|avi|webm|m4v|ts)$/i.test(t)||/(?:^|[.\s])(?:2160|1080|720|480)p?(?=[.\s]|$)/i.test(t)&&/\.[A-Za-z0-9]/.test(t)&&!/\s/.test(t);}
function findFilename(s){if(typeof s.filename==='string'&&clean(s.filename))return clean(s.filename);const b=s.behaviorHints&&s.behaviorHints.filename;if(typeof b==='string'&&clean(b))return clean(b);for(const line of String(s.title||'').split('\n').map(clean))if(/\.(mkv|mp4|avi|webm|m4v)$/i.test(line))return line;return '';}
function parseMeta(text){
 const t=' '+clean(text).replace(/[._]+/g,' ')+' ';const out={};
 let m=/[ ](2160|1080|720|480)\s?[pi]?(?=[ ]|$)/i.exec(t);if(m)out.resolution=m[1]+'p';else if(/[ ](?:4k|uhd)(?=[ ])/i.test(t))out.resolution='2160p';
 m=/[ ](WEB[ -]?DL|WEB[ -]?Rip|WEB|BluRay|Blu[ -]Ray|BDRip|BRRip|REMUX|HDTV|DVDRip|HDRip)(?=[ -])/i.exec(t);if(m){const v=m[1].toLowerCase().replace(/[ ]/g,'-');out.source=({'web-dl':'WEB-DL','webdl':'WEB-DL','web-rip':'WEBRip','webrip':'WEBRip','web':'WEB','bluray':'BluRay','blu-ray':'BluRay','bdrip':'BDRip','brrip':'BRRip','remux':'REMUX','hdtv':'HDTV','dvdrip':'DVDRip','hdrip':'HDRip'})[v]||m[1];}
 m=/[ ](H ?\.? ?264|x ?264|AVC|H ?\.? ?265|x ?265|HEVC|AV1)(?=[ -])/i.exec(t.replace(/H 264/gi,'H.264').replace(/H 265/gi,'H.265'));if(m){const v=m[1].toLowerCase().replace(/\s/g,'');out.codec=/264|avc/.test(v)?(v==='x264'?'x264':'H.264'):/265|hevc/.test(v)?(v==='x265'?'x265':'HEVC'):'AV1';}
 m=/[ ](TrueHD(?: Atmos)?|DDP ?\+?|DD\+|DD|EAC3|AC3|DTS(?: HD(?: MA)?)?|AAC|FLAC|Opus)(?: ?(\d) ?(\d))?(?=[ -])/i.exec(t.replace(/\b(DD\+|DDP|DD|AAC|DTS|FLAC|EAC3|AC3)(\d) (\d)\b/gi,'$1 $2 $3'));
 if(m){let a=m[1].replace(/\s+/g,' ').replace(/^DDP.*|^DD\+$/i,'DDP').replace(/^EAC3$/i,'DDP').replace(/^AC3$/i,'DD');if(/^dts/i.test(a))a=a.toUpperCase().replace('DTS HD MA','DTS-HD MA').replace('DTS HD','DTS-HD');if(/^aac$/i.test(a))a='AAC';out.audio=a+(m[2]?' '+m[2]+'.'+m[3]:'');}
 const hdr=[];if(/[ ](?:DV|Dolby Vision)(?=[ ])/i.test(t))hdr.push('Dolby Vision');if(/[ ]HDR10\+(?=[ ])/i.test(t))hdr.push('HDR10+');else if(/[ ]HDR10(?=[ ])/i.test(t))hdr.push('HDR10');else if(/[ ]HDR(?=[ ])/i.test(t))hdr.push('HDR');if(hdr.length)out.hdr=hdr.join(' ');
 return out;
}
function parseEpisode(name){const m=/(?:^|[^A-Za-z0-9])S(\d{1,2})[ ._-]?E(\d{1,3})(?![0-9])/i.exec(name);if(!m)return null;const before=name.slice(0,m.index).replace(/[._]+/g,' ').replace(/\s*\(?\d{4}\)?\s*$/,'').trim();let after=name.slice(m.index+m[0].length).replace(/^[\s._-]+/,'');after=after.replace(/\.(mkv|mp4|avi|webm|m4v)$/i,'');const cut=/(?:^|[._ -])(?:2160p?|1080p?|720p?|480p?|4k|uhd|WEB|BluRay|HDTV|REMUX|AMZN|NF|DSNP|HMAX|ATVP|PCOK|HULU|PMTP|iT)(?=[._ -]|$)/i.exec(after);if(cut)after=after.slice(0,cut.index);const epTitle=after.replace(/[._]+/g,' ').trim();return {show:before,season:+m[1],episode:+m[2],epTitle};}
function pad(n){return String(n).padStart(2,'0');}
function formatSize(s,text){let bytes=null;for(const k of ['size','sizeBytes','bytes'])if(Number.isFinite(Number(s[k]))&&Number(s[k])>1e6){bytes=Number(s[k]);break;}if(!bytes&&s.behaviorHints&&Number(s.behaviorHints.videoSize)>1e6)bytes=Number(s.behaviorHints.videoSize);if(bytes){return bytes>=1073741824?(bytes/1073741824).toFixed(bytes>=10737418240?1:2).replace(/\.?0+$/,'')+' GB':Math.round(bytes/1048576)+' MB';}
 const m=/(\d+(?:\.\d+)?)\s?(GB|GiB|MB|MiB)\b/i.exec(text||'');if(!m)return '';const n=parseFloat(m[1]);return /^g/i.test(m[2])?(n.toFixed(2).replace(/\.?0+$/,'')+' GB'):Math.round(n)+' MB';}
/**
 * @param {{entry:{id:string,name?:string},stream:object,request?:{type:'movie'|'series',season?:number,episode?:number},lowConfidence?:boolean}} input
 * @returns {{name:string,title:string,filename:string,resolution:string}}
 */
function formatStream({entry,stream,request={},lowConfidence=false}){
 const s=stream||{};const provider=providerLabel(entry);const filename=findFilename(s);
 const blob=[filename,s.title,s.name,s.quality].map(clean).filter(Boolean).join(' ');
 const meta=parseMeta(filename||blob);const fallback=parseMeta(blob);for(const k of Object.keys(fallback))if(!meta[k])meta[k]=fallback[k];
 if(!meta.resolution){const q=parseMeta(clean(s.quality));if(q.resolution)meta.resolution=q.resolution;}
 const isHls=/\.m3u8(?:[?#]|$)/i.test(s.url||'')||/hls/i.test(clean(s.name)+' '+clean(s.title));
 const res=meta.resolution||'Auto';
 const head=[provider,res];if(meta.source)head.push(meta.source);
 let line2='';const ep=filename?parseEpisode(filename):null;
 const wantTv=request.type==='series'&&Number.isInteger(request.season)&&Number.isInteger(request.episode);
 if(ep){line2=[ep.show,'S'+pad(ep.season)+'E'+pad(ep.episode),ep.epTitle].filter(Boolean).join(' — ');}
 else if(wantTv)line2='S'+pad(request.season)+'E'+pad(request.episode);
 else if(filename)line2=filename.replace(/\.(mkv|mp4|avi|webm|m4v)$/i,'').replace(/[._]+/g,' ');
 const tech=[meta.codec,meta.audio,meta.hdr,formatSize(s,blob)].filter(Boolean).join(' • ');
 let line3='';
 if(entry&&entry.id==='cno'){const srv=/\/api\/s\/(\d+)\//.exec(s.url||'')||/Server\s*(\d+)/i.exec(clean(s.name));line3=[srv?'Server '+srv[1]:'',isHls?'HLS':''].filter(Boolean).join(' • ');}
 else{const h=hostLabel(s.url);line3=[h?'Host: '+h:'',isHls?'HLS':''].filter(Boolean).join(' • ');}
 const name=(lowConfidence?'Low confidence | ':'')+head.join(' • ');
 const title=[line2,tech,line3].filter(Boolean).join('\n')||name;
 return {name,title,filename,resolution:meta.resolution||'unknown'};
}
module.exports={formatStream,parseMeta,parseEpisode,hostLabel,providerLabel};
