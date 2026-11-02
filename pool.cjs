function createPool(limit,execute){
  let active=0;const waiting=[];let batches=0;
  function pump(){
    while(active<limit&&waiting.length){
      const b=waiting.shift();if(b.finished)continue;
      if(Date.now()>=b.deadline){b.finish('deadline');continue;}
      const entry=b.pending.shift();if(b.pending.length)waiting.push(b);
      active++;b.running++;
      Promise.resolve().then(()=>execute(entry,b.args,b.controller.signal,b.deadline)).then(streams=>{
        if(!b.finished)b.results.push({entry,streams:Array.isArray(streams)?streams:[]});
      },()=>{}).finally(()=>{active--;b.running--;if(!b.finished&&!b.pending.length&&!b.running)b.finish('complete');pump();});
    }
  }
  return function run(entries,args,{deadline,signal}={}){
    if(batches>=16)return Promise.reject(new Error('Service busy; retry shortly'));
    batches++;
    return new Promise(resolve=>{
      const b={pending:entries.slice(),args,deadline:deadline||Date.now()+18000,controller:new AbortController(),results:[],running:0,finished:false};
      let timer;const abort=()=>b.finish('client_disconnected');
      b.finish=reason=>{
        if(b.finished)return;b.finished=true;batches--;clearTimeout(timer);
        if(signal)signal.removeEventListener('abort',abort);
        b.controller.abort();for(let i=waiting.length-1;i>=0;i--)if(waiting[i]===b)waiting.splice(i,1);
        console.log(JSON.stringify({event:'batch_finished',reason,completed:b.results.length,unfinished:b.pending.length+b.running}));
        resolve(b.results);
      };
      if(!entries.length)return b.finish('complete');
      if(signal?.aborted)return b.finish('client_disconnected');
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>b.finish('deadline'),Math.max(0,b.deadline-Date.now()));
      waiting.push(b);pump();
    });
  };
}
module.exports={createPool};
