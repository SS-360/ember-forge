import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(os.tmpdir(),"ember forge package check "));
const pkg=path.join(root,"runtime","emberforge-runtime.mjs");
const guard=path.join(root,"tests","network-guard.mjs");
const input=JSON.parse(await readFile(path.join(root,"input.example.json"),"utf8"));
const unsupported=JSON.parse(await readFile(path.join(root,"examples","unsupported-unknown-unit.json"),"utf8"));
const verification=JSON.parse(await readFile(path.join(root,"verification.json"),"utf8"));
const bootstrap='process.argv=[process.execPath,process.env.EF_RUNTIME_URL,"--input",process.env.EF_INPUT,"--output",process.env.EF_OUTPUT];import(process.env.EF_RUNTIME_URL).catch(e=>{console.error(e);process.exitCode=1})';const run=(runtime,data,filename="input.json",output=path.join(temp,"result.json"))=>{const file=path.join(temp,filename);return writeFile(file,typeof data==="string"?data:JSON.stringify(data)).then(()=>spawnSync(process.execPath,["--import",pathToFileURL(guard).href,"-e",bootstrap],{cwd:temp,encoding:"utf8",env:{PATH:process.env.PATH??"",SystemRoot:process.env.SystemRoot??"",TEMP:temp,TMP:temp,NVIDIA_API_KEY:"dummy-offline-test-key",ZETARIS_API_KEY:"dummy-offline-test-key",EF_RUNTIME_URL:pathToFileURL(runtime).href,EF_INPUT:file,EF_OUTPUT:output}}))};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
try{
 let r=await run(pkg,input);assert.equal(r.status,0,r.stderr);const output=JSON.parse(await readFile(path.join(temp,"result.json"),"utf8"));assert.equal(output.skillId,"zetaris-stock-207ca2ab-retry-3");assert.equal(output.skillVersion,"0.1.0");assert.equal(createHash("sha256").update(JSON.stringify(canonical(output.records))).digest("hex"),"57af5d75a12bef42902d9915bdc93a2ee5e95561855d0691ca0a515d9695c228");
 r=await run(pkg,unsupported,"unsupported.json");assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).reason,"UNKNOWN_UNIT");
 const policy=structuredClone(input);policy.parameters.policyVersion="stock-v2";r=await run(pkg,policy,"policy.json");assert.equal(JSON.parse(r.stderr).reason,"POLICY_VERSION_MISMATCH");
 const schema=structuredClone(input);schema.dataset.sourceSchemaVersions.orders="orders/v2";r=await run(pkg,schema,"schema.json");assert.equal(JSON.parse(r.stderr).reason,"SCHEMA_VERSION_MISMATCH");
 r=await run(pkg,"{not json","malformed.json");assert.equal(JSON.parse(r.stderr).reason,"INPUT_INVALID_JSON");
 r=await run(pkg,input,"bad-output.json",path.join(temp,"missing-parent","out.json"));assert.equal(JSON.parse(r.stderr).reason,"OUTPUT_WRITE_FAILED");
 const broken=path.join(temp,"missing-skill-assets");await mkdir(path.join(broken,"runtime"),{recursive:true});await mkdir(path.join(broken,"tests"),{recursive:true});await copyFile(pkg,path.join(broken,"runtime","emberforge-runtime.mjs"));await copyFile(guard,path.join(broken,"tests","network-guard.mjs"));r=await run(path.join(broken,"runtime","emberforge-runtime.mjs"),input,"missing-asset-input.json");assert.equal(JSON.parse(r.stderr).reason,"SKILL_PACKAGE_INCOMPLETE");
 console.log(JSON.stringify({status:"passed",workingDirectory:temp,supportedResultHash:"57af5d75a12bef42902d9915bdc93a2ee5e95561855d0691ca0a515d9695c228",unsupported:"UNKNOWN_UNIT",policyDrift:"POLICY_VERSION_MISMATCH",schemaDrift:"SCHEMA_VERSION_MISMATCH",malformedJson:"INPUT_INVALID_JSON",invalidOutput:"OUTPUT_WRITE_FAILED",missingPackageAsset:"SKILL_PACKAGE_INCOMPLETE",networkCheck:"Node API instrumentation only; not an OS sandbox",providerCalls:"disabled"},null,2));
}finally{await rm(temp,{recursive:true,force:true})}
