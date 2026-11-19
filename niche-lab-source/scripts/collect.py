"""Unattended writer. Pass {site_url, token} as one JSON line on stdin.
Obtain fresh service authorization from Sites get_site. Never save it in source.
"""
import json
import sys
import time
import urllib.request
import urllib.error


def collect(config):
    base = config['site_url'].rstrip('/')
    if not base.startswith('https://'):
        raise ValueError('HTTPS site URL required')

    def request(path, body=None):
        headers = {'OAI-Sites-Authorization': 'Bearer ' + config['token']}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(base + path, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=180) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise RuntimeError('Site authorization failed. Reacquire service access; do not change site sharing.') from None
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError(f'Collector HTTP {exc.code}') from None
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError('Collector network request failed; the next run can resume pending tasks.') from None
            time.sleep(2 ** (attempt + 1))

    status = request('/api/collector/start', {})
    for _ in range(450):
        if not status.get('pending'):
            break
        status = request('/api/collector/step', {'day': status['day']})
        if status.get('busy'):
            time.sleep(2)
    result = request('/api/collector/status?day=' + status['day'])
    summary = {key: result.get(key) for key in ['day', 'status', 'total', 'done', 'pending', 'failed', 'warnings', 'finished_at']}
    print(json.dumps(summary), flush=True)
    if result.get('errors'):
        print(json.dumps({'issues': result['errors']}), flush=True)
    return 0 if result.get('status') == 'complete' and not result.get('pending') else 1


if __name__ == '__main__':
    try:
        sys.exit(collect(json.loads(sys.stdin.readline())))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
