const {parentPort,workerData}=require('node:worker_threads');
const vm=require('node:vm');
let provider=null,running=false;
const log=(event,data={})=>console.log(JSON.stringify({provider:'netmirror',event,...data}));
async function tracedFetch(input,options={}){
  let host='unrecognized';try{host=new URL(typeof input==='string'?input:input.url||String(input)).hostname;}catch{}
  const timeout=AbortSignal.timeout(15000);const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  try{const r=await fetch(input,{...options,signal});log('http_response',{host,status:r.status});return r;}catch(error){log('http_failure',{host,errorType:error.name});throw error;}
}
(async()=>{
  const {root,entry}=workerData;
  if(entry.id!=='netmirror'||entry.filename!=='providers/netmirror.js')throw new Error('Unexpected provider');
  const r=await tracedFetch(root+entry.filename);if(!r.ok)throw new Error('Provider download failed');const code=await r.text();
  const module={exports:{}};const context=vm.createContext({module,exports:module.exports,fetch:tracedFetch,URL,URLSearchParams,Headers,Request,Response,AbortController,AbortSignal,TextEncoder,TextDecoder,Buffer,atob,btoa,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,SCRAPER_SETTINGS:{},console:{log(){},warn(){log('upstream_warning');},error(){log('upstream_error');}}});
  new vm.Script(code,{filename:entry.filename}).runInContext(context,{timeout:3000});
  if(typeof module.exports.getStreams!=='function'||typeof context.bypass!=='function')throw new Error('Unsupported provider interface');
  const verified=await context.bypass('https://net52.cc');if(!verified)throw new Error('Session initialization failed');
  provider=module.exports;parentPort.postMessage({kind:'ready'});
})().catch(error=>{log('initialization_failed',{errorType:error.name});parentPort.postMessage({kind:'failed'});});
parentPort.on('message',async message=>{
  if(message.kind!=='run'||!provider||running)return;
  running=true;
  try{const streams=await provider.getStreams(...message.args);parentPort.postMessage({kind:'result',id:message.id,streams:Array.isArray(streams)?JSON.parse(JSON.stringify(streams)):[]});}
  catch(error){log('session_extraction_failed',{errorType:error.name});parentPort.postMessage({kind:'result',id:message.id,streams:[]});}
  finally{running=false;}
});
