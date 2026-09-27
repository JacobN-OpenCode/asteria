const ACCENT = '#86efac';
const ACCENT_DIM = '#3f6b4f';

/**
 * The dashboard shell. Deliberately server rendered with a small client script that
 * polls /api/stats: it keeps the first paint instant and needs no build step, while
 * the numbers still move while you watch them.
 */
export function renderDashboardHtml({ oauthConfigured = false, signedIn = false, role = null, baseUrl = '' } = {}) {
  return `<!doctype html>
<html lang="en" data-base="${escapeHtml(baseUrl)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asteria — live dashboard</title>
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(STAR_FAVICON)}">
<style>${STYLES}</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<header class="topbar">
  <a class="brand" href="/">
    <span class="mark">${STAR_SVG}</span>
    <span class="brand-text">Asteria<em>dashboard</em></span>
  </a>
  <div class="topbar-right">
    <span class="live" title="auto refreshing"><i></i>live</span>
    <span class="uptime-pill" id="uptime-pill">uptime —</span>
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
    <p class="sub">Huddles it watched, points it handed out, and how long it has been standing by. ${
      oauthConfigured
        ? ''
        : '<span class="hint">Slack sign-in is not configured yet — use the member-ID sign-in below.</span>'
    }</p>
  </section>

  <section class="stat-row" id="stat-row">
    ${statCard('stat-active', 'Huddles live', 'now')}
    ${statCard('stat-24h', 'Huddles ended', 'last 24h')}
    ${statCard('stat-members', 'People seen', 'all time')}
    ${statCard('stat-channels', 'Channels', 'bot is in')}
    ${statCard('stat-score', 'Points awarded', 'visible to you')}
  </section>

  <div class="grid">
    <section class="panel leaderboard">
      <header class="panel-head">
        <h2>Leaderboard</h2>
        <span class="tag" id="lb-scope">channels the bot is in</span>
      </header>
      <div id="opt-in-slot"></div>
      <ol class="board" id="board"></ol>
    </section>

    <div class="side">
      <section class="panel">
        <header class="panel-head"><h2>Status</h2><span class="tag" id="state-tag">—</span></header>
        <dl class="kv">
          <div><dt>Uptime</dt><dd id="kv-uptime">—</dd></div>
          <div><dt>Started</dt><dd id="kv-started">—</dd></div>
          <div><dt>Longest huddle</dt><dd id="kv-longest">—</dd></div>
          <div><dt>Average</dt><dd id="kv-average">—</dd></div>
          <div><dt>Opted out</dt><dd id="kv-optedout">—</dd></div>
        </dl>
        <div class="spark" id="spark" aria-hidden="true"></div>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Channels</h2><span class="tag" id="ch-tag">—</span></header>
        <ul class="channels" id="channels"></ul>
      </section>

      <section class="panel" id="login-panel">
        <header class="panel-head"><h2>${signedIn ? 'Your access' : 'Sign in'}</h2></header>
        <div id="login-body"></div>
      </section>
    </div>
  </div>

  ${
    signedIn
      ? ''
      : `<section class="panel signin" id="signin-panel">
    <header class="panel-head"><h2>Sign in</h2><span class="tag">Slack verified</span></header>
    <p class="muted">Asteria checks who you are against Slack — nothing is trusted from the browser.</p>
    <div class="signin-row">
      <input id="slack-id" placeholder="U012ABCDEF — your Slack member ID" autocomplete="off" spellcheck="false">
      <button class="btn" id="send-code">Send me a code</button>
    </div>
    <div class="signin-row hidden" id="code-row">
      <input id="slack-code" placeholder="6-digit code from the DM" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <button class="btn" id="verify-code">Verify</button>
    </div>
    <p class="msg" id="signin-msg"></p>
  </section>`
  }

  <section class="panel hidden" id="log-panel">
    <header class="panel-head"><h2>Activity</h2><span class="tag">owner only</span></header>
    <ul class="log" id="log"></ul>
  </section>
</main>

<footer>
  <span>Asteria · <a href="/health">health</a> · <a href="/rss.xml">rss</a></span>
  <span class="muted" id="foot-updated">—</span>
</footer>

<script>${SCRIPT}</script>
</body>
</html>`;
}

