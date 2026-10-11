/* ASCENT project page -- staggered pipeline reveal.
 *
 * Contract (this is the whole spec):
 *   1. Every panel is frozen on frame 0 and shown dim + desaturated.
 *   2. The top-down pane is lit from the start and never dims.
 *   3. Groups light up left to right, REVEAL_MS apart. Nothing moves yet.
 *   4. The instant the last group (P) lights, every video starts together.
 *   5. Past the handoff frame the field panels and the top-down really ARE
 *      frozen -- the navigation network is out of the loop and only the
 *      cameras keep moving -- so the page says so instead of looking broken.
 *   6. When the longest stream ends, hold, then run the whole thing again.
 *
 * All seven streams are rendered from the same episode with the same frame
 * count (scripts/replay_level_b_smooth_video.py --dump-panels), so they stay
 * in step; a watchdog nudges any element that drifts.
 */
/* One rate for every clip on the page; the second IIFE below is a separate
   scope and cannot see a var declared inside the first. */
var ASCENT_RATE = 3.0;

(function () {
  "use strict";

  var REVEAL_MS = 400;   // gap between groups lighting up
  var HOLD_MS   = 1100;  // pause on the last frame before looping
  var DRIFT_S   = 0.08;  // resync threshold, seconds
  var PLAYBACK_RATE = ASCENT_RATE;

  var NAV_LABEL  = "Perception → fields → potential";
  var HAND_LABEL = "Gate handoff — fields frozen, π₀.₅ drives the arm";

  var flow = document.getElementById("flow");
  if (!flow) return;

  var panes  = Array.prototype.slice.call(flow.querySelectorAll(".pane"));
  var arrows = Array.prototype.slice.call(flow.querySelectorAll(".arrow"));
  var videos = panes.map(function (p) { return p.querySelector("video"); })
                    .filter(Boolean);
  if (!videos.length) return;

  var titleEl = document.querySelector(".stage-title");

  function stageOf(p) {
    var g = p.closest(".group");
    return g ? parseInt(g.getAttribute("data-stage") || "0", 10) : 0;
  }

  // Stage 0 panes (the top-down) are always lit; the rest reveal in order.
  var stages = [];
  panes.forEach(function (p) {
    var s = stageOf(p);
    if (s > 0 && stages.indexOf(s) === -1) stages.push(s);
  });
  stages.sort(function (a, b) { return a - b; });

  var master = videos[0];
  var timers = [];
  var watchdog = null;
  var running = false;
  var ready = false;
  var handoffAt = Infinity;   // seconds; filled in from panels.json

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
  }

  function setLit(stage, on) {
    panes.forEach(function (p) {
      if (stageOf(p) === stage) p.classList.toggle("lit", on);
    });
    arrows.forEach(function (a) {
      if (a.classList.contains("always")) return;
      if (parseInt(a.getAttribute("data-stage") || "0", 10) === stage) {
        a.classList.toggle("lit", on);
      }
    });
  }

  function setHandoff(on) {
    flow.classList.toggle("handoff", on);
    if (titleEl) titleEl.textContent = on ? HAND_LABEL : NAV_LABEL;
  }

  function freeze() {
    clearTimers();
    videos.forEach(function (v) {
      try { v.pause(); v.currentTime = 0; } catch (e) {}
    });
    stages.forEach(function (s) { setLit(s, false); });
    setHandoff(false);
    // The always-on group never dims.
    panes.forEach(function (p) {
      var g = p.closest(".group");
      if (g && g.classList.contains("always")) p.classList.add("lit");
    });
  }

  function playAll() {
    videos.forEach(function (v) {
      try { v.playbackRate = PLAYBACK_RATE; } catch (e) {}
      var q = v.play();
      if (q && q.catch) q.catch(function () {});
    });
    watchdog = setInterval(function () {
      if (master.paused) return;
      var t = master.currentTime;
      setHandoff(t >= handoffAt);
      videos.forEach(function (v) {
        if (v === master || v.seeking) return;
        if (Math.abs(v.currentTime - t) > DRIFT_S) {
          try { v.currentTime = t; } catch (e) {}
        }
      });
    }, 250);
  }

  function run() {
    if (!ready) return;
    running = true;
    freeze();
    stages.forEach(function (s, i) {
      timers.push(setTimeout(function () { setLit(s, true); }, i * REVEAL_MS));
    });
    timers.push(setTimeout(playAll, stages.length * REVEAL_MS));
  }

  master.addEventListener("ended", function () {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
    timers.push(setTimeout(function () { if (running) run(); }, HOLD_MS));
  });

  // ---- manifest: where the handoff falls -----------------------------------
  fetch("assets/panels/panels.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      if (m && m.fps && typeof m.handoff_index === "number") {
        handoffAt = m.handoff_index / m.fps;
      }
    })
    .catch(function () {});

  // ---- load ---------------------------------------------------------------
  var pending = videos.length;
  var failed = 0;

  function settled() {
    if (--pending > 0) return;
    if (failed === videos.length) {
      // No panel assets yet -- leave the figure static rather than break.
      flow.setAttribute("data-assets", "missing");
      return;
    }
    ready = true;
    freeze();
    observe();
  }

  videos.forEach(function (v) {
    v.addEventListener("loadeddata", function () {
      try { v.currentTime = 0; } catch (e) {}
      settled();
    }, { once: true });
    v.addEventListener("error", function () { failed++; settled(); }, { once: true });
    v.src = v.getAttribute("data-src");
    v.load();
  });

  // ---- only animate while on screen ---------------------------------------
  function observe() {
    if (!("IntersectionObserver" in window)) { run(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!running) run();
        } else {
          running = false;
          freeze();
        }
      });
    }, { threshold: 0.25 });
    io.observe(document.getElementById("stage"));
  }

  var btn = document.getElementById("replay");
  if (btn) btn.addEventListener("click", function () { run(); });
})();

/* The standalone rollout video is not part of the staged reveal, but it carries
   the same rate badge, so set its rate whenever it starts. */
(function () {
  var v = document.querySelector("#rollout video");
  if (!v) return;
  var set = function () { try { v.playbackRate = ASCENT_RATE; } catch (e) {} };
  v.addEventListener("loadedmetadata", set);
  v.addEventListener("play", set);
  set();
})();
