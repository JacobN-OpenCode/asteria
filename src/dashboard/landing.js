import { ORBIT_FAVICON, ORBIT_MARK_SVG, THEME_TOKENS } from './theme.js';

/**
 * The public front door.
 *
 * Deliberately static: no stats, no channel names, no session data. Everything
 * about the leaderboard, huddle history and channel activity lives behind Slack
 * sign in on /dashboard.
 */
export function renderLandingPage({ signedIn = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jacob's Orbit, huddles scored and remembered</title>
<meta name="description" content="Orbit sits in your Hack Club Slack channels, tracks every huddle, keeps the leaderboard, and turns the funny bits into recaps. No audio, no bots in the call.">
<meta property="og:title" content="Jacob's Orbit">
<meta property="og:description" content="Huddles scored and remembered for your Hack Club Slack.">
<meta property="og:type" content="website">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(ORBIT_FAVICON)}" type="image/svg+xml">
<style>
${THEME_TOKENS}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.6;
  background:
    radial-gradient(1100px 520px at 68% -14%,var(--glow),transparent 62%),
    radial-gradient(900px 460px at 4% 8%,var(--blue-ring),transparent 60%),
    var(--bg);
  -webkit-font-smoothing:antialiased}
a{color:var(--accent-bright);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1160px;margin:0 auto;padding:0 clamp(18px,4vw,36px)}

/* nav */
.lnav{position:sticky;top:0;z-index:20;background:var(--glass);backdrop-filter:saturate(140%) blur(14px);
  border-bottom:1px solid var(--hair)}
.lnav .wrap{display:flex;align-items:center;gap:22px;height:64px}
.lbrand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:700;letter-spacing:-.02em;font-size:15.5px}
.lbrand:hover{text-decoration:none}
.lbrand .mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;color:var(--accent);
  background:var(--tint);box-shadow:inset 0 0 0 1px var(--ring)}
.links{display:flex;gap:4px;margin-left:10px}
.links a{color:var(--ink-3);font-size:13px;font-weight:560;padding:7px 10px;border-radius:8px}
.links a:hover{color:var(--ink);background:var(--raised);text-decoration:none}
.lnav .spacer{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:13.5px;
  font-weight:680;color:var(--ctp-crust);background:var(--accent);border:0;border-radius:9px;
  padding:10px 16px;cursor:pointer;text-decoration:none;transition:background .15s ease,transform .12s ease}
.btn:hover{background:var(--accent-bright);text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn:focus-visible{outline:2px solid var(--accent-bright);outline-offset:3px}
.btn.ghost{background:transparent;color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--hair)}
.btn.ghost:hover{color:var(--ink);background:var(--raised);box-shadow:inset 0 0 0 1px var(--hair-strong)}

/* hero */
.hero{padding:clamp(44px,7vw,86px) 0 clamp(30px,5vw,54px)}
.hero .wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(26px,5vw,64px);align-items:center}
@media (max-width:900px){.hero .wrap{grid-template-columns:1fr}}
.kicker{margin:0 0 12px;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);font-weight:750}
h1{margin:0 0 16px;font-size:clamp(34px,5vw,58px);line-height:1.02;letter-spacing:-.04em;font-weight:740}
h1 span{color:var(--accent)}
.lede{margin:0 0 24px;color:var(--ink-2);font-size:clamp(15px,1.6vw,17.5px);max-width:50ch}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.hero-note{margin:16px 0 0;font-size:12px;color:var(--ink-3)}
.hero-note b{color:var(--ink-2);font-weight:600}

/* preview */
.preview{position:relative;border-radius:18px;padding:16px;background:linear-gradient(160deg,var(--stage-top),var(--stage-bottom));
  box-shadow:inset 0 0 0 1px var(--hair),0 30px 70px -40px var(--ctp-crust)}
.preview::before{content:"";position:absolute;inset:-40% 20% 40% -20%;z-index:-1;pointer-events:none;
  background:radial-gradient(closest-side,var(--tint-2),transparent);filter:blur(10px)}
