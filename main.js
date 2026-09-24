(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  /* Theme toggle */

  var toggle = document.querySelector(".theme-toggle");
  var themeListeners = [];

  function effectiveTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function notifyTheme() {
    themeListeners.forEach(function (fn) { fn(); });
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      notifyTheme();
    });
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notifyTheme);

  /* Scroll reveal and count-up */

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var decimals = parseInt(el.getAttribute("data-decimals"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) return;
    var start = null;
    var duration = 1400;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.innerHTML = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        var num = entry.target.querySelector("[data-count]");
        if (num) countUp(num);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* Canvas helper */

  function fitCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  /* B: live early-warning demo */

  var THRESHOLD = 0.6;
  var WINDOW = 4;
  var HITS = 2;
  var MAX_STEPS = 9;

  var scenarios = [
    {
      tokens: ["START", "city_subway", "concession", "daily", "Cancel", "city_subway", "concession", "daily", "Buy"],
      risk: [0.38, 0.55, 0.66, 0.72, 0.58, 0.69, 0.77, 0.85, 0.9],
      end: "Ended with the wrong ticket. The alert came 5 steps earlier."
    },
    {
      tokens: ["START", "country_trains", "full_fare", "individual", "trip_2", "Buy"],
      risk: [0.38, 0.3, 0.22, 0.16, 0.1, 0.05],
      end: "Completed correctly. No alert, no interruption."
    },
    {
      tokens: ["START", "country_trains", "concession", "Cancel", "country_trains", "full_fare", "individual", "trip_2", "Buy"],
      risk: [0.38, 0.34, 0.64, 0.52, 0.4, 0.3, 0.2, 0.12, 0.06],
      end: "One risky step is not enough. The 2-of-4 rule avoided a false alarm."
    }
  ];

  var panel = document.querySelector(".live-panel");
  if (panel) {
    var canvas = panel.querySelector(".risk-canvas");
    var tokenRow = panel.querySelector(".token-row");
    var status = panel.querySelector(".live-status");
    var state = { s: 0, shown: 0, progress: 1, alertAt: -1, done: false };
    var timer = null;

    function alertStep(risk, upto) {
      for (var t = 0; t < upto; t++) {
        var hits = 0;
        for (var k = Math.max(0, t - WINDOW + 1); k <= t; k++) if (risk[k] > THRESHOLD) hits++;
        if (hits >= HITS) return t;
      }
      return -1;
    }

    function draw() {
      var fit = fitCanvas(canvas);
      var ctx = fit.ctx, w = fit.w, h = fit.h;
      var padL = 34, padR = 10, padT = 24, padB = 24;
      var pw = w - padL - padR, ph = h - padT - padB;
      var sc = scenarios[state.s];
      function X(i) { return padL + (i / (MAX_STEPS - 1)) * pw; }
      function Y(v) { return padT + (1 - v) * ph; }
      var ink = cssVar("--ink"), muted = cssVar("--muted"), grid = cssVar("--grid");
      var blue = cssVar("--blue"), alert = cssVar("--alert"), amber = cssVar("--amber");

      ctx.clearRect(0, 0, w, h);
      ctx.font = "11px Inter, Segoe UI, Arial, sans-serif";
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.fillStyle = muted;
      [0, 0.5, 1].forEach(function (v) {
        ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke();
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(v.toFixed(1), padL - 6, Y(v));
      });
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("risk of failing", padL - 26, 11);
      ctx.textAlign = "right";
      ctx.fillText("step →", w - padR, h - 6);

      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = amber;
      ctx.beginPath(); ctx.moveTo(padL, Y(THRESHOLD)); ctx.lineTo(w - padR, Y(THRESHOLD)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = amber;
      ctx.textAlign = "right";
      ctx.fillText("threshold", w - padR, Y(THRESHOLD) - 6);

      if (state.alertAt >= 0 && state.alertAt < state.shown) {
        var ax = X(state.alertAt);
        ctx.fillStyle = cssVar("--alert-soft");
        ctx.fillRect(ax, padT, w - padR - ax, ph);
        ctx.strokeStyle = alert;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, padT); ctx.lineTo(ax, padT + ph); ctx.stroke();
        ctx.fillStyle = alert;
        ctx.textAlign = "left";
        ctx.font = "700 11px Inter, Segoe UI, Arial, sans-serif";
        ctx.fillText("ALERT", ax + 5, padT + 13);
        ctx.font = "11px Inter, Segoe UI, Arial, sans-serif";
      }

      var n = state.shown;
      if (n > 0) {
        ctx.strokeStyle = blue;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(X(0), Y(sc.risk[0]));
        for (var i = 1; i < n; i++) {
          var p = i === n - 1 ? state.progress : 1;
          var x = X(i - 1) + (X(i) - X(i - 1)) * p;
          var y = Y(sc.risk[i - 1]) + (Y(sc.risk[i]) - Y(sc.risk[i - 1])) * p;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (var j = 0; j < n; j++) {
          if (j === n - 1 && state.progress < 1 && j > 0) break;
          var hot = sc.risk[j] > THRESHOLD;
          ctx.beginPath();
          ctx.arc(X(j), Y(sc.risk[j]), hot ? 4.5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = hot ? alert : cssVar("--panel");
          ctx.fill();
          ctx.strokeStyle = hot ? alert : blue;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.fillStyle = ink;
    }

    function addToken(i) {
      var sc = scenarios[state.s];
      var el = document.createElement("span");
      el.className = "token";
      if (sc.risk[i] > THRESHOLD) el.classList.add("hot");
      if (i === sc.tokens.length - 1 && sc.risk[i] < 0.2) el.classList.add("good");
      el.textContent = sc.tokens[i];
      tokenRow.appendChild(el);
      while (tokenRow.children.length > 7) tokenRow.removeChild(tokenRow.firstChild);
    }

    function setStatus(text, cls) {
      status.textContent = text;
      status.className = "live-status" + (cls ? " " + cls : "");
    }

    function animateSegment(done) {
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        state.progress = Math.min(1, (ts - start) / 420);
        draw();
        if (state.progress < 1) requestAnimationFrame(frame);
        else done();
      }
      requestAnimationFrame(frame);
    }

    function step() {
      var sc = scenarios[state.s];
      if (state.shown >= sc.tokens.length) {
        var fired = state.alertAt >= 0;
        setStatus(sc.end, fired ? "alert" : "ok");
        timer = setTimeout(nextScenario, 3200);
        return;
      }
      addToken(state.shown);
      state.shown += 1;
      state.progress = 0;
      var a = alertStep(sc.risk, state.shown);
      animateSegment(function () {
        if (a >= 0 && state.alertAt < 0) {
          state.alertAt = a;
          draw();
          setStatus("⚠ Alert at step " + (a + 1) + ": offer a hint while the user can still recover.", "alert");
        } else if (state.alertAt < 0) {
          setStatus("Step " + state.shown + ": risk " + sc.risk[state.shown - 1].toFixed(2) + (sc.risk[state.shown - 1] > THRESHOLD ? " (above threshold)" : ""), "");
        }
        timer = setTimeout(step, 700);
      });
    }

    function nextScenario() {
      state.s = (state.s + 1) % scenarios.length;
      startScenario();
    }

    function startScenario() {
      clearTimeout(timer);
      tokenRow.innerHTML = "";
      state.shown = 0;
      state.alertAt = -1;
      state.progress = 1;
      setStatus("Watching a new user…", "");
      draw();
      timer = setTimeout(step, 600);
    }

    function renderStatic() {
      var sc = scenarios[0];
      state.s = 0;
      state.shown = sc.tokens.length;
      state.progress = 1;
      state.alertAt = alertStep(sc.risk, sc.tokens.length);
      tokenRow.innerHTML = "";
      for (var i = 0; i < sc.tokens.length; i++) addToken(i);
      draw();
      setStatus("⚠ Alert at step " + (state.alertAt + 1) + ". " + sc.end, "alert");
    }

    if (reduceMotion) renderStatic();
    else startScenario();

    window.addEventListener("resize", draw);
    themeListeners.push(draw);
    document.addEventListener("visibilitychange", function () {
      if (reduceMotion) return;
      if (document.hidden) clearTimeout(timer);
      else startScenario();
    });
  }

  /* A: "Same click, different moment" beta(t) curve for the daily action */

  var BETA = {
    t: [0,0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08,0.09,0.1,0.11,0.12,0.13,0.14,0.15,0.16,0.17,0.18,0.19,0.2,0.21,0.22,0.23,0.24,0.25,0.26,0.27,0.28,0.29,0.3,0.31,0.32,0.33,0.34,0.35,0.36,0.37,0.38,0.39,0.4,0.41,0.42,0.43,0.44,0.45,0.46,0.47,0.48,0.49,0.5,0.51,0.52,0.53,0.54,0.55,0.56,0.57,0.58,0.59,0.6,0.61,0.62,0.63,0.64,0.65,0.66,0.67,0.68,0.69,0.7,0.71,0.72,0.73,0.74,0.75,0.76,0.77,0.78,0.79,0.8,0.81,0.82,0.83,0.84,0.85,0.86,0.87,0.88,0.89,0.9,0.91,0.92,0.93,0.94,0.95,0.96,0.97,0.98,0.99,1],
    beta: [-0.74,-1.079,-1.38,-1.646,-1.877,-2.074,-2.239,-2.372,-2.476,-2.55,-2.597,-2.618,-2.613,-2.584,-2.533,-2.459,-2.366,-2.253,-2.121,-1.973,-1.809,-1.631,-1.44,-1.236,-1.021,-0.797,-0.564,-0.323,-0.077,0.175,0.43,0.688,0.947,1.206,1.465,1.721,1.974,2.222,2.465,2.7,2.927,3.145,3.353,3.549,3.731,3.9,4.053,4.19,4.309,4.409,4.489,4.548,4.585,4.598,4.59,4.562,4.516,4.454,4.377,4.288,4.188,4.079,3.963,3.842,3.717,3.59,3.464,3.339,3.217,3.101,2.993,2.893,2.802,2.715,2.629,2.538,2.438,2.325,2.195,2.042,1.863,1.652,1.407,1.121,0.791,0.412,-0.024,-0.537,-1.149,-1.882,-2.758,-3.798,-5.025,-6.46,-8.126,-10.045,-12.238,-14.727,-17.534,-20.682,-24.191],
    lo: [-8.642,-8.175,-7.769,-7.368,-7.065,-6.768,-6.497,-6.26,-5.931,-5.7,-5.613,-5.434,-5.255,-5.054,-4.828,-4.554,-4.237,-3.949,-3.641,-3.389,-3.158,-2.858,-2.523,-2.155,-1.869,-1.591,-1.313,-0.987,-0.651,-0.401,-0.091,0.246,0.523,0.776,1.055,1.305,1.589,1.829,2.05,2.265,2.486,2.711,2.917,3.109,3.28,3.426,3.558,3.681,3.809,3.905,3.978,4.031,4.062,4.067,4.038,4.002,3.955,3.894,3.821,3.753,3.675,3.577,3.473,3.364,3.252,3.127,3.004,2.89,2.785,2.697,2.612,2.533,2.442,2.34,2.231,2.117,1.993,1.799,1.6,1.322,1.044,0.642,0.205,-0.272,-0.845,-1.576,-2.313,-3.161,-4.199,-5.39,-6.78,-8.722,-10.871,-13.649,-16.831,-21.011,-25.689,-31.814,-38.469,-46.224],
    hi: [-0.043,-0.451,-0.807,-1.107,-1.331,-1.395,-1.617,-1.769,-1.905,-1.893,-1.894,-1.821,-1.808,-1.65,-1.479,-1.148,-0.905,-0.572,-0.236,0.031,0.302,0.573,0.868,1.169,1.464,1.755,2.038,2.314,2.552,2.804,3.07,3.336,3.605,3.826,4.034,4.277,4.576,4.807,5.044,5.288,5.537,5.823,6.004,6.208,6.426,6.629,6.83,7,7.125,7.246,7.344,7.414,7.427,7.41,7.39,7.36,7.311,7.241,7.119,6.999,6.889,6.749,6.601,6.457,6.306,6.149,5.995,5.823,5.628,5.424,5.205,5.019,4.859,4.726,4.52,4.394,4.269,4.043,3.778,3.493,3.2,2.829,2.416,2.021,1.583,1.097,0.507,-0.2,-0.933,-1.918,-2.888,-4.162,-5.277,-6.561,-7.944,-9.348,-10.771,-12.31,-13.653,-15.061],
    hist: [2, 11, 22, 88, 200, 267, 338, 437, 581, 421]
  };

  var svg = document.querySelector(".beta-svg");
  var slider = document.querySelector(".beta-slider");
  var readout = document.querySelector(".beta-readout");
  if (svg && slider && readout) {
    var NS = "http://www.w3.org/2000/svg";
    var L = 50, R = 536, T = 16, B = 232, HT = 252, HB = 292;
    var YMIN = -9, YMAX = 8;
    function sx(t) { return L + t * (R - L); }
    function sy(v) { return T + (YMAX - Math.max(YMIN, Math.min(YMAX, v))) / (YMAX - YMIN) * (B - T); }
    function el(name, attrs, parent) {
      var node = document.createElementNS(NS, name);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(node);
      return node;
    }
    function pathFrom(ts, vs) {
      return ts.map(function (t, i) { return (i ? "L" : "M") + sx(t).toFixed(1) + " " + sy(vs[i]).toFixed(1); }).join(" ");
    }

    var clip = el("clipPath", { id: "beta-clip" }, el("defs", {}));
    el("rect", { x: L, y: T, width: R - L, height: B - T }, clip);

    [-8, -4, 0, 4, 8].forEach(function (v) {
      el("line", { x1: L, x2: R, y1: sy(v), y2: sy(v), stroke: "var(--grid)", "stroke-width": v === 0 ? 0 : 1 });
      var label = el("text", { x: L - 8, y: sy(v) + 4, "text-anchor": "end" });
      label.textContent = v > 0 ? "+" + v : String(v);
    });
    el("line", { x1: L, x2: R, y1: sy(0), y2: sy(0), stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "4 4" });

    var zoneLabels = [
      { t: 0.14, text: "early" },
      { t: 0.57, text: "comparing prices" },
      { t: 1, text: "final choice", anchor: "end" }
    ];

    var ciT = BETA.hi.map(function (_, i) { return i / (BETA.hi.length - 1); });
    var bandPath = pathFrom(ciT, BETA.hi) + " " + ciT.slice().reverse().map(function (t, i) {
      var v = BETA.lo[BETA.lo.length - 1 - i];
      return "L" + sx(t).toFixed(1) + " " + sy(v).toFixed(1);
    }).join(" ") + " Z";
    var plot = el("g", { "clip-path": "url(#beta-clip)" });
    el("path", { d: bandPath, fill: "var(--band)", stroke: "none" }, plot);

    var curve = el("path", { d: pathFrom(BETA.t, BETA.beta), fill: "none", stroke: "var(--blue)", "stroke-width": 2.6, "stroke-linejoin": "round" }, plot);
    if (!reduceMotion) {
      var len = curve.getTotalLength();
      curve.style.strokeDasharray = len;
      curve.style.strokeDashoffset = len;
      curve.style.transition = "stroke-dashoffset 1.8s ease";
      var drawn = false;
      var cio = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !drawn) {
          drawn = true;
          curve.style.strokeDashoffset = "0";
          cio.disconnect();
        }
      }, { threshold: 0.4 });
      cio.observe(svg);
    }

    var drop = el("text", { x: sx(0.86), y: sy(-7.4), "text-anchor": "end", "class": "drop-label" });
    drop.textContent = "↓ falls to −24 at submission";

    zoneLabels.forEach(function (z) {
      var tx = el("text", { x: sx(z.t), y: T + 14, "text-anchor": z.anchor || "middle" });
      tx.textContent = z.text;
      tx.setAttribute("font-weight", "600");
    });

    var hmax = Math.max.apply(null, BETA.hist);
    BETA.hist.forEach(function (c, i) {
      var h = (c / hmax) * (HB - HT - 4);
      el("rect", { x: sx(i / 10) + 2, y: HB - h, width: (R - L) / 10 - 4, height: h, rx: 2, fill: "var(--grid)" });
    });
    var htxt = el("text", { x: L, y: HB + 18 });
    htxt.textContent = "when students clicked daily (0 = start, 1 = submit)";
    var ylab = el("text", { x: 14, y: (T + B) / 2, "text-anchor": "middle", "class": "y-label", transform: "rotate(-90 14 " + (T + B) / 2 + ")" });
    ylab.textContent = "effect on log-odds";

    var guide = el("line", { y1: T, y2: HB, stroke: "var(--amber)", "stroke-width": 1.5 });
    var dot = el("circle", { r: 7, fill: "var(--panel)", stroke: "var(--amber)", "stroke-width": 3 });

    function interp(t) {
      var i = Math.min(BETA.t.length - 2, Math.floor(t * 100));
      var f = t * 100 - i;
      return BETA.beta[i] + (BETA.beta[i + 1] - BETA.beta[i]) * f;
    }

    function describe(t, b) {
      if (t < 0.29) return "Early in the task, before any prices have been compared. Associated with <span class=\"neg\">lower</span> odds of a correct answer.";
      if (t < 0.86) return "Mid-task: checking the daily price as one step of a comparison. Associated with <span class=\"pos\">higher</span> odds of a correct answer.";
      return "Near submission: the daily ticket is the final pick, and it is the more expensive one. Strongly associated with a <span class=\"neg\">wrong</span> answer.";
    }

    function update(t) {
      var b = interp(t);
      var x = sx(t);
      guide.setAttribute("x1", x);
      guide.setAttribute("x2", x);
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", sy(b));
      dot.setAttribute("stroke", b >= 0 ? "var(--green)" : "var(--alert)");
      readout.innerHTML = "<strong>t = " + t.toFixed(2) + "</strong> &middot; effect " +
        "<span class=\"" + (b >= 0 ? "pos" : "neg") + "\">" + (b >= 0 ? "+" : "−") + Math.abs(b).toFixed(1) + "</span>. " + describe(t, b);
    }

    function fromPointer(evt) {
      var pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var t = Math.max(0, Math.min(1, (p.x - L) / (R - L)));
      slider.value = Math.round(t * 100);
      update(t);
    }

    var dragging = false;
    svg.addEventListener("pointerdown", function (e) { dragging = true; svg.setPointerCapture(e.pointerId); fromPointer(e); });
    svg.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    svg.addEventListener("pointerup", function () { dragging = false; });
    svg.addEventListener("pointercancel", function () { dragging = false; });
    slider.addEventListener("input", function () { update(slider.value / 100); });

    update(slider.value / 100);
  }
})();
