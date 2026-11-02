#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{
  source:{type:'string',multiple:true},out:{type:'string'},
  timezone:{type:'string',default:Intl.DateTimeFormat().resolvedOptions().timeZone},
  folder:{type:'string',default:'Codex汇总'},help:{type:'boolean'}
}});
if(values.help||!values.out){
  console.log('node collect.mjs --source /path/to/.codex --out /path/to/work [--timezone Asia/Shanghai] [--folder Codex汇总]');
  process.exit(values.help?0:1);
}
const roots=(values.source??[path.join(os.homedir(),'.codex')]).map(p=>fs.realpathSync(p));
const out=path.resolve(values.out),folder=values.folder;
if(!folder||folder==='.'||folder==='..'||/[\\/:*?"<>|]/.test(folder))throw Error('--folder must be a single folder name');
for(const root of roots){
  const rel=path.relative(root,out);
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw Error('--out must be outside the source directory');
}
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:values.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
const day=ts=>{const d=new Date(ts);if(!ts||Number.isNaN(d.valueOf()))return 'undated';const p=Object.fromEntries(formatter.formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const write=(name,text)=>{const p=path.join(out,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
const old=fs.existsSync(path.join(out,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')):{files:{},threads:{}};
if(old.timezone&&old.timezone!==values.timezone)throw Error('Use a new --out directory when changing timezone');
if(old.folder&&old.folder!==folder)throw Error('Use a new --out directory when changing folder');
const issues=[],unsupported={};
const safeId=id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)?id:hash(id).slice(0,24);
const canonical=x=>{
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  return x;
};
function clean(x){
  if(typeof x==='string')return x
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,'[REDACTED:private-key]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,'[REDACTED:token]')
    .replace(/\bBearer\s+[A-Za-z0-9_.\/+=-]{12,}/gi,'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?)[^\s"',;]{8,}/gi,'$1[REDACTED]')
    .replace(/data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)/g,(_m,mime,data)=>'[embedded '+mime+'; sha256='+hash(data)+']');
  if(Array.isArray(x))return x.map(clean);
  if(x&&typeof x==='object'){
    if(typeof x.data==='string'&&['image','audio'].includes(x.type))return {type:x.type,mimeType:x.mimeType,sha256:hash(x.data),embedded_binary:true};
    return Object.fromEntries(Object.entries(x).filter(([k])=>!['encrypted_content','internal_chat_message_metadata_passthrough'].includes(k)).map(([k,v])=>[k,clean(v)]));
  }
  return x;
}
function contentText(content){
  if(typeof content==='string')return clean(content);
  return (content??[]).map(c=>typeof c.text==='string'?clean(c.text):'[attachment '+JSON.stringify(clean(c))+']').join('\n');
}
function walk(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.jsonl')?[path.join(dir,e.name)]:[]);
}
const files=[...new Set(roots.flatMap(root=>['sessions','archived_sessions'].flatMap(d=>walk(path.join(root,d)))))].sort();
if(!files.length)throw Error('No session JSONL files found under sessions or archived_sessions');
const inventory={},groups=new Map(),touched=new Set();
for(const file of files){
  const stat=fs.statSync(file),previous=old.files[file];
  if(previous&&previous.bytes===stat.size&&previous.mtime_ms===stat.mtimeMs&&!previous.retry){
    inventory[file]=previous;
  }else{
    const bytes=fs.readFileSync(file);let id=previous?.thread_id;
    if(!id)for(const line of bytes.toString('utf8').split('\n').slice(0,20)){
      try{const row=JSON.parse(line.replace(/^\uFEFF/,''));if(row.type==='session_meta'&&row.payload?.id){id=String(row.payload.id);break;}}catch{}
    }
    if(!id){issues.push({file,problem:'session_meta.id not found'});continue;}
    inventory[file]={thread_id:id,bytes:stat.size,mtime_ms:stat.mtimeMs,sha256:hash(bytes)};
    if(previous?.sha256!==inventory[file].sha256||previous.retry)touched.add(id);
  }
  const id=inventory[file].thread_id;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(file);
  if(!old.threads[id])touched.add(id);
}
const threads={...old.threads},changed=[];
for(const id of [...touched].sort()){
  let meta={id},events=[],seen=new Set(),sourceHashes=new Set();
  for(const file of groups.get(id)??[]){
    const info=inventory[file];if(sourceHashes.has(info.sha256))continue;sourceHashes.add(info.sha256);
    let turn=null,lineNo=0;const occurrences=new Map();
    const stream=fs.createReadStream(file,{end:Math.max(0,info.bytes-1)});
    for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
      lineNo++;if(!line.trim())continue;
      let row;try{row=JSON.parse(line.replace(/^\uFEFF/,''));}catch{
        issues.push({file,line:lineNo,problem:'incomplete or invalid JSON'});info.retry=true;continue;
      }
      const p=row.payload??{},ts=row.timestamp??p.timestamp??null;
      if(row.type==='session_meta'){
        meta={...meta,title:p.title??meta.title,parent_thread_id:p.parent_thread_id??meta.parent_thread_id,cwd:p.cwd??meta.cwd,created_at:p.timestamp??ts};continue;
      }
      if(row.type==='turn_context'){turn=p.turn_id??turn;continue;}
      if(row.type==='event_msg'&&p.type==='task_started')turn=p.turn_id??turn;
      let e;
      if(row.type==='response_item'){
        if(p.type==='message'&&['user','assistant'].includes(p.role)&&!['analysis','summary'].includes(p.channel)&&p.phase!=='analysis'){
          e={kind:'message',role:p.role,text:contentText(p.content),representation:'response_item'};
        }else if(['function_call','custom_tool_call','web_search_call','image_generation_call','local_shell_call','computer_call'].includes(p.type)){
          e={kind:'tool_call',tool:p.name??p.type,call_id:p.call_id??p.id??null,details:clean(p)};
        }else if(['function_call_output','custom_tool_call_output','computer_call_output'].includes(p.type)){
          e={kind:'tool_result',call_id:p.call_id??p.id??null,details:clean(p.output??p)};
        }else if(!['reasoning','message'].includes(p.type)){
          unsupported['response_item/'+p.type]=(unsupported['response_item/'+p.type]??0)+1;
        }
      }else if(row.type==='event_msg'){
        if(['user_message','agent_message'].includes(p.type)&&p.phase!=='analysis'){
          e={kind:'message',role:p.type==='user_message'?'user':'assistant',text:clean(p.message??''),representation:'event_msg'};
        }else if(['task_started','task_complete','turn_aborted','error','web_search_end'].includes(p.type)){
          e={kind:p.type,details:clean(p)};
        }
      }
      if(!e)continue;
      const identity=hash(JSON.stringify(canonical({id,turn,timestamp:ts,...e})));
      const ordinal=(occurrences.get(identity)??0)+1;occurrences.set(identity,ordinal);
      const eventId=hash(identity+':'+ordinal).slice(0,24);if(seen.has(eventId))continue;seen.add(eventId);
      events.push({schema_version:1,thread_id:id,event_id:eventId,turn_id:turn,timestamp:ts,date:day(ts),...e,source_ref:{file,line:lineNo}});
    }
  }
  // Pair event-stream mirrors while retaining repeated real messages.
  const available=new Map();
  for(const e of events)if(e.kind==='message'&&e.representation==='response_item'){
    const key=hash(JSON.stringify([e.turn_id,e.role,e.text]));
    if(!available.has(key))available.set(key,[]);available.get(key).push(e);
  }
  for(const e of events)if(e.kind==='message'&&e.representation==='event_msg'){
    const key=hash(JSON.stringify([e.turn_id,e.role,e.text])),pool=available.get(key)??[];
    const idx=pool.findIndex(other=>Math.abs(Date.parse(other.timestamp)-Date.parse(e.timestamp))<=5000);
    if(idx>=0)e.mirror_of=pool.splice(idx,1)[0].event_id;
  }
  events.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  const visible=events.filter(e=>!e.mirror_of),dates=[...new Set(visible.map(e=>e.date))].sort();
  const month=dates.find(d=>d!=='undated')?.slice(0,7)??'undated';
  const title=clean(meta.title||visible.find(e=>e.role==='user')?.text.split('\n').find(Boolean)?.slice(0,80)||id);
  const dir=folder+'/02-完整对话/'+month+'/'+safeId(id),notes=[],links={},maxBytes=750_000;
  let part='',partBytes=0,partNumber=1;
  const tick=String.fromCharCode(96);
  const fence=text=>tick.repeat(Math.max(3,...[...text.matchAll(new RegExp(tick+'+','g'))].map(m=>m[0].length+1)));
  const flush=()=>{
    if(!part)return;const note=dir+'/记录-'+String(partNumber++).padStart(3,'0')+'.md';notes.push(note);
    write('vault/'+note,'---\nid: '+JSON.stringify(id)+'\ntype: conversation\nsource: codex\ntitle: '+JSON.stringify(title)+'\nparent_thread_id: '+JSON.stringify(meta.parent_thread_id??null)+'\n---\n\n# '+title+'\n\n'+part);
    part='';partBytes=0;
  };
  for(const e of visible){
    const label=e.kind==='message'?(e.role==='user'?'用户':'Codex'):e.kind==='tool_call'?'工具调用 · '+e.tool:e.kind==='tool_result'?'工具结果':e.kind;
    const raw=e.kind==='message'?e.text:(typeof e.details==='string'?e.details:JSON.stringify(e.details,null,2));
    const f=fence(raw),body=e.kind==='message'?raw:f+'text\n'+raw+'\n'+f;
    const section='## '+label+' · '+(e.timestamp??'时间未记录')+'\n\n'+body+'\n\n^e-'+e.event_id+'\n\n';
    if(part&&partBytes+Buffer.byteLength(section)>maxBytes)flush();
    const note=dir+'/记录-'+String(partNumber).padStart(3,'0')+'.md';
    links[e.event_id]=note.replace(/\.md$/,'')+'#^e-'+e.event_id;
    part+=section;partBytes+=Buffer.byteLength(section);
  }
  flush();
  const ledger=folder+'/10-原始资料与附件/轨迹/'+safeId(id)+'.jsonl';
  write('vault/'+ledger,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  const record={id,title,parent_thread_id:meta.parent_thread_id??null,dates,notes,ledger,events:events.length,visible_events:visible.length,messages:visible.filter(e=>e.kind==='message').length,tools:visible.filter(e=>e.kind==='tool_call').length,event_links:links};
  threads[id]=record;changed.push(record);
}
const manifest={schema_version:1,timezone:values.timezone,folder,files:inventory,threads};
const plan={schema_version:1,generated_at:new Date().toISOString(),timezone:values.timezone,changed_threads:changed,affected_dates:[...new Set(changed.flatMap(x=>x.dates))].sort(),issues,unsupported,scope:'Collected records only. Read and synthesize before merging into the vault.'};
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');write('read-plan.json',JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({changed_threads:changed.length,affected_dates:plan.affected_dates,issues:issues.length,reading_plan:path.join(out,'read-plan.json')},null,2));
