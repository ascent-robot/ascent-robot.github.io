/* ASCENT project page -- the three-way comparison.
 *
 * One start pose, three systems, played side by side and in step. The clips are
 * padded to a common length when they are packed (scripts/pack_threeway.sh), so
 * a system that finishes early simply holds while the others keep going.
 *
 * Two levels of selection: task, then start pose within that task. Everything
 * comes from assets/compare/cells.json and each cell's own compare.json -- the
 * badges are read from the measured outcome, never hard-coded here.
 */
(function () {
  "use strict";

  var SYSTEMS = ["ascent", "n2m", "purepi05"];
  var DRIFT_S = 0.08;
  var HOLD_MS = 900;
  var PLAYBACK_RATE = 4.0;

  var root = document.getElementById("compare");
  if (!root) return;
  var taskEl = root.querySelector(".tasks");
  var chipsEl = root.querySelector(".chips");
  var rowEl = root.querySelector(".cmp-row");
  var metaEl = root.querySelector(".cmp-meta");
  if (!taskEl || !chipsEl || !rowEl) return;

  var videos = SYSTEMS.map(function (s) {
    return rowEl.querySelector('.cmp[data-system="' + s + '"] video');
  });
  if (videos.some(function (v) { return !v; })) return;
  var master = videos[0];

  var tasks = [];
  var ti = -1, ci = -1;
  var watchdog = null, loopTimer = null, visible = false, token = 0;

  function stop() {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
  }

  function playAll() {
    videos.forEach(function (v) {
      try { v.currentTime = 0; v.playbackRate = PLAYBACK_RATE; } catch (e) {}
    });
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
    }, 300);
  }

  master.addEventListener("ended", function () {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
    loopTimer = setTimeout(function () { if (visible) playAll(); }, HOLD_MS);
  });

  function badge(el, ok) {
    var b = el.querySelector(".badge");
    if (!b) return;
    b.textContent = ok ? "success" : "failure";
    b.classList.toggle("ok", !!ok);
    b.classList.toggle("bad", !ok);
    el.classList.toggle("is-ok", !!ok);
  }

  function selectCell(k) {
    var list = tasks[ti].cells;
    if (k < 0 || k >= list.length) return;
    ci = k;
    Array.prototype.forEach.call(chipsEl.querySelectorAll(".chip"), function (c) {
      var on = Number(c.dataset.i) === k;
      c.classList.toggle("on", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
    });
    stop();
    var my = ++token;
    var cell = list[k];
    var base = "assets/compare/" + cell.dir + "/";
    if (metaEl) metaEl.textContent = cell.dir;
    SYSTEMS.forEach(function (s, i) {
      videos[i].src = base + s + ".mp4";
      // 2x on the page rather than in the encode: the clips stay frame-exact
      // for any later re-cut, and the rate survives a re-pack.
      videos[i].playbackRate = PLAYBACK_RATE;
      videos[i].load();
    });
    fetch(base + "compare.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m || my !== token) return;
        SYSTEMS.forEach(function (s) {
          badge(rowEl.querySelector('.cmp[data-system="' + s + '"]'),
                ((m.systems || {})[s] || {}).success);
        });
      })
      .catch(function () {});
    var pending = videos.length;
    videos.forEach(function (v) {
      v.addEventListener("loadeddata", function () {
        if (--pending === 0 && visible && my === token) playAll();
      }, { once: true });
    });
  }

  function selectTask(k) {
    if (k < 0 || k >= tasks.length) return;
    ti = k;
    Array.prototype.forEach.call(taskEl.children, function (c, i) {
      c.classList.toggle("on", i === k);
      c.setAttribute("aria-selected", i === k ? "true" : "false");
    });
    // One row per start distance. With 20+ starts on a task a single wrapped
    // run of chips is unreadable, and the distance is the first thing you pick
    // by. Chips carry their index because the rows put non-chip children in
    // chipsEl and position is no longer the index.
    chipsEl.textContent = "";
    var row = null, band = null;
    tasks[k].cells.forEach(function (cell, i) {
      if (row === null || cell.distance !== band) {
        band = cell.distance;
        row = document.createElement("div");
        row.className = "band-row";
        var lab = document.createElement("span");
        lab.className = "band";
        lab.textContent = band + " m";
        row.appendChild(lab);
        chipsEl.appendChild(row);
      }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.i = String(i);
      b.setAttribute("role", "tab");
      b.textContent = String(cell.seed);
      b.addEventListener("click", function () { selectCell(i); });
      row.appendChild(b);
    });
    selectCell(0);
  }

  fetch("assets/compare/cells.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (list) {
      if (!list || !list.tasks || !list.tasks.length) {
        root.setAttribute("data-assets", "missing");
        return;
      }
      tasks = list.tasks.filter(function (t) { return t.cells && t.cells.length; });
      tasks.forEach(function (t, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tab";
        b.setAttribute("role", "tab");
        b.textContent = t.label + "  (" + t.cells.length + ")";
        b.addEventListener("click", function () { selectTask(i); });
        taskEl.appendChild(b);
      });
      if (!("IntersectionObserver" in window)) { visible = true; selectTask(0); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) {
            if (ti < 0) selectTask(0);
            else if (master.paused) playAll();
          } else {
            stop();
          }
        });
      }, { threshold: 0.2 });
      io.observe(root);
    })
    .catch(function () { root.setAttribute("data-assets", "missing"); });
})();
