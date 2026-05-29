/**
 * DoHp — Professional High-Performance DNS-over-HTTPS Proxy for Cloudflare Workers
 * ------------------------------------------------------------------------------
 * Features:
 *   - Provider racing (Promise.any) for the lowest achievable latency
 *   - TTL-aware edge caching driven by the real DNS answer (not a fixed value)
 *   - POST -> GET cache normalization so binary POST queries are cacheable
 *   - Adaptive routing: KV-backed RTT/health scoring re-ranks providers
 *   - RFC 8484 DoH (wireformat) + Google/Cloudflare-style JSON (/resolve)
 *   - Stale-while-revalidate for resilient, fast responses
 *   - Health, stats, providers, and a polished landing page
 *
 * Author: Rainman69
 * License: MIT
 */

import { LANDING_PAGE } from './landing.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VERSION = '1.0.0';

/**
 * Upstream DoH resolvers. `weight` is the *initial* bias before adaptive
 * routing kicks in. `family` lets clients pick a flavour via `?profile=`.
 */
const PROVIDERS = [
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', weight: 30, family: 'standard' },
  { id: 'google',     name: 'Google',     url: 'https://dns.google/dns-query',          weight: 25, family: 'standard' },
  { id: 'quad9',      name: 'Quad9',      url: 'https://dns.quad9.net/dns-query',        weight: 15, family: 'secure'   },
  { id: 'opendns',    name: 'OpenDNS',    url: 'https://doh.opendns.com/dns-query',      weight: 10, family: 'standard' },
  { id: 'adguard',    name: 'AdGuard',    url: 'https://dns.adguard-dns.com/dns-query',  weight: 8,  family: 'adblock'  },
  { id: 'mullvad',    name: 'Mullvad',    url: 'https://adblock.dns.mullvad.net/dns-query', weight: 7, family: 'adblock' },
  { id: 'controld',   name: 'ControlD',   url: 'https://freedns.controld.com/p2',        weight: 5,  family: 'adblock'  },
];

const DEFAULTS = {
  // How many top-ranked providers to race in parallel for a single query.
  RACE_COUNT: 3,
  // Hard timeout per upstream request (ms).
  UPSTREAM_TIMEOUT: 4000,
  // Fallback cache TTL when a DNS answer carries no usable TTL (seconds).
  FALLBACK_TTL: 120,
  // Clamp DNS-derived cache TTL to this maximum (seconds) to keep things fresh.
  MAX_TTL: 600,
  // Minimum cache TTL (seconds).
  MIN_TTL: 10,
  // Serve stale answers up to this long while revalidating (seconds).
  STALE_TTL: 86400,
  // How long an RTT sample remains relevant (ms half-life-ish window).
  METRICS_TTL: 3600,
};

const DNS_MSG = 'application/dns-message';
const DNS_JSON = 'application/dns-json';

// In-memory metrics cache (per-isolate) to avoid hammering KV.
let METRICS_CACHE = { ts: 0, data: null };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      return json({ error: 'internal_error', message: String(err && err.message || err) }, 500);
    }
  },

  // Cron: lightweight health probe + metrics decay.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenance(env));
  },
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') return preflight();

  switch (pathname) {
    case '/':
      return landing(request);
    case '/dns-query':
      return handleDoH(request, env, ctx, url);
    case '/resolve':
      return handleJSON(request, env, ctx, url);
    case '/providers':
      return handleProviders(env);
    case '/stats':
      return handleStats(env);
    case '/health':
      return handleHealth(env, ctx);
    default:
      return json({ error: 'not_found', endpoints: ['/dns-query', '/resolve', '/providers', '/stats', '/health'] }, 404);
  }
}

// ---------------------------------------------------------------------------
// RFC 8484 DoH endpoint (wireformat)
// ---------------------------------------------------------------------------

async function handleDoH(request, env, ctx, url) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') {
    return text('Method not allowed. Use GET or POST.', 405, { Allow: 'GET, POST, OPTIONS' });
  }

  let dnsB64; // base64url representation of the raw query (used as cache key + GET param)
  if (method === 'GET') {
    dnsB64 = url.searchParams.get('dns');
    if (!dnsB64) return text('Missing "dns" query parameter (base64url DNS message).', 400);
  } else {
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length) return text('Empty DNS message body.', 400);
    dnsB64 = b64urlEncode(buf);
  }

  const profile = url.searchParams.get('profile') || null;
  const result = await resolveWire(dnsB64, env, ctx, profile);
  return result;
}

