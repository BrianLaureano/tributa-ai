/* ===========================================================================
 * map.js — MAPA geográfico do Brasil, estética "Tron" (contornos neon + campo
 * de partículas em canvas). Dados REAIS: ICMS interno 2026 por UF + direção do
 * impacto pelo princípio do destino (IPEA): perdem AM, ES, MT, MS, SP, RO.
 * ===========================================================================*/
import { BR_VIEWBOX, BR_SHAPES } from "./br-paths.js";

const SVGNS = "http://www.w3.org/2000/svg";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const PERDE = new Set(["AM", "ES", "MT", "MS", "SP", "RO"]);

const INFO = {
  RR: ["Roraima", 20], AP: ["Amapá", 18], AM: ["Amazonas", 20], PA: ["Pará", 19],
  MA: ["Maranhão", 23], CE: ["Ceará", 20], RN: ["Rio Grande do Norte", 20], PB: ["Paraíba", 20],
  PE: ["Pernambuco", 20.5], AL: ["Alagoas", 20.5], SE: ["Sergipe", 19], AC: ["Acre", 19],
  RO: ["Rondônia", 19.5], TO: ["Tocantins", 20], PI: ["Piauí", 22.5], BA: ["Bahia", 20.5],
  MT: ["Mato Grosso", 17], GO: ["Goiás", 19], DF: ["Distrito Federal", 20], MG: ["Minas Gerais", 18],
  ES: ["Espírito Santo", 17], MS: ["Mato Grosso do Sul", 17], SP: ["São Paulo", 18], RJ: ["Rio de Janeiro", 20],
  PR: ["Paraná", 19.5], SC: ["Santa Catarina", 17], RS: ["Rio Grande do Sul", 17],
};
export const ESTADOS = Object.entries(INFO).map(([uf, [nome, icms]]) => ({ uf, nome, icms, perde: PERDE.has(uf) }));

const GAIN = "#2ee6d6", LOSE = "#ff8a3d";
const ICMS_MIN = 17, ICMS_MAX = 23;
function lerpHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const rateColor = (icms) => lerpHex("#1a6b7a", "#56e8ff", Math.max(0, Math.min(1, (icms - ICMS_MIN) / (ICMS_MAX - ICMS_MIN))));
const colorFor = (e, mode) => mode === "impact" ? (e.perde ? LOSE : GAIN) : rateColor(e.icms);
const fmt = (n) => String(n).replace(".", ",") + "%";

/* centro geométrico (para posicionar a sigla) a partir do maior polígono da UF */
function parsePts(s) {
  const nums = s.split(/[ ,]+/).map(Number).filter((n) => !isNaN(n));
  const p = []; for (let i = 0; i + 1 < nums.length; i += 2) p.push([nums[i], nums[i + 1]]);
  return p;
}
function polyCentroid(pts) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const cr = x0 * y1 - x1 * y0; A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-6) { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; }
  return [cx / (6 * A), cy / (6 * A)];
}
function labelPos(shapes) {
  let best = null, bestA = -1;
  for (const [t, v] of shapes) {
    if (t !== "poly") continue;
    const pts = parsePts(v); if (pts.length < 3) continue;
    let A = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; A += x0 * y1 - x1 * y0; }
    A = Math.abs(A); if (A > bestA) { bestA = A; best = polyCentroid(pts); }
  }
  return best;
}
// ajustes finos para UFs pequenas/sobrepostas (unidades do viewBox)
const LABEL_NUDGE = { DF: [3, -1], SE: [1.5, 0], RJ: [2.5, 1], ES: [2, 0], AL: [1.5, -0.5], RN: [1, -1], PB: [1.5, 0.5], PE: [-2, 0] };

let rafId = null, resizeH = null;

