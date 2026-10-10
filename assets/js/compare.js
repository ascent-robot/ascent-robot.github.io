/* ASCENT project page -- the three-way comparison.
 *
 * One start pose, three systems, played side by side and in step. The clips are
 * padded to a common length when they are packed (scripts/pack_threeway.sh), so
 * "ours has finished, theirs is still going" reads straight off the row.
 *
 * Cells come from assets/compare/cells.json; each cell directory carries its own
 * compare.json with the per-system outcome, which is what fills the badges --
 * nothing here hard-codes who won.
 */
(function () {
  "use strict";

  var SYSTEMS = ["ascent", "n2m", "purepi05"];
  var DRIFT_S = 0.08;
  var HOLD_MS = 900;

  var root = document.getElementById("compare");
  if (!root) return;
  var chipsEl = root.querySelector(".chips");
  var rowEl = root.querySelector(".cmp-row");
  var noteEl = root.querySelector(".cmp-note");
  if (!chipsEl || !rowEl) return;

  var videos = SYSTEMS.map(function (s) {
    return rowEl.querySelector('.cmp[data-system="' + s + '"] video');
  });
  if (videos.some(function (v) { return !v; })) return;
  var master = videos[0];

  var cells = [];
  var active = -1;
  var watchdog = null;
  var loopTimer = null;
  var visible = false;

  function stop() {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
  }

  function playAll() {
    videos.forEach(function (v) {
      try { v.currentTime = 0; } catch (e) {}
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

  function select(i) {
    if (i < 0 || i >= cells.length) return;
    active = i;
    var cell = cells[i];
    Array.prototype.forEach.call(chipsEl.children, function (c, k) {
      c.classList.toggle("on", k === i);
      c.setAttribute("aria-selected", k === i ? "true" : "false");
    });
    stop();
    var base = "assets/compare/" + cell.dir + "/";
    SYSTEMS.forEach(function (s, k) {
      videos[k].src = base + s + ".mp4";
      videos[k].load();
    });
    if (noteEl) {
      noteEl.textContent = cell.note || "";
    }
    fetch(base + "compare.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m) return;
        SYSTEMS.forEach(function (s, k) {
          var el = rowEl.querySelector('.cmp[data-system="' + s + '"]');
          var info = (m.systems || {})[s] || {};
          badge(el, info.success);
        });
      })
      .catch(function () {});
    var pending = videos.length;
    videos.forEach(function (v) {
      v.addEventListener("loadeddata", function () {
        if (--pending === 0 && visible) playAll();
      }, { once: true });
    });
  }

  fetch("assets/compare/cells.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (list) {
      if (!list || !list.cells || !list.cells.length) {
        root.setAttribute("data-assets", "missing");
        return;
      }
      cells = list.cells;
      cells.forEach(function (c, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.setAttribute("role", "tab");
        b.textContent = c.label || c.dir;
        b.addEventListener("click", function () { select(i); });
        chipsEl.appendChild(b);
      });
      if (!("IntersectionObserver" in window)) { visible = true; select(0); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visible = e.isIntersecting;
          if (visible) {
            if (active < 0) select(0);
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