// ---------------------------------------------------------------------------
// JSON DNS endpoint (Google/Cloudflare style)
// ---------------------------------------------------------------------------

async function handleJSON(request, env, ctx, url) {
  const name = url.searchParams.get('name');
  if (!name) return json({ error: 'missing_name', hint: '/resolve?name=example.com&type=A' }, 400);

  const type = (url.searchParams.get('type') || 'A').toUpperCase();
  const profile = url.searchParams.get('profile') || null;

  const typeCode = TYPE_CODES[type] || (/^\d+$/.test(type) ? parseInt(type, 10) : null);
  if (typeCode == null) return json({ error: 'unsupported_type', type }, 400);

  // Build a wire query, resolve it, then parse the wire answer into JSON.
  const query = buildQuery(name, typeCode);
  const dnsB64 = b64urlEncode(query);

  const wireResp = await resolveWire(dnsB64, env, ctx, profile, /*returnRaw*/ true);
  if (!wireResp.ok) {
    return json({ error: 'upstream_failed', status: wireResp.status }, 502);
  }
  const answer = parseResponse(new Uint8Array(wireResp.bytes));
  const body = {
    Status: answer.rcode,
    TC: answer.tc, RD: true, RA: true, AD: answer.ad, CD: false,
    Question: [{ name: dotName(name), type: typeCode }],
    Answer: answer.answers.map((a) => ({ name: a.name, type: a.type, TTL: a.ttl, data: a.data })),
    Provider: wireResp.provider,
    LatencyMs: wireResp.latency,
    Cache: wireResp.cache,
  };
  return json(body, 200, {
    'Cache-Control': `public, max-age=${clampTTL(answer.minTtl)}`,
    'X-DoHp-Provider': wireResp.provider,
    'X-DoHp-Cache': wireResp.cache,
  });
}

// ---------------------------------------------------------------------------
// Core resolution with racing + caching + adaptive routing
// ---------------------------------------------------------------------------

async function resolveWire(dnsB64, env, ctx, profile, returnRaw = false) {
  const cache = caches.default;
  // Normalized GET-style cache key so POST and GET hit the same entry.
  const cacheKey = new Request(`https://dohp.cache/dns-query?dns=${dnsB64}${profile ? '&profile=' + profile : ''}`);

  // 1) Edge cache lookup
  const cached = await cache.match(cacheKey);
  if (cached) {
    const age = parseInt(cached.headers.get('Age') || '0', 10);
    const maxAge = parseInt(cached.headers.get('X-DoHp-Max-Age') || '0', 10);
    const fresh = age <= maxAge;
    if (returnRaw) {
      return { ok: true, bytes: await cached.arrayBuffer(), provider: cached.headers.get('X-DoHp-Provider') || 'cache', latency: 0, cache: fresh ? 'HIT' : 'STALE' };
    }
    if (fresh) return withMeta(cached, cached.headers.get('X-DoHp-Provider') || 'cache', 'HIT', 0);
    // Stale-while-revalidate: serve stale, refresh in background.
    ctx.waitUntil(refresh(dnsB64, env, profile, cache, cacheKey));
    return withMeta(cached, cached.headers.get('X-DoHp-Provider') || 'cache', 'STALE', 0);
  }

  // 2) Miss — race providers
  const raced = await raceProviders(dnsB64, env, profile);
  if (!raced) {
    if (returnRaw) return { ok: false, status: 503 };
    return text('All DNS providers are unavailable.', 503, cors());
  }

  // 3) Cache by parsed TTL
  const parsed = parseResponse(new Uint8Array(raced.bytes));
  const ttl = clampTTL(parsed.minTtl);
  const stored = buildCacheable(raced.bytes, raced.provider, ttl);
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  ctx.waitUntil(recordMetric(env, raced.provider, raced.latency, true));

  if (returnRaw) return { ok: true, bytes: raced.bytes, provider: raced.provider, latency: raced.latency, cache: 'MISS' };
  return withMeta(stored, raced.provider, 'MISS', raced.latency);
}

