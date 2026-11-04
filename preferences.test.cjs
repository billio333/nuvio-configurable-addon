const assert=require('node:assert/strict');
const policy=require('./source-policy.cjs').createPolicy();
const fresh=policy.normalize({sources:['showbox','gramcinema','4khdhub','dooflix','levidia','netmirror','cinemacity','moviebox']});
assert.deepEqual(fresh.sources,['4khdhub','dooflix']);
assert.deepEqual(fresh.resolutions,['1080','720','unknown']);
assert.ok(policy.state(fresh,'showbox').hidden);
assert.ok(policy.state(fresh,'gramcinema').hidden);
for(const id of ['levidia','netmirror','cinemacity','moviebox']){assert.ok(policy.state(fresh,id).hidden);assert.ok(policy.blocked(fresh,id));}
assert.ok(policy.blocked(fresh,'showbox'));
assert.ok(policy.blocked(fresh,'gramcinema'));
assert.equal(policy.blocked(fresh,'4khdhub'),false);
assert.deepEqual(policy.normalize({sources:['4khdhub'],resolutions:['2160','480']}).resolutions,['2160','480']);
const legacy=policy.normalize({sources:['levidia','netmirror','cinemacity','moviebox'],lowPriority:['castle','levidia','netmirror'],disabledSources:['cinemacity']});
assert.deepEqual(legacy.sources,[]);assert.deepEqual(legacy.lowPriority,['castle']);assert.deepEqual(legacy.disabledSources,[]);
const html=require('./config-page.cjs').renderConfig([{id:'4khdhub',name:'4KHDHub'},{id:'levidia',name:'Levidia / Wootly'},{id:'netmirror',name:'NetMirror'},{id:'cinemacity',name:'CinemaCity'},{id:'moviebox',name:'MovieBox'}],legacy);
for(const name of ['Levidia / Wootly','NetMirror','CinemaCity','MovieBox'])assert.ok(!html.includes('>'+name+'</label>'));
console.log(JSON.stringify({tests:'passed',checks:['failed and held providers removed from current and legacy configurations','public-link source retained','4K and 480p default off','explicit resolution choices preserved']}));
