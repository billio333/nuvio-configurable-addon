const assert=require('node:assert/strict'),vm=require('node:vm');const {createProbe,patchServer}=require('./cno-probe.cjs');
(async()=>{
 let calls=0;const probe=createProbe(async(url,options)=>{calls++;assert.equal(url,'https://beta.cno.to/watch/show/1434-family-guy/22/1');assert.equal(options.redirect,'manual');return new Response('<title>Family Guy</title><script src="/app.js?private=test"></script><script src="https://other.invalid/x.js"></script><video></video>',{headers:{'content-type':'text/html'}});});
 const [a,b]=await Promise.all([probe(),probe()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.httpStatus,200);assert.deepEqual(a.scripts,['https://beta.cno.to/app.js']);assert.equal(a.mediaHints.videoTag,true);assert.ok(!JSON.stringify(a).includes('private'));await probe();assert.equal(calls,1);
 const refused=await createProbe(async()=>new Response('Forbidden',{status:403,headers:{'cf-ray':'test'}}))();assert.equal(refused.httpStatus,403);assert.equal(refused.cloudflareRay,true);assert.equal(refused.challenge,false);
 const failed=await createProbe(async()=>{throw Error('private error text');})();assert.equal(failed.fetchError,'Error');assert.ok(!JSON.stringify(failed).includes('private'));
 const big=await createProbe(async()=>new Response('x'.repeat(1048600)))();assert.equal(big.bytesInspected,1048576);assert.equal(big.truncated,true);
 const script=patchServer("async function route(){if(path.length===1&&path[0]==='health')return json(200,{});}");new vm.Script(script);assert.equal(patchServer(script),script);assert.throws(()=>patchServer('changed'));
 console.log(JSON.stringify({passed:true,checks:['fixed target','manual redirects','shared concurrent request','60-second cache','same-origin script URLs without query strings','403 classification','error redaction','one-megabyte inspection cap','route patch idempotence and anchor guard']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