/**
 * Race the top-ranked providers in parallel and return the first success.
 */
async function raceProviders(dnsB64, env, profile) {
  const ranked = await rankProviders(env, profile);
  const racers = ranked.slice(0, DEFAULTS.RACE_COUNT);
  const rest = ranked.slice(DEFAULTS.RACE_COUNT);

  const attempt = (provider) => queryUpstream(provider, dnsB64, env);

  // First, race the leaders.
  try {
    const winner = await Promise.any(racers.map(attempt));
    return winner;
  } catch (_) {
    // Leaders all failed — try the remainder sequentially as a safety net.
    for (const p of rest) {
      try { return await attempt(p); } catch (_) { /* continue */ }
    }
    return null;
  }
}

/**
 * Issue a single upstream DoH GET, with timeout + RTT measurement.
 * Resolves with { bytes, provider, latency } or rejects on failure.
 */
async function queryUpstream(provider, dnsB64, env) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULTS.UPSTREAM_TIMEOUT);
  try {
    const resp = await fetch(`${provider.url}?dns=${dnsB64}`, {
      method: 'GET',
      headers: { Accept: DNS_MSG, 'User-Agent': `DoHp/${VERSION}` },
      signal: ctrl.signal,
      // Hint Cloudflare to cache upstream where possible.
      cf: { cacheTtl: 60, cacheEverything: false },
    });
    if (!resp.ok) throw new Error(`upstream ${provider.id} -> ${resp.status}`);
    const bytes = await resp.arrayBuffer();
    if (!bytes || bytes.byteLength < 12) throw new Error(`short answer from ${provider.id}`);
    return { bytes, provider: provider.id, latency: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Background refresh for stale-while-revalidate.
 */
async function refresh(dnsB64, env, profile, cache, cacheKey) {
  const raced = await raceProviders(dnsB64, env, profile);
  if (!raced) return;
  const parsed = parseResponse(new Uint8Array(raced.bytes));
  const ttl = clampTTL(parsed.minTtl);
  const stored = buildCacheable(raced.bytes, raced.provider, ttl);
  await cache.put(cacheKey, stored);
  await recordMetric(env, raced.provider, raced.latency, true);
}

// ---------------------------------------------------------------------------
// Adaptive routing (KV-backed RTT scoring)
// ---------------------------------------------------------------------------

async function rankProviders(env, profile) {
  let pool = PROVIDERS;
  if (profile === 'adblock') pool = PROVIDERS.filter((p) => p.family === 'adblock');
  else if (profile === 'secure') pool = PROVIDERS.filter((p) => p.family !== 'adblock');
  if (!pool.length) pool = PROVIDERS;

  const metrics = await getMetrics(env);
  // Score = base weight boosted by speed and reliability.
  const scored = pool.map((p) => {
    const m = metrics[p.id] || {};
    const rtt = m.rtt || 120;          // assume 120ms if unknown
    const fails = m.fails || 0;
    const ok = m.ok || 0;
    const reliability = (ok + 1) / (ok + fails + 1);
    // Lower RTT + higher reliability + higher weight = better.
    const score = (p.weight * reliability * 1000) / rtt;
    return { ...p, score, rtt, reliability };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function getMetrics(env) {
  const now = Date.now();
  if (METRICS_CACHE.data && now - METRICS_CACHE.ts < 15000) return METRICS_CACHE.data;
  let data = {};
  if (env.DOHP_METRICS) {
    try {
      const raw = await env.DOHP_METRICS.get('metrics');
      if (raw) data = JSON.parse(raw);
    } catch (_) { /* ignore */ }
  }
  METRICS_CACHE = { ts: now, data };
  return data;
}

async function recordMetric(env, providerId, latency, success) {
  if (!env.DOHP_METRICS) return;
  try {
    const data = await getMetrics(env);
    const m = data[providerId] || { rtt: latency, ok: 0, fails: 0 };
    // Exponential moving average of RTT.
    m.rtt = success ? Math.round(m.rtt * 0.7 + latency * 0.3) : m.rtt;
    if (success) m.ok = (m.ok || 0) + 1; else m.fails = (m.fails || 0) + 1;
    m.last = Date.now();
    data[providerId] = m;
    METRICS_CACHE = { ts: Date.now(), data };
    await env.DOHP_METRICS.put('metrics', JSON.stringify(data), { expirationTtl: DEFAULTS.METRICS_TTL });
  } catch (_) { /* best-effort */ }
}

async function runMaintenance(env) {
  // Probe each provider with a tiny A query and update metrics.
  const dnsB64 = b64urlEncode(buildQuery('cloudflare.com', 1));
  await Promise.all(PROVIDERS.map(async (p) => {
    try {
      const r = await queryUpstream(p, dnsB64, env);
      await recordMetric(env, p.id, r.latency, true);
    } catch (_) {
      await recordMetric(env, p.id, 0, false);
    }
  }));
}

// ---------------------------------------------------------------------------
// Status endpoints
// ---------------------------------------------------------------------------

async function handleProviders(env) {
  const ranked = await rankProviders(env, null);
  return json({
    version: VERSION,
    count: ranked.length,
    providers: ranked.map((p, i) => ({
      rank: i + 1, id: p.id, name: p.name, family: p.family,
      url: p.url, weight: p.weight,
      rttMs: Math.round(p.rtt), reliability: +p.reliability.toFixed(3),
      score: +p.score.toFixed(2),
    })),
  });
}

async function handleStats(env) {
  const metrics = await getMetrics(env);
  return json({ version: VERSION, generatedAt: new Date().toISOString(), metrics });
}

async function handleHealth(env, ctx) {
  // Quick liveness check against the fastest provider.
  const ranked = await rankProviders(env, null);
  const dnsB64 = b64urlEncode(buildQuery('example.com', 1));
  let healthy = false; let provider = null; let latency = null;
  for (const p of ranked.slice(0, 2)) {
    try {
      const r = await queryUpstream(p, dnsB64, env);
      healthy = true; provider = p.id; latency = r.latency; break;
    } catch (_) { /* try next */ }
  }
  return json({ status: healthy ? 'ok' : 'degraded', provider, latencyMs: latency, version: VERSION },
    healthy ? 200 : 503);
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

function landing(request) {
  const url = new URL(request.url);
  const endpoint = `${url.origin}/dns-query`;
  const html = LANDING_PAGE(endpoint, url.origin, VERSION);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
  };
}

function preflight() {
  return new Response(null, { status: 204, headers: { ...cors(), 'Access-Control-Max-Age': '86400' } });
}

function buildCacheable(bytes, provider, ttl) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': DNS_MSG,
      'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${DEFAULTS.STALE_TTL}`,
      'X-DoHp-Provider': provider,
      'X-DoHp-Max-Age': String(ttl),
      ...cors(),
    },
  });
}

function withMeta(resp, provider, cacheState, latency) {
  const h = new Headers(resp.headers);
  h.set('X-DoHp-Provider', provider);
  h.set('X-DoHp-Cache', cacheState);
  if (latency != null) h.set('X-DoHp-Latency', String(latency));
  Object.entries(cors()).forEach(([k, v]) => h.set(k, v));
  return new Response(resp.body, { status: resp.status, headers: h });
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(), ...extra },
  });
}

