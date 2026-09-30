#!/usr/bin/env python3
"""The launch page for the private artifact of the demo (HANDOFF §9): the built app's own index.html, re-wrapped for the
artifact frame (no doctype/html/head/body of its own), with a launch card for the five demo scenes and the game's two
views. The artifact's link carries no query string, so the card sets the scene's query with history.replaceState and
then loads the app's module script; a bare #house … #tv token on the link deep-links a scene.

    cd frontend && npx vite build --base=./ && python3 scripts/launch-page.py <out dir>

Publish <out dir>/the-agentic-economy.html with the artifact tool, files rooted at frontend/dist: assets/*.js, assets/*.css,
traces/trace.json, and engine/context_engine.wasm at both engine/ and assets/engine/ (the worker fetches it relative to
its own folder). Private by default; the laboratory's stop line applies (LABORATORY.md).
"""
import re, sys, pathlib
out = pathlib.Path(sys.argv[1]); dist = pathlib.Path(__file__).resolve().parents[1] / "dist"
html = (dist / "index.html").read_text()
style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
fonts = re.search(r'<link\s+rel="stylesheet"\s+href="https://fonts\.googleapis\.com[^>]*>', html, re.S).group(0)
css = re.search(r'<link rel="stylesheet" crossorigin href="(\./assets/[^"]+\.css)">', html).group(1)
js = re.search(r'<script type="module" crossorigin src="(\./assets/[^"]+\.js)"></script>', html).group(1)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1).strip()
page = f'''<title>The Agentic Economy</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts}
<link rel="stylesheet" crossorigin href="{css}">
<style>
  /* The app's own shell (frontend/index.html), single dark world by design: DESIGN §2 tokens. */
  :root {{ color-scheme: dark; }}
{style}
  /* The launch card: the same paper-on-ground idiom as the Door (DESIGN §3). */
  #launch {{ position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: var(--ground); overflow: auto; }}
  #launch-card {{ width: min(100%, 520px); background: var(--paper); color: var(--paper-ink); padding: 28px 28px 22px; box-sizing: border-box; }}
  #launch-card h1 {{ font: 600 clamp(1.7rem, 5vw, 2.2rem)/1.1 var(--display); margin: 6px 0 10px; text-wrap: balance; }}
  #launch-card p {{ margin: 0 0 14px; max-width: 46ch; }}
  #launch-card .eyebrow.game {{ margin: 18px 0 6px; }}
  .scenes {{ list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }}
  .scenes button {{ width: 100%; display: grid; grid-template-columns: 7.5rem 1fr; gap: 12px; align-items: baseline; text-align: left; padding: 10px 12px; border: 1px solid #c9b995; background: #f7efdf; color: var(--paper-ink); font: inherit; cursor: pointer; }}
  .scenes button:hover, .scenes button:focus-visible {{ border-color: var(--gold); background: #fbf5e8; outline: none; box-shadow: inset 0 0 0 1px var(--gold); }}
  .scenes .name {{ font: 600 1.05rem/1.2 var(--display); }}
  .scenes .what {{ font-size: 0.93rem; line-height: 1.4; color: #4a3d2c; min-width: 0; }}
  #launch-note {{ margin: 18px 0 0; font-size: 0.86rem; line-height: 1.45; color: #5a4c3a; }}
  #scenes-again {{ position: fixed; left: 10px; bottom: calc(6px + env(safe-area-inset-bottom, 0px)); z-index: 40; padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px; background: rgba(30, 23, 16, 0.85); color: var(--ink-3); font: 600 0.72rem/1.2 var(--ui); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }}
  #scenes-again:hover, #scenes-again:focus-visible {{ color: var(--gold); border-color: var(--gold); outline: none; }}
  @media (max-width: 480px) {{ .scenes button {{ grid-template-columns: 1fr; gap: 2px; }} }}
</style>

{body}

<div id="launch" role="dialog" aria-labelledby="launch-title">
  <div id="launch-card">
    <p class="eyebrow">The demo, live</p>
    <h1 id="launch-title">Choose where to stand</h1>
    <p>The engine runs here, in your browser. Five nested scales, one rule: state moves only at a boundary, and nothing is shared by default.</p>
    <ul class="scenes">
      <li><button type="button" data-scene="house"><span class="name">The House</span><span class="what">A week with a helper. The Porter knocks; you answer at the Door.</span></button></li>
      <li><button type="button" data-scene="street"><span class="name">The Street</span><span class="what">Elm Street's houses hire each other's couriers. The kerb settles or reverts.</span></button></li>
      <li><button type="button" data-scene="city"><span class="name">The City</span><span class="what">Six streets of eight. The Clearinghouse nets the day; drift frays the rims.</span></button></li>
      <li><button type="button" data-scene="country"><span class="name">The Country</span><span class="what">Statutory Law. The High Court rolls a forged tick back.</span></button></li>
      <li><button type="button" data-scene="world"><span class="name">The World</span><span class="what">Start in the room, then climb the ladder at the top left to the globe.</span></button></li>
    </ul>
    <p class="eyebrow game">A Week on Elm Street, round 1</p>
    <ul class="scenes">
      <li><button type="button" data-scene="phone"><span class="name">Ada's Door</span><span class="what">The phone view: one Door, four answers. Send it, hire a neighbour's courier, ask the oracle first, or leave it on the table.</span></button></li>
      <li><button type="button" data-scene="tv"><span class="name">The TV</span><span class="what">Elm Street with the cottages named; on Friday's last tick, the Notes on the table.</span></button></li>
    </ul>
    <p id="launch-note">Best on a laptop or a tablet; a phone shows the same scene smaller. Here each tab runs its own engine, so the two game views are a look, not a table: the kitchen-table recipe in HANDOFF §9 shares one engine between the TV and the phones.</p>
  </div>
</div>
<button type="button" id="scenes-again" hidden>Scenes</button>

<script>
(function () {{
  var APP = "{js}";
  var SCENES = {{
    house:   "?source=wasm&run=house&quality=balanced",
    street:  "?source=wasm&run=street&quality=balanced",
    city:    "?source=wasm&run=city&streets=6&houses=8&quality=balanced",
    country: "?source=wasm&run=country&quality=balanced",
    world:   "?source=wasm&run=world_full&countries=3&cities=2&streets=3&houses=4&zoom=1&quality=balanced",
    phone:   "?source=wasm&run=game&houses=4&week=40&house=Ada",
    tv:      "?source=wasm&run=game&houses=4&week=40&view=tv&quality=balanced"
  }};
  var launch = document.getElementById("launch");
  var again = document.getElementById("scenes-again");
  var started = false;
  function start(name) {{
    var q = SCENES[name];
    if (!q || started) return;
    started = true;
    try {{ history.replaceState(null, "", q + "#" + name); }}
    catch (e) {{ location.href = q + "#" + name; return; }}
    launch.hidden = true;
    again.hidden = false;
    var s = document.createElement("script");
    s.type = "module"; s.crossOrigin = "anonymous"; s.src = APP;
    document.head.appendChild(s);
  }}
  launch.addEventListener("click", function (e) {{
    var b = e.target.closest("button[data-scene]");
    if (b) start(b.getAttribute("data-scene"));
  }});
  again.addEventListener("click", function () {{
    try {{ history.replaceState(null, "", location.pathname); }} catch (e) {{}}
    location.reload();
  }});
  var token = (location.hash || "").replace(/^#/, "");
  if (SCENES[token]) start(token);
}})();
</script>
'''
(out / "the-agentic-economy.html").write_text(page)
print("page", len(page), "bytes; app", js, "; css", css)
