const ACCENT = '#238636';
const ACCENT_BRIGHT = '#2ea043';

/**
 * The dashboard shell. Deliberately server rendered with a small client script that
 * polls /api/stats: it keeps the first paint instant and needs no build step, while
 * the numbers still move while you watch them.
 */
export function renderDashboardHtml({ oauthConfigured = false, signedIn = false, role = null, baseUrl = '' } = {}) {
  return `<!doctype html>
<html lang="en" data-base="${escapeHtml(baseUrl)}" data-oauth="${oauthConfigured ? '1' : '0'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asteria, live dashboard</title>
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(STAR_FAVICON)}">
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">
    <span class="mark">${STAR_SVG}</span>
    <span class="brand-text">Asteria<em>live status</em></span>
  </a>
  <div class="topbar-right">
    <span class="live" title="refreshes every 5 seconds"><i></i>live</span>
    <span class="uptime-pill" id="uptime-pill"><span class="skel skel-sm"></span></span>
    ${
      signedIn
        ? `<span class="who" id="who">${escapeHtml(role || 'user')}</span>
           <form method="post" action="/logout"><button class="btn ghost" type="submit">Sign out</button></form>`
        : `<a class="btn" href="/login">Sign in with Slack</a>`
    }
  </div>
</header>

<main>
  <section class="hero">
    <p class="kicker">personal channel companion</p>
    <h1>Everything Asteria is doing, <span class="accent">right now</span>.</h1>
    <p class="sub">Huddles it watched, points it handed out, and how long it has been standing by.</p>
  </section>

  <section class="stat-strip" id="stat-strip">
    ${statCell('stat-active', 'Huddles live', 'right now')}
    ${statCell('stat-24h', 'Huddles ended', 'last 24 hours')}
    ${statCell('stat-members', 'People seen', 'all time')}
    ${statCell('stat-channels', 'Channels', 'bot is in')}
    ${statCell('stat-score', 'Points awarded', 'on the board')}
  </section>

  <div id="cold-start" class="hidden"></div>

  <div class="grid" id="grid">
    <section class="panel leaderboard">
      <header class="panel-head">
        <h2>Leaderboard</h2>
        <span class="tag" id="lb-scope">channels the bot is in</span>
      </header>
      <div id="opt-in-slot"></div>
      <ol class="board" id="board"><li class="none-slot"><div class="none"><span class="skel" style="width:130px"></span></div></li></ol>
    </section>

    <div class="side">
      <section class="panel">
        <header class="panel-head"><h2>Status</h2><span class="tag" id="state-tag"><span class="skel skel-sm"></span></span></header>
        <dl class="kv">
          <div><dt>Uptime</dt><dd id="kv-uptime"><span class="skel"></span></dd></div>
          <div><dt>Started</dt><dd id="kv-started"><span class="skel"></span></dd></div>
          <div><dt>Longest huddle</dt><dd id="kv-longest"><span class="skel"></span></dd></div>
          <div><dt>Average huddle</dt><dd id="kv-average"><span class="skel"></span></dd></div>
          <div><dt>Opted out</dt><dd id="kv-optedout"><span class="skel"></span></dd></div>
        </dl>
        <div class="spark" id="spark"></div>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Channels</h2><span class="tag" id="ch-tag"><span class="skel skel-sm"></span></span></header>
        <ul class="channels" id="channels"><li class="none-slot"><div class="none"><span class="skel" style="width:96px"></span></div></li></ul>
      </section>
    </div>
  </div>

  <section class="panel hidden" id="log-panel">
    <header class="panel-head"><h2>Activity</h2><span class="tag">owner only</span></header>
    <ul class="log" id="log"></ul>
  </section>
</main>

<footer>
  <span>Asteria, <a href="/health">health</a>, <a href="/rss.xml">rss</a></span>
  <span class="muted" id="foot-updated"><span class="skel skel-sm"></span></span>
</footer>

<script>${SCRIPT}</script>
</body>
</html>`;
}

