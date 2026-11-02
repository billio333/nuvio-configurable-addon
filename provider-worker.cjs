const {parentPort,workerData}=require('node:worker_threads');
const vm=require('node:vm');
const cheerio=require('cheerio');
const cryptoJs=require('crypto-js');
const label=String(workerData.entry.id).replace(/[^A-Za-z0-9_-]/g,'');
let stage='initializing';
let completed=false;
const log=(event,data={})=>console.log(JSON.stringify({provider:label,event,...data}));
const watchdog=setTimeout(()=>{if(!completed)log('approaching_worker_timeout',{stage});},18000);
function providerRequire(name){
  if(name==='cheerio-without-node-native'||name==='cheerio')return cheerio;
  if(name==='crypto-js')return cryptoJs;
  log('unsupported_module',{moduleName:String(name).replace(/[^A-Za-z0-9_./@-]/g,'').slice(0,120)});
  throw new Error('Unsupported provider module');
}
async function tracedFetch(input,options){
  let host='unrecognized';
  try{host=new URL(typeof input==='string'?input:input.url||String(input)).hostname;}catch{}
  const started=Date.now();
  try{
    const response=await fetch(input,options);
    log('http_response',{host,status:response.status,ms:Date.now()-started});
    return response;
  }catch(error){
    log('http_failure',{host,errorType:error.name,ms:Date.now()-started});
    throw error;
  }
}
(async()=>{
  const {root,entry,args}=workerData;
  log('worker_started',{adapterVersion:'0.1.3-crypto'});
  stage='validating_provider_path';
  if(typeof entry.filename!=='string'||!/^providers\/[A-Za-z0-9_.-]+\.js$/.test(entry.filename))throw new Error('Unsafe provider path');
  stage='downloading_provider';
  const r=await tracedFetch(root+entry.filename,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Provider download failed');
  const code=await r.text();
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,require:providerRequire,fetch:tracedFetch,URL,URLSearchParams,Headers,Request,Response,AbortController,AbortSignal,TextEncoder,TextDecoder,Buffer,atob,btoa,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},warn(){log('upstream_warning',{stage});},error(){log('upstream_error',{stage});}}});
  stage='evaluating_provider';
  new vm.Script(code,{filename:entry.filename}).runInContext(context,{timeout:3000});
  stage='checking_exports';
  const getStreams=module.exports.getStreams;
  if(typeof getStreams!=='function')throw new Error('Provider has no supported getStreams export');
  stage='running_getStreams';
  const result=await getStreams(...args);
  log('provider_completed',{isArray:Array.isArray(result),count:Array.isArray(result)?result.length:0});
  stage='serializing_results';
  const output=Array.isArray(result)?JSON.parse(JSON.stringify(result)):[];
  completed=true;clearTimeout(watchdog);
  parentPort.postMessage(output);
})().catch(error=>{
  completed=true;clearTimeout(watchdog);
  const missing=error.name==='ReferenceError'?/^([A-Za-z_$][A-Za-z0-9_$]*) is not defined$/.exec(String(error.message)):null;
  log('provider_failed',{stage,errorType:error.name,...(missing?{missingGlobal:missing[1]}:{})});
  parentPort.postMessage([]);
});
