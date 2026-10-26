import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
const blocked=()=>{throw new Error("Network access blocked by the export instrumentation check.")};
globalThis.fetch=blocked;
for(const [m,names] of [[http,["request","get"]],[https,["request","get"]],[net,["connect","createConnection"]],[tls,["connect"]]])for(const name of names)Object.defineProperty(m,name,{value:blocked,configurable:true,writable:true});
