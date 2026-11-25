(() => {
  const SESSIONS_PAYLOAD = window.KULFI_SESSIONS;
  if (!SESSIONS_PAYLOAD || !SESSIONS_PAYLOAD.sessions) return;

  const sessions = SESSIONS_PAYLOAD.sessions;
  let activeSessionIdx = Math.max(0, sessions.reduce((best, s, i) => (s.status === "ready" ? i : best), 0));
  let activeTab = "overview";

  const tooltip = document.getElementById("chart-tooltip");

  const fmtMinSec = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  const toMiB = (kib) => (kib == null ? null : +(kib / 1024).toFixed(2));
  const toGiB = (kib) => (kib == null ? null : +(kib / (1024 * 1024)).toFixed(3));
  const fmtNum = (v, dec = 1) => {
    if (v == null || v === "NA") return "NA";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: dec });
  };

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Scroll reveal observer
  const revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
      }
    }
  }, { threshold: 0.08 });

  function setupReveals() {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.remove("visible");
      revealObserver.observe(el);
    });
  }

  // Render Session Switcher
  function renderSessionSwitcher() {
    const el = document.getElementById("session-switcher");
    el.innerHTML = sessions.map((s, idx) => `
      <button class="session-btn ${idx === activeSessionIdx ? "active" : ""}" data-idx="${idx}" role="tab" aria-selected="${idx === activeSessionIdx}">
        <span class="s-title"><span class="dot ${s.status}"></span>${s.label}</span>
        <span class="s-sub">${s.sublabel}</span>
      </button>
    `).join("");

    el.querySelectorAll(".session-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSessionIdx = Number(btn.dataset.idx);
        renderAll();
      });
    });
  }

  // Tab Switcher
  document.querySelectorAll("#tab-switcher .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll("#tab-switcher .tab-btn").forEach((b) => {
        const isAct = b.dataset.tab === activeTab;
        b.classList.toggle("active", isAct);
        b.setAttribute("aria-selected", String(isAct));
      });
      renderActiveViews();
    });
  });

  function renderActiveViews() {
    const sess = sessions[activeSessionIdx];
    const ov = document.getElementById("view-overview");
    const ex = document.getElementById("view-extra");
    const gm = document.getElementById("view-gmemory");
    const pend = document.getElementById("view-pending");

    if (!sess || sess.status !== "ready" || !sess.data) {
      ov.classList.remove("active");
      ex.classList.remove("active");
      if (gm) gm.classList.remove("active");
      pend.hidden = false;
      document.getElementById("pending-title").textContent = `${sess.label} — Pending Manual Test`;
      return;
    }

    pend.hidden = true;
    ov.classList.toggle("active", activeTab === "overview");
    ex.classList.toggle("active", activeTab === "extra");
    if (gm) gm.classList.toggle("active", activeTab === "gmemory");

    if (activeTab === "overview" || activeTab === "extra" || activeTab === "gmemory") {
      // Trigger redraw on visible canvases
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
  }

  // Reusable Horizontal Scroll-Zoom + Left/Right (< >) Pan Controller
  function attachZoomControls(canvas, state, getPlotBounds, onRedraw) {
    const wrap = canvas.parentElement;
    wrap.querySelectorAll(".chart-pan-btn, .chart-zoom-bar").forEach((el) => el.remove());

    const btnLeft = document.createElement("button");
    btnLeft.className = "chart-pan-btn left";
    btnLeft.type = "button";
    btnLeft.title = "Pan Left";
    btnLeft.innerHTML = "&lt;";
    btnLeft.hidden = true;

    const btnRight = document.createElement("button");
    btnRight.className = "chart-pan-btn right";
    btnRight.type = "button";
    btnRight.title = "Pan Right";
    btnRight.innerHTML = "&gt;";
    btnRight.hidden = true;

    const zoomBar = document.createElement("div");
    zoomBar.className = "chart-zoom-bar";
    zoomBar.hidden = true;
    zoomBar.innerHTML = `<span class="zoom-label">1.0x</span><button type="button" class="chart-zoom-reset">Reset</button>`;

    wrap.appendChild(btnLeft);
    wrap.appendChild(btnRight);
    wrap.appendChild(zoomBar);

    const syncUI = () => {
      const span = state.viewEnd - state.viewStart;
      const zoomed = span < 0.995;
      btnLeft.hidden = !zoomed;
      btnRight.hidden = !zoomed;
      zoomBar.hidden = !zoomed;
      if (zoomed) {
        btnLeft.disabled = state.viewStart <= 0.001;
        btnRight.disabled = state.viewEnd >= 0.999;
        zoomBar.querySelector(".zoom-label").textContent = `${(1 / span).toFixed(1)}x`;
      }
    };

    const panBy = (dir) => {
      const span = state.viewEnd - state.viewStart;
      const step = span * 0.28 * dir;
      let ns = state.viewStart + step;
      let ne = state.viewEnd + step;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= (ne - 1); ne = 1; }
      state.viewStart = Math.max(0, ns);
      state.viewEnd = Math.min(1, ne);
      syncUI();
      onRedraw();
    };

    btnLeft.addEventListener("click", () => panBy(-1));
    btnRight.addEventListener("click", () => panBy(1));
    zoomBar.querySelector(".chart-zoom-reset").addEventListener("click", () => {
      state.viewStart = 0;
      state.viewEnd = 1;
      syncUI();
      onRedraw();
    });

    canvas.addEventListener("dblclick", () => {
      state.viewStart = 0;
      state.viewEnd = 1;
      syncUI();
      onRedraw();
    });

    canvas.addEventListener("wheel", (e) => {
      const b = getPlotBounds();
      if (!b) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < b.left || mx > rect.width - b.right) return;
      e.preventDefault();

      const ratio = Math.max(0, Math.min(1, (mx - b.left) / b.plotW));
      const span = state.viewEnd - state.viewStart;
      const factor = e.deltaY < 0 ? 0.78 : 1.28;
      const newSpan = Math.max(0.03, Math.min(1, span * factor));
      const anchor = state.viewStart + ratio * span;
      let ns = anchor - ratio * newSpan;
      let ne = ns + newSpan;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= (ne - 1); ne = 1; }
      state.viewStart = Math.max(0, ns);
      state.viewEnd = Math.min(1, ne);
      syncUI();
      onRedraw();
    }, { passive: false });

    syncUI();
  }

  // Time-Series Chart (Gradient Area / Smooth Line / Staircase Step-Line)
  function createTimeChart({ canvasId, legendId, series, yLabel, stepped = false, fill = true, refLines = [] }) {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    const ctx = canvas.getContext("2d");
    const state = { hidden: new Set(), hoverX: null, viewStart: 0, viewEnd: 1 };

    legendEl.innerHTML = series.map((s, idx) => `
      <div class="legend-item" data-idx="${idx}">
        <span class="legend-swatch" style="background:${s.color}"></span>
        <span>${s.label}</span>
      </div>
    `).join("");

    legendEl.querySelectorAll(".legend-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = Number(item.dataset.idx);
        if (state.hidden.has(idx)) {
          state.hidden.delete(idx);
          item.classList.remove("muted");
        } else {
          state.hidden.add(idx);
          item.classList.add("muted");
        }
        draw();
      });
    });

    function draw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width < 50) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const pad = { top: 18, right: 20, bottom: 36, left: 66 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      ctx.clearRect(0, 0, W, H);

      let minT = Infinity, maxT = -Infinity;
      let minY = 0, maxY = -Infinity;

      series.forEach((s, idx) => {
        if (state.hidden.has(idx)) return;
        for (const pt of s.data) {
          if (pt.x < minT) minT = pt.x;
          if (pt.x > maxT) maxT = pt.x;
          if (pt.y != null && pt.y > maxY) maxY = pt.y;
        }
      });

      for (const rl of refLines) {
        if (rl.y > maxY) maxY = rl.y;
      }
      if (!Number.isFinite(minT) || !Number.isFinite(maxY)) {
        minT = 0; maxT = 1; maxY = 100;
      }
      minT = 0;
      if (maxT <= 1800000 && maxT > 1200000) maxT = 1800000;
      const fullMinT = minT;
      const fullMaxT = maxT;
      minT = fullMinT + state.viewStart * (fullMaxT - fullMinT);
      maxT = fullMinT + state.viewEnd * (fullMaxT - fullMinT);
      if (maxY <= minY) maxY = minY + 10;
      maxY *= 1.08;

      const xScale = (t) => pad.left + ((t - minT) / Math.max(1, maxT - minT)) * plotW;
      const yScale = (y) => pad.top + plotH - ((y - minY) / Math.max(1e-6, maxY - minY)) * plotH;

      // Grid
      ctx.font = "11px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 5; i++) {
        const v = minY + (maxY - minY) * (i / 5);
        const py = yScale(v);
        ctx.strokeStyle = i === 0 ? "#cbd5e1" : "#f1f5f9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(W - pad.right, py);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.fillText(v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1), pad.left - 8, py);
      }

      ctx.save();
      ctx.translate(15, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.font = "700 11px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xTickCount = maxT === 1800000 ? 6 : 8;
      for (let i = 0; i <= xTickCount; i++) {
        const t = minT + (maxT - minT) * (i / xTickCount);
        const px = xScale(t);
        ctx.strokeStyle = "#f1f5f9";
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.fillText(fmtMinSec(t), px, pad.top + plotH + 8);
      }

      for (const rl of refLines) {
        const py = yScale(rl.y);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = rl.color || "#94a3b8";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(W - pad.right, py);
        ctx.stroke();
        ctx.fillStyle = rl.color || "#64748b";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(rl.label, pad.left + 8, py - 3);
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();

      series.forEach((s, idx) => {
        if (state.hidden.has(idx)) return;
        const segments = [];
        let cur = [];
        for (const pt of s.data) {
          if (pt.y == null) {
            if (cur.length) { segments.push(cur); cur = []; }
          } else {
            cur.push({ px: xScale(pt.x), py: yScale(pt.y) });
          }
        }
        if (cur.length) segments.push(cur);

        for (const seg of segments) {
          if (fill && seg.length > 1) {
            const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
            grad.addColorStop(0, hexToRgba(s.color, 0.22));
            grad.addColorStop(1, hexToRgba(s.color, 0.01));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(seg[0].px, pad.top + plotH);
            ctx.lineTo(seg[0].px, seg[0].py);
            for (let i = 1; i < seg.length; i++) {
              if (stepped) {
                ctx.lineTo(seg[i].px, seg[i - 1].py);
              }
              ctx.lineTo(seg[i].px, seg[i].py);
            }
            ctx.lineTo(seg[seg.length - 1].px, pad.top + plotH);
            ctx.closePath();
            ctx.fill();
          }

          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width || 2.2;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(seg[0].px, seg[0].py);
          for (let i = 1; i < seg.length; i++) {
            if (stepped) {
              ctx.lineTo(seg[i].px, seg[i - 1].py);
            }
            ctx.lineTo(seg[i].px, seg[i].py);
          }
          ctx.stroke();

          if (s.points) {
            ctx.fillStyle = s.color;
            for (const p of seg) {
              if (p.px < pad.left - 6 || p.px > W - pad.right + 6) continue;
              ctx.beginPath();
              ctx.arc(p.px, p.py, 3.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });

      ctx.restore();

      if (state.hoverX != null && state.hoverX >= pad.left && state.hoverX <= W - pad.right) {
        ctx.save();
        ctx.strokeStyle = "#e11d48";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(state.hoverX, pad.top);
        ctx.lineTo(state.hoverX, pad.top + plotH);
        ctx.stroke();
        ctx.restore();
      }

      canvas._meta = { pad, plotW, plotH, minT, maxT };
    }

    canvas.onmousemove = (e) => {
      const m = canvas._meta;
      if (!m) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < m.pad.left || mx > rect.width - m.pad.right) {
        state.hoverX = null;
        tooltip.hidden = true;
        draw();
        return;
      }
      state.hoverX = mx;
      const targetT = m.minT + ((mx - m.pad.left) / m.plotW) * (m.maxT - m.minT);
      const rows = [];
      let matchedT = targetT;

      series.forEach((s, idx) => {
        if (state.hidden.has(idx) || !s.data.length) return;
        let best = null, bestD = Infinity;
        for (const pt of s.data) {
          const d = Math.abs(pt.x - targetT);
          if (d < bestD) { bestD = d; best = pt; }
        }
        if (best && bestD < 25000) {
          matchedT = best.x;
          rows.push({
            label: s.label,
            color: s.color,
            val: best.y == null ? "NA" : `${best.y.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${s.unit || ""}`
          });
        }
      });

      if (rows.length) {
        tooltip.innerHTML = `<div class="tooltip-title">Elapsed: ${fmtMinSec(matchedT)}</div>` +
          rows.map((r) => `<div class="tooltip-row"><span class="tooltip-name"><span class="legend-swatch" style="background:${r.color}"></span>${r.label}</span><strong>${r.val}</strong></div>`).join("");
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(window.innerWidth - 240, e.clientX + 14)}px`;
        tooltip.style.top = `${Math.min(window.innerHeight - 170, e.clientY + 14)}px`;
      } else {
        tooltip.hidden = true;
      }
      draw();
    };

    canvas.onmouseleave = () => {
      state.hoverX = null;
      tooltip.hidden = true;
      draw();
    };

    attachZoomControls(canvas, state, () => (canvas._meta ? { left: canvas._meta.pad.left, right: canvas._meta.pad.right, plotW: canvas._meta.plotW } : null), draw);
    window.addEventListener("resize", draw);
    draw();
  }
  function createPieChart({ canvasId, breakdownId, items, centerLabel = "Total", unit = "MiB" }) {
    const canvas = document.getElementById(canvasId);
    const breakdownEl = document.getElementById(breakdownId);
    if (!canvas || !breakdownEl) return;
    const ctx = canvas.getContext("2d");
    const valid = items.filter((it) => it.value != null && it.value > 0);
    const total = valid.reduce((acc, it) => acc + it.value, 0);
    let hoverIdx = -1;

    const slices = [];
    let angle = -Math.PI / 2;
    for (const it of valid) {
      const frac = total > 0 ? it.value / total : 0;
      const sweep = frac * Math.PI * 2;
      slices.push({ ...it, frac, start: angle, end: angle + sweep });
      angle += sweep;
    }

    breakdownEl.innerHTML = slices.length
      ? slices.map((s, idx) => `
          <div class="pie-row" data-idx="${idx}">
            <span class="pie-row-left">
              <span class="legend-swatch" style="background:${s.color}"></span>
              <span>${s.label}</span>
            </span>
            <span class="pie-row-right"><strong>${fmtNum(s.value, 1)} ${unit}</strong> (${(s.frac * 100).toFixed(1)}%)</span>
          </div>
        `).join("")
      : `<p class="card-desc">No non-zero breakdown data available for this session.</p>`;

    const syncRowHighlight = () => {
      breakdownEl.querySelectorAll(".pie-row").forEach((row) => {
        row.classList.toggle("active", Number(row.dataset.idx) === hoverIdx);
      });
    };

    breakdownEl.querySelectorAll(".pie-row").forEach((row) => {
      row.addEventListener("mouseenter", () => { hoverIdx = Number(row.dataset.idx); syncRowHighlight(); draw(); });
      row.addEventListener("mouseleave", () => { hoverIdx = -1; syncRowHighlight(); draw(); });
    });

    function draw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width < 40) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const cx = W / 2;
      const cy = H / 2;
      const outerR = Math.min(W, H) / 2 - 12;
      const innerR = outerR * 0.56;

      ctx.clearRect(0, 0, W, H);

      if (!slices.length || total <= 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No Data", cx, cy);
        return;
      }

      slices.forEach((s, idx) => {
        const isHov = idx === hoverIdx;
        const rOut = isHov ? outerR + 6 : outerR;
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, s.start, s.end);
        ctx.arc(cx, cy, innerR, s.end, s.start, true);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      const activeSlice = hoverIdx >= 0 ? slices[hoverIdx] : null;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#64748b";
      ctx.font = "700 10.5px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(activeSlice ? activeSlice.label : centerLabel, cx, cy - 11);

      ctx.fillStyle = "#0f172a";
      ctx.font = "700 17px 'Space Grotesk', sans-serif";
      const valText = activeSlice ? `${fmtNum(activeSlice.value, 1)} ${unit}` : `${fmtNum(total, 0)} ${unit}`;
      ctx.fillText(valText, cx, cy + 8);

      if (activeSlice) {
        ctx.fillStyle = "#e11d48";
        ctx.font = "700 11px 'JetBrains Mono', monospace";
        ctx.fillText(`${(activeSlice.frac * 100).toFixed(1)}%`, cx, cy + 25);
      }
    }

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - rect.width / 2;
      const dy = e.clientY - rect.top - rect.height / 2;
      const dist = Math.hypot(dx, dy);
      const outerR = Math.min(rect.width, rect.height) / 2 - 12;
      const innerR = outerR * 0.56;

      if (dist < innerR || dist > outerR + 8) {
        hoverIdx = -1;
        tooltip.hidden = true;
        syncRowHighlight();
        draw();
        return;
      }

      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const found = slices.findIndex((s) => a >= s.start && a <= s.end);
      hoverIdx = found;
      syncRowHighlight();

      if (found >= 0) {
        const s = slices[found];
        tooltip.innerHTML = `<div class="tooltip-title">${s.label}</div>` +
          `<div class="tooltip-row"><span>Size</span><strong>${fmtNum(s.value, 1)} ${unit}</strong></div>` +
          `<div class="tooltip-row"><span>Share</span><strong>${(s.frac * 100).toFixed(1)}%</strong></div>`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(window.innerWidth - 220, e.clientX + 14)}px`;
        tooltip.style.top = `${Math.min(window.innerHeight - 130, e.clientY + 14)}px`;
      } else {
        tooltip.hidden = true;
      }
      draw();
    };

    canvas.onmouseleave = () => {
      hoverIdx = -1;
      tooltip.hidden = true;
      syncRowHighlight();
      draw();
    };

    window.addEventListener("resize", draw);
    draw();
  }

  // Grouped Bar Chart Renderer
  function createBarChart({ canvasId, legendId, categories, series, yLabel, refLines = [] }) {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    const ctx = canvas.getContext("2d");
    const state = { hidden: new Set(), hoverCat: -1, viewStart: 0, viewEnd: 1 };

    legendEl.innerHTML = series.map((s, idx) => `
      <div class="legend-item" data-idx="${idx}">
        <span class="legend-swatch" style="background:${s.color}"></span>
        <span>${s.label}</span>
      </div>
    `).join("");

    legendEl.querySelectorAll(".legend-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = Number(item.dataset.idx);
        if (state.hidden.has(idx)) { state.hidden.delete(idx); item.classList.remove("muted"); }
        else { state.hidden.add(idx); item.classList.add("muted"); }
        draw();
      });
    });

    function draw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width < 50) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const pad = { top: 20, right: 20, bottom: 44, left: 66 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      ctx.clearRect(0, 0, W, H);

      let maxY = 10;
      const visibleSeries = series.filter((_, idx) => !state.hidden.has(idx));
      for (const s of visibleSeries) {
        for (const v of s.values) {
          if (v != null && v > maxY) maxY = v;
        }
      }
      for (const rl of refLines) {
        if (rl.y > maxY) maxY = rl.y;
      }
      maxY *= 1.1;

      const yScale = (y) => pad.top + plotH - (y / maxY) * plotH;

      ctx.font = "11px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 5; i++) {
        const v = maxY * (i / 5);
        const py = yScale(v);
        ctx.strokeStyle = i === 0 ? "#cbd5e1" : "#f1f5f9";
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(W - pad.right, py);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.fillText(v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1), pad.left - 8, py);
      }

      ctx.save();
      ctx.translate(15, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.font = "700 11px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();

      const totalCats = Math.max(1, categories.length);
      const visStart = Math.max(0, Math.min(totalCats - 1, Math.floor(state.viewStart * totalCats)));
      const visEnd = Math.max(visStart + 1, Math.min(totalCats, Math.ceil(state.viewEnd * totalCats)));
      const catCount = visEnd - visStart;
      const groupW = plotW / catCount;
      const barAreaW = groupW * 0.72;
      const barW = Math.max(2, Math.min(28, barAreaW / Math.max(1, visibleSeries.length)));

      for (let vi = 0; vi < catCount; vi++) {
        const ci = visStart + vi;
        const cat = categories[ci];
        const gx = pad.left + vi * groupW;
        if (ci === state.hoverCat) {
          ctx.fillStyle = "rgba(225, 29, 72, 0.06)";
          ctx.fillRect(gx, pad.top, groupW, plotH);
        }

        const totalBarsW = visibleSeries.length * barW;
        const startX = gx + (groupW - totalBarsW) / 2;

        visibleSeries.forEach((s, si) => {
          const val = s.values[ci];
          if (val == null) return;
          const bx = startX + si * barW;
          const by = yScale(val);
          const bh = pad.top + plotH - by;

          const grad = ctx.createLinearGradient(0, by, 0, pad.top + plotH);
          grad.addColorStop(0, s.color);
          grad.addColorStop(1, hexToRgba(s.color, 0.65));
          ctx.fillStyle = grad;

          const r = Math.min(4, barW / 2, bh);
          ctx.beginPath();
          ctx.moveTo(bx, pad.top + plotH);
          ctx.lineTo(bx, by + r);
          ctx.quadraticCurveTo(bx, by, bx + r, by);
          ctx.lineTo(bx + barW - r, by);
          ctx.quadraticCurveTo(bx + barW, by, bx + barW, by + r);
          ctx.lineTo(bx + barW, pad.top + plotH);
          ctx.closePath();
          ctx.fill();
        });

        // X label (thin out if many categories)
        const step = catCount > 16 ? Math.ceil(catCount / 10) : 1;
        if (vi % step === 0) {
          ctx.fillStyle = "#64748b";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(cat, gx + groupW / 2, pad.top + plotH + 10);
        }
      }

      for (const rl of refLines) {
        const py = yScale(rl.y);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = rl.color || "#94a3b8";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(W - pad.right, py);
        ctx.stroke();
        ctx.fillStyle = rl.color || "#64748b";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(rl.label, pad.left + 8, py - 3);
        ctx.restore();
      }

      canvas._barMeta = { pad, plotW, groupW, catCount, visStart };
    }

    canvas.onmousemove = (e) => {
      const m = canvas._barMeta;
      if (!m) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < m.pad.left || mx > rect.width - m.pad.right) {
        state.hoverCat = -1;
        tooltip.hidden = true;
        draw();
        return;
      }
      const vi = Math.min(m.catCount - 1, Math.max(0, Math.floor((mx - m.pad.left) / m.groupW)));
      const ci = m.visStart + vi;
      state.hoverCat = ci;
      const rows = series
        .filter((_, idx) => !state.hidden.has(idx))
        .map((s) => ({
          label: s.label,
          color: s.color,
          val: s.values[ci] == null ? "NA" : `${s.values[ci].toLocaleString(undefined, { maximumFractionDigits: 2 })} ${s.unit || ""}`
        }));

      tooltip.innerHTML = `<div class="tooltip-title">${categories[ci]}</div>` +
        rows.map((r) => `<div class="tooltip-row"><span class="tooltip-name"><span class="legend-swatch" style="background:${r.color}"></span>${r.label}</span><strong>${r.val}</strong></div>`).join("");
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(window.innerWidth - 240, e.clientX + 14)}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 170, e.clientY + 14)}px`;
      draw();
    };

    canvas.onmouseleave = () => {
      state.hoverCat = -1;
      tooltip.hidden = true;
      draw();
    };

    attachZoomControls(canvas, state, () => (canvas._meta ? { left: canvas._meta.pad.left, right: canvas._meta.pad.right, plotW: canvas._meta.plotW } : null), draw);
    window.addEventListener("resize", draw);
    draw();
  }
  function createPieChart({ canvasId, breakdownId, items, centerLabel = "Total", unit = "MiB" }) {
    const canvas = document.getElementById(canvasId);
    const breakdownEl = document.getElementById(breakdownId);
    if (!canvas || !breakdownEl) return;
    const ctx = canvas.getContext("2d");
    const valid = items.filter((it) => it.value != null && it.value > 0);
    const total = valid.reduce((acc, it) => acc + it.value, 0);
    let hoverIdx = -1;

    const slices = [];
    let angle = -Math.PI / 2;
    for (const it of valid) {
      const frac = total > 0 ? it.value / total : 0;
      const sweep = frac * Math.PI * 2;
      slices.push({ ...it, frac, start: angle, end: angle + sweep });
      angle += sweep;
    }

    breakdownEl.innerHTML = slices.length
      ? slices.map((s, idx) => `
          <div class="pie-row" data-idx="${idx}">
            <span class="pie-row-left">
              <span class="legend-swatch" style="background:${s.color}"></span>
              <span>${s.label}</span>
            </span>
            <span class="pie-row-right"><strong>${fmtNum(s.value, 1)} ${unit}</strong> (${(s.frac * 100).toFixed(1)}%)</span>
          </div>
        `).join("")
      : `<p class="card-desc">No non-zero breakdown data available for this session.</p>`;

    const syncRowHighlight = () => {
      breakdownEl.querySelectorAll(".pie-row").forEach((row) => {
        row.classList.toggle("active", Number(row.dataset.idx) === hoverIdx);
      });
    };

    breakdownEl.querySelectorAll(".pie-row").forEach((row) => {
      row.addEventListener("mouseenter", () => { hoverIdx = Number(row.dataset.idx); syncRowHighlight(); draw(); });
      row.addEventListener("mouseleave", () => { hoverIdx = -1; syncRowHighlight(); draw(); });
    });

    function draw() {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width < 40) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const cx = W / 2;
      const cy = H / 2;
      const outerR = Math.min(W, H) / 2 - 12;
      const innerR = outerR * 0.56;

      ctx.clearRect(0, 0, W, H);

      if (!slices.length || total <= 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No Data", cx, cy);
        return;
      }

      slices.forEach((s, idx) => {
        const isHov = idx === hoverIdx;
        const rOut = isHov ? outerR + 6 : outerR;
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, s.start, s.end);
        ctx.arc(cx, cy, innerR, s.end, s.start, true);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      const activeSlice = hoverIdx >= 0 ? slices[hoverIdx] : null;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#64748b";
      ctx.font = "700 10.5px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(activeSlice ? activeSlice.label : centerLabel, cx, cy - 11);

      ctx.fillStyle = "#0f172a";
      ctx.font = "700 17px 'Space Grotesk', sans-serif";
      const valText = activeSlice ? `${fmtNum(activeSlice.value, 1)} ${unit}` : `${fmtNum(total, 0)} ${unit}`;
      ctx.fillText(valText, cx, cy + 8);

      if (activeSlice) {
        ctx.fillStyle = "#e11d48";
        ctx.font = "700 11px 'JetBrains Mono', monospace";
        ctx.fillText(`${(activeSlice.frac * 100).toFixed(1)}%`, cx, cy + 25);
      }
    }

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - rect.width / 2;
      const dy = e.clientY - rect.top - rect.height / 2;
      const dist = Math.hypot(dx, dy);
      const outerR = Math.min(rect.width, rect.height) / 2 - 12;
      const innerR = outerR * 0.56;

      if (dist < innerR || dist > outerR + 8) {
        hoverIdx = -1;
        tooltip.hidden = true;
        syncRowHighlight();
        draw();
        return;
      }

      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const found = slices.findIndex((s) => a >= s.start && a <= s.end);
      hoverIdx = found;
      syncRowHighlight();

      if (found >= 0) {
        const s = slices[found];
        tooltip.innerHTML = `<div class="tooltip-title">${s.label}</div>` +
          `<div class="tooltip-row"><span>Size</span><strong>${fmtNum(s.value, 1)} ${unit}</strong></div>` +
          `<div class="tooltip-row"><span>Share</span><strong>${(s.frac * 100).toFixed(1)}%</strong></div>`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(window.innerWidth - 220, e.clientX + 14)}px`;
        tooltip.style.top = `${Math.min(window.innerHeight - 130, e.clientY + 14)}px`;
      } else {
        tooltip.hidden = true;
      }
      draw();
    };

    canvas.onmouseleave = () => {
      hoverIdx = -1;
      tooltip.hidden = true;
      syncRowHighlight();
      draw();
    };

    window.addEventListener("resize", draw);
    draw();
  }

  function renderSessionData(DATA) {
    const summaryMap = new Map();
    for (const r of DATA.summary) {
      summaryMap.set(`${r.source_file}:${r.metric_name}`, r);
    }
    const getStat = (src, name) => summaryMap.get(`${src}:${name}`) || null;

    const meta = DATA.metadata;
    const mon = meta.monitoring;
    const dev = meta.device;

    document.getElementById("hero-subtitle").textContent =
      `${meta.package_name} v${meta.application_version_name} (build ${meta.application_version_code}) • ${dev.manufacturer.toUpperCase()} ${dev.model} • Android ${dev.android_version} (SDK ${dev.sdk_version}) • ${dev.display_refresh_rate_hz} Hz`;

    document.getElementById("hero-meta").innerHTML = [
      { k: "Duration", v: `${(mon.duration_ms / 60000).toFixed(1)} min` },
      { k: "Samples", v: `${mon.total_successful_samples.toLocaleString()} ok / ${mon.total_failed_samples} fail` },
      { k: "Battery", v: `${dev.battery_level_percent}% (${(Number(dev.battery_temperature_tenths_c) / 10).toFixed(1)} °C)` }
    ].map((p) => `<div class="meta-pill"><strong>${p.k}</strong>${p.v}</div>`).join("");

    // Symmetrical 4x2 (8-card) KPI Grid
    const pssS = getStat("memory.csv", "total_pss_kib");
    const swapPssS = getStat("memory.csv", "swap_pss_kib");
    const ramPssVals = DATA.memory
      .filter((r) => r.total_pss_kib != null)
      .map((r) => r.total_pss_kib - (r.swap_pss_kib || 0));
    const ramPssMax = ramPssVals.length ? Math.max(...ramPssVals) : pssS.max;
    const ramPssMean = ramPssVals.length ? ramPssVals.reduce((a, b) => a + b, 0) / ramPssVals.length : pssS.mean;
    const ramPssNet = ramPssVals.length ? ramPssVals[ramPssVals.length - 1] - ramPssVals[0] : pssS.net_change;

    const rssS = getStat("memory.csv", "total_rss_kib");
    const gfxS = getStat("graphics_memory.csv", "graphics_memory_kib");
    const natS = getStat("native_heap.csv", "native_heap_allocated_kib");
    const javS = getStat("java_heap.csv", "java_heap_allocated_kib");
    const fpsS = getStat("graphics_frames.csv", "sf_fps_estimate");
    const latS = getStat("graphics_frames.csv", "sf_frame_p95_ms");
    const ramS = getStat("device_memory.csv", "device_available_ram_kib");

    const kpis = [
      { label: "Peak RAM PSS", value: `${(ramPssMax / 1024).toFixed(0)} MiB`, sub: `Mean ${(ramPssMean / 1024).toFixed(0)} MiB • Net +${(ramPssNet / 1024).toFixed(0)} MiB` },
      { label: "Peak Total RSS", value: `${(rssS.max / 1024).toFixed(0)} MiB`, sub: `Mean ${(rssS.mean / 1024).toFixed(0)} MiB • P95 ${(rssS.p95 / 1024).toFixed(0)} MiB` },
      { label: "Peak Graphics Mem", value: `${(gfxS.max / 1024).toFixed(0)} MiB`, sub: `Mean ${(gfxS.mean / 1024).toFixed(0)} MiB • GL/EGL mtrack` },
      { label: "Peak Native Alloc", value: `${(natS.max / 1024).toFixed(1)} MiB`, sub: `Mean ${(natS.mean / 1024).toFixed(1)} MiB • P95 ${(natS.p95 / 1024).toFixed(1)} MiB` },
      { label: "Peak Java Alloc", value: `${(javS.max / 1024).toFixed(1)} MiB`, sub: `Mean ${(javS.mean / 1024).toFixed(1)} MiB • Min ${(javS.min / 1024).toFixed(1)} MiB` },
      { label: "SurfaceFlinger FPS", value: `${Number(fpsS.median).toFixed(1)} FPS`, sub: `Median (${fpsS.valid_count} windows) • Min ${Number(fpsS.min).toFixed(1)}` },
      { label: "Frame Latency P95", value: `${Number(latS.median).toFixed(2)} ms`, sub: `Median P95 • Max ${Number(latS.max).toFixed(1)} ms` },
      { label: "Device Avail RAM", value: `${(ramS.min / (1024 * 1024)).toFixed(2)} GiB`, sub: `Min observed • Mean ${(ramS.mean / (1024 * 1024)).toFixed(2)} GiB` }
    ];
    document.getElementById("kpi-grid").innerHTML = kpis.map((k, i) => `
      <div class="kpi-card" style="animation-delay:${i * 45}ms">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join("");

    const setChips = (id, chips) => {
      document.getElementById(id).innerHTML = chips.map((c) =>
        `<div class="stat-chip"><span>${c.k}</span>${c.v}</div>`
      ).join("");
    };

    // 1. App Memory (Area + Line: RAM-only PSS, Total RSS, Swap PSS, Process VmRSS)
    setChips("stats-app-memory", [
      { k: "RAM PSS Max", v: `${(ramPssMax / 1024).toFixed(0)} MiB` },
      { k: "RAM PSS Mean", v: `${(ramPssMean / 1024).toFixed(0)} MiB` },
      { k: "RSS Max", v: `${(rssS.max / 1024).toFixed(0)} MiB` },
      { k: "Swap PSS Max", v: `${((swapPssS?.max || 0) / 1024).toFixed(0)} MiB` }
    ]);
    createTimeChart({
      canvasId: "chart-app-memory",
      legendId: "legend-app-memory",
      yLabel: "Memory (MiB)",
      fill: true,
      series: [
        { label: "RAM PSS (dumpsys)", color: "#e11d48", unit: "MiB", data: DATA.memory.map((r) => ({ x: r.elapsed_ms, y: r.total_pss_kib == null ? null : toMiB(r.total_pss_kib - (r.swap_pss_kib || 0)) })) },
        { label: "Total RSS (dumpsys)", color: "#0ea5e9", unit: "MiB", data: DATA.memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.total_rss_kib) })) },
        { label: "Swap PSS (zRAM)", color: "#f59e0b", width: 2.0, unit: "MiB", data: DATA.memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.swap_pss_kib) })) },
        { label: "Process VmRSS (/proc)", color: "#64748b", width: 1.6, unit: "MiB", data: DATA.process.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.rss_kib) })) }
      ]
    });

    // 2. PSS Composition (Grouped Bar Chart)
    const pssCats = [
      { label: "Graphics", key: "graphics_pss_kib" },
      { label: "System", key: "system_pss_kib" },
      { label: "Priv Other", key: "private_other_pss_kib" },
      { label: "Native Heap", key: "native_heap_pss_kib" },
      { label: "Code", key: "code_pss_kib" },
      { label: "Java Heap", key: "java_heap_pss_kib" },
      { label: "Stack", key: "stack_pss_kib" }
    ];
    setChips("stats-pss-bar", [
      { k: "Top Category", v: "Graphics" },
      { k: "Graphics Peak", v: `${(gfxS.max / 1024).toFixed(0)} MiB` }
    ]);
    createBarChart({
      canvasId: "chart-pss-bar",
      legendId: "legend-pss-bar",
      yLabel: "PSS (MiB)",
      categories: pssCats.map((c) => c.label),
      series: [
        { label: "Mean PSS", color: "#4f46e5", unit: "MiB", values: pssCats.map((c) => toMiB(getStat("memory.csv", c.key)?.mean)) },
        { label: "Peak PSS", color: "#e11d48", unit: "MiB", values: pssCats.map((c) => toMiB(getStat("memory.csv", c.key)?.max)) }
      ]
    });

    // 3. Native vs Java Heap
    setChips("stats-heaps", [
      { k: "Native Alloc Max", v: `${(natS.max / 1024).toFixed(1)} MiB` },
      { k: "Java Alloc Max", v: `${(javS.max / 1024).toFixed(1)} MiB` }
    ]);
    createTimeChart({
      canvasId: "chart-heaps",
      legendId: "legend-heaps",
      yLabel: "Heap (MiB)",
      fill: true,
      series: [
        { label: "Native Heap Size", color: "#f59e0b", width: 1.6, unit: "MiB", data: DATA.native_heap.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.native_heap_size_kib) })) },
        { label: "Native Heap Allocated", color: "#e11d48", width: 2.3, unit: "MiB", data: DATA.native_heap.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.native_heap_allocated_kib) })) },
        { label: "Java Heap Size", color: "#06b6d4", width: 1.6, unit: "MiB", data: DATA.java_heap.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.java_heap_size_kib) })) },
        { label: "Java Heap Allocated", color: "#4f46e5", width: 2.3, unit: "MiB", data: DATA.java_heap.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.java_heap_allocated_kib) })) }
      ]
    });

    // 4. Graphics Memory
    const glS = getStat("graphics_memory.csv", "gl_mtrack_pss_kib");
    const eglS = getStat("graphics_memory.csv", "egl_mtrack_pss_kib");
    setChips("stats-graphics-mem", [
      { k: "Graphics Max", v: `${(gfxS.max / 1024).toFixed(0)} MiB` },
      { k: "GL mtrack Max", v: `${(glS.max / 1024).toFixed(0)} MiB` },
      { k: "EGL mtrack Max", v: `${(eglS.max / 1024).toFixed(0)} MiB` }
    ]);
    createTimeChart({
      canvasId: "chart-graphics-mem",
      legendId: "legend-graphics-mem",
      yLabel: "Memory (MiB)",
      fill: true,
      series: [
        { label: "Graphics Summary", color: "#e11d48", width: 2.4, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.graphics_memory_kib) })) },
        { label: "GL mtrack", color: "#fb7185", width: 1.8, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.gl_mtrack_pss_kib) })) },
        { label: "EGL mtrack", color: "#0ea5e9", width: 1.8, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.egl_mtrack_pss_kib) })) }
      ]
    });

    // 5. FPS Staircase Chart
    setChips("stats-fps", [
      { k: "Median FPS", v: `${Number(fpsS.median).toFixed(1)}` },
      { k: "Mean FPS", v: `${Number(fpsS.mean).toFixed(1)}` },
      { k: "Min FPS", v: `${Number(fpsS.min).toFixed(1)}` }
    ]);
    createTimeChart({
      canvasId: "chart-fps",
      legendId: "legend-fps",
      yLabel: "FPS",
      stepped: true,
      fill: true,
      refLines: [
        { y: 120, label: "120 FPS (8.33 ms)", color: "#10b981" },
        { y: 60, label: "60 FPS (16.67 ms)", color: "#f59e0b" }
      ],
      series: [
        { label: "SurfaceFlinger FPS (Staircase)", color: "#10b981", points: true, unit: "FPS", data: DATA.graphics_frames.map((r) => ({ x: r.elapsed_ms, y: r.sf_fps_estimate })) }
      ]
    });

    // 6. Frame Latency Grouped Bar Chart (Active Windows)
    const activeWins = DATA.graphics_frames.filter((r) => r.sf_frame_p50_ms != null);
    const p50S = getStat("graphics_frames.csv", "sf_frame_p50_ms");
    const p99S = getStat("graphics_frames.csv", "sf_frame_p99_ms");
    setChips("stats-latency", [
      { k: "Median P50", v: `${Number(p50S.median).toFixed(2)} ms` },
      { k: "Median P95", v: `${Number(latS.median).toFixed(2)} ms` },
      { k: "Max P99", v: `${Number(p99S.max).toFixed(1)} ms` }
    ]);
    createBarChart({
      canvasId: "chart-latency",
      legendId: "legend-latency",
      yLabel: "Latency (ms)",
      categories: activeWins.map((r) => fmtMinSec(r.elapsed_ms)),
      refLines: [
        { y: 8.33, label: "8.33 ms (120 Hz)", color: "#10b981" },
        { y: 16.67, label: "16.67 ms (60 Hz)", color: "#f59e0b" }
      ],
      series: [
        { label: "P50 (ms)", color: "#06b6d4", unit: "ms", values: activeWins.map((r) => r.sf_frame_p50_ms) },
        { label: "P95 (ms)", color: "#f59e0b", unit: "ms", values: activeWins.map((r) => r.sf_frame_p95_ms) },
        { label: "P99 (ms)", color: "#e11d48", unit: "ms", values: activeWins.map((r) => r.sf_frame_p99_ms) }
      ]
    });

    // 7. Process Threads & Swap (Staircase)
    const thrS = getStat("process.csv", "threads");
    const anonS = getStat("process.csv", "rss_anon_kib");
    setChips("stats-process", [
      { k: "Threads Max", v: `${thrS.max}` },
      { k: "Anon RSS Max", v: `${(anonS.max / 1024).toFixed(0)} MiB` }
    ]);
    createTimeChart({
      canvasId: "chart-process",
      legendId: "legend-process",
      yLabel: "MiB / Count",
      stepped: true,
      fill: true,
      series: [
        { label: "Thread Count (Staircase)", color: "#e11d48", unit: "threads", data: DATA.process.map((r) => ({ x: r.elapsed_ms, y: r.threads })) },
        { label: "RssAnon (MiB)", color: "#4f46e5", unit: "MiB", data: DATA.process.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.rss_anon_kib) })) },
        { label: "RssFile (MiB)", color: "#10b981", unit: "MiB", data: DATA.process.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.rss_file_kib) })) },
        { label: "VmSwap (MiB)", color: "#64748b", width: 1.6, unit: "MiB", data: DATA.process.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.vm_swap_kib) })) }
      ]
    });

    // 8. Device RAM & Swap
    const swpS = getStat("device_memory.csv", "device_swap_used_kib");
    setChips("stats-device-ram", [
      { k: "Avail RAM Min", v: `${(ramS.min / (1024 * 1024)).toFixed(2)} GiB` },
      { k: "Swap Used Max", v: `${(swpS.max / (1024 * 1024)).toFixed(2)} GiB` }
    ]);
    createTimeChart({
      canvasId: "chart-device-ram",
      legendId: "legend-device-ram",
      yLabel: "Memory (GiB)",
      fill: true,
      series: [
        { label: "Device Available RAM", color: "#10b981", unit: "GiB", data: DATA.device_memory.map((r) => ({ x: r.elapsed_ms, y: toGiB(r.device_available_ram_kib) })) },
        { label: "Device Cached RAM", color: "#06b6d4", unit: "GiB", data: DATA.device_memory.map((r) => ({ x: r.elapsed_ms, y: toGiB(r.device_cached_kib) })) },
        { label: "Device Swap Used", color: "#e11d48", unit: "GiB", data: DATA.device_memory.map((r) => ({ x: r.elapsed_ms, y: toGiB(r.device_swap_used_kib) })) },
        { label: "Device Free RAM", color: "#64748b", width: 1.5, unit: "GiB", data: DATA.device_memory.map((r) => ({ x: r.elapsed_ms, y: toGiB(r.device_free_ram_kib) })) }
      ]
    });

    // EXTRA TAB CONTENT: GPU Memory Over Time + Memory & GPU Pie Charts + Events
    const grallocPeakS = getStat("graphics_memory.csv", "gralloc_total_kib");
    const hasGralloc = DATA.graphics_memory.some((r) => r.gralloc_total_kib != null && r.gralloc_total_kib > 0);

    const eventsHtml = DATA.events && DATA.events.length
      ? `<ul class="event-list">${DATA.events.map((ev) => {
          const cls = ev.event_name.includes("start") ? "start" : (ev.event_name.includes("home") ? "home" : "auto");
          return `<li class="event-item"><span class="event-time">${fmtMinSec(ev.elapsed_ms)}</span><span class="event-badge ${cls}">${ev.event_name}</span><span>${ev.description || ""}</span></li>`;
        }).join("")}</ul>`
      : `<p>No manual event markers were recorded in <code>events.csv</code> for this session.</p>`;

    document.getElementById("extra-content").innerHTML = `
      <section class="chart-card" style="margin-top:22px;">
        <div class="card-header">
          <div>
            <span class="chart-type-pill">GPU Telemetry • Area + Line</span>
            <h2>GPU &amp; Graphics Memory Consumption Over Time</h2>
            <p class="card-desc">Detailed GPU memory timeline: <code>Graphics Summary</code>, <code>GL mtrack</code>, <code>EGL mtrack</code>${hasGralloc ? ", and <code>Gralloc Total</code> / <code>ImageReader</code> buffers" : ""} in MiB.</p>
          </div>
          <div class="card-stats" id="stats-extra-gpu"></div>
        </div>
        <div class="chart-legend" id="legend-extra-gpu"></div>
        <div class="chart-wrap"><canvas id="chart-extra-gpu"></canvas></div>
      </section>

      <div class="extra-two-col">
        <section class="chart-card" style="margin-bottom:0;">
          <div class="card-header">
            <div>
              <span class="chart-type-pill">Memory Attribution • Donut</span>
              <h2>What Is Using the Memory?</h2>
              <p class="card-desc">PSS share across Android memory categories (MiB).</p>
            </div>
            <div class="unit-toggle" id="pie-mode-toggle">
              <button class="unit-btn active" data-mode="mean">Mean PSS</button>
              <button class="unit-btn" data-mode="max">Peak PSS</button>
            </div>
          </div>
          <div class="pie-layout">
            <div class="pie-canvas-wrap"><canvas id="chart-extra-mem-pie"></canvas></div>
            <div class="pie-breakdown-list" id="breakdown-extra-mem-pie"></div>
          </div>
        </section>

        <section class="chart-card" style="margin-bottom:0;">
          <div class="card-header">
            <div>
              <span class="chart-type-pill">GPU Attribution • Donut</span>
              <h2>${hasGralloc ? "GPU Gralloc Buffer Breakdown" : "Graphics mtrack Breakdown"}</h2>
              <p class="card-desc">${hasGralloc ? "Mean Gralloc buffer allocation by consumer (ImageReader, VRI, SurfaceView, Other)." : "Mean GL mtrack vs. EGL mtrack graphics memory share."}</p>
            </div>
          </div>
          <div class="pie-layout">
            <div class="pie-canvas-wrap"><canvas id="chart-extra-gpu-pie"></canvas></div>
            <div class="pie-breakdown-list" id="breakdown-extra-gpu-pie"></div>
          </div>
        </section>
      </div>

      <div class="extra-grid">
        <div class="extra-card">
          <h3>Session Configuration &amp; Intervals</h3>
          <p><strong>Session ID:</strong> <code>${meta.session_id}</code></p>
          <p><strong>Package:</strong> <code>${meta.package_name}</code> v${meta.application_version_name} (${meta.application_version_code})</p>
          <p><strong>Detected Processes:</strong> ${mon.detected_processes.map((p) => `<code>${p}</code>`).join(", ") || "None"}</p>
          <p><strong>Intervals:</strong> Process ${mon.intervals_sec.process}s, Device RAM ${mon.intervals_sec.device_memory}s, Meminfo ${mon.intervals_sec.memory}s, Graphics ${mon.intervals_sec.graphics}s</p>
        </div>
        <div class="extra-card">
          <h3>Gameplay Event Timeline (${DATA.events ? DATA.events.length : 0} events)</h3>
          ${eventsHtml}
        </div>
      </div>
    `;

    const extraGpuChips = [
      { k: "Graphics Peak", v: `${(gfxS.max / 1024).toFixed(0)} MiB` },
      { k: "GL mtrack Mean", v: `${(glS.mean / 1024).toFixed(0)} MiB` },
      { k: "EGL mtrack Mean", v: `${(eglS.mean / 1024).toFixed(0)} MiB` }
    ];
    if (hasGralloc && grallocPeakS) {
      extraGpuChips.push({ k: "Gralloc Peak", v: `${(grallocPeakS.max / 1024).toFixed(0)} MiB` });
    }
    setChips("stats-extra-gpu", extraGpuChips);

    const extraGpuSeries = [
      { label: "Graphics Summary", color: "#e11d48", width: 2.4, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.graphics_memory_kib) })) },
      { label: "GL mtrack", color: "#fb7185", width: 1.9, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.gl_mtrack_pss_kib) })) },
      { label: "EGL mtrack", color: "#0ea5e9", width: 1.9, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.egl_mtrack_pss_kib) })) }
    ];
    if (hasGralloc) {
      extraGpuSeries.push(
        { label: "Gralloc Total", color: "#8b5cf6", width: 2.0, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.gralloc_total_kib) })) },
        { label: "Gralloc ImageReader", color: "#f59e0b", width: 1.6, unit: "MiB", data: DATA.graphics_memory.map((r) => ({ x: r.elapsed_ms, y: toMiB(r.gralloc_imagereader_kib) })) }
      );
    }
    createTimeChart({
      canvasId: "chart-extra-gpu",
      legendId: "legend-extra-gpu",
      yLabel: "GPU Memory (MiB)",
      fill: true,
      series: extraGpuSeries
    });

    const memPiePalette = [
      { label: "Graphics", key: "graphics_pss_kib", color: "#e11d48" },
      { label: "System", key: "system_pss_kib", color: "#4f46e5" },
      { label: "Private Other", key: "private_other_pss_kib", color: "#0ea5e9" },
      { label: "Native Heap", key: "native_heap_pss_kib", color: "#f59e0b" },
      { label: "Code", key: "code_pss_kib", color: "#10b981" },
      { label: "Java Heap", key: "java_heap_pss_kib", color: "#8b5cf6" },
      { label: "Stack", key: "stack_pss_kib", color: "#64748b" }
    ];

    const renderMemPie = (mode = "mean") => {
      createPieChart({
        canvasId: "chart-extra-mem-pie",
        breakdownId: "breakdown-extra-mem-pie",
        centerLabel: mode === "mean" ? "Mean PSS" : "Peak Sum",
        unit: "MiB",
        items: memPiePalette.map((c) => ({
          label: c.label,
          color: c.color,
          value: toMiB(getStat("memory.csv", c.key)?.[mode])
        }))
      });
    };
    renderMemPie("mean");
    document.querySelectorAll("#pie-mode-toggle .unit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#pie-mode-toggle .unit-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderMemPie(btn.dataset.mode);
      });
    });

    const gpuPieItems = hasGralloc
      ? [
          { label: "ImageReader", color: "#e11d48", value: toMiB(getStat("graphics_memory.csv", "gralloc_imagereader_kib")?.mean) },
          { label: "ViewRootImpl (VRI)", color: "#4f46e5", value: toMiB(getStat("graphics_memory.csv", "gralloc_vri_kib")?.mean) },
          { label: "SurfaceView", color: "#10b981", value: toMiB(getStat("graphics_memory.csv", "gralloc_surfaceview_kib")?.mean) },
          { label: "Other Gralloc", color: "#f59e0b", value: toMiB(getStat("graphics_memory.csv", "gralloc_other_kib")?.mean) }
        ]
      : [
          { label: "GL mtrack", color: "#e11d48", value: toMiB(glS?.mean) },
          { label: "EGL mtrack", color: "#0ea5e9", value: toMiB(eglS?.mean) }
        ];

    createPieChart({
      canvasId: "chart-extra-gpu-pie",
      breakdownId: "breakdown-extra-gpu-pie",
      centerLabel: hasGralloc ? "Mean Gralloc" : "Mean GPU",
      unit: "MiB",
      items: gpuPieItems
    });
  }

  function renderGMemoryTab() {
    const container = document.getElementById("gmemory-content");
    const gm = window.KULFI_GMEMORY;
    if (!container || !gm || !gm.timeseries || !gm.timeseries.length) return;

    const ts = gm.timeseries;
    const maxOf = (k) => {
      const vals = ts.map((r) => r[k]).filter((v) => v != null);
      return vals.length ? Math.max(...vals) : 0;
    };

    container.innerHTML = `
      <div class="kpi-grid" style="margin:22px 0;">
        <div class="kpi-card"><div class="kpi-label">Peak GL mtrack</div><div class="kpi-value">${maxOf("gl_mib").toFixed(1)} MiB</div><div class="kpi-sub">dumpsys meminfo</div></div>
        <div class="kpi-card"><div class="kpi-label">Peak sGPU Driver</div><div class="kpi-value">${maxOf("sgpu_mib").toFixed(1)} MiB</div><div class="kpi-sub">/sys/kernel/gpu/proc</div></div>
        <div class="kpi-card"><div class="kpi-label">Peak Gralloc</div><div class="kpi-value">${maxOf("gralloc_mib").toFixed(1)} MiB</div><div class="kpi-sub">Peak ${maxOf("buffer_count")} buffers</div></div>
        <div class="kpi-card"><div class="kpi-label">Peak ImageReader</div><div class="kpi-value">${maxOf("imagereader_mib").toFixed(1)} MiB</div><div class="kpi-sub">${(gm.imagereader_summary || []).length} instance(s)</div></div>
      </div>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Deep GPU • Area + Line</span><h2>GL mtrack vs. sGPU Driver &amp; EGL mtrack Over Time</h2><p class="card-desc">Comparison of Android <code>GL mtrack</code>, Samsung Xclipse 940 kernel driver <code>sGPU</code> allocation, and <code>EGL mtrack</code> (MiB).</p></div><div class="card-stats" id="stats-gm-gl"></div></div>
        <div class="chart-legend" id="legend-gm-gl"></div>
        <div class="chart-wrap"><canvas id="chart-gm-gl"></canvas></div>
      </section>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Gralloc • Area + Line</span><h2>Gralloc &amp; ImageReader Subsystem Breakdown Over Time</h2><p class="card-desc">Per-buffer imported gralloc memory grouped by consumer: <code>ImageReader</code>, <code>ViewRootImpl</code>, and <code>SurfaceView</code> (MiB).</p></div><div class="card-stats" id="stats-gm-gralloc"></div></div>
        <div class="chart-legend" id="legend-gm-gralloc"></div>
        <div class="chart-wrap"><canvas id="chart-gm-gralloc"></canvas></div>
      </section>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Lifecycle • Staircase</span><h2>Graphics Buffer Count Over Time</h2><p class="card-desc">Imported Gralloc buffer count vs. sGPU kernel driver buffer count across phases.</p></div><div class="card-stats" id="stats-gm-bufs"></div></div>
        <div class="chart-legend" id="legend-gm-bufs"></div>
        <div class="chart-wrap"><canvas id="chart-gm-bufs"></canvas></div>
      </section>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Phase Comparison</span><h2>Graphics Memory by Experiment Phase</h2><p class="card-desc">Mean memory (MiB) and buffer counts across recorded gameplay phases.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Phase</th><th class="num">Samples</th><th class="num">Graphics PSS</th><th class="num">GL mtrack</th><th class="num">EGL mtrack</th><th class="num">sGPU Driver</th><th class="num">Gralloc</th><th class="num">ImageReader</th><th class="num">Buffers</th></tr></thead><tbody>
          ${(gm.phase_comparison || []).map((p) => `<tr><td><strong>${p[0]}</strong></td><td class="num">${p[1]}</td><td class="num">${p[2]} MiB</td><td class="num">${p[3]} MiB</td><td class="num">${p[4]} MiB</td><td class="num">${p[5]} MiB</td><td class="num">${p[6]} MiB</td><td class="num">${p[7]} MiB</td><td class="num">${p[8]}</td></tr>`).join("")}
        </tbody></table></div>
      </section>

      <div class="extra-two-col">
        <section class="chart-card" style="margin-bottom:0;">
          <div class="card-header"><div><span class="chart-type-pill">GPU Attribution • Donut</span><h2>1. Overall GPU Memory Breakdown</h2><p class="card-desc">Mean sGPU / GL mtrack + EGL mtrack split between driver-internal memory, ImageReader, and other Gralloc buffers (MiB).</p></div></div>
          <div class="pie-layout">
            <div class="pie-canvas-wrap"><canvas id="chart-gm-pie-overall"></canvas></div>
            <div class="pie-breakdown-list" id="breakdown-gm-pie-overall"></div>
          </div>
        </section>

        <section class="chart-card" style="margin-bottom:0;">
          <div class="card-header"><div><span class="chart-type-pill">Gralloc Attribution • Donut</span><h2>2. Gralloc Buffer Share (ImageReader vs. Others)</h2><p class="card-desc">Mean imported Gralloc buffer memory showing how much ImageReader takes compared to ViewRootImpl and SurfaceView (MiB).</p></div></div>
          <div class="pie-layout">
            <div class="pie-canvas-wrap"><canvas id="chart-gm-pie-gralloc"></canvas></div>
            <div class="pie-breakdown-list" id="breakdown-gm-pie-gralloc"></div>
          </div>
        </section>
      </div>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Subsystem • Donut</span><h2>3. ImageReader Instances Breakdown</h2><p class="card-desc">Individual ImageReader instances observed via <code>dumpsys gfxinfo</code>, showing latest footprint (MiB) and buffer count per instance.</p></div></div>
        <div class="pie-layout">
          <div class="pie-canvas-wrap"><canvas id="chart-gm-pie-ir"></canvas></div>
          <div class="pie-breakdown-list" id="breakdown-gm-pie-ir"></div>
        </div>
      </section>

      <section class="chart-card">
        <div class="card-header"><div><span class="chart-type-pill">Technical Summary</span><h2>What Is Consuming Kulfi's Graphics Memory?</h2><p class="card-desc">Evidence-based summary of confirmed allocations, subsystem ownership, and current measurement boundaries.</p></div></div>
        <ul class="findings-list">
          <li><strong>GPU Driver Allocations (GL mtrack = sGPU, ~733 MiB mean / ~971 MiB peak):</strong> Android's <code>GL mtrack</code> matches the Samsung Xclipse 940 kernel driver's per-process allocation (<code>/sys/kernel/gpu/proc/&lt;pid&gt;/summary</code>: 731.1 MiB mean, 1,001.2 MiB peak) 1:1. <code>dumpsys gpu</code> confirms Kulfi initializes both a Vulkan device/swapchain (Flutter Impeller) and an OpenGL ES context.</li>
          <li><strong>Driver-Internal vs. Imported Gralloc (~487 MiB vs. ~245 MiB mean):</strong> Roughly 245–305 MiB of the GPU footprint consists of individually observable Gralloc buffers. The remaining ~490–670 MiB resides inside driver-internal GPU allocations (Vulkan/GLES textures, offscreen render targets, shader/pipeline caches, and dynamically downloaded game/UI assets).</li>
          <li><strong>Static APK Images Are Not the Primary Driver (73.11 MiB total):</strong> All 164 packaged images across the 4 APKs decode to 73.11 MiB RGBA combined, confirming that the ~733–971 MiB GPU footprint comes from runtime/dynamically loaded resources and rendering buffers.</li>
          <li><strong>ImageReader Is the Largest Identifiable Consumer (~163 MiB mean / ~199.5 MiB peak):</strong> ImageReader accounts for ~67% of all Gralloc buffer memory across 7 distinct instances (81 unique buffer IDs): five full-screen <code>1080x2340</code> RGBA (<code>fmt=1</code>) instances holding up to 7 buffers (69.21 MiB each, with one persisting from 86s to 606s), plus two <code>1280x720</code> (<code>fmt=310</code>) instances holding 44–46 buffers (58.39–61.05 MiB each, typical of 720p media/video decoder queues).</li>
          <li><strong>Window &amp; Flutter Rendering Surfaces (~55 MiB mean):</strong> <code>ViewRootImpl</code> (<code>VRI[MainActivity]</code>) holds 4 full-screen buffers (~37.8 MiB mean, 39.5 MiB peak) for the Android window swapchain, while Flutter's <code>SurfaceView (BLAST)</code> uses ~17.0 MiB mean (49.4 MiB peak).</li>
          <li><strong>Inspection Boundary on Non-Rooted Production Builds:</strong> On a non-rooted production APK, Android/Xclipse restricts per-texture inspection inside driver-internal <code>sGPU</code> memory and blocks <code>dmabuf_dump</code>. Inspecting individual textures and render targets within that ~490–670 MiB remainder requires a <code>profileable</code> or <code>debuggable</code> build with Android GPU Inspector (AGI) or Flutter/Impeller DevTools.</li>
        </ul>
      </section>
    `;

    const meanOf = (k) => {
      const vals = ts.map((r) => r[k]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const meanSgpu = meanOf("sgpu_mib");
    const meanEgl = meanOf("egl_mib");
    const meanIr = meanOf("imagereader_mib");
    const meanVri = meanOf("vri_mib");
    const meanSv = meanOf("surfaceview_mib");
    const meanGralloc = meanOf("gralloc_mib");
    const meanOtherGralloc = Math.max(0, meanGralloc - meanIr - meanVri - meanSv);
    const meanDriverInternal = Math.max(0, meanSgpu - meanGralloc);

    createPieChart({
      canvasId: "chart-gm-pie-overall", breakdownId: "breakdown-gm-pie-overall", centerLabel: "Mean GPU", unit: "MiB",
      items: [
        { label: "Driver-Internal (Textures/Targets)", color: "#e11d48", value: meanDriverInternal },
        { label: "ImageReader Buffers", color: "#4f46e5", value: meanIr },
        { label: "EGL mtrack", color: "#0ea5e9", value: meanEgl },
        { label: "ViewRootImpl (VRI)", color: "#10b981", value: meanVri },
        { label: "SurfaceView + Other Gralloc", color: "#f59e0b", value: meanSv + meanOtherGralloc }
      ]
    });

    createPieChart({
      canvasId: "chart-gm-pie-gralloc", breakdownId: "breakdown-gm-pie-gralloc", centerLabel: "Mean Gralloc", unit: "MiB",
      items: [
        { label: "ImageReader", color: "#e11d48", value: meanIr },
        { label: "ViewRootImpl (VRI)", color: "#4f46e5", value: meanVri },
        { label: "SurfaceView", color: "#f59e0b", value: meanSv },
        { label: "Other Gralloc", color: "#10b981", value: meanOtherGralloc }
      ]
    });

    const irColors = ["#e11d48", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#64748b"];
    const irItems = (gm.imagereader_summary || []).map((row, i) => ({
      label: `${row[0]} (${row[2]} bufs, ${row[3]})`,
      color: irColors[i % irColors.length],
      value: Number(row[6]) || 0
    }));
    createPieChart({
      canvasId: "chart-gm-pie-ir", breakdownId: "breakdown-gm-pie-ir", centerLabel: "ImageReader", unit: "MiB",
      items: irItems
    });

    createTimeChart({
      canvasId: "chart-gm-gl", legendId: "legend-gm-gl", yLabel: "Memory (MiB)", fill: true,
      series: [
        { label: "GL mtrack (meminfo)", color: "#e11d48", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.gl_mib })) },
        { label: "sGPU Driver (/sys/kernel/gpu)", color: "#4f46e5", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.sgpu_mib })) },
        { label: "EGL mtrack (meminfo)", color: "#0ea5e9", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.egl_mib })) }
      ]
    });

    createTimeChart({
      canvasId: "chart-gm-gralloc", legendId: "legend-gm-gralloc", yLabel: "Memory (MiB)", fill: true,
      series: [
        { label: "Gralloc Total", color: "#8b5cf6", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.gralloc_mib })) },
        { label: "ImageReader", color: "#e11d48", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.imagereader_mib })) },
        { label: "ViewRootImpl", color: "#10b981", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.vri_mib })) },
        { label: "SurfaceView", color: "#f59e0b", unit: "MiB", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.surfaceview_mib })) }
      ]
    });

    createTimeChart({
      canvasId: "chart-gm-bufs", legendId: "legend-gm-bufs", yLabel: "Buffer Count", stepped: true, fill: true,
      series: [
        { label: "Imported Gralloc Buffers", color: "#0ea5e9", unit: "buffers", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.buffer_count })) },
        { label: "sGPU Driver Buffers", color: "#e11d48", unit: "buffers", data: ts.map((r) => ({ x: r.elapsed_ms, y: r.sgpu_buffers })) }
      ]
    });
  }

  function renderAll() {
    renderSessionSwitcher();
    const sess = sessions[activeSessionIdx];
    if (sess && sess.status === "ready" && sess.data) {
      renderSessionData(sess.data);
    } else {
      document.getElementById("hero-subtitle").textContent = `${sess.label} • Ready for manual testing`;
      document.getElementById("hero-meta").innerHTML = "";
      document.getElementById("kpi-grid").innerHTML = "";
    }
    renderActiveViews();
    renderGMemoryTab();
    setupReveals();
  }

  renderAll();
})();