function statCard(id, label, hint) {
  return `<article class="stat">
  <p class="stat-label">${escapeHtml(label)}</p>
  <p class="stat-value" id="${id}">—</p>
  <p class="stat-hint">${escapeHtml(hint)}</p>
</article>`;
}

const STAR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l2.1 4.6 5 .6-3.7 3.4 1 4.9L12 14.4 7.6 16.7l1-4.9L4.9 8.4l5-.6z"/></svg>`;
const STAR_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0b0d0c"/><path d="M12 4l2 4.4 4.8.6-3.6 3.3.95 4.7L12 14.7 7.85 17l.95-4.7L5.2 9l4.8-.6z" fill="none" stroke="#86efac" stroke-width="1.5"/></svg>`;

const STYLES = `
:root{color-scheme:dark;
  --bg:#0a0b0a; --bg-2:#0e100f; --panel:#111312; --panel-2:#151817; --line:#1e2320; --line-2:#2a302c;
  --ink:#e8ece9; --ink-2:#9aa39d; --ink-3:#6b736d;
  --accent:${ACCENT}; --accent-dim:${ACCENT_DIM};
  --radius:14px; --radius-sm:9px;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:
    radial-gradient(1100px 620px at 78% -12%, rgba(134,239,172,.07), transparent 62%),
    radial-gradient(820px 480px at 8% 0%, rgba(134,239,172,.035), transparent 60%),
    linear-gradient(180deg,var(--bg-2),var(--bg) 42%);
  color:var(--ink); font-family:var(--sans); font-size:15px; line-height:1.55;
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
.grain{position:fixed;inset:0;pointer-events:none;opacity:.035;z-index:0;
  background-image:radial-gradient(circle at 1px 1px,#fff 1px,transparent 0);background-size:4px 4px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.hidden{display:none !important}
.muted{color:var(--ink-2)}
.hint{color:var(--ink-3)}

/* top bar */
.topbar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:14px clamp(16px,4vw,40px);border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,rgba(10,11,10,.92),rgba(10,11,10,.55));backdrop-filter:blur(12px);
  position:sticky;top:0}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:600;letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;color:var(--accent);
  background:linear-gradient(180deg,#141815,#0d100e);border:1px solid var(--line-2);box-shadow:0 0 0 1px rgba(134,239,172,.06) inset}
.brand-text{display:flex;flex-direction:column;line-height:1.15}
.brand-text em{font-style:normal;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3)}
.topbar-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.live{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);
  border:1px solid var(--line-2);border-radius:999px;padding:4px 9px}
.live i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 rgba(134,239,172,.5);animation:pulse 2.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(134,239,172,.45)}70%{box-shadow:0 0 0 7px rgba(134,239,172,0)}100%{box-shadow:0 0 0 0 rgba(134,239,172,0)}}
.uptime-pill,.who{font-family:var(--mono);font-size:12px;color:var(--ink-2);border:1px solid var(--line);
  border-radius:999px;padding:5px 11px;background:var(--panel)}
.who{color:var(--accent);border-color:rgba(134,239,172,.28)}
.btn{font:inherit;font-size:13px;font-weight:550;color:#07110b;background:linear-gradient(180deg,#a7f3c4,#86efac);
  border:1px solid #6ee7a5;border-radius:9px;padding:7px 14px;cursor:pointer;transition:.16s ease}
.btn:hover{filter:brightness(1.07);text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn.ghost{background:transparent;color:var(--ink-2);border-color:var(--line-2)}
.btn.ghost:hover{color:var(--ink);border-color:var(--accent-dim)}
.btn[disabled]{opacity:.55;cursor:not-allowed}

main{position:relative;z-index:1;max-width:1220px;margin:0 auto;padding:clamp(22px,4vw,44px) clamp(16px,4vw,40px) 60px}

/* hero */
.hero{max-width:760px;margin-bottom:26px}
.kicker{margin:0 0 10px;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent-dim)}
h1{margin:0 0 10px;font-size:clamp(28px,4.6vw,46px);line-height:1.06;letter-spacing:-.028em;font-weight:660}
h1 .accent{color:var(--accent)}
.sub{margin:0;color:var(--ink-2);font-size:15px;max-width:60ch}

/* stat cards */
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;margin-bottom:18px}
.stat{position:relative;overflow:hidden;background:linear-gradient(180deg,var(--panel-2),var(--panel));
  border:1px solid var(--line);border-radius:var(--radius);padding:14px 15px 13px}
.stat::after{content:"";position:absolute;inset:0 0 auto;height:1px;background:linear-gradient(90deg,transparent,rgba(134,239,172,.35),transparent)}
.stat-label{margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}
.stat-value{margin:6px 0 2px;font-family:var(--mono);font-size:29px;line-height:1.05;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;transition:color .3s}
.stat-value.bump{color:var(--accent)}
.stat-hint{margin:0;font-size:11.5px;color:var(--ink-3)}

/* layout */
.grid{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:940px){.grid{grid-template-columns:1fr}}
.panel{background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--line);
  border-radius:var(--radius);padding:15px 16px 16px;margin-bottom:14px}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.panel-head h2{margin:0;font-size:12.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-2);font-weight:600}
.tag{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);border:1px solid var(--line-2);
  border-radius:999px;padding:3px 9px;white-space:nowrap}
.tag.ok{color:var(--accent);border-color:rgba(134,239,172,.3)}

/* leaderboard */
.board{list-style:none;margin:0;padding:0}
.board li{display:grid;grid-template-columns:26px 30px minmax(0,1fr) auto;align-items:center;gap:10px;
  padding:8px 8px;border-radius:var(--radius-sm);border:1px solid transparent}
.board li+li{margin-top:2px}
.board li:hover{background:rgba(255,255,255,.017);border-color:var(--line)}
.board li.me{background:rgba(134,239,172,.055);border-color:rgba(134,239,172,.26)}
.rank{font-family:var(--mono);font-size:12.5px;color:var(--ink-3);text-align:right}
li:nth-child(1) .rank{color:var(--accent)}
.avatar{width:30px;height:30px;border-radius:9px;object-fit:cover;background:#161a17;border:1px solid var(--line-2)}
.who-cell{display:flex;flex-direction:column;min-width:0}
.who-name{font-size:14px;font-weight:520;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who-sub{font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pts{font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums}
.empty{padding:16px 10px;color:var(--ink-3);font-size:13.5px;text-align:center;border:1px dashed var(--line-2);border-radius:var(--radius-sm)}

/* opt-in switch */
.optin{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;
  padding:10px 12px;border:1px solid rgba(134,239,172,.22);border-radius:var(--radius-sm);background:rgba(134,239,172,.04)}
.optin-text{display:flex;flex-direction:column}
.optin-text b{font-size:13.5px;font-weight:560}
.optin-text span{font-size:11.5px;color:var(--ink-3)}
.switch{position:relative;width:46px;height:26px;border-radius:999px;background:#1c201e;border:1px solid var(--line-2);
  cursor:pointer;transition:.18s;flex:none}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;
  background:#5c6660;transition:.18s}
.switch[aria-checked="true"]{background:rgba(134,239,172,.22);border-color:rgba(134,239,172,.5)}
.switch[aria-checked="true"]::after{left:22px;background:var(--accent)}

/* kv list */
.kv{margin:0;display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden}
.kv>div{display:flex;justify-content:space-between;gap:10px;background:var(--panel-2);padding:9px 11px}
.kv dt{font-size:12.5px;color:var(--ink-2)}
.kv dd{margin:0;font-family:var(--mono);font-size:12.5px;font-variant-numeric:tabular-nums}
.spark{display:flex;align-items:flex-end;gap:3px;height:44px;margin-top:12px;padding:0 1px}
.spark i{flex:1;background:linear-gradient(180deg,rgba(134,239,172,.75),rgba(134,239,172,.14));border-radius:2px 2px 0 0;min-height:2px}

/* channels */
.channels{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.channels li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;
  background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius-sm);font-size:13.5px}
.channels .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;flex:none;background:#3a423d;box-shadow:0 0 0 2px rgba(58,66,61,.2)}
.dot.on{background:var(--accent);box-shadow:0 0 0 2px rgba(134,239,172,.18)}
.dot.paused{background:#c9a227}

/* sign in */
.signin-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
input{flex:1;min-width:210px;font:inherit;font-size:14px;color:var(--ink);background:#0c0e0d;
  border:1px solid var(--line-2);border-radius:9px;padding:9px 12px}
input::placeholder{color:#5c635e}
input:focus{outline:none;border-color:var(--accent-dim);box-shadow:0 0 0 3px rgba(134,239,172,.1)}
.msg{margin:10px 0 0;font-size:13px;min-height:1.2em}
.msg.ok{color:var(--accent)}
.msg.bad{color:#fca5a5}

/* log */
.log{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden;max-height:340px;overflow-y:auto}
.log li{display:grid;grid-template-columns:78px 132px minmax(0,1fr);gap:10px;background:var(--panel-2);
  padding:7px 10px;font-size:12.5px;align-items:baseline}
.log time{font-family:var(--mono);font-size:11.5px;color:var(--ink-3)}
.log .act{font-family:var(--mono);font-size:11.5px;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log .det{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

footer{position:relative;z-index:1;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
  max-width:1220px;margin:0 auto;padding:18px clamp(16px,4vw,40px) 34px;
  border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3)}
@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}
`;

