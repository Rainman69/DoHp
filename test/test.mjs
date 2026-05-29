/**
 * Lightweight end-to-end test against a running DoHp endpoint.
 * Usage: BASE=https://dohp.example.workers.dev node test/test.mjs
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

// Build a base64url DNS query (example.com, A) — RFC 8484.
function buildQuery(name, type = 1) {
  const labels = name.split('.');
  let len = 12 + 1 + labels.reduce((a, l) => a + 1 + l.length, 0) + 4;
  const b = new Uint8Array(len);
  const dv = new DataView(b.buffer);
  dv.setUint16(2, 0x0100); dv.setUint16(4, 1);
  let o = 12;
  for (const l of labels) { b[o++] = l.length; for (const c of l) b[o++] = c.charCodeAt(0); }
  b[o++] = 0; dv.setUint16(o, type); o += 2; dv.setUint16(o, 1);
  let bin = ''; for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  console.log('Testing DoHp at', BASE, '\n');

  console.log('GET /  (landing)');
  let r = await fetch(`${BASE}/`);
  ok(r.status === 200, 'returns 200');
  ok((r.headers.get('content-type') || '').includes('text/html'), 'is HTML');

  console.log('\nGET /dns-query  (wireformat)');
  const dns = buildQuery('example.com', 1);
  r = await fetch(`${BASE}/dns-query?dns=${dns}`);
  ok(r.status === 200, 'returns 200');
  ok((r.headers.get('content-type') || '').includes('dns-message'), 'dns-message content-type');
  const buf = new Uint8Array(await r.arrayBuffer());
  ok(buf.length > 12, `answer has ${buf.length} bytes`);
  console.log('  → provider:', r.headers.get('x-dohp-provider'), '| cache:', r.headers.get('x-dohp-cache'), '| latency:', r.headers.get('x-dohp-latency'));

  console.log('\nGET /dns-query  (cache hit on repeat)');
  r = await fetch(`${BASE}/dns-query?dns=${dns}`);
  ok(r.status === 200, 'returns 200');
  console.log('  → cache:', r.headers.get('x-dohp-cache'));

  console.log('\nGET /resolve?name=example.com&type=A  (JSON)');
  r = await fetch(`${BASE}/resolve?name=example.com&type=A`);
  ok(r.status === 200, 'returns 200');
  const j = await r.json();
  ok(Array.isArray(j.Answer), 'has Answer array');
  ok(j.Answer.length > 0, `resolved ${j.Answer.length} record(s): ${j.Answer.map(a => a.data).join(', ')}`);

  console.log('\nGET /providers');
  r = await fetch(`${BASE}/providers`);
  ok(r.status === 200, 'returns 200');
  const p = await r.json();
  ok(p.providers && p.providers.length === 7, `${p.providers?.length} providers ranked`);

  console.log('\nGET /health');
  r = await fetch(`${BASE}/health`);
  ok(r.status === 200 || r.status === 503, `status ${r.status}`);
  console.log('  →', JSON.stringify(await r.json()));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
