import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
const host=process.argv[2];if(!['codex','claude'].includes(host))throw Error('host required');
const root='D:/Pocket Forge/Ember Forge host rehearsal be33034d',workspace=path.join(root,host+' unrelated working directory');
const output=path.resolve('artifacts/host-verification',host+'-'+crypto.randomUUID());fs.mkdirSync(output);
const binary=host==='codex'?'C:/Users/Sam/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe':'C:/Users/Sam/.local/bin/claude.exe';
const args=host==='codex'?['exec','--ignore-user-config','--json','--ephemeral','--sandbox','read-only','-c','windows.sandbox="unelevated"','-c','approval_policy="never"','--skip-git-repo-check','-C',workspace,'-']:['-p','--output-format','stream-json','--verbose','--no-session-persistence','--setting-sources','project','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--permission-mode','dontAsk','--tools','Bash,Skill','--allowedTools','Skill,Bash(node:*),Bash(cat:*),Bash(ls:*)'];
const env={...process.env};for(const key of Object.keys(env))if(/^(NVIDIA_|ZETARIS_|ANTHROPIC_API_KEY$|OPENAI_API_KEY$|CODEX_API_KEY$)/.test(key))delete env[key];
if(host==='claude'&&process.env.EMBERFORGE_CLAUDE_MODEL)args.push('--model',process.env.EMBERFORGE_CLAUDE_MODEL);
const started=Date.now();const states=[];for(const port of [3001,5174]){try{await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(1500)});states.push({port,reachable:true})}catch{states.push({port,reachable:false})}}
if(states.some(x=>x.reachable))throw Error('Stop Ember Forge servers before host rehearsal');
fs.writeFileSync(path.join(output,'run.json'),JSON.stringify({host,workspace,startedAt:new Date().toISOString(),args,serverStoppedEvidence:states,authentication:'Existing host sign-in; application/provider API keys removed from child environment.',promptSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,host+'-prompt.txt'))).digest('hex')},null,2));
const proc=spawn(binary,args,{cwd:workspace,env,stdio:['pipe','pipe','pipe'],windowsHide:true});let line='',stderr='',events=0,usage=null,model=null;
function record(data){events++;fs.appendFileSync(path.join(output,'events.jsonl'),JSON.stringify(data)+'\n')}
proc.stdout.on('data',chunk=>{line+=chunk;let p;while((p=line.indexOf('\n'))>=0){const s=line.slice(0,p);line=line.slice(p+1);try{const e=JSON.parse(s);if(host==='codex'){if(e.type==='turn.completed')usage=e.usage;if(e.item?.type==='reasoning'){record({type:e.type,item:{type:'reasoning',omitted:true}});continue}if(e.item&&e.item.type!=='command_execution'&&e.item.type!=='agent_message'){record({type:e.type,item:{type:e.item.type}});continue}record(e)}else{if(e.type==='system'){model=e.model;record({type:e.type,subtype:e.subtype,model:e.model,tools:e.tools,skills:e.skills});}else if(e.type==='assistant'){record({...e,message:{...e.message,content:e.message.content?.filter(x=>x.type!=='thinking'&&x.type!=='redacted_thinking')}})}else{if(e.type==='result')usage={usage:e.usage,total_cost_usd:e.total_cost_usd,modelUsage:e.modelUsage,num_turns:e.num_turns,is_error:e.is_error};record(e)}}}catch{record({type:'unparsed_output',bytes:Buffer.byteLength(s)})}}});
proc.stderr.on('data',x=>{stderr+=x;if(stderr.length>50000)stderr=stderr.slice(-50000)});
const timer=setTimeout(()=>proc.kill(),240000);proc.stdin.end(fs.readFileSync(path.join(root,host+'-prompt.txt')));
const code=await new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',resolve)});clearTimeout(timer);
const report={host,exitCode:code,events,durationMs:Date.now()-started,usage,model,stderrBytes:Buffer.byteLength(stderr),stderrSha256:crypto.createHash('sha256').update(stderr).digest('hex'),output};fs.writeFileSync(path.join(output,'completion.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