function statCell(id, label, hint) {
  return `<div class="stat">
  <p class="stat-label">${escapeHtml(label)}</p>
  <p class="stat-value" id="${id}"><span class="skel skel-lg"></span></p>
  <p class="stat-hint">${escapeHtml(hint)}</p>
</div>`;
}

const STAR_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l2.1 4.6 5 .6-3.7 3.4 1 4.9L12 14.4 7.6 16.7l1-4.9L4.9 8.4l5-.6z"/></svg>`;
const STAR_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0d1117"/><path d="M12 4l2 4.4 4.8.6-3.6 3.3.95 4.7L12 14.7 7.85 17l.95-4.7L5.2 9l4.8-.6z" fill="none" stroke="#2ea043" stroke-width="1.5"/></svg>`;

const STYLES = `
:root{color-scheme:dark;
  --bg:#0d1117; --surface:#161b22; --raised:#21262d; --line:#30363d; --line-soft:#21262d;
  --ink:#f0f6fc; --ink-2:#c9d1d9; --ink-3:#8b949e;
  --accent:${ACCENT}; --accent-bright:${ACCENT_BRIGHT};
  --gold:#ffd700; --bronze:#cd7f32; --silver:#c0c0c0; --red:#f85149;
  --r:10px; --r-sm:6px;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; min-height:100vh; color:var(--ink); font-family:var(--sans); font-size:15px; line-height:1.5;
  background:radial-gradient(900px 400px at 50% -8%, rgba(46,160,67,.07), transparent 70%),var(--bg);
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent-bright);text-decoration:none}
a:hover{text-decoration:underline}
.hidden{display:none !important}
.muted{color:var(--ink-3)}

/* top bar */
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:0 clamp(16px,4vw,36px);height:56px;background:rgba(13,17,23,.86);
  backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:2}
.brand{display:flex;align-items:center;gap:9px;color:var(--ink);font-weight:600;letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.mark{display:grid;place-items:center;width:28px;height:28px;border-radius:var(--r-sm);color:var(--accent-bright);
  background:var(--surface);box-shadow:0 0 0 1px var(--line)}
.brand-text{display:flex;flex-direction:column;line-height:1.2}
.brand-text em{font-style:normal;font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3)}
.topbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.live{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-2);padding:4px 9px;border-radius:999px;box-shadow:0 0 0 1px var(--line)}
.live i{width:5px;height:5px;border-radius:50%;background:var(--accent-bright);animation:pulse 2.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.uptime-pill,.who{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);padding:4px 9px;
  border-radius:999px;box-shadow:0 0 0 1px var(--line);min-width:52px;display:inline-flex;align-items:center;gap:6px}
.who{color:var(--accent-bright);box-shadow:0 0 0 1px rgba(46,160,67,.35)}
.btn{display:inline-flex;align-items:center;font:inherit;font-size:13px;font-weight:600;color:#fff;
  background:var(--accent);border:0;border-radius:var(--r-sm);padding:7px 14px;cursor:pointer;transition:.14s ease}
.btn:hover{background:var(--accent-bright);text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn.ghost{background:transparent;color:var(--ink-2);box-shadow:0 0 0 1px var(--line)}
.btn.ghost:hover{color:var(--ink);background:var(--raised)}

main{max-width:1180px;margin:0 auto;padding:clamp(26px,4vw,44px) clamp(16px,4vw,36px) 56px}

/* hero */
.hero{max-width:680px;margin-bottom:24px}
.kicker{margin:0 0 10px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-bright);font-weight:600}
h1{margin:0 0 9px;font-size:clamp(26px,4.2vw,42px);line-height:1.08;letter-spacing:-.028em;font-weight:650}
h1 .accent{color:var(--accent-bright)}
.sub{margin:0;color:var(--ink-3);font-size:15px;max-width:56ch}

/* stat strip */
.stat-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:var(--surface);
  border-radius:var(--r);box-shadow:0 0 0 1px var(--line);margin-bottom:18px;overflow:hidden}
@media (max-width:860px){.stat-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:460px){.stat-strip{grid-template-columns:1fr}}
.stat{position:relative;padding:13px 15px 12px}
.stat+.stat{box-shadow:inset 1px 0 0 var(--line)}
.stat::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(46,160,67,.5),transparent);opacity:.55}
.stat-label{margin:0;font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.stat-value{margin:7px 0 1px;font-family:var(--mono);font-size:27px;line-height:1;font-variant-numeric:tabular-nums;
  letter-spacing:-.02em;transition:color .3s}
.stat-value.bump{color:var(--accent-bright)}
.stat-hint{margin:0;font-size:11px;color:var(--ink-3)}

/* layout */
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:940px){.grid{grid-template-columns:1fr}}
.panel{background:var(--surface);border-radius:var(--r);box-shadow:0 0 0 1px var(--line);
  padding:15px 16px 16px;margin-bottom:16px}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px}
.panel-head h2{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);font-weight:700}
.tag{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);border-radius:999px;padding:3px 8px;
  box-shadow:0 0 0 1px var(--line-soft);white-space:nowrap;display:inline-flex;align-items:center;gap:6px;min-height:20px}
.tag.ok{color:var(--accent-bright);box-shadow:0 0 0 1px rgba(46,160,67,.35)}

/* leaderboard */
.board{list-style:none;margin:0;padding:0}
.board li{display:grid;grid-template-columns:24px 28px minmax(0,1fr) auto;align-items:center;gap:11px;
  padding:7px 9px;border-radius:var(--r-sm);box-shadow:0 0 0 1px transparent}
.board li+li{margin-top:2px}
.board li:hover{background:var(--raised)}
.board li.me{background:rgba(46,160,67,.09);box-shadow:0 0 0 1px rgba(46,160,67,.4)}
.rank{font-family:var(--mono);font-size:12px;color:var(--ink-3);text-align:right}
.board li:nth-child(1) .rank{color:var(--gold);font-weight:700}
.board li:nth-child(2) .rank{color:var(--bronze);font-weight:700}
.board li:nth-child(3) .rank{color:var(--silver);font-weight:700}
.avatar{width:28px;height:28px;border-radius:var(--r-sm);object-fit:cover;background:var(--raised);
  box-shadow:0 0 0 1px var(--line);display:grid;place-items:center;font-size:10.5px;font-weight:700;color:var(--ink-3)}
.who-cell{display:flex;flex-direction:column;min-width:0}
.who-name{font-size:14px;font-weight:520;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who-sub{font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pts{font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums}
.pts.zero{color:var(--ink-3)}

/* empty states, the whole point of a quiet design */
.none{display:grid;justify-items:center;gap:3px;padding:22px 16px;text-align:center;
  border-radius:var(--r-sm);box-shadow:0 0 0 1px var(--line-soft)}
.none-mark{display:grid;place-items:center;width:26px;height:26px;border-radius:var(--r-sm);color:var(--ink-3);
  background:var(--raised);box-shadow:0 0 0 1px var(--line);margin-bottom:5px}
.none-title{margin:0;font-size:13px;font-weight:600;color:var(--ink-2)}
.none-hint{margin:0;font-size:12px;color:var(--ink-3);max-width:34ch}
.none-slot{padding:0;list-style:none;display:block !important}
.log li.none-slot,.board li.none-slot,.channels li.none-slot{grid-template-columns:none;background:none}
.placeholder{color:var(--ink-3);font-style:normal}

/* loading skeletons, so nothing ever shows a bare dash */
.skel{display:inline-block;width:100%;height:11px;border-radius:3px;
  background:linear-gradient(90deg,var(--raised),#2b3138,var(--raised));background-size:200% 100%;
  animation:shimmer 1.5s linear infinite}
.skel-sm{width:44px;height:9px}
.skel-lg{width:52px;height:22px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* cold start, when the bot has literally nothing yet */
.cold{display:grid;justify-items:center;gap:9px;text-align:center;padding:52px 20px;background:var(--surface);
  border-radius:var(--r);box-shadow:0 0 0 1px var(--line)}
.cold h2{margin:0;font-size:19px;letter-spacing:-.01em}
.cold p{margin:0;color:var(--ink-3);max-width:46ch;font-size:14px}
.cold .none-mark{width:38px;height:38px;margin-bottom:2px}

/* opt-in switch */
.optin{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px;
  padding:10px 12px;border-radius:var(--r-sm);background:rgba(46,160,67,.07);box-shadow:0 0 0 1px rgba(46,160,67,.25)}
.optin-text{display:flex;flex-direction:column}
.optin-text b{font-size:13.5px;font-weight:600}
.optin-text span{font-size:11.5px;color:var(--ink-3)}
.switch{position:relative;width:44px;height:25px;border-radius:999px;background:var(--raised);border:0;
  box-shadow:0 0 0 1px var(--line);cursor:pointer;transition:.18s;flex:none}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;
  background:var(--ink-3);transition:.18s}
.switch[aria-checked="true"]{background:rgba(46,160,67,.28);box-shadow:0 0 0 1px rgba(46,160,67,.6)}
.switch[aria-checked="true"]::after{left:22px;background:var(--accent-bright)}

/* kv list */
.kv{margin:0;display:grid;gap:1px;background:var(--line-soft);border-radius:var(--r-sm);overflow:hidden;
  box-shadow:0 0 0 1px var(--line-soft)}
.kv>div{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--surface);padding:8px 11px}
.kv dt{font-size:12.5px;color:var(--ink-2)}
.kv dd{margin:0;font-family:var(--mono);font-size:12.5px;font-variant-numeric:tabular-nums;text-align:right}
.kv dd .placeholder{font-family:var(--sans);font-size:12px}
.spark{display:flex;align-items:flex-end;gap:3px;height:40px;margin-top:13px}
.spark i{flex:1;background:linear-gradient(180deg,rgba(46,160,67,.85),rgba(46,160,67,.16));border-radius:2px 2px 0 0;min-height:2px}
.spark-empty{margin-top:13px}

/* channels */
.channels{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.channels li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;
  background:var(--raised);border-radius:var(--r-sm);font-size:13.5px}
.channels .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--ink-3);box-shadow:0 0 0 2px rgba(139,148,158,.16)}
.dot.on{background:var(--accent-bright);box-shadow:0 0 0 2px rgba(46,160,67,.2)}
.dot.paused{background:var(--gold)}

/* activity log */
.log{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--line-soft);
  border-radius:var(--r-sm);overflow:hidden;max-height:340px;overflow-y:auto;box-shadow:0 0 0 1px var(--line-soft)}
.log li{display:grid;grid-template-columns:74px 128px minmax(0,1fr);gap:10px;background:var(--surface);
  padding:7px 10px;font-size:12.5px;align-items:baseline}
.log time{font-family:var(--mono);font-size:11.5px;color:var(--ink-3)}
.log .act{font-family:var(--mono);font-size:11.5px;color:var(--accent-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log .det{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
  max-width:1180px;margin:0 auto;padding:16px clamp(16px,4vw,36px) 32px;
  border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3)}
@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}
`;

