// Prepare reviewable production packages. This module never deploys or reads secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out='artifacts/meta-preview-publicacao-20261029/packages';
const project_id='hlqrpreqvvxtkruwsolg';
const modules={
 'sync-meta-ads':['index.ts','meta-ads.ts','meta-creative.ts','preview-media.ts','preview-receipts.ts','deno.json'],
 'sync-dashboard-daily':['index.ts','runner.ts','scheduler.ts','deno.json'],
 'request-dashboard-sync':['index.ts','handler.ts','deno.json'],
};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
await fs.mkdir(out,{recursive:true});
const manifest=[];
for(const [name,modulesForFunction] of Object.entries(modules)){
 const paths=[...modulesForFunction.map(file=>`supabase/functions/${name}/${file}`),
  ...['dashboard.ts','ingestion.ts','sync-control.ts','preview-operation.ts'].map(file=>`supabase/functions/_shared/${file}`)];
 const files=await Promise.all(paths.map(async name=>{
  const content=(await fs.readFile(name,'utf8')).replace(/^\uFEFF/,'').replace('import "@supabase/functions-js/edge-runtime.d.ts";',
   '// Type-only runtime declaration omitted from deployment package; executable source unchanged.');
  if(/tests\/homolog|homologEnv|HOMOLOG_|createHomologCollector/.test(content))throw Error('TEST_ADAPTER_IN_PRODUCTION_PACKAGE');
  return {name,content};
 }));
 const pkg={project_id,name,entrypoint_path:`supabase/functions/${name}/index.ts`,
  import_map_path:`supabase/functions/${name}/deno.json`,verify_jwt:false,files};
 const bytes=JSON.stringify(pkg,null,2)+'\n';
 await fs.writeFile(path.join(out,`${name}.json`),bytes);
 manifest.push({name,project_id,package_sha256:sha(bytes),verify_jwt:false,
  files:files.map(file=>({path:file.name,sha256:sha(file.content)}))});
}
const migrations=['20261028181122_meta_preview_reservation_protocol.sql',
 '20261028185400_meta_preview_receipt_validation.sql','20261028185700_meta_preview_status_compatibility.sql'];
const migrationManifest=[];
for(const name of migrations){
 const bytes=await fs.readFile(`supabase/migrations/${name}`);
 await fs.writeFile(path.join(out,name),bytes);
 migrationManifest.push({name,sha256:sha(bytes)});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({production_deploy_authorized:false,
 project_id,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),packages:manifest,migrations:migrationManifest},null,2)+'\n');
console.log(JSON.stringify({project_id,production_deploy_authorized:false,packages:manifest.map(({name,package_sha256})=>({name,package_sha256})),migrations:migrationManifest}));