function text(msg, status = 200, extra = {}) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

function clampTTL(ttl) {
  if (!ttl || ttl <= 0) return DEFAULTS.FALLBACK_TTL;
  return Math.min(DEFAULTS.MAX_TTL, Math.max(DEFAULTS.MIN_TTL, ttl));
}

// ---------------------------------------------------------------------------
// Base64url
// ---------------------------------------------------------------------------

function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Minimal DNS wireformat: build a query + parse answers for TTL & JSON
// ---------------------------------------------------------------------------

const TYPE_CODES = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257, HTTPS: 65, SVCB: 64 };
const TYPE_NAMES = Object.fromEntries(Object.entries(TYPE_CODES).map(([k, v]) => [v, k]));

function dotName(n) { return n.endsWith('.') ? n : n + '.'; }

/** Build a standard recursive DNS query message for `name`/`type`. */
function buildQuery(name, type) {
  const labels = name.replace(/\.$/, '').split('.');
  let qnameLen = 1;
  for (const l of labels) qnameLen += 1 + l.length;
  const buf = new Uint8Array(12 + qnameLen + 4);
  const dv = new DataView(buf.buffer);
  // Header: ID=0 (cacheable), RD=1
  dv.setUint16(0, 0x0000);
  dv.setUint16(2, 0x0100); // flags: recursion desired
  dv.setUint16(4, 1);      // QDCOUNT
  let off = 12;
  for (const l of labels) {
    buf[off++] = l.length;
    for (let i = 0; i < l.length; i++) buf[off++] = l.charCodeAt(i);
  }
  buf[off++] = 0; // root
  dv.setUint16(off, type); off += 2;
  dv.setUint16(off, 1);    // class IN
  return buf;
}