export function renderMap(stage, legendEl, detailEl, mode = "impact") {
  stage.innerHTML = "";
  stage.classList.add("map__stage");

  const canvas = document.createElement("canvas");
  canvas.className = "map__particles";
  stage.appendChild(canvas);

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", BR_VIEWBOX);
  svg.setAttribute("class", "map__svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Mapa do Brasil por estado");

  const groups = {};
  for (const uf of Object.keys(BR_SHAPES)) {
    const e = ESTADOS.find((x) => x.uf === uf);
    const color = colorFor(e, mode);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "uf-shape");
    g.style.setProperty("--c", color);
    for (const [t, v] of BR_SHAPES[uf]) {
      const node = document.createElementNS(SVGNS, t === "poly" ? "polygon" : "path");
      if (t === "poly") node.setAttribute("points", v); else node.setAttribute("d", v);
      g.appendChild(node);
    }
    const show = () => { highlight(svg, g); showDetail(detailEl, e); };
    g.addEventListener("mouseenter", show);
    g.addEventListener("click", show);
    g.setAttribute("tabindex", "0");
    g.addEventListener("focus", show);
    groups[uf] = g;
    svg.appendChild(g);
  }
  stage.appendChild(svg);   // precisa estar no DOM para getBBox()

  // rótulos (siglas das UFs) por cima dos contornos
  const labels = document.createElementNS(SVGNS, "g");
  labels.setAttribute("class", "uf-labels");
  for (const uf of Object.keys(BR_SHAPES)) {
    let pos = labelPos(BR_SHAPES[uf]);          // centroide do polígono
    if (!pos) { try { const b = groups[uf].getBBox(); pos = [b.x + b.width / 2, b.y + b.height / 2]; } catch (_) { } }
    if (!pos) continue;
    const nudge = LABEL_NUDGE[uf] || [0, 0];
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", pos[0] + nudge[0]);
    t.setAttribute("y", pos[1] + nudge[1]);
    t.setAttribute("class", "uf-label");
    t.textContent = uf;
    labels.appendChild(t);
  }
  svg.appendChild(labels);

  legendEl.innerHTML = mode === "impact"
    ? `<span class="legend-item"><i style="background:${GAIN}"></i>Tende a ganhar (consumo)</span>
       <span class="legend-item"><i style="background:${LOSE}"></i>Tende a perder (produção)</span>`
    : `<span class="legend-item"><i style="background:${rateColor(17)}"></i>ICMS 17%</span>
       <span class="legend-item"><i style="background:${rateColor(20)}"></i>~20%</span>
       <span class="legend-item"><i style="background:${rateColor(23)}"></i>23%</span>`;

  if (!detailEl.dataset.touched) showDefault(detailEl);
  startParticles(canvas, stage);
}

function highlight(svg, g) {
  svg.querySelectorAll(".uf-shape").forEach((x) => x.classList.remove("is-on"));
  g.classList.add("is-on");
}

/* ---------- detalhe ---------- */
function showDefault(el) {
  el.innerHTML = `<div class="mapd__hint">Passe o mouse (ou toque) num estado.</div>
    <div class="mapd__note">No regime novo, o imposto estadual (IBS) é cobrado no <b>destino</b> (consumo) e com alíquota <b>uniforme</b> no país — hoje cada estado tem a sua. A partilha migra gradualmente até 2078.</div>`;
}
function showDetail(el, e) {
  el.dataset.touched = "1";
  const badge = e.perde ? `<span class="badge badge--bad">tende a perder</span>` : `<span class="badge badge--good">tende a ganhar</span>`;
  const motivo = e.perde
    ? "Estado de produção/origem — no modelo de destino, perde participação na arrecadação (IPEA)."
    : "Consumo maior que produção — tende a ganhar arrecadação no modelo de destino (IPEA).";
  el.innerHTML = `
    <div class="mapd__h"><b>${e.nome}</b> ${badge}</div>
    <div class="mapd__row"><span>ICMS interno hoje</span><b>${fmt(e.icms)}</b></div>
    <div class="mapd__row"><span>No novo regime</span><b>IBS (ref. ~17,7%, nacional)</b></div>
    <div class="mapd__note">${motivo}</div>`;
}

/* ---------- campo de partículas (Tron) ---------- */
function startParticles(canvas, stage) {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeH) removeEventListener("resize", resizeH);
  const ctx = canvas.getContext("2d");
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let w = 0, h = 0, pts = [];

  function size() {
    const r = stage.getBoundingClientRect();
    w = r.width; h = r.height || r.width;
    canvas.width = w * DPR; canvas.height = h * DPR;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function seed() {
    const n = Math.max(26, Math.min(60, Math.round(w / 12)));
    pts = Array.from({ length: n }, (_, i) => ({
      x: (i * 97.13 % w), y: (i * 53.77 % h),
      vx: ((i % 7) - 3) * 0.06 || 0.05, vy: ((i % 5) - 2) * 0.06 || 0.04,
    }));
  }
  size(); seed();
  resizeH = () => { size(); seed(); };
  addEventListener("resize", resizeH);

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
    }
    // linhas de conexão (circuito)
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 7000) {
          ctx.strokeStyle = `rgba(46,230,214,${0.12 * (1 - d2 / 7000)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    }
    // pontos
    for (const p of pts) {
      ctx.fillStyle = "rgba(86,232,255,0.7)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, 6.2832); ctx.fill();
    }
    rafId = requestAnimationFrame(frame);
  }
  if (reduce()) { seed(); ctx.clearRect(0, 0, w, h); /* estático */ }
  else frame();
}
