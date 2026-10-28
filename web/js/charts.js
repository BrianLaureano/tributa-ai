/* ===========================================================================
 * charts.js — gráficos em SVG puro (sem libs). Paleta categórica validada
 * (dataviz skill): 6 famílias de tributo, gaps de 2px, legenda + rótulos
 * diretos como codificação secundária, tooltip no hover.
 * ===========================================================================*/
const SVGNS = "http://www.w3.org/2000/svg";
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlf = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Famílias de tributo (ordem = ordem validada da paleta no modo escuro).
export const FAMILIES = [
  { key: "cbs", label: "CBS", color: "#3987e5", novo: true },
  { key: "ibs", label: "IBS", color: "#d95926", novo: true },
  { key: "iseletivo", label: "IS", color: "#199e70", novo: true },
  { key: "ipi", label: "IPI", color: "#c98500", novo: false },
  { key: "pisco", label: "PIS/COFINS", color: "#d55181", novo: false },
  { key: "icmsiss", label: "ICMS/ISS", color: "#008300", novo: false },
];

function segments(bd) {
  const map = { cbs: bd.cbs, ibs: bd.ibs, iseletivo: bd.iseletivo, ipi: bd.ipi,
    pisco: bd.pis + bd.cofins, icmsiss: bd.icms + bd.iss };
  return FAMILIES.map((f) => ({ ...f, value: round(map[f.key] || 0) })).filter((s) => s.value > 0.005);
}
const round = (n) => Math.round(n * 100) / 100;

function el(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/* Tooltip compartilhado */
let tip;
function tooltip() {
  if (!tip) { tip = document.createElement("div"); tip.className = "viz-tip"; tip.hidden = true; document.body.appendChild(tip); }
  return tip;
}
function showTip(html, ev) {
  const t = tooltip(); t.innerHTML = html; t.hidden = false;
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > innerWidth) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight) y = ev.clientY - r.height - pad;
  t.style.left = x + "px"; t.style.top = y + "px";
}
const hideTip = () => { if (tip) tip.hidden = true; };