/** Parse a DNS response: extract rcode, flags, answers (name/type/ttl/data), min TTL. */
function parseResponse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = { rcode: 0, tc: false, ad: false, answers: [], minTtl: 0 };
  if (bytes.length < 12) return out;
  const flags = dv.getUint16(2);
  out.tc = !!(flags & 0x0200);
  out.ad = !!(flags & 0x0020);
  out.rcode = flags & 0x000f;
  const qd = dv.getUint16(4);
  const an = dv.getUint16(6);
  let off = 12;
  // Skip questions
  for (let i = 0; i < qd; i++) {
    off = skipName(bytes, off);
    off += 4; // type + class
  }
  let minTtl = Infinity;
  for (let i = 0; i < an && off < bytes.length; i++) {
    const nameRes = readName(bytes, off);
    const name = nameRes.name; off = nameRes.off;
    if (off + 10 > bytes.length) break;
    const type = dv.getUint16(off); off += 2;
    off += 2; // class
    const ttl = dv.getUint32(off); off += 4;
    const rdlen = dv.getUint16(off); off += 2;
    const rdata = bytes.subarray(off, off + rdlen);
    const data = parseRdata(type, rdata, bytes, off);
    off += rdlen;
    if (ttl < minTtl) minTtl = ttl;
    out.answers.push({ name: dotName(name), type, ttl, data });
  }
  out.minTtl = minTtl === Infinity ? 0 : minTtl;
  return out;
}

function parseRdata(type, rdata, full, rdataOff) {
  try {
    if (type === 1 && rdata.length === 4) return rdata.join('.');
    if (type === 28 && rdata.length === 16) {
      const parts = [];
      for (let i = 0; i < 16; i += 2) parts.push(((rdata[i] << 8) | rdata[i + 1]).toString(16));
      return parts.join(':').replace(/(^|:)0(:0)+(:|$)/, '::').replace(/:{3,}/, '::');
    }
    if (type === 5 || type === 2 || type === 12) return dotName(readName(full, rdataOff).name);
    if (type === 16) { // TXT
      let s = ''; let i = 0;
      while (i < rdata.length) { const len = rdata[i++]; s += new TextDecoder().decode(rdata.subarray(i, i + len)); i += len; }
      return s;
    }
    if (type === 15) { // MX
      const pref = (rdata[0] << 8) | rdata[1];
      return `${pref} ${dotName(readName(full, rdataOff + 2).name)}`;
    }
    // Fallback: hex
    return Array.from(rdata).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return '';
  }
}

function skipName(bytes, off) {
  while (off < bytes.length) {
    const len = bytes[off];
    if (len === 0) return off + 1;
    if ((len & 0xc0) === 0xc0) return off + 2; // pointer
    off += 1 + len;
  }
  return off;
}

function readName(bytes, off, depth = 0) {
  const labels = [];
  let jumped = false; let originalOff = off;
  while (off < bytes.length && depth < 20) {
    const len = bytes[off];
    if (len === 0) { off += 1; break; }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | bytes[off + 1];
      if (!jumped) originalOff = off + 2;
      const sub = readName(bytes, ptr, depth + 1);
      labels.push(sub.name);
      jumped = true;
      off = originalOff;
      return { name: labels.filter(Boolean).join('.'), off };
    }
    off += 1;
    labels.push(new TextDecoder().decode(bytes.subarray(off, off + len)));
    off += len;
  }
  return { name: labels.filter(Boolean).join('.'), off: jumped ? originalOff : off };
}
