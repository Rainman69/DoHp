<div align="center">

# 🛡️ DoHp

### A professional, ultra-fast DNS-over-HTTPS proxy for Cloudflare Workers

**Provider racing · Adaptive routing · TTL-aware caching · JSON DNS API**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Rainman69/DoHp)
[![License: MIT](https://img.shields.io/badge/License-MIT-22d3a6.svg)](LICENSE)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)

🔗 **Live demo:** [`https://dohp.dohp-rainman.workers.dev`](https://dohp.dohp-rainman.workers.dev)

</div>

---

## ✨ What makes DoHp different

Most DoH proxies just forward your query to a single upstream and add CORS headers. DoHp is engineered to be **measurably faster and more resilient**:

| Feature | What it does | Why it's faster |
|---|---|---|
| 🏁 **Provider racing** | Queries the top 3 ranked resolvers in parallel with `Promise.any` | You always get the *fastest* answer, never blocked by a slow upstream |
| 🧠 **Adaptive routing** | KV-backed RTT + reliability scoring re-ranks providers continuously | Routes around degraded resolvers automatically |
| ⚡ **TTL-aware caching** | Parses the real DNS answer and caches by its actual TTL | Fresh when it matters, near-instant when it can be |
| 🔁 **Stale-while-revalidate** | Serves slightly stale answers instantly, refreshes in background | Zero perceived latency on near-expiry entries |
| 📦 **POST → GET cache** | Normalizes binary POST queries into a cache key | Even RFC 8484 POST traffic is cacheable |
| 🌍 **Smart Placement** | Cloudflare moves the Worker closer to upstreams | Lower round-trip on cache misses |
| 🛡️ **Profiles** | `?profile=adblock` / `?profile=secure` | Route through ad-blocking or security resolvers on demand |

## 🚀 Quick deploy

### One-click

Click the **Deploy to Cloudflare Workers** button above and connect this repo.

### Manual (Wrangler CLI)

```bash
# 1. Clone & install
git clone https://github.com/Rainman69/DoHp.git && cd DoHp
npm install

# 2. Create your KV namespace for adaptive metrics
npx wrangler kv namespace create DOHP_METRICS
#   → copy the returned id into wrangler.toml ([[kv_namespaces]].id)

# 3. Deploy
npx wrangler deploy
```

Your endpoint will be printed as `https://dohp.<your-subdomain>.workers.dev`.

## 🔧 Usage

### As your system / browser DNS resolver

Set this URL as your **Secure DNS / DNS-over-HTTPS** provider:

```
https://dohp.<your-subdomain>.workers.dev/dns-query
```

- **Firefox** → Settings → Privacy & Security → DNS over HTTPS → *Custom*
- **Chrome / Edge** → Settings → Privacy → Use secure DNS → *Custom*
- **Windows 11** → Settings → Network → DNS over HTTPS
- **Android (Private DNS)** requires DoT, not DoH — use a client like Intra/RethinkDNS pointed at the endpoint.

### RFC 8484 wireformat

```bash
# GET (base64url-encoded DNS message)
curl "https://dohp.<sub>.workers.dev/dns-query?dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE"

# POST (raw binary, no encoding)
curl -H "content-type: application/dns-message" \
     --data-binary @query.bin \
     "https://dohp.<sub>.workers.dev/dns-query"
```

### JSON DNS API (Google/Cloudflare style)

```bash
curl "https://dohp.<sub>.workers.dev/resolve?name=example.com&type=A"
```

```json
{
  "Status": 0,
  "Answer": [
    { "name": "example.com.", "type": 1, "TTL": 261, "data": "104.20.23.154" }
  ],
  "Provider": "cloudflare",
  "LatencyMs": 3,
  "Cache": "MISS"
}
```

Supported `type` values: `A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, SRV, CAA, HTTPS, SVCB` (or a numeric code).

## 📡 API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Landing page with live endpoint + docs |
| `/dns-query` | GET, POST | RFC 8484 DoH (wireformat) |
| `/resolve?name=&type=` | GET | JSON DNS resolution |
| `/providers` | GET | Live provider ranking (RTT, reliability, score) |
| `/stats` | GET | Raw performance metrics from KV |
| `/health` | GET | Liveness probe against the fastest provider |

### Query parameters

| Param | Applies to | Values | Effect |
|---|---|---|---|
| `profile` | `/dns-query`, `/resolve` | `adblock`, `secure` | Restrict racing to ad-blocking or security-focused resolvers |

## 📊 Response headers

| Header | Meaning |
|---|---|
| `X-DoHp-Provider` | Which upstream resolver answered |
| `X-DoHp-Cache` | `HIT` / `STALE` / `MISS` |
| `X-DoHp-Latency` | Upstream resolution time (ms) on a miss |
| `Cache-Control` | `public, max-age=<dns-ttl>, stale-while-revalidate=86400` |

## 🌐 Upstream resolvers

| Resolver | Profile | Endpoint |
|---|---|---|
| Cloudflare | standard | `cloudflare-dns.com` |
| Google | standard | `dns.google` |
| Quad9 | secure | `dns.quad9.net` |
| OpenDNS | standard | `doh.opendns.com` |
| AdGuard | adblock | `dns.adguard-dns.com` |
| Mullvad | adblock | `adblock.dns.mullvad.net` |
| ControlD | adblock | `freedns.controld.com` |

Want to customize? Edit the `PROVIDERS` array in [`src/worker.js`](src/worker.js).

## ⚙️ Configuration

Tunables live in `DEFAULTS` at the top of [`src/worker.js`](src/worker.js):

```js
const DEFAULTS = {
  RACE_COUNT: 3,          // providers raced in parallel
  UPSTREAM_TIMEOUT: 4000, // per-upstream timeout (ms)
  MAX_TTL: 600,           // clamp DNS TTL for caching (s)
  MIN_TTL: 10,
  STALE_TTL: 86400,       // stale-while-revalidate window (s)
};
```

The cron trigger (`*/5 * * * *` in `wrangler.toml`) runs a lightweight health probe so adaptive routing has fresh data even on a cold cache.

## 🧪 Testing

```bash
# Local dev server
npm run dev

# In another terminal — run the e2e suite
npm test                                   # tests http://127.0.0.1:8787
BASE=https://dohp.<sub>.workers.dev npm test   # tests a live deployment
```

## 📁 Project structure

```
DoHp/
├── src/
│   ├── worker.js     # core: routing, racing, caching, DNS parsing
│   └── landing.js    # self-contained landing page
├── test/
│   └── test.mjs      # end-to-end test suite
├── wrangler.toml     # Cloudflare Workers config (KV, cron, placement)
├── package.json
└── LICENSE
```

## 📝 License

[MIT](LICENSE) © Rainman69

Inspired by [`doh-proxy-worker`](https://github.com/code3-dev/doh-proxy-worker) by Hossein Pira — rebuilt from scratch with racing, adaptive routing, TTL-aware caching, and a JSON API.
