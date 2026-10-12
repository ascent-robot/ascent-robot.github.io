/* ASCENT project page -- the teaser: Observe -> Predict -> Propagate -> Move & decide.
 *
 * Contract:
 *   1. Every panel is frozen on frame 0 and shown dim + desaturated.
 *   2. The steps light up left to right, REVEAL_MS apart. Nothing moves yet.
 *   3. The instant the last step lights, every clip starts together.
 *   4. One number under the top-down: the handoff gate's p for the decision the
 *      robot is executing (assets/panels/gate.json, one value per frame). The
 *      bar turns gold at the 0.5 threshold.
 *   5. Past the handoff frame the fields and the top-down really ARE frozen --
 *      the navigation network is out of the loop -- so the page says so.
 *   6. When the longest clip ends, hold, then run the whole thing again.
 *
 * All six clips are cut from the same episode with the same frame count, so
 * they stay in step; a watchdog nudges any element that drifts.
 */
/* One rate for every clip on the page (results.js reads it too). */
var ASCENT_RATE = 3.0;

(function () {
  "use strict";

  var REVEAL_MS = 420;   // gap between steps lighting up
  var HOLD_MS   = 1300;  // pause on the last frame before looping
  var DRIFT_S   = 0.08;  // resync threshold, seconds

  var NAV_LABEL  = "Perception → fields → potential";
  var HAND_LABEL = "Gate handoff — fields frozen, π₀.₅ drives the arm";

  var flow = document.getElementById("flow");
  if (!flow) return;
  var stage = document.getElementById("stage");
  var titleEl = stage.querySelector(".stage-title");
  var steps = Array.prototype.slice.call(flow.querySelectorAll(".step"));
  var arrows = Array.prototype.slice.call(flow.querySelectorAll(".arrow"));
  var videos = Array.prototype.slice.call(flow.querySelectorAll("video"));
  if (!videos.length) return;
  var master = videos[0];

  var gateEl = document.getElementById("gate");
  var fillEl = gateEl && gateEl.querySelector(".gate-fill");
  var valEl = gateEl && gateEl.querySelector(".gate-val");
  var gate = null;            // {fps, threshold, handoff_index, p: [...]}

  var timers = [], watchdog = null, raf = 0;
  var running = false, ready = false;

  function stageOf(el) { return parseInt(el.getAttribute("data-stage") || "0", 10); }
  var stages = [];
  steps.forEach(function (s) { var k = stageOf(s); if (stages.indexOf(k) === -1) stages.push(k); });
  stages.sort(function (a, b) { return a - b; });

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
  }

  function setLit(k, on) {
    steps.concat(arrows).forEach(function (el) {
      if (stageOf(el) === k) el.classList.toggle("lit", on);
    });
  }

  // ---- the gate readout ----------------------------------------------------
  function frameIndex() {
    if (!gate) return 0;
    var j = Math.floor((master.currentTime || 0) * gate.fps + 1e-6);
    return Math.max(0, Math.min(gate.p.length - 1, j));
  }
  function showGate(j) {
    if (!gate || !gateEl) return;
    var p = gate.p[j];
    fillEl.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + "%";
    valEl.textContent = p.toFixed(2);
    gateEl.classList.toggle("open", p >= gate.threshold);
    var handoff = j >= gate.handoff_index;
    flow.classList.toggle("handoff", handoff);
    if (titleEl) titleEl.textContent = handoff ? HAND_LABEL : NAV_LABEL;
  }
  function tick() {
    showGate(frameIndex());
    raf = window.requestAnimationFrame(tick);
  }

  // ---- the loop-back arrow: from the gate, under the row, up to the cameras --
  var svg = flow.querySelector(".loopback");
  var label = flow.querySelector(".loop-label");
  function drawLoop() {
    if (!svg || !gateEl) return;
    var cams = flow.querySelector(".s1 .panes");
    var f = flow.getBoundingClientRect();
    var c = cams.getBoundingClientRect();
    var g = gateEl.getBoundingClientRect();
    if (!c.width || !g.width || getComputedStyle(svg).display === "none") {
      flow.classList.remove("drawn");
      return;
    }
    var x1 = c.left + c.width / 2 - f.left, y1 = c.bottom - f.top + 10;
    // leave from under the gate's name, clear of the 0.5 tick and its label
    var x3 = g.left + 18 - f.left, y3 = g.bottom - f.top + 8;
    var yl = y3 + 20, r = 12;
    var d = "M" + x3 + "," + y3 + " V" + (yl - r) +
            " Q" + x3 + "," + yl + " " + (x3 - r) + "," + yl +
            " H" + (x1 + r) +
            " Q" + x1 + "," + yl + " " + x1 + "," + (yl - r) +
            " V" + (y1 + 2);
    var head = "M" + (x1 - 5) + "," + (y1 + 9) + " L" + x1 + "," + y1 + " L" + (x1 + 5) + "," + (y1 + 9);
    svg.innerHTML = '<path d="' + d + '"/><path d="' + head + '" style="stroke-dasharray:none"/>';
    label.style.left = ((x1 + x3) / 2) + "px";
    label.style.top = yl + "px";
    flow.classList.add("drawn");
  }
  if ("ResizeObserver" in window) new ResizeObserver(drawLoop).observe(flow);
  window.addEventListener("resize", drawLoop);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLoop);

  // ---- playback ------------------------------------------------------------
  function freeze() {
    clearTimers();
    videos.forEach(function (v) {
      try { v.pause(); v.currentTime = 0; } catch (e) {}
    });
    stages.forEach(function (k) { setLit(k, false); });
    showGate(0);
  }

  function playAll() {
    videos.forEach(function (v) {
      try { v.playbackRate = ASCENT_RATE; } catch (e) {}
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
    }, 250);
  }

  function run() {
    if (!ready) return;
    running = true;
    freeze();
    stages.forEach(function (k, i) {
      timers.push(setTimeout(function () { setLit(k, true); }, i * REVEAL_MS));
    });
    timers.push(setTimeout(playAll, stages.length * REVEAL_MS));
  }

  master.addEventListener("ended", function () {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
    timers.push(setTimeout(function () { if (running) run(); }, HOLD_MS));
  });

  fetch("assets/panels/gate.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      if (m && m.p && m.p.length) { gate = m; showGate(frameIndex()); }
    })
    .catch(function () {});

  // ---- load ------------------------------------------------------------------
  var pending = videos.length, failed = 0;
  function settled() {
    if (--pending > 0) return;
    if (failed === videos.length) { flow.setAttribute("data-assets", "missing"); return; }
    ready = true;
    freeze();
    drawLoop();
    if (!raf) raf = window.requestAnimationFrame(tick);
    observe();
  }
  videos.forEach(function (v) {
    v.addEventListener("loadeddata", function () {
      try { v.currentTime = 0; } catch (e) {}
      settled();
    }, { once: true });
    v.addEventListener("error", function () { failed++; settled(); }, { once: true });
    v.addEventListener("play", function () { try { v.playbackRate = ASCENT_RATE; } catch (e) {} });
    v.src = v.getAttribute("data-src");
    v.load();
  });
  drawLoop();

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
    io.observe(stage);
  }

  var btn = document.getElementById("replay");
  if (btn) btn.addEventListener("click", function () { run(); });
})();
