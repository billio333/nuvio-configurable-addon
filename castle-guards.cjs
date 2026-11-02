function installCastleGuards(context,args,log){
 const clean=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s*\(\d{4}\)\s*$/,'').replace(/\s+season\s+\d+\s*$/,'').replace(/[^a-z0-9]+/g,' ').trim();
 const year=value=>{const m=String(value||'').match(/\b(?:19|20)\d{2}\b/);return m?Number(m[0]):null;};
 let expected=null;
 function validate(item){
  const name=item.title||item.name;if(!name||clean(name)!==clean(expected.title))return false;
  const y=year(item.year||item.releaseDate||item.release_date||item.first_air_date);if(y&&expected.year&&y!==Number(expected.year))return false;
  const tmdb=item.tmdbId||item.tmdb_id;if(tmdb&&String(tmdb)!==String(expected.tmdbId))return false;
  const type=String(item.type||item.mediaType||'').toLowerCase();if(args[1]==='tv'&&type==='movie')return false;if(args[1]==='movie'&&['tv','series'].includes(type))return false;return true;
 }
 if(typeof context.searchCastle!=='function'||typeof context.extractDataBlock!=='function'||typeof context.getDetails!=='function')throw new Error('Castle interface changed');
 context.findCastleMovieId=async(key,details)=>{
  expected=details;const query=details.title+(details.year?' '+details.year:'');const data=context.extractDataBlock(await context.searchCastle(key,query));
  const rows=Array.isArray(data.rows)?data.rows:[];const ids=[...new Set(rows.filter(validate).map(x=>x.id||x.redirectId||x.redirectIdStr).filter(Boolean).map(String))];
  if(ids.length!==1){log('castle_match_rejected',{candidates:rows.length,acceptedIds:ids.length});throw new Error('No unique strict Castle match');}
  log('castle_strict_candidate_selected');return ids[0];
 };
 const original=context.getDetails;
 context.getDetails=async(...callArgs)=>{
  const result=await original(...callArgs);const block=context.extractDataBlock(result);
  if((block.title||block.name)&&!validate(block)){log('castle_detail_mismatch');throw new Error('Castle details mismatch');}
  if(args[1]==='tv'){
   const season=Number(args[2]),episode=Number(args[3]);const seasons=Array.isArray(block.seasons)?block.seasons:[];
   if(seasons.length&&!seasons.some(x=>Number(x.number)===season))throw new Error('Requested Castle season unavailable');
   const known=Number(block.seasonNumber||block.seasonNo||(typeof block.season==='number'?block.season:0));
   if(known&&known!==season&&!seasons.length)throw new Error('Castle season mismatch');
   if(season>1&&!seasons.length&&!known)throw new Error('Castle season cannot be verified');
   if(!Array.isArray(block.episodes)||!block.episodes.some(x=>Number(x.number)===episode))throw new Error('Requested Castle episode unavailable');
  }return result;
 };
}
module.exports={installCastleGuards};
