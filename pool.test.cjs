const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const mod={exports:{}};
 const health={begin:()=>true,release(){},record(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./pool.cjs'),'utf8'),{module:mod,require:id=>id==='./source-health.cjs'?{sourceHealth:health}:{createSharedExecutor:fn=>fn,isCancelledResult:()=>false},AbortController,setTimeout,clearTimeout,console:{log(){}}});
 const {createPool}=mod.exports;
 let active=0,peak=0,browser=false;const started=[],finished=[];
 const pool=createPool(4,(entry,args,signal)=>new Promise(resolve=>{
  assert.ok(!browser,'No provider may start while PressPlay runs');
  if(entry.id==='pressplay'){assert.equal(active,0,'PressPlay must wait for all active providers');browser=true;}
  active++;peak=Math.max(peak,active);started.push(entry.id);
  let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',finish);active--;if(entry.id==='pressplay')browser=false;finished.push(entry.id);resolve([{url:'https://example.org/'+entry.id}]);};
  const timer=setTimeout(finish,entry.ms||10);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish();
 }));
 const deadline=Date.now()+1000;
 const first=pool([{id:'pressplay'},{id:'4khdhub',ms:35},{id:'cno'},{id:'castle'}],[],{deadline});
 const second=pool([{id:'other',ms:20}],[],{deadline});
 const results=await Promise.all([first,second]);
 assert.equal(peak,2);assert.equal(results.flat().length,5);assert.equal(started.at(-1),'pressplay');
 const browserRun=pool([{id:'pressplay',ms:25}],[],{deadline:Date.now()+500});
 const later=pool([{id:'later'}],[],{deadline:Date.now()+500});
 await Promise.all([browserRun,later]);
 assert.ok(finished.indexOf('later')>finished.lastIndexOf('pressplay'));
 const partial=await pool([{id:'fast',ms:5},{id:'slow',ms:200},{id:'pressplay'}],[],{deadline:Date.now()+30});
 assert.equal(partial.length,1);assert.equal(partial[0].entry.id,'fast');
 const controller=new AbortController();const pending=pool([{id:'cancel',ms:200},{id:'pressplay'}],[],{deadline:Date.now()+500,signal:controller.signal});controller.abort();assert.equal((await pending).length,0);
 await new Promise(r=>setTimeout(r,5));
 assert.equal((await pool([{id:'recovery'}],[],{deadline:Date.now()+500})).length,1);
 console.log(JSON.stringify({schedulingTests:'passed',peakNonBrowser:peak,pressplayExclusive:true,partialDeadline:true,cancellationRecovery:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