.pv-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pv-live{display:inline-flex;align-items:center;gap:6px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink-2);font-weight:700;padding:4px 8px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--hair)}
.pv-live i{width:5px;height:5px;border-radius:50%;background:var(--green)}
.pv-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.pv-kpi{background:var(--surface);border-radius:10px;padding:10px 11px;box-shadow:inset 0 0 0 1px var(--hair)}
.pv-kpi small{display:block;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);font-weight:700}
.pv-kpi b{display:block;font-family:var(--mono);font-size:21px;letter-spacing:-.03em;margin-top:5px}
.pv-board{background:var(--surface);border-radius:12px;box-shadow:inset 0 0 0 1px var(--hair);overflow:hidden}
.pv-row{display:grid;grid-template-columns:22px 26px minmax(0,1fr) auto;gap:9px;align-items:center;
  padding:9px 11px;font-size:12.5px}
.pv-row+.pv-row{border-top:1px solid var(--hair)}
.pv-row .r{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);text-align:right}
.pv-row:first-child .r{color:var(--gold)}
.pv-row .a{width:26px;height:26px;border-radius:50%;background:var(--raised);box-shadow:inset 0 0 0 1px var(--hair);
  display:grid;place-items:center;font-size:9px;font-weight:700;color:var(--ink-3)}
.pv-row .n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:560}
.pv-row .p{font-family:var(--mono);font-size:11.5px;color:var(--ink-2)}
.pv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.pv-chip{font-size:10.5px;color:var(--ink-2);background:var(--raised);border-radius:999px;padding:4px 9px;
  box-shadow:inset 0 0 0 1px var(--hair)}
.pv-chip i{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green);margin-right:6px;vertical-align:1px}

/* claims */
.claims{border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);padding:20px 0}
.claims .wrap{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media (max-width:820px){.claims .wrap{grid-template-columns:repeat(2,1fr)}}
.claim{font-size:12.5px;color:var(--ink-3)}
.claim b{display:block;color:var(--ink);font-size:13.5px;margin-bottom:2px;font-weight:640}

/* sections */
section.block{padding:clamp(44px,6vw,76px) 0}
.block h2{margin:0 0 10px;font-size:clamp(24px,3.2vw,34px);letter-spacing:-.03em;line-height:1.1;font-weight:700}
.block .intro{margin:0 0 30px;color:var(--ink-3);max-width:56ch;font-size:14.5px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media (max-width:900px){.grid3{grid-template-columns:1fr}}
.feature{background:var(--surface);border-radius:14px;padding:18px;box-shadow:inset 0 0 0 1px var(--hair)}
.feature h3{margin:0 0 6px;font-size:14.5px;font-weight:660;display:flex;align-items:center;gap:8px}
.feature h3 .ico{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;color:var(--accent);
  background:var(--tint);box-shadow:inset 0 0 0 1px var(--ring)}
.feature p{margin:0;font-size:13px;color:var(--ink-3)}

.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;counter-reset:step}
@media (max-width:900px){.steps{grid-template-columns:1fr}}
.step{background:var(--surface);border-radius:14px;padding:18px;box-shadow:inset 0 0 0 1px var(--hair);position:relative}
.step::before{counter-increment:step;content:counter(step);position:absolute;top:14px;right:16px;
  font-family:var(--mono);font-size:26px;font-weight:700;color:var(--raised);text-shadow:0 0 0 var(--line)}
.step h3{margin:0 0 6px;font-size:14px;font-weight:660}
.step p{margin:0;font-size:13px;color:var(--ink-3);max-width:34ch}

.privacy{background:linear-gradient(160deg,var(--stage-top),var(--stage-bottom));border-radius:18px;
  box-shadow:inset 0 0 0 1px var(--hair);padding:clamp(22px,4vw,34px)}
.privacy h2{margin-top:0}
.privacy ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}
@media (max-width:760px){.privacy ul{grid-template-columns:1fr}}
.privacy li{font-size:13px;color:var(--ink-2);padding-left:20px;position:relative}
.privacy li::before{content:"";position:absolute;left:2px;top:8px;width:6px;height:6px;border-radius:50%;
  background:var(--accent);box-shadow:0 0 8px var(--ring)}
.privacy li b{color:var(--ink)}

