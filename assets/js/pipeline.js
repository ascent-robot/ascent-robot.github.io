/* ASCENT project page -- staggered pipeline reveal.
 *
 * Contract (this is the whole spec):
 *   1. Every panel is frozen on frame 0 and shown dim + desaturated.
 *   2. The top-down pane is lit from the start and never dims.
 *   3. Groups light up left to right, REVEAL_MS apart. Nothing moves yet.
 *   4. The instant the last group (P) lights, every video starts together.
 *   5. When the longest stream ends, hold, then run the whole thing again.
 *
 * All seven streams are rendered from the same episode with the same frame
 * count (see scripts/replay_level_b_smooth_video.py --dump-panels), so they
 * stay in step; a watchdog nudges any element that drifts.
 */
(function () {
  "use strict";

  var REVEAL_MS = 400;   // gap between groups lighting up
  var HOLD_MS   = 1100;  // pause on the last frame before looping
  var DRIFT_S   = 0.08;  // resync threshold, seconds

  var flow = document.getElementById("flow");
  if (!flow) return;

  var panes  = Array.prototype.slice.call(flow.querySelectorAll(".pane"));
  var arrows = Array.prototype.slice.call(flow.querySelectorAll(".arrow"));
  var videos = panes.map(function (p) { return p.querySelector("video"); })
                    .filter(Boolean);
  if (!videos.length) return;

  // Stage 0 panes (the top-down) are always lit; the rest reveal in order.
  var stages = [];
  panes.forEach(function (p) {
    var g = p.closest(".group");
    var s = g ? parseInt(g.getAttribute("data-stage") || "0", 10) : 0;
    if (s > 0 && stages.indexOf(s) === -1) stages.push(s);
  });
  stages.sort(function (a, b) { return a - b; });

  var master = videos[0];
  var timers = [];
  var watchdog = null;
  var running = false;
  var ready = false;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
  }

  function setLit(stage, on) {
    panes.forEach(function (p) {
      var g = p.closest(".group");
      var s = g ? parseInt(g.getAttribute("data-stage") || "0", 10) : 0;
      if (s === stage) p.classList.toggle("lit", on);
    });
    arrows.forEach(function (a) {
      if (a.classList.contains("always")) return;
      var s = parseInt(a.getAttribute("data-stage") || "0", 10);
      if (s === stage) a.classList.toggle("lit", on);
    });
  }

  function freeze() {
    clearTimers();
    videos.forEach(function (v) {
      try { v.pause(); v.currentTime = 0; } catch (e) {}
    });
    stages.forEach(function (s) { setLit(s, false); });
    // The always-on group never dims.
    panes.forEach(function (p) {
      var g = p.closest(".group");
      if (g && g.classList.contains("always")) p.classList.add("lit");
    });
  }

  function playAll() {
    videos.forEach(function (v) {
      var q = v.play();
      if (q && q.catch) q.catch(function () {});
    });
    watchdog = setInterval(function () {
      if (master.paused) return;
      var t = master.currentTime;
      videos.forEach(function (v) {
        if (v === master || v.seeking) return;
        if (Math.abs(v.currentTime - t) > DRIFT_S) {
          try { v.currentTime = t; } catch (e) {}
        }
      });
    }, 500);
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
