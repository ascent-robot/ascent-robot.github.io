/* ASCENT project page -- results: one card per task, three clips side by side.
 *
 * Each clip is already cut where its outcome is decided (assets/examples/,
 * scripts/cut_site_examples.py), so playback is simple:
 *   - a card starts when it scrolls into view and pauses when it leaves;
 *   - the three clips wait until all three can play, then start together;
 *   - a clip that reaches its end holds its last frame: greyed out with
 *     "Fail", or with a "Success" tag;
 *   - once all three have ended, hold, then start the card again;
 *   - "Example 1/2/3" swaps all three clips and restarts the card.
 */
(function () {
  "use strict";

  var RATE = (typeof ASCENT_RATE === "number") ? ASCENT_RATE : 3.0;
  var HOLD_MS = 2200;      // all three verdicts on screen before the loop restarts
  var READY_MS = 6000;     // give up waiting for a slow clip after this long
  var SYS = ["ascent", "n2m", "purepi05"];

  Array.prototype.slice.call(document.querySelectorAll(".task")).forEach(setup);

  function setup(task) {
    var btns = Array.prototype.slice.call(task.querySelectorAll(".ex-switch button"));
    var clips = SYS.map(function (s) { return task.querySelector('.clip[data-sys="' + s + '"]'); });
    var vids = clips.map(function (c) { return c.querySelector("video"); });
    var verdicts = clips.map(function (c) { return c.querySelector(".verdict"); });
    var distEl = task.querySelector(".task-meta b");
    var cur = 0, inView = false, loadedIdx = -1, token = 0, hold = null;

    function load(i) {
      var b = btns[i];
      SYS.forEach(function (s, k) {
        var v = vids[k];
        v.pause();
        v.preload = "auto";
        v.poster = b.getAttribute("data-" + s + "-poster");
        v.src = b.getAttribute("data-" + s);
        v.load();
        var ok = b.getAttribute("data-" + s + "-ok") === "1";
        verdicts[k].className = "verdict " + (ok ? "ok" : "bad");
        verdicts[k].textContent = ok ? "Success" : "Fail";
        clips[k].classList.remove("ended");
      });
      if (distEl) distEl.textContent = b.getAttribute("data-dist") + " m";
      loadedIdx = i;
    }

    // Resolves once the clip can start: already buffered, a seek back to 0
    // finished (a clip parked on its last frame may never fire canplay
    // again), or the timeout.
    function whenReady(v) {
      return new Promise(function (res) {
        if (v.readyState >= 3 && !v.seeking) return res();
        var done = false;
        function fin() { if (!done) { done = true; res(); } }
        v.addEventListener("canplay", fin, { once: true });
        v.addEventListener("seeked", fin, { once: true });
        v.addEventListener("error", fin, { once: true });
        setTimeout(fin, READY_MS);
      });
    }

    function start() {
      var my = ++token;
      clearTimeout(hold);
      if (loadedIdx !== cur) load(cur);
      clips.forEach(function (c) { c.classList.remove("ended"); });
      vids.forEach(function (v) {
        if (v.readyState >= 1 && v.currentTime > 0) { try { v.currentTime = 0; } catch (e) {} }
      });
      Promise.all(vids.map(whenReady)).then(function () {
        if (my !== token || !inView) return;
        vids.forEach(function (v) {
          v.defaultPlaybackRate = RATE;
          v.playbackRate = RATE;
          var q = v.play();
          if (q && q.catch) q.catch(function () {});
        });
      });
    }

    function stop() {
      token++;
      clearTimeout(hold);
      vids.forEach(function (v) { v.pause(); });
    }

    vids.forEach(function (v, k) {
      v.addEventListener("play", function () { v.playbackRate = RATE; });
      v.addEventListener("ended", function () {
        clips[k].classList.add("ended");
        var all = vids.every(function (x) { return x.ended; });
        if (all) {
          var my = token;
          hold = setTimeout(function () { if (my === token && inView) start(); }, HOLD_MS);
        }
      });
    });

    btns.forEach(function (b, i) {
      b.addEventListener("click", function () {
        if (i === cur) return;
        btns.forEach(function (x, j) {
          x.classList.toggle("on", j === i);
          x.setAttribute("aria-selected", j === i ? "true" : "false");
        });
        cur = i;
        stop();
        load(i);
        if (inView) start();
      });
    });

    if (!("IntersectionObserver" in window)) { inView = true; start(); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!inView) { inView = true; start(); }
        } else if (inView) {
          inView = false;
          stop();
        }
      });
    }, { threshold: 0.35 }).observe(task);
  }
})();
