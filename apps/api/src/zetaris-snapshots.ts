import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {StockDatasetSchema,StockParametersSchema} from '@emberforge/contracts';
import {canonicalHash} from '@emberforge/compiler/trace-compiler';
import {importWorkSample} from '../../../packages/compiler/src/sample-import.js';
const Origin=z.object({kind:z.literal('zetaris_read_snapshot'),readId:z.string().uuid(),readHash:z.string().regex(/^[a-f0-9]{64}$/),snapshotDatasetHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
async function sourceRead(root:string,id:string){
 z.string().uuid().parse(id);
 const read=JSON.parse(await readFile(path.join(root,'artifacts/zetaris/stock-reads',id+'.json'),'utf8'));
 if(read.schemaVersion!=='emberforge.local-zetaris-stock-read/1'||read.readId!==id||read.evidenceClass!=='synthetic_fixture')throw Error('SOURCE_READ_RECEIPT_INVALID');
 const dataset=StockDatasetSchema.parse(read.dataset);
 if(dataset.sourceMode!=='live'||canonicalHash(dataset)!==read.datasetHash||!Array.isArray(read.observations)||new Set(read.observations.map((x:any)=>x.registeredSource)).size<2)throw Error('SOURCE_READ_RECEIPT_INVALID');
 return{read,dataset};
}
export async function createZetarisSnapshotSample(root:string,readId:string,parametersInput?:unknown){
 const{read,dataset}=await sourceRead(root,readId);
 const parameters=StockParametersSchema.parse(parametersInput??read.parameters);
 if(parameters.policyVersion!==read.parameters.policyVersion)throw Error('SNAPSHOT_POLICY_MISMATCH');
 const snapshot=StockDatasetSchema.parse({...dataset,sourceMode:'snapshot'});
 const sample={...importWorkSample({format:'json',provenance:{evidenceClass:read.evidenceClass,sourceLabel:'Zetaris snapshot '+readId.slice(0,8),sanitizedConfirmed:true},parameters,dataset:snapshot},{allowSnapshot:true}),sampleId:randomUUID(),importedAt:new Date().toISOString(),sourceOrigin:Origin.parse({kind:'zetaris_read_snapshot',readId,readHash:canonicalHash(read),snapshotDatasetHash:canonicalHash(snapshot)})};
 const dir=path.join(root,'artifacts/work-samples');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,sample.sampleId+'.json'),JSON.stringify(sample,null,2)+'\n',{flag:'wx'});return sample;
}
export async function assertZetarisSnapshotSample(root:string,stored:any){
 const origin=Origin.parse(stored.sourceOrigin),{read,dataset}=await sourceRead(root,origin.readId);
 const snapshot=StockDatasetSchema.parse({...dataset,sourceMode:'snapshot'});
 if(canonicalHash(read)!==origin.readHash||canonicalHash(snapshot)!==origin.snapshotDatasetHash||canonicalHash(stored.dataset)!==origin.snapshotDatasetHash||stored.parameters?.policyVersion!==read.parameters.policyVersion||stored.provenance?.evidenceClass!==read.evidenceClass||canonicalHash({parameters:stored.parameters,dataset:snapshot})!==stored.inputHash)throw Error('SNAPSHOT_ORIGIN_MISMATCH');
 return importWorkSample({format:'json',provenance:stored.provenance,parameters:stored.parameters,dataset:stored.dataset},{allowSnapshot:true});
}
