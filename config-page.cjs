const HIDDEN_SOURCES=new Set(['desiflix','dahmermovies','dahmermovies-tv','topcartoons']);
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function browserScript(){
  const form=document.querySelector('form');
  form.onsubmit=e=>e.preventDefault();
  document.querySelector('#all').onclick=()=>document.querySelectorAll('input[name=source]').forEach(x=>x.checked=true);
  document.querySelector('#none').onclick=()=>document.querySelectorAll('input[name=source]').forEach(x=>x.checked=false);
  document.querySelector('#generate').onclick=()=>{
    try{
      const sources=Array.from(document.querySelectorAll('input[name=source]:checked')).map(x=>x.value);
      const resolutions=Array.from(document.querySelectorAll('input[name=resolution]:checked')).map(x=>x.value);
      if(!sources.length||!resolutions.length)throw new Error('Select at least one source and one resolution.');
      const bytes=new TextEncoder().encode(JSON.stringify({sources,resolutions}));
      const token=btoa(String.fromCharCode(...bytes)).split('+').join('-').split('/').join('_').split('=').join('');
      const output=document.querySelector('textarea');output.value=location.origin+'/'+token+'/manifest.json';
      const link=document.querySelector('#reconfigure');link.href=location.origin+'/'+token+'/configure';link.hidden=false;
      document.querySelector('#status').textContent='Generated URL for '+sources.length+' sources. Copy it into Nuvio and replace the previous addon configuration.';
      output.focus();output.select();
    }catch(error){document.querySelector('#status').textContent=error.message;}
  };
}
function renderConfig(entries,config){
  const qualities=[['2160','4K / 2160p'],['1080','1080p'],['720','720p'],['480','480p'],['unknown','Unknown / Other']];
  const allowed=config.resolutions===undefined?qualities.map(x=>x[0]):config.resolutions;
  const qualityBoxes=qualities.map(([id,name])=>'<label><input type="checkbox" name="resolution" value="'+id+'" '+(allowed.includes(id)?'checked':'')+'>'+name+'</label>').join('');
  const sourceBoxes=entries.filter(e=>!HIDDEN_SOURCES.has(e.id)).map(e=>'<label><input type="checkbox" name="source" value="'+escapeHtml(e.id)+'" '+(config.sources.includes(e.id)?'checked':'')+'>'+escapeHtml(e.name)+'</label>').join('');
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nuvio Source Select</title><style>body{font:16px system-ui;max-width:750px;margin:30px auto;padding:16px}label{display:block;padding:8px}textarea{width:100%;height:120px}button{margin:10px;padding:10px}fieldset{margin:16px 0}</style><h1>Nuvio Source Select</h1><p>Source selector revision 2. Experimental provider bridge; playback is not guaranteed.</p><form><fieldset><legend>Allowed resolutions</legend>'+qualityBoxes+'<p>Resolution is inferred from provider labels. Unknown / Other includes unrecognized or unlabeled qualities. Filtering does not convert video or guarantee playback.</p></fieldset><fieldset><legend>Sources</legend><p>Requests use a shared worker limit and an overall deadline. Selecting every source does not guarantee every provider is queried or returns results.</p><button type="button" id="all">Select all sources</button><button type="button" id="none">Clear sources</button>'+sourceBoxes+'</fieldset><button type="button" id="generate">Generate install URL</button></form><p id="status" role="status"></p><textarea readonly aria-label="Manifest URL"></textarea><p><a hidden id="reconfigure">Reopen these settings</a></p><script>('+browserScript.toString()+')();</script>';
}
module.exports={renderConfig};
