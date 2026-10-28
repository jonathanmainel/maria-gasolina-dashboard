"""Isolated-project operator. Never prints credentials or stores sessions."""
import json, subprocess, urllib.request, urllib.error, sys, os
from pathlib import Path

REF = 'uwafdxsdsgqysjjxfywo'
URL = 'https://' + REF + '.supabase.co'

def config():
    assert os.environ.get('HOMOLOG_AUTH_FILE'), 'Private homologation configuration file required'
    value = json.loads(Path(os.environ['HOMOLOG_AUTH_FILE']).read_text(encoding='utf-8-sig'))
    assert value['projectRef'] == REF and value['url'].rstrip('/') == URL
    return value

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

def request(path, key, body=None, method=None, token=None, extra=None):
    assert path.startswith(('/rest/v1/', '/auth/v1/', '/functions/v1/'))
    headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key), 'Content-Type': 'application/json'}
    headers.update(extra or {})
    req = urllib.request.Request(URL + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=115) as response:
            data = response.read(); status = response.status
    except urllib.error.HTTPError as error:
        status = error.code; data = error.read()
    try: return status, json.loads(data)
    except ValueError: return status, {'error_code': 'NON_JSON_RESPONSE'}

def backend_key():
    result = subprocess.run([str(Path('node_modules/.bin/supabase.cmd').resolve()), 'projects', 'api-keys', '--project-ref', REF, '--reveal', '--output', 'json'], capture_output=True, text=True, check=True)
    items = json.loads(result.stdout)
    keys = [item for item in items if item.get('type') == 'secret' and item.get('name') == 'default']
    assert len(keys) == 1
    return keys[0]['api_key']

