import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function queryLocalZetaris(sql: string, environment: Record<string,string|undefined> = process.env, options: {setup?:boolean;sensitiveSql?:boolean} = {}) {
 const url=environment.ZETARIS_JDBC_URL,jar=environment.ZETARIS_JDBC_DRIVER_JAR,user=environment.ZETARIS_USERNAME,password=environment.ZETARIS_PASSWORD;
 if(!url||!/^jdbc:zetaris:lightning@(?:localhost|127\.0\.0\.1):10000$/.test(url)||!jar||!user||!password||[user,password,url].some(x=>/[\r\n]/.test(x)))throw Error('LOCAL_JDBC_CONFIG_INVALID');
 if(!options.setup&&!/^\s*(SELECT|WITH|SHOW|DESC(?:RIBE)?)\b/i.test(sql))throw Error('READ_ONLY_QUERY_REQUIRED');
 if(sql.length>30000||sql.includes(';'))throw Error('SINGLE_BOUNDED_STATEMENT_REQUIRED');
 const started=performance.now();
 return await new Promise<{records:Array<Record<string,string|null>>;rowCount:number;durationMs:number}>((resolve,reject)=>{
 const child=spawn('java',['--class-path',jar,path.join(path.dirname(fileURLToPath(import.meta.url)),'ZetarisJdbc.java')],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(Error('LOCAL_JDBC_TIMEOUT'))},60000);
 child.stdout.on('data',x=>{bytes+=x.length;if(bytes>1000000){child.kill();reject(Error('SOURCE_RESPONSE_TOO_LARGE'))}else output+=x});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('JAVA_RUNTIME_UNAVAILABLE'))});child.on('close',code=>{clearTimeout(timer);try{const parsed=JSON.parse(output);if(code!==0)throw Error(options.sensitiveSql?'LOCAL_JDBC_SETUP_FAILED':'LOCAL_JDBC_QUERY_FAILED: '+String(parsed.message??parsed.error).slice(0,300));if(!Array.isArray(parsed.records)||parsed.records.length>5000||parsed.rowCount!==parsed.records.length)throw Error('LOCAL_JDBC_RESPONSE_INVALID');resolve({...parsed,durationMs:performance.now()-started})}catch(e){reject(e)}});child.stdin.on('error',()=>{});child.stdin.end([user,password,url,sql].join('\n'));
 });
}