const SCRIPT = `
const $ = (id) => document.getElementById(id);
const base = document.documentElement.dataset.base || '';
const fmt = new Intl.NumberFormat();
let viewer = null, pointsSeen = {};

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
  if (!node || node.textContent === String(value)) return;
  node.textContent = value;
  node.classList.add('bump');
  setTimeout(() => node.classList.remove('bump'), 700);
}

function renderBoard(rows){
  const board = $('board');
  if (!rows.length){
    board.innerHTML = '<li class="empty">No points yet. Huddles only count when the bot is actually in the channel.</li>';
    return;
  }
  board.innerHTML = rows.map((row) => {
    const name = row.displayName || row.userId;
    const sub = [row.pronouns, row.realName && row.realName !== name ? row.realName : ''].filter(Boolean).join(' · ');
    const avatar = row.imageUrl
      ? '<img class="avatar" alt="" loading="lazy" src="' + row.imageUrl + '" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar',textContent:'' + initials(name) + ''}))">'
      : '<span class="avatar">' + initials(name) + '</span>';
    return '<li' + (viewer && row.userId === viewer.userId ? ' class="me"' : '') + '>' +
      '<span class="rank">' + row.rank + '</span>' + avatar +
      '<span class="who-cell"><span class="who-name">' + escapeHtml(name) + '</span>' +
      (sub ? '<span class="who-sub">' + escapeHtml(sub) + '</span>' : '') + '</span>' +
      '<span class="pts">' + fmt.format(row.points) + '</span></li>';
  }).join('');
}

function renderOptIn(){
  const slot = $('opt-in-slot');
  if (!viewer) { slot.innerHTML = ''; return; }
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
  if (!channels.length){ list.innerHTML = '<li class="empty">No tracked channels configured.</li>'; return; }
  list.innerHTML = channels.map((channel) => {
    const cls = channel.paused ? 'paused' : (channel.enabled ? 'on' : '');
    const state = channel.paused ? 'paused' : (channel.enabled ? 'tracking' : 'off');
    return '<li><span class="name">' + (channel.inBot ? '' : '⚠ ') + escapeHtml(channel.name) + '</span>' +
      '<span class="tag' + (channel.enabled ? ' ok' : '') + '"><i class="dot ' + cls + '" style="display:inline-block;margin-right:6px"></i>' + state + '</span></li>';
  }).join('');
}

function renderLog(entries){
  if (!entries) return;
  $('log-panel').classList.remove('hidden');
  const list = $('log');
  if (!entries.length){ list.innerHTML = '<li><span class="det">Nothing logged yet.</span></li>'; return; }
  list.innerHTML = entries.map((entry) => {
    const at = new Date(String(entry.created_at).replace(' ', 'T') + 'Z');
    return '<li><time>' + at.toISOString().slice(11, 19) + '</time>' +
      '<span class="act">' + escapeHtml(entry.action) + '</span>' +
      '<span class="det">' + escapeHtml([entry.user_id, entry.detail, entry.channel_id].filter(Boolean).join(' · ')) + '</span></li>';
  }).join('');
}

function renderSparkline(values){
  const node = $('spark');
  const max = Math.max(1, ...values);
  node.innerHTML = values.map((value) => '<i style="height:' + Math.max(3, Math.round(value / max * 100)) + '%"></i>').join('');
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function refresh(){
  const response = await fetch(base + '/api/stats', { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const data = await response.json();
  viewer = data.viewer;
  const h = data.huddles, u = data.uptime;
  setValue('stat-active', fmt.format(h.active));
  setValue('stat-24h', fmt.format(h.last24h));
  setValue('stat-members', fmt.format(h.members));
  setValue('stat-channels', fmt.format(data.botChannels.count));
  setValue('stat-score', fmt.format(data.leaderboard.reduce((total, row) => total + row.points, 0)));
  $('uptime-pill').textContent = 'up ' + duration(u.seconds);
  $('kv-uptime').textContent = duration(u.seconds);
  $('kv-started').textContent = new Date(u.startedAt).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  $('kv-longest').textContent = duration(h.longestSeconds);
  $('kv-average').textContent = duration(h.averageSeconds);
  $('kv-optedout').textContent = fmt.format(h.optedOut);
  const stateTag = $('state-tag');
  stateTag.textContent = u.state;
  stateTag.classList.toggle('ok', u.state === 'ok' || u.state === 'operational');
  $('foot-updated').textContent = 'updated ' + new Date(data.generatedAt).toISOString().slice(11, 19) + 'Z';
  renderBoard(data.leaderboard);
  renderOptIn();
  renderChannels(data.channels, data.botChannels.count);
  renderLog(data.viewer.isOwner ? data.logs : null);
  renderSparkline(data.leaderboard.slice(0, 12).map((row) => row.points));
}

/* sign in */
async function sendCode(){
  const id = $('slack-id').value.trim();
  const msg = $('signin-msg');
  if (!id) { msg.className = 'msg bad'; msg.textContent = 'Enter your Slack member ID first.'; return; }
  msg.className = 'msg'; msg.textContent = 'Sending…';
  const response = await fetch(base + '/api/auth/code', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slackUserId: id }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { msg.className = 'msg bad'; msg.textContent = body.error || 'Could not send the code.'; return; }
  msg.className = 'msg ok';
  msg.textContent = 'Code sent. Check your Slack DM, then enter it below.';
  $('code-row').classList.remove('hidden');
  $('slack-code').focus();
}
async function verifyCode(){
  const msg = $('signin-msg');
  msg.className = 'msg'; msg.textContent = 'Checking…';
  const response = await fetch(base + '/api/auth/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slackUserId: $('slack-id').value.trim(), code: $('slack-code').value.trim() }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { msg.className = 'msg bad'; msg.textContent = body.error || 'That did not work.'; return; }
  msg.className = 'msg ok'; msg.textContent = 'Signed in. Loading your dashboard…';
  setTimeout(() => location.reload(), 700);
}
$('send-code')?.addEventListener('click', sendCode);
$('verify-code')?.addEventListener('click', verifyCode);
$('slack-id')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCode(); });
$('slack-code')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyCode(); });

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
