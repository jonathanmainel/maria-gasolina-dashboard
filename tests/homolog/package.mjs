// Produces reviewable packages ONLY for the existing isolated homologation project.
// No deployment side effect and no credentials are accepted by this module.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
export const projectRef='uwafdxsdsgqysjjxfywo';
export const names=['request-dashboard-sync','sync-dashboard-daily','sync-google-ads','sync-meta-ads','sync-ga4'];
const modules={
 'request-dashboard-sync':['index.ts','handler.ts','deno.json'],
 'sync-dashboard-daily':['index.ts','runner.ts','scheduler.ts','deno.json'],
 'sync-google-ads':['index.ts','auth.ts','google-ads.ts','deno.json'],
 'sync-meta-ads':['index.ts','meta-ads.ts','meta-creative.ts','deno.json'],
 'sync-ga4':['index.ts','ga4.ts','ga4-auth.ts','deno.json'],
};
export async function packageFor(name, destination=projectRef){
 if(destination!==projectRef||!names.includes(name))throw Error('ISOLATED_PACKAGE_GUARD');
 const collector=name.startsWith('sync-')&&name!=='sync-dashboard-daily';
 const paths=[...modules[name].map(f=>`supabase/functions/${name}/${f}`),...['dashboard.ts','ingestion.ts','sync-control.ts'].map(f=>`supabase/functions/_shared/${f}`),...(collector?[`tests/homolog/${name}.ts`,'tests/homolog/transport.ts']:[])];
 const files=await Promise.all(paths.map(async path=>{
  let content=(await fs.readFile(path,'utf8')).replace(/^\uFEFF/,'');
  content=content.replace('import "@supabase/functions-js/edge-runtime.d.ts";','// Runtime type declaration omitted in isolated deployment package; no executable behavior changed.');
  // Hosted Edge Runtime has read-only environment variables. Redirect only the
  // native collector's provider configuration reads to the in-memory fixture.
  // Supabase SDK/backend authentication reads its own real environment normally.
  if(collector&&path===`supabase/functions/${name}/index.ts`)content='import { homologEnv } from "../../../tests/homolog/transport.ts";\n'+content.replaceAll('Deno.env.get(','homologEnv(');
  return {name:path,content};
 }));
 return {project_id:destination,name,entrypoint_path:collector?`tests/homolog/${name}.ts`:`supabase/functions/${name}/index.ts`,import_map_path:`supabase/functions/${name}/deno.json`,verify_jwt:false,files};
}
export async function manifest(){
 return Promise.all(names.map(async name=>{const p=await packageFor(name);return {name,entrypoint:p.entrypoint_path,files:p.files.map(f=>({path:f.name,sha256:crypto.createHash('sha256').update(f.content).digest('hex')}))};}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/package.mjs'))console.log(JSON.stringify(await manifest(),null,2));