.cta{padding:clamp(40px,6vw,70px) 0}
.cta .panelcta{background:linear-gradient(160deg,var(--tint-2),transparent 60%),var(--surface);
  border-radius:18px;box-shadow:inset 0 0 0 1px var(--ring);padding:clamp(26px,5vw,44px);
  display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap}
.cta h2{margin:0;font-size:clamp(22px,3vw,32px);letter-spacing:-.03em;font-weight:720}
.cta p{margin:6px 0 0;color:var(--ink-3);font-size:13.5px}

footer{border-top:1px solid var(--hair);padding:26px 0 40px;color:var(--ink-3);font-size:12.5px}
footer .wrap{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
footer a{color:var(--ink-3)}
footer a:hover{color:var(--ink)}
</style>
</head>
<body>
<nav class="lnav">
  <div class="wrap">
    <a class="lbrand" href="/"><span class="mark">${ORBIT_MARK_SVG}</span><span>Jacob's Orbit</span></a>
    <div class="links">
      <a href="#features">Features</a>
      <a href="#how">How it works</a>
      <a href="#privacy">Privacy</a>
    </div>
    <span class="spacer"></span>
    ${
      signedIn
        ? `<a class="btn" href="/dashboard">Open Orbit</a>`
        : `<a class="btn" href="/login">Sign in with Slack</a>`
    }
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <div>
      <p class="kicker">for Hack Club Slack</p>
      <h1>Your huddles, <span>scored and remembered</span>.</h1>
      <p class="lede">Orbit sits in your channels, tracks every huddle, keeps the leaderboard honest, and turns the
        funny bits into recaps. It never records audio and never joins the call.</p>
      <div class="hero-cta">
        ${
          signedIn
            ? `<a class="btn" href="/dashboard">Open your dashboard</a>
               <a class="btn ghost" href="#features">What it does</a>`
            : `<a class="btn" href="/login">Sign in with Slack</a>
               <a class="btn ghost" href="#how">See how it works</a>`
        }
      </div>
      <p class="hero-note"><b>No password.</b> Sign in with your Slack account. Only Hack Club members can see
        the leaderboard and huddle history.</p>
    </div>

    <div class="preview" aria-hidden="true">
      <div class="pv-top">
        <span class="pv-live"><i></i>live dashboard</span>
        <span class="pv-chip">hippogriffs-tinkering</span>
      </div>
      <div class="pv-kpis">
        <div class="pv-kpi"><small>Points</small><b>3,457</b></div>
        <div class="pv-kpi"><small>Huddles</small><b>54</b></div>
        <div class="pv-kpi"><small>Hours</small><b>148</b></div>
      </div>
      <div class="pv-board">
        <div class="pv-row"><span class="r">1</span><span class="a">FF</span><span class="n">FreeformWave</span><span class="p">706</span></div>
        <div class="pv-row"><span class="r">2</span><span class="a">JN</span><span class="n">Jacob N</span><span class="p">550</span></div>
        <div class="pv-row"><span class="r">3</span><span class="a">TR</span><span class="n">Trulle123</span><span class="p">493</span></div>
        <div class="pv-row"><span class="r">4</span><span class="a">DR</span><span class="n">Dragaroni</span><span class="p">460</span></div>
      </div>
      <div class="pv-chips">
        <span class="pv-chip"><i></i>j-log</span>
        <span class="pv-chip"><i></i>freddies-castle</span>
        <span class="pv-chip"><i></i>waveland</span>
      </div>
    </div>
  </div>
</header>

<section class="claims">
  <div class="wrap">
    <div class="claim"><b>Every huddle</b>Tracked from join to leave, with the gaps kept.</div>
    <div class="claim"><b>Real time only</b>Points follow provable minutes, not guesses.</div>
    <div class="claim"><b>Opt-in recaps</b>Funny moments come from people, not scraped messages.</div>
    <div class="claim"><b>Private by design</b>No audio. Private channels stay private.</div>
  </div>
</section>

<section class="block" id="features">
  <div class="wrap">
    <p class="kicker">features</p>
    <h2>Built for the way Hack Club actually uses Slack.</h2>
    <p class="intro">Six things, no dashboards inside dashboards. Everything below needs a signed-in Hack Club account.</p>
    <div class="grid3">
      <article class="feature">
        <h3><span class="ico">${icon('headphones')}</span>Orbit Huddles</h3>
        <p>See who joined, how long they stayed and the gaps in between. Each huddle gets its own page with a clean breakdown.</p>
      </article>
      <article class="feature">
        <h3><span class="ico">${icon('chart')}</span>Leaderboard</h3>
        <p>Minutes turn into points, with small bonuses for rank, the starter and the best message. Opt out and you are simply not listed.</p>
      </article>
      <article class="feature">
        <h3><span class="ico">${icon('sliders')}</span>Channel controls</h3>
        <p>Per channel: tracking, replies, managers-only triggers, condensed recaps and a pause switch. The owner sets the defaults.</p>
      </article>
      <article class="feature">
        <h3><span class="ico">${icon('mic')}</span>Orbit Recaps</h3>
        <p>Share a channel page, and people who have huddled there submit their own moments. The policy is explicit and the tick is stored.</p>
      </article>
      <article class="feature">
        <h3><span class="ico">${icon('send')}</span>Orbit Messages</h3>
        <p>The owner can DM anyone as the bot, signed off with <b>from @jacob</b>. No hidden sender, no impersonation.</p>
      </article>
      <article class="feature">
        <h3><span class="ico">${icon('shield')}</span>Privacy by design</h3>
        <p>Private channel stats need membership. Recaps need consent. Nothing about the leaderboard is public any more.</p>
      </article>
    </div>
  </div>
</section>

<section class="block" id="how">
  <div class="wrap">
    <p class="kicker">how it works</p>
    <h2>Three steps, then it just runs.</h2>
    <div class="steps">
      <article class="step">
        <h3>Invite Orbit</h3>
        <p>Add the bot to a channel. It only ever looks at conversations it is a member of.</p>
      </article>
      <article class="step">
        <h3>Huddle</h3>
        <p>Orbit reads the roster Slack already publishes, plus live presence events. It does not join, listen or record.</p>
      </article>
      <article class="step">
        <h3>Sign in</h3>
        <p>Use Slack to open the dashboard, see the board, and read any huddle you were in.</p>
      </article>
    </div>
  </div>
</section>

<section class="block" id="privacy">
  <div class="wrap">
    <div class="privacy">
      <p class="kicker">privacy</p>
      <h2>What Orbit will never do.</h2>
      <ul>
        <li><b>No audio.</b> It never joins a call and never records one.</li>
        <li><b>No scraping.</b> It processes live events and stores metadata, not message bodies.</li>
        <li><b>No public data.</b> The board, huddle pages and channel stats need Slack sign in.</li>
        <li><b>No private leaks.</b> A private channel opens only to its members, its managers and the owner.</li>
        <li><b>No surprise DMs.</b> Only sign-in links and an owner-requested message arrive unprompted.</li>
        <li><b>No resale.</b> Data stays in your workspace and is never sold or shared.</li>
      </ul>
    </div>
  </div>
</section>

<section class="cta">
  <div class="wrap">
    <div class="panelcta">
      <div>
        <h2>${signedIn ? 'Pick up where you left off.' : 'Ready to see your huddles?'}</h2>
        <p>Sign in with Slack. If you are in the workspace, that is all you need.</p>
      </div>
      ${
        signedIn
          ? `<a class="btn" href="/dashboard">Open Orbit</a>`
          : `<a class="btn" href="/login">Sign in with Slack</a>`
      }
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <span>Jacob's Orbit. Built for Hack Club, not affiliated with Slack.</span>
    <span>
      <a href="/health">health</a> ·
      <a href="/rss.xml">rss</a> ·
      <a href="/login">sign in</a>
    </span>
  </div>
</footer>
</body>
</html>`;
}

/** Small stroke icons, in the palette's accent. */
function icon(name) {
  const paths = {
    headphones: '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="14" width="4" height="6" rx="2"/><rect x="17.5" y="14" width="4" height="6" rx="2"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  };
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}
