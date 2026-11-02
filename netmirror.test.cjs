const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {createService}=require('./netmirror-service.cjs');
(async()=>{
let launches=0,runs=0;class Fake extends EventEmitter{postMessage(m){runs++;setTimeout(()=>this.emit('message',{kind:'result',id:m.id,streams:[{url:'https://example.invalid/video'}]}),35);}terminate(){return Promise.resolve();}}
const service=createService({factory:()=>{launches++;const w=new Fake();setTimeout(()=>w.emit('message',{kind:'ready'}),5);return w;},warmMs:1000,jobMs:1000,idleMs:1000,cooldownMs:10});
const args=['1','tv',1,1],entry={id:'netmirror'},opts=()=>({root:'unused',deadline:Date.now()+1000});
assert.deepEqual(await service.request(entry,args,opts()),[]);await new Promise(r=>setTimeout(r,15));assert.equal(service.status().phase,'ready');
const controller=new AbortController();const first=service.request(entry,args,{...opts(),signal:controller.signal});setTimeout(()=>controller.abort(),5);assert.deepEqual(await first,[]);assert.equal(service.status().worker,true);
await new Promise(r=>setTimeout(r,50));assert.equal((await service.request(entry,args,opts())).length,1);assert.equal(launches,1);assert.equal(runs,1);
await service.request(entry,['1','tv',1,2],opts());assert.equal(launches,1);assert.equal(runs,2);service.close();
console.log(JSON.stringify({tests:'passed',workerLaunches:launches,episodeJobs:runs,checks:['warmup','cookie-context reuse','caller cancellation preserves job','background result cache']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