/* ---------- gráfico 1: comparação Hoje x Ano-alvo (barras empilhadas) ---------- */
export function renderCompare(host, current, projected, yearLabel) {
  host.innerHTML = "";
  const W = 560, H = 360, padT = 46, padB = 58, padL = 16, padR = 16;
  const bars = [
    { title: "Hoje", sub: "regime atual", bd: current },
    { title: yearLabel, sub: "Reforma", bd: projected },
  ];
  const maxV = Math.max(current.total, projected.total) * 1.14 || 1;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg", role: "img",
    "aria-label": `Carga tributária hoje ${brlf(current.total)} contra ${yearLabel} ${brlf(projected.total)}` });
  const plotH = H - padT - padB, bw = 120, gap = (W - padL - padR - bw * 2) / 3;
  const barX = [], cen = [{}, {}]; // centróide y de cada família, por barra

  bars.forEach((b, i) => {
    const x = padL + gap + i * (bw + gap);
    barX[i] = x;
    const segs = segments(b.bd);
    let yAcc = H - padB;
    // total no topo
    const topY = H - padB - (b.bd.total / maxV) * plotH;
    segs.forEach((s) => {
      const h = (s.value / maxV) * plotH;
      if (h <= 0) return;
      const segH = Math.max(h - 2, 1); // gap de 2px entre fatias
      const y = yAcc - segH;
      cen[i][s.key] = y + segH / 2;
      const rect = el("rect", { x, y, width: bw, height: segH, rx: 3, fill: s.color, class: "viz-seg" });
      rect.addEventListener("mousemove", (ev) => showTip(
        `<b>${s.label}</b> · ${b.title}<br>${brlf(s.value)}`, ev));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
      if (!reduce()) { rect.style.transformOrigin = `center ${H - padB}px`; rect.animate(
        [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 620, delay: i * 90, easing: "cubic-bezier(.22,1,.36,1)" }); }
      yAcc -= h;
    });
    // rótulo total
    const tTotal = el("text", { x: x + bw / 2, y: topY - 12, class: "viz-total", "text-anchor": "middle" });
    tTotal.textContent = brl(b.bd.total); svg.appendChild(tTotal);
    const tCarga = el("text", { x: x + bw / 2, y: topY - 28, class: "viz-carga", "text-anchor": "middle" });
    tCarga.textContent = `${b.bd.carga}%`; svg.appendChild(tCarga);
    // base
    const t1 = el("text", { x: x + bw / 2, y: H - padB + 24, class: "viz-axlabel", "text-anchor": "middle" });
    t1.textContent = b.title; svg.appendChild(t1);
    const t2 = el("text", { x: x + bw / 2, y: H - padB + 42, class: "viz-axsub", "text-anchor": "middle" });
    t2.textContent = b.sub; svg.appendChild(t2);
  });
  // --- conectores de transição: legado (esq) "vira" novo regime (dir) ---
  const leftR = barX[0] + bw, rightL = barX[1];
  const groupY = (ci, keys) => {
    const ys = keys.map((k) => cen[ci][k]).filter((v) => v != null);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
  };
  const flows = [
    { from: groupY(0, ["pisco", "ipi"]), to: cen[1]["cbs"], color: "#3987e5" },
    { from: groupY(0, ["icmsiss"]), to: cen[1]["ibs"], color: "#d95926" },
  ];
  flows.forEach((f) => {
    if (f.from == null || f.to == null) return;
    const midX = (leftR + rightL) / 2;
    const d = `M ${leftR} ${f.from} C ${midX} ${f.from}, ${midX} ${f.to}, ${rightL} ${f.to}`;
    const path = el("path", { d, fill: "none", stroke: f.color, "stroke-width": 2, "stroke-linecap": "round", class: "viz-flow", opacity: 0.55, "stroke-dasharray": "5 7" });
    svg.appendChild(path);
    if (!reduce()) path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -24 }], { duration: 900, iterations: Infinity });
  });

  // baseline
  svg.appendChild(el("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, class: "viz-base" }));
  host.appendChild(svg);
}

/* ---------- gráfico 2: transição ano a ano (colunas empilhadas) ---------- */
export function renderTimeline(host, timeline, currentTotal) {
  host.innerHTML = "";
  const W = 720, H = 340, padT = 24, padB = 46, padL = 44, padR = 12;
  const maxV = Math.max(currentTotal, ...timeline.map((t) => t.total)) * 1.1 || 1;
  const plotH = H - padT - padB, plotW = W - padL - padR;
  const n = timeline.length, slot = plotW / n, bw = Math.min(46, slot * 0.6);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg", role: "img",
    "aria-label": "Carga tributária ano a ano de 2026 a 2033" });

  // grid + eixo Y (R$)
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (maxV / ticks) * i, y = H - padB - (v / maxV) * plotH;
    svg.appendChild(el("line", { x1: padL, y1: y, x2: W - padR, y2: y, class: "viz-grid" }));
    const t = el("text", { x: padL - 8, y: y + 4, class: "viz-axsub", "text-anchor": "end" });
    t.textContent = brl(v); svg.appendChild(t);
  }
  // linha de referência "hoje"
  const yHoje = H - padB - (currentTotal / maxV) * plotH;
  svg.appendChild(el("line", { x1: padL, y1: yHoje, x2: W - padR, y2: yHoje, class: "viz-ref" }));
  const refL = el("text", { x: W - padR, y: yHoje - 6, class: "viz-reflabel", "text-anchor": "end" });
  refL.textContent = `hoje ${brl(currentTotal)}`; svg.appendChild(refL);

  timeline.forEach((bd, i) => {
    const cx = padL + slot * i + slot / 2, x = cx - bw / 2;
    const segs = segments(bd);
    let yAcc = H - padB;
    const g = el("g", {});
    segs.forEach((s) => {
      const h = (s.value / maxV) * plotH; if (h <= 0) return;
      const segH = Math.max(h - 2, 1), y = yAcc - segH;
      g.appendChild(el("rect", { x, y, width: bw, height: segH, rx: 2, fill: s.color }));
      yAcc -= h;
    });
    // hover: coluna inteira
    const hit = el("rect", { x: padL + slot * i, y: padT, width: slot, height: plotH, fill: "transparent", class: "viz-hit" });
    hit.addEventListener("mousemove", (ev) => showTip(tlTip(bd), ev));
    hit.addEventListener("mouseleave", hideTip);
    g.appendChild(hit);
    svg.appendChild(g);
    if (!reduce()) { g.style.transformOrigin = `center ${H - padB}px`; g.animate(
      [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity: 1 }],
      { duration: 560, delay: 60 * i, easing: "cubic-bezier(.22,1,.36,1)" }); }
    // ano
    const t = el("text", { x: cx, y: H - padB + 20, class: "viz-axsub", "text-anchor": "middle" });
    t.textContent = bd.year; svg.appendChild(t);
  });
  svg.appendChild(el("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, class: "viz-base" }));
  host.appendChild(svg);
}

function tlTip(bd) {
  const segs = segments(bd);
  const rows = segs.map((s) => `<span class="dot" style="background:${s.color}"></span>${s.label}: ${brlf(s.value)}`).join("<br>");
  return `<b>${bd.year}</b> · carga ${bd.carga}%<br>${rows}<br><b>Total ${brlf(bd.total)}</b>`;
}

/* ---------- legenda (HTML) ---------- */
export function renderLegend(host) {
  host.innerHTML = "";
  for (const f of FAMILIES) {
    const span = document.createElement("span");
    span.className = "legend-item" + (f.novo ? " is-new" : "");
    span.innerHTML = `<i style="background:${f.color}"></i>${f.label}`;
    host.appendChild(span);
  }
}
