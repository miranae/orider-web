// Safe local transport fixtures exercise the complete checker, without changing live data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let mode = 'empty';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url.includes('.js') ? 'text/javascript' : req.url.includes('getActivityDiscovery') ? 'application/json' : 'text/html');
  if (req.url.includes('getActivityDiscovery')) return res.end(JSON.stringify(mode === 'error' ? { error: { status: 'UNAVAILABLE' } } : { result: { items: [], exhausted: true, nextCursor: null, totalCount: null, consistency: mode === 'malformed' ? 'invalid' : 'current_authorized_seek_pages', order: 'startTime_desc', includesUndated: false, expiresAt: Date.now() + 60000, scannedCount: 0 } }));
  if (req.url.includes('/assets/')) return res.end(`fetch('/getActivityDiscovery').then(r=>r.json()).then(()=>{document.querySelector('#root').innerHTML='<main>'+(location.pathname.startsWith('/ko/')?'아직 활동이 없어요':'No activities yet')+'</main>'})`);
  res.end('<html><body><div id="root"></div><script type="module" src="/assets/index-fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const output = await mkdtemp(join(tmpdir(), 'orider-monitor-fixtures-'));
try {
  for (mode of ['empty', 'error', 'malformed']) {
    const dir = join(output, mode);
    const child = spawn(process.execPath, ['scripts/production-monitor.mjs'], { stdio: 'inherit', env: { ...process.env, PROD_SMOKE_BASE_URL: `http://127.0.0.1:${server.address().port}`, MONITOR_RESULT_DIR: dir, MONITOR_RESOLVE_HOSTING: 'false', MONITOR_SIMULATE: '' } });
    const code = await new Promise(resolve => child.once('exit', resolve));
    const result = JSON.parse(await readFile(join(dir, 'latest.json'), 'utf8'));
    assert.equal(code, mode === 'empty' ? 0 : 1);
    assert.deepEqual(result.checks.map(c => c.state), Array(2).fill(mode === 'empty' ? 'healthy_empty' : mode === 'error' ? 'api_error' : 'unverified_empty'));
  }
  console.log(`PASS: actual checker distinguishes valid empty contract from HTTP-200 error envelope; evidence ${output}`);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
