/**
 * DoHp landing page — rendered server-side, fully self-contained (no external assets).
 */
export function LANDING_PAGE(endpoint, origin, version) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="DoHp — a professional, ultra-fast DNS-over-HTTPS proxy on Cloudflare Workers with provider racing, adaptive routing and TTL-aware caching.">
<title>DoHp · Fast DNS-over-HTTPS Proxy</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>">
<style>
  :root{
    --bg:#0b1020;--bg2:#0e1530;--card:#121a36;--card2:#0f1730;
    --txt:#e8edff;--muted:#94a3c4;--line:#23304f;
    --brand:#5b8cff;--brand2:#22d3a6;--accent:#a855f7;
    --ok:#22c55e;--warn:#f59e0b;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;background:
    radial-gradient(1200px 600px at 80% -10%,rgba(91,140,255,.18),transparent),
    radial-gradient(900px 500px at -10% 10%,rgba(34,211,166,.14),transparent),var(--bg);
    color:var(--txt);line-height:1.65;min-height:100vh;overflow-x:hidden}
  .wrap{max-width:1080px;margin:0 auto;padding:0 22px}
  /* Nav */
  nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.25rem;letter-spacing:.3px}
  .logo .dot{width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 0 18px var(--brand)}
  .nav-links{display:flex;gap:22px;font-size:.95rem}
  .nav-links a{color:var(--muted);text-decoration:none;transition:.2s}
  .nav-links a:hover{color:var(--txt)}
  /* Hero */
  header{text-align:center;padding:60px 0 30px}
  .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(91,140,255,.12);border:1px solid var(--line);
    color:var(--brand);padding:6px 14px;border-radius:999px;font-size:.82rem;font-weight:600;margin-bottom:22px}
  .badge .pulse{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
  h1{font-size:clamp(2.4rem,6vw,4rem);font-weight:850;line-height:1.05;letter-spacing:-1.5px;margin-bottom:18px}
  h1 .grad{background:linear-gradient(100deg,var(--brand),var(--brand2) 60%,var(--accent));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .lead{font-size:1.2rem;color:var(--muted);max-width:640px;margin:0 auto 34px}
  /* Endpoint */
  .endpoint{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:18px;
    padding:26px;max-width:760px;margin:0 auto;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  .endpoint .label{font-size:.8rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:12px}
  .url-row{display:flex;gap:10px;flex-wrap:wrap}
  .url{flex:1;min-width:240px;background:#0a1126;border:1px solid var(--line);border-radius:12px;padding:16px 18px;
    font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:1rem;color:var(--brand2);word-break:break-all;text-align:left}
  .copy{background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;border:none;border-radius:12px;
    padding:0 26px;font-weight:700;font-size:.98rem;cursor:pointer;transition:.2s;white-space:nowrap}
  .copy:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(91,140,255,.4)}
  .copy:active{transform:translateY(0)}
  /* Stats strip */
  .strip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:42px auto;max-width:760px}
  .strip .s{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center}
  .strip .s .n{font-size:1.7rem;font-weight:800;background:linear-gradient(135deg,var(--brand),var(--brand2));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .strip .s .t{font-size:.8rem;color:var(--muted);margin-top:4px}
  /* Sections */
  section{padding:50px 0}
  .h2{font-size:2rem;font-weight:800;margin-bottom:8px;letter-spacing:-.5px}
  .sub{color:var(--muted);margin-bottom:30px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}
  .feat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;transition:.25s}
  .feat:hover{transform:translateY(-4px);border-color:var(--brand);box-shadow:0 16px 40px rgba(91,140,255,.12)}
  .feat .ic{font-size:1.7rem;margin-bottom:12px}
  .feat h3{font-size:1.15rem;margin-bottom:6px}
  .feat p{color:var(--muted);font-size:.95rem}
  /* Code */
  pre{background:#080d1f;border:1px solid var(--line);border-radius:14px;padding:20px;overflow-x:auto;
    font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:.9rem;color:#cfe0ff;margin:14px 0}
  pre .c{color:#5b7099}.pre .k{color:var(--brand2)}
  .tabs{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .tab{background:var(--card);border:1px solid var(--line);color:var(--muted);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:.9rem;transition:.2s}
  .tab.active{background:var(--brand);color:#fff;border-color:var(--brand)}
  .panel{display:none}.panel.active{display:block}
  /* Providers */
  .prov{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  .pcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
  .pcard .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .pcard .name{font-weight:700}
  .pcard .tag{font-size:.7rem;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px}
  .tag.standard{background:rgba(91,140,255,.15);color:var(--brand)}
  .tag.adblock{background:rgba(34,211,166,.15);color:var(--brand2)}
  .tag.secure{background:rgba(168,85,247,.15);color:var(--accent)}
  .pcard .u{font-size:.8rem;color:var(--muted);word-break:break-all;font-family:ui-monospace,monospace}
  footer{border-top:1px solid var(--line);padding:34px 0;text-align:center;color:var(--muted);font-size:.9rem;margin-top:30px}
  footer a{color:var(--brand);text-decoration:none}
  .toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(140%);background:var(--ok);color:#062012;
    padding:14px 26px;border-radius:12px;font-weight:700;transition:.3s;z-index:99;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  .toast.show{transform:translateX(-50%) translateY(0)}
  @media(max-width:680px){.strip{grid-template-columns:repeat(2,1fr)}.nav-links{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <nav>
    <div class="logo"><span class="dot"></span>DoHp</div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#usage">Usage</a>
      <a href="#providers">Providers</a>
      <a href="/health">Health</a>
      <a href="https://github.com/Rainman69/DoHp" target="_blank">GitHub</a>
    </div>
  </nav>

  <header>
    <div class="badge"><span class="pulse"></span> Live · v${version} · powered by Cloudflare edge</div>
    <h1>Your private, <span class="grad">blazing-fast</span><br>DNS-over-HTTPS resolver</h1>
    <p class="lead">DoHp races multiple upstream resolvers in parallel, caches with real DNS TTLs, and adaptively routes to whatever is fastest from your location — anywhere on Earth.</p>

    <div class="endpoint">
      <div class="label">🔗 Your DoH endpoint</div>
      <div class="url-row">
        <div class="url" id="ep">${endpoint}</div>
        <button class="copy" onclick="cp()">Copy</button>
      </div>
    </div>

    <div class="strip">
      <div class="s"><div class="n">7</div><div class="t">Upstream resolvers</div></div>
      <div class="s"><div class="n">3×</div><div class="t">Parallel racing</div></div>
      <div class="s"><div class="n">300+</div><div class="t">Edge locations</div></div>
      <div class="s"><div class="n">~0ms</div><div class="t">Cached responses</div></div>
    </div>
  </header>

  <section id="features">
    <div class="h2">Why DoHp is faster</div>
    <p class="sub">Engineering decisions that shave off every millisecond.</p>
    <div class="grid">
      <div class="feat"><div class="ic">🏁</div><h3>Provider racing</h3><p>Top-ranked resolvers are queried simultaneously; the first valid answer wins. No waiting on a slow upstream.</p></div>
      <div class="feat"><div class="ic">🧠</div><h3>Adaptive routing</h3><p>KV-backed RTT &amp; reliability scoring continuously re-ranks providers based on real performance from the edge.</p></div>
      <div class="feat"><div class="ic">⚡</div><h3>TTL-aware caching</h3><p>Responses are cached using the actual TTL parsed from the DNS answer — fresh when it matters, fast when it can be.</p></div>
      <div class="feat"><div class="ic">🔁</div><h3>Stale-while-revalidate</h3><p>Slightly stale entries are served instantly while a fresh copy is fetched in the background. Zero perceived latency.</p></div>
      <div class="feat"><div class="ic">📦</div><h3>POST → GET cache</h3><p>Binary POST queries are normalized to a cache key, so even RFC 8484 POST traffic benefits from edge caching.</p></div>
      <div class="feat"><div class="ic">🛡️</div><h3>Profiles</h3><p>Append <code>?profile=adblock</code> or <code>?profile=secure</code> to route through ad-blocking or security-focused resolvers.</p></div>
    </div>
  </section>

  <section id="usage">
    <div class="h2">Usage</div>
    <p class="sub">Standard RFC 8484 wireformat plus a convenient JSON API.</p>
    <div class="tabs">
      <div class="tab active" onclick="tab(event,'browser')">Browser / OS</div>
      <div class="tab" onclick="tab(event,'curl')">curl</div>
      <div class="tab" onclick="tab(event,'json')">JSON API</div>
    </div>
    <div class="panel active" id="browser">
      <pre><span class="c"># Set this URL as your "Secure DNS" / DoH provider</span>
${endpoint}

<span class="c"># Firefox:  Settings → Privacy → Enable DNS over HTTPS → Custom</span>
<span class="c"># Chrome:   Settings → Security → Use secure DNS → Custom</span>
<span class="c"># Windows 11: Settings → Network → DNS over HTTPS</span></pre>
    </div>
    <div class="panel" id="curl">
      <pre><span class="c"># GET (base64url-encoded query for example.com A)</span>
curl "${endpoint}?dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE"

<span class="c"># POST (raw binary, no encoding needed)</span>
curl -H "content-type: application/dns-message" \\
     --data-binary @query.bin "${endpoint}"</pre>
    </div>
    <div class="panel" id="json">
      <pre><span class="c"># Human-friendly JSON resolve</span>
curl "${origin}/resolve?name=example.com&type=A"

<span class="c"># Other endpoints</span>
${origin}/providers   <span class="c"># live provider ranking</span>
${origin}/stats       <span class="c"># performance metrics</span>
${origin}/health      <span class="c"># liveness probe</span></pre>
    </div>
  </section>

  <section id="providers">
    <div class="h2">Upstream resolvers</div>
    <p class="sub">Racing across trusted public resolvers; ad-block &amp; security profiles available.</p>
    <div class="prov">
      <div class="pcard"><div class="top"><span class="name">Cloudflare</span><span class="tag standard">standard</span></div><div class="u">cloudflare-dns.com</div></div>
      <div class="pcard"><div class="top"><span class="name">Google</span><span class="tag standard">standard</span></div><div class="u">dns.google</div></div>
      <div class="pcard"><div class="top"><span class="name">Quad9</span><span class="tag secure">secure</span></div><div class="u">dns.quad9.net</div></div>
      <div class="pcard"><div class="top"><span class="name">OpenDNS</span><span class="tag standard">standard</span></div><div class="u">doh.opendns.com</div></div>
      <div class="pcard"><div class="top"><span class="name">AdGuard</span><span class="tag adblock">adblock</span></div><div class="u">dns.adguard-dns.com</div></div>
      <div class="pcard"><div class="top"><span class="name">Mullvad</span><span class="tag adblock">adblock</span></div><div class="u">adblock.dns.mullvad.net</div></div>
      <div class="pcard"><div class="top"><span class="name">ControlD</span><span class="tag adblock">adblock</span></div><div class="u">freedns.controld.com</div></div>
    </div>
  </section>
</div>

<footer>
  <div class="wrap">
    <p><strong>DoHp</strong> · open-source DNS-over-HTTPS proxy · <a href="https://github.com/Rainman69/DoHp" target="_blank">github.com/Rainman69/DoHp</a></p>
    <p style="margin-top:8px;opacity:.7">Built on Cloudflare Workers · MIT License</p>
  </div>
</footer>

<div class="toast" id="toast">✓ Endpoint copied!</div>

<script>
function cp(){navigator.clipboard.writeText(document.getElementById('ep').textContent).then(()=>{var t=document.getElementById('toast');t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);});}
function tab(e,id){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));e.target.classList.add('active');document.getElementById(id).classList.add('active');}
</script>
</body>
</html>`;
}
