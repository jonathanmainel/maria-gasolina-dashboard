import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root='dist/client';
const files=(await fs.readdir(root,{recursive:true})).map(f=>path.join(root,f));
const counts={secret_keys:0,private_keys:0,service_role_jwt:0,google_refresh_token:0,backend_secret_names:0,source_maps:0};
let checked=0;
for(const file of files){
 if(!(await fs.stat(file)).isFile()||!/\.(js|html|css|json|map)$/.test(file))continue;
 checked++;
 const body=await fs.readFile(file,'utf8');
 counts.source_maps+=file.endsWith('.map')?1:0;
 counts.secret_keys+=(body.match(/sb_secret_[A-Za-z0-9_-]+/g)||[]).length;
 counts.private_keys+=(body.match(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g)||[]).length;
 counts.google_refresh_token+=(body.match(/1\/\/[A-Za-z0-9_-]{30,}/g)||[]).length;
 counts.backend_secret_names+=(body.match(/GOOGLE_ADS_SERVICE_ACCOUNT_JSON|GA4_SERVICE_ACCOUNT_JSON|GOOGLE_ADS_CLIENT_SECRET|GOOGLE_ADS_REFRESH_TOKEN|META_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|dashboard_cron_secret_key/g)||[]).length;
 for(const jwt of body.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
  try{if(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString()).role==='service_role')counts.service_role_jwt++;}catch{}
 }
}
assert.ok(checked>0);
assert.ok(Object.values(counts).every(value=>value===0),'Private credential marker or source map in frontend bundle');
const result={passed:true,files_checked:checked,patterns_found:counts,scope:'Pattern scan of local QA build; unknown secret formats cannot be exhaustively identified'};
await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/sync-bundle-scan.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