const SCRIPT = `
const $ = (id) => document.getElementById(id);
const base = document.documentElement.dataset.base || '';
const fmt = new Intl.NumberFormat();
const STAR_MARK = '${STAR_SVG}';
let viewer = null, first = true;

const NONE_MARK = '<span class="none-mark">' + STAR_MARK + '</span>';
function none(title, hint){
  return '<div class="none">' + NONE_MARK +
    '<p class="none-title">' + title + '</p>' +
    '<p class="none-hint">' + hint + '</p></div>';
}
function cold(title, body){
  const slot = $('cold-start');
  slot.classList.remove('hidden');
  slot.innerHTML = '<div class="cold">' + NONE_MARK + '<h2>' + title + '</h2><p>' + body + '</p></div>';
  $('stat-strip').classList.add('hidden');
  $('grid').classList.add('hidden');
}
function duration(seconds){
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}
function initials(text){
  return (text || '?').trim().split(/\\s+/).slice(0,2).map((w) => w[0]).join('').toUpperCase();
}
function setValue(id, value){
  const node = $(id);
  if (!node) return;
  const text = String(value);
  if (node.textContent === text) return;
  node.textContent = text;
  if (first) return;
  node.classList.add('bump');
  setTimeout(() => node.classList.remove('bump'), 700);
}
function setField(id, value, placeholder){
  const node = $(id);
  if (!node) return;
  node.textContent = value == null || value === '' ? '' : String(value);
  if (!node.textContent) node.innerHTML = '<span class="placeholder">' + placeholder + '</span>';
}

function renderBoard(rows, viewer){
  const board = $('board');
  if (!rows.length){
    const everyoneHidden = viewer && viewer.signedIn && viewer.isOwner;
    board.innerHTML = '<li class="none-slot">' + none(
      'No points on the board',
      everyoneHidden
        ? 'Nobody has opted in to the leaderboard yet.'
        : 'Points appear once the bot is in a channel and someone joins a huddle.'
    ) + '</li>';
    return;
  }
  board.innerHTML = rows.map((row) => {
    const name = row.displayName || row.userId;
    const sub = [row.pronouns, row.realName && row.realName !== name ? row.realName : ''].filter(Boolean).join(' / ');
    const avatar = row.imageUrl
      ? '<img class="avatar" alt="" loading="lazy" src="' + row.imageUrl + '" onerror="this.replaceWith(Object.assign(document.createElement(\\'span\\'),{className:\\'avatar\\',textContent:\\'\\' + initials(name) + \\'}))">'
      : '<span class="avatar">' + escapeHtml(initials(name)) + '</span>';
    return '<li' + (viewer && viewer.userId === row.userId ? ' class="me"' : '') + '>' +
      '<span class="rank">' + row.rank + '</span>' + avatar +
      '<span class="who-cell"><span class="who-name">' + escapeHtml(name) + '</span>' +
      (sub ? '<span class="who-sub">' + escapeHtml(sub) + '</span>' : '') + '</span>' +
      '<span class="pts' + (row.points ? '' : ' zero') + '">' + fmt.format(row.points) + '</span></li>';
  }).join('');
}

function renderOptIn(){
  const slot = $('opt-in-slot');
  if (!viewer || !viewer.signedIn) { slot.innerHTML = ''; return; }
  slot.innerHTML = '<div class="optin"><span class="optin-text"><b>On the leaderboard</b>' +
    '<span>' + (viewer.role === 'owner' ? 'You see everything, yours or not' : 'Turn this off to hide your points') + '</span></span>' +
    '<button class="switch" id="optin-switch" role="switch" aria-checked="' + viewer.leaderboardOptIn + '" aria-label="Show me on the leaderboard"></button></div>';
  $('optin-switch').addEventListener('click', toggleOptIn);
}

async function toggleOptIn(){
  const button = $('optin-switch');
  const next = button.getAttribute('aria-checked') !== 'true';
  button.setAttribute('aria-checked', String(next));
  const response = await fetch(base + '/api/me/opt-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ optedIn: next }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok){
    button.setAttribute('aria-checked', String(!next));
    return;
  }
  viewer.leaderboardOptIn = body.leaderboardOptIn;
  refresh();
}

function renderChannels(channels, botCount){
  const list = $('channels');
  $('ch-tag').textContent = botCount + ' in bot';
  if (!channels.length){
    list.innerHTML = '<li class="none-slot">' + none('No channels yet', 'Add Asteria to a channel and it shows up here.') + '</li>';
    return;
  }
  list.innerHTML = channels.map((channel) => {
    const cls = channel.paused ? 'paused' : (channel.enabled ? 'on' : '');
    const state = channel.paused ? 'paused' : (channel.enabled ? 'tracking' : 'off');
    return '<li><span class="name">' + (channel.inBot ? '' : 'not in bot: ') + escapeHtml(channel.name) + '</span>' +
      '<span class="tag' + (channel.enabled ? ' ok' : '') + '"><i class="dot ' + cls + '"></i>' + state + '</span></li>';
  }).join('');
}

function renderLog(entries, allowed){
  if (!allowed) return;
  const panel = $('log-panel');
  panel.classList.remove('hidden');
  const list = $('log');
  if (!entries || !entries.length){
    list.innerHTML = '<li class="none-slot">' + none('Nothing logged yet', 'Owner actions show up here as soon as they happen.') + '</li>';
    return;
  }
  list.innerHTML = entries.map((entry) => {
    const at = new Date(String(entry.created_at).replace(' ', 'T') + 'Z');
    return '<li><time>' + at.toISOString().slice(11, 19) + '</time>' +
      '<span class="act">' + escapeHtml(entry.action) + '</span>' +
      '<span class="det">' + escapeHtml([entry.user_id, entry.detail, entry.channel_id].filter(Boolean).join(' / ')) + '</span></li>';
  }).join('');
}

function renderSparkline(values){
  const node = $('spark');
  if (!values.length || values.every((value) => !value)){
    node.innerHTML = none('No points to chart', 'The chart fills in once the leaderboard has scores.');
    node.classList.add('spark-empty');
    return;
  }
  node.classList.remove('spark-empty');
  const max = Math.max(1, ...values);
  node.innerHTML = values.map((value) => '<i style="height:' + Math.max(3, Math.round(value / max * 100)) + '%"></i>').join('');
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function refresh(){
  let data;
  try {
    const response = await fetch(base + '/api/stats', { headers: { accept: 'application/json' } });
    if (!response.ok) return;
    data = await response.json();
  } catch (error) {
    return;
  }
  viewer = data.viewer;
  const h = data.huddles, u = data.uptime;

  const boardTotal = data.leaderboard.reduce((total, row) => total + row.points, 0);
  const bare = !h.total && !h.members && !data.botChannels.count;

  setValue('stat-active', fmt.format(h.active));
  setValue('stat-24h', fmt.format(h.last24h));
  setValue('stat-members', fmt.format(h.members));
  setValue('stat-channels', fmt.format(data.botChannels.count));
  setValue('stat-score', fmt.format(boardTotal));
  $('uptime-pill').textContent = 'up ' + duration(u.seconds);
  setField('kv-uptime', duration(u.seconds));
  setField('kv-started', new Date(u.startedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z');
  setField('kv-longest', h.longestSeconds ? duration(h.longestSeconds) : null, 'no huddles yet');
  setField('kv-average', h.averageSeconds ? duration(h.averageSeconds) : null, 'no huddles yet');
  setField('kv-optedout', fmt.format(h.optedOut));
  const stateTag = $('state-tag');
  stateTag.textContent = u.state;
  stateTag.classList.toggle('ok', u.state === 'ok' || u.state === 'operational');
  $('foot-updated').textContent = 'updated ' + new Date(data.generatedAt).toISOString().slice(11, 19) + 'Z';

  renderBoard(data.leaderboard, viewer);
  renderOptIn();
  renderChannels(data.channels, data.botChannels.count);
  renderLog(data.logs, Boolean(viewer && viewer.isOwner));
  renderSparkline(data.leaderboard.slice(0, 12).map((row) => row.points));

  if (bare) {
    cold('Nothing here yet', 'Asteria has not seen a huddle, a person, or a channel. Invite it to a channel and this page fills itself in.');
  }
  first = false;
}

refresh();
setInterval(refresh, 5000);
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const DASHBOARD_ACCENT = ACCENT;
