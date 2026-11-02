const {sourceHealth}=require('./source-health.cjs');
function healthPanel(entries){
 const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const snapshot=sourceHealth.snapshot();const lines=[];
 for(const e of entries)for(const s of snapshot[e.id]||[]){
  const last=s.lastHit?new Date(s.lastHit).toISOString():'Never observed';
  const detail=s.note||('Attempts: '+s.attempts+'; raw-result hits: '+s.hits+'; distinct empty titles: '+s.distinctEmptyTitles+'; last raw-result hit: '+last+(s.phase==='cooldown'?'; retry after '+new Date(s.cooldownUntil).toISOString():'')+(s.suggestDisable?'; repeated cooldowns: consider manually disabling':''));
  lines.push('<tr><td>'+esc(e.name)+'</td><td>'+esc(s.type||'-')+'</td><td>'+esc(s.phase)+'</td><td>'+esc(detail)+'</td></tr>');
 }
 return '<section><h2>Source health — revision 1</h2><p>Reload this settings page to refresh. Counts are shared across this deployment, split by movie/TV, stored only in memory, and reset on process restart. Raw results are counted before resolution filtering; a hit does not verify playback or correct content. Eight distinct empty titles within the observation window pause a source/type for 15 minutes; the next applicable request can test recovery. Repeated empty results do not prove a source is broken or relevant to every title.</p><table><thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Observations</th></tr></thead><tbody>'+lines.join('')+'</tbody></table>'+(lines.length?'':'<p>No completed provider observations yet.</p>')+'</section>';
}
module.exports={healthPanel};
