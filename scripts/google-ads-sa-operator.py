"""Authorized local operator: stage only the new secret, or run read-only tests.

Credentials never appear in arguments, stdout, receipts, or the repository.
The existing private directory must already have its Windows ACL validated.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'hlqrpreqvvxtkruwsolg'
IDENTITY = 'maria-gasolina-google-ads@thermal-apricot-508813-q7.iam.gserviceaccount.com'
PRIVATE = Path(r'C:\Users\GAMER\AppData\Local\MariaGasolina\Credentials\google-ads')
KEY = PRIVATE / 'collector-service-account.json'
CLI = ROOT / 'node_modules' / '.bin' / 'supabase.cmd'
DENO = Path(r'C:\Users\GAMER\AppData\Local\npm-cache\_npx\05b6ef7b13673c57\node_modules\deno\deno.exe')
SECRET = 'GOOGLE_ADS_SERVICE_ACCOUNT_JSON'

def cli_json(*args):
    result = subprocess.run([str(CLI), *args, '--project-ref', PROJECT, '--output', 'json'],
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
    if result.returncode:
        raise RuntimeError('CLI_READ_FAILED')
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError('CLI_RESPONSE_INVALID') from None

def inventory():
    rows = cli_json('secrets', 'list')
    if not isinstance(rows, list):
        raise RuntimeError('SECRET_INVENTORY_INVALID')
    hashes = {}
    for row in rows:
        digest = row.get('digest', row.get('value'))
        if not isinstance(row.get('name'), str) or not isinstance(digest, str) or not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
            raise RuntimeError('SECRET_DIGEST_FORMAT_INVALID')
        hashes[row['name']] = digest.lower()
    return hashes

def credential():
    data = json.loads(KEY.read_text(encoding='utf-8'))
    if data.get('type') != 'service_account' or data.get('client_email') != IDENTITY or data.get('project_id') != 'thermal-apricot-508813-q7':
        raise RuntimeError('LOCAL_IDENTITY_MISMATCH')
    return json.dumps(data, separators=(',', ':'), ensure_ascii=True)

def stage():
    before = inventory()
    payload = credential()
    digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    if SECRET in before:
        return {'secret_present': True, 'created': False, 'overwritten': False,
                'matches_local_payload': before[SECRET] == digest}
    path = PRIVATE / 'stage-google-ads-sa-20261027.env'
    if path.parent.resolve() != PRIVATE.resolve() or "'" in payload:
        raise RuntimeError('PRIVATE_STAGING_PATH_INVALID')
    # Exclusive creation; the parent ACL is inherited before credential bytes land.
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(SECRET + "='" + payload + "'\n")
    result = subprocess.run([str(CLI), 'secrets', 'set', '--env-file', str(path), '--project-ref', PROJECT],
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
    # No retry: always read back after a response, even if the CLI failed.
    after = inventory()
    unchanged = all(after.get(name) == value for name, value in before.items())
    matched = after.get(SECRET) == digest
    if not unchanged or not matched:
        raise RuntimeError('SECRET_READBACK_MISMATCH_NO_RETRY')
    path.unlink()
    return {'secret_present': True, 'created': True, 'overwritten': False,
            'matches_local_payload': matched, 'all_existing_secrets_unchanged': unchanged,
            'private_staging_copy_removed': True, 'cli_reported_success': result.returncode == 0}

def readonly_test():
    keys = cli_json('projects', 'api-keys', '--reveal')
    candidates = [row for row in keys if row.get('type') == 'secret']
    if len(candidates) != 1 or not isinstance(candidates[0].get('api_key'), str):
        raise RuntimeError('BACKEND_KEY_SELECTION_FAILED')
    env = dict(os.environ)
    env.update({'GOOGLE_ADS_SERVICE_ACCOUNT_JSON': credential(), 'GOOGLE_ADS_AUTH_MODE': 'service_account',
                'GOOGLE_ADS_WRITES_ENABLED': 'false', 'SUPABASE_URL': 'https://' + PROJECT + '.supabase.co',
                'SUPABASE_SECRET_KEY': candidates[0]['api_key']})
    env.pop('GOOGLE_ADS_DEVELOPER_TOKEN', None)
    env.pop('GOOGLE_ADS_SERVICE_ACCOUNT_LOGIN_CUSTOMER_ID', None)
    result = subprocess.run([str(DENO), 'run', '--cached-only', '--allow-env',
                             '--allow-net=oauth2.googleapis.com,googleads.googleapis.com,' + PROJECT + '.supabase.co',
                             '--config', 'supabase/functions/sync-google-ads/deno.json',
                             '--lock', 'artifacts/service-account-deno.lock', 'scripts/google-ads-sa-readonly.ts'],
                            cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240)
    # Only the allowlisted business receipt produced by our runner is exported.
    text = result.stdout.strip() if result.returncode == 0 else result.stderr.strip()
    try:
        report = json.loads(text)
    except ValueError:
        raise RuntimeError('LOCAL_RUNNER_FAILED_NO_RAW_LOG') from None
    if not isinstance(report, dict) or not isinstance(report.get('ok'), bool):
        raise RuntimeError('LOCAL_RUNNER_RECEIPT_INVALID')
    serialized = json.dumps(report)
    if 'PRIVATE KEY' in serialized or candidates[0]['api_key'] in serialized:
        raise RuntimeError('UNSAFE_RECEIPT_BLOCKED')
    if result.returncode and not re.fullmatch(r'(?:Google Ads (?:API request|OAuth token exchange|service account JWT signing)[\s\S]{0,250}|PREFLIGHT_[A-Z_]+)', str(report.get('diagnostic', ''))):
        raise RuntimeError('UNSAFE_DIAGNOSTIC_BLOCKED')
    return report

if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) == 2 else ''
    try:
        if action == 'stage-authorized':
            report = stage()
        elif action == 'readonly-test':
            report = readonly_test()
        else:
            raise RuntimeError('EXPLICIT_OPERATION_REQUIRED')
        name = 'secret-stage' if action == 'stage-authorized' else 'real-dry-runs'
        (ROOT / 'artifacts' / (name + '-20261027.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        if report.get('ok') is False:
            sys.exit(1)
    except Exception as error:
        code = str(error)
        if not re.fullmatch(r'[A-Z_]+', code):
            code = 'OPERATOR_FAILED_NO_RAW_LOG'
        print(json.dumps({'ok': False, 'diagnostic': code, 'automatic_retry': False}))
        sys.exit(1)