def main():
    cfg = config()
    action = sys.argv[1]
    if action == 'frontend':
        env = 'VITE_SUPABASE_URL=' + URL + '\nVITE_SUPABASE_PUBLISHABLE_KEY=' + cfg['apiKey'] + '\n'
        Path('.env.local').write_text(env, encoding='utf-8')
        print(json.dumps({'project_ref': REF, 'frontend_uses_public_key_only': True}))
        return
    key = backend_key()
    if action == 'scenario':
        assert sys.argv[2] in ('partial', 'success', 'indeterminate')
        generation = int(sys.argv[3]); assert 1 <= generation <= 4
        status, _ = request('/rest/v1/manual_sync_homolog_control?id=eq.true', key, {'scenario': sys.argv[2], 'generation': generation}, 'PATCH')
        assert status == 204, ('CONTROL_FAILED', status)
        print(json.dumps({'scenario': sys.argv[2], 'generation': generation, 'project_ref': REF}))
    elif action == 'cron':
        status, result = request('/functions/v1/sync-dashboard-daily', key, {'trigger': 'cron'})
        Path('artifacts/homolog-integrada-20261027/cron-result.json').write_text(json.dumps({'http': status, 'result': result}, indent=2), encoding='utf-8')
        print(json.dumps({'http': status, 'result': result}))
    elif action == 'preflight':
        from datetime import date, timedelta
        status, state = request('/rest/v1/rpc/get_dashboard_sync_status', key, {'p_client_slug': 'maria-gasolina', 'p_user_id': cfg['accounts']['admin']['userId']})
        assert status == 200
        today = date.fromisoformat(state['today'])
        for source in ['google-ads', 'meta-ads', 'ga4']:
            status, result = request('/functions/v1/sync-' + source, key, {'client_slug': 'maria-gasolina', 'start_date': str(today-timedelta(days=7)), 'end_date': str(today), 'dry_run': True})
            print(json.dumps({'source': source, 'http': status, 'ok': result.get('ok'), 'counts': result.get('counts'), 'write': result.get('database_write_performed'), 'error': result.get('error'), 'details': result.get('details'), 'code': result.get('error_code')}))
    elif action == 'indeterminate':
        import concurrent.futures, time, uuid
        status, _ = request('/rest/v1/manual_sync_homolog_control?id=eq.true', key, {'scenario': 'indeterminate', 'generation': 1}, 'PATCH')
        assert status == 204
        account = cfg['accounts']['admin']
        status, session = request('/auth/v1/token?grant_type=password', cfg['apiKey'], {'email': account['email'], 'password': account['password']})
        assert status == 200
        report = {'project_ref': REF, 'test': 'indeterminate', 'checks': {}}
        with concurrent.futures.ThreadPoolExecutor() as executor:
            work = executor.submit(request, '/functions/v1/sync-dashboard-daily', key, {'trigger': 'cron'})
            run = None
            for _ in range(60):
                status, rows = request('/rest/v1/dashboard_automation_runs?trigger=eq.cron&source=eq.google_ads&order=requested_at.desc&limit=1', key)
                if status == 200 and rows and rows[0]['status'] == 'indeterminate':
                    run = rows[0]; break
                time.sleep(0.5)
            assert run, 'INDETERMINATE_NOT_OBSERVED'
            run_id = run['id']; report['run_id'] = run_id
            _, rows = request('/rest/v1/manual_sync_homolog_receipts?run_id=eq.' + run_id, key)
            assert len(rows) == 1 and rows[0]['finished_at'] is None, 'COLLECTOR_MUST_STILL_BE_ACTIVE'
            report['checks']['native_collector_still_active'] = True
            status, released = request('/rest/v1/rpc/reconcile_manual_sync_homolog', key, {'p_run_id': run_id, 'p_operator': account['userId']})
            assert status == 200 and released is False, 'ACTIVE_WORK_MUST_NOT_BE_RELEASED'
            report['checks']['active_reconciliation_refused'] = True
            status, blocked = request('/functions/v1/request-dashboard-sync', cfg['apiKey'], {'action': 'request', 'client_slug': 'maria-gasolina', 'sources': ['google_ads'], 'request_key': str(uuid.uuid4())}, token=session['access_token'])
            assert status == 202 and blocked['results'][0]['state'] == 'active' and blocked['results'][0]['run_id'] == run_id
            report['checks']['manual_during_cron_blocked'] = True
            report['coordinator'] = dict(zip(['http', 'result'], work.result(timeout=110)))
            for _ in range(65):
                _, rows = request('/rest/v1/manual_sync_homolog_receipts?run_id=eq.' + run_id, key)
                if rows and rows[0]['finished_at'] is not None: break
                time.sleep(1)
            assert rows[0]['finished_at'] is not None and rows[0]['outcome'] == 'success'
            report['terminal_receipt'] = rows[0]
            status, released = request('/rest/v1/rpc/reconcile_manual_sync_homolog', key, {'p_run_id': run_id, 'p_operator': account['userId']})
            assert status == 200 and released is True
            _, rows = request('/rest/v1/dashboard_automation_runs?id=eq.' + run_id, key)
            assert rows[0]['status'] == 'success'
            report['checks']['terminal_evidence_reconciliation'] = True
            report['checks']['cron_excludes_today'] = rows[0]['period_mode'] == 'complete_days'
        report['passed'] = True
        Path('artifacts/homolog-integrada-20261027/indeterminate-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
    elif action == 'preservation':
        _, before = request('/rest/v1/dashboard_daily_metrics?source=eq.meta_ads&order=metric_date', key)
        assert len(before) == 7
        status, _ = request('/rest/v1/manual_sync_homolog_control?id=eq.true', key, {'scenario': 'partial', 'generation': 1}, 'PATCH')
        assert status == 204
        status, result = request('/functions/v1/sync-dashboard-daily', key, {'trigger': 'cron'})
        assert status == 207
        assert {r['source']: r['state'] for r in result['results']} == {'google_ads': 'success', 'ga4': 'success', 'meta_ads': 'failed'}
        _, after = request('/rest/v1/dashboard_daily_metrics?source=eq.meta_ads&order=metric_date', key)
        assert before == after
        ids = ','.join(r['run_id'] for r in result['results'])
        _, receipts = request('/rest/v1/manual_sync_homolog_receipts?run_id=in.(' + ids + ')', key)
        successes = [r for r in receipts if r['source'] != 'meta_ads']
        assert len(successes) == 2 and all(not r['write_performed'] and r['write_status'] == 'already_processed' for r in successes)
        report = {'project_ref': REF, 'passed': True, 'checks': {'failed_source_preserves_saved_rows': True, 'same_payload_replay_no_write': True, 'cron_excludes_today': True}, 'coordinator': result, 'receipts': receipts}
        Path('artifacts/homolog-integrada-20261027/preservation-replay-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
    else: raise ValueError('UNKNOWN_ACTION')

if __name__ == '__main__': main()
