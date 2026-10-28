/* ===========================================================================
 * motion.js — camada cinematográfica (sem libs externas, 100% offline).
 * Reveals por scroll, barra de progresso, count-up, botões magnéticos,
 * tilt dos cards e o card-teaser do hero com números reais do motor fiscal.
 * ===========================================================================*/
import { SAMPLES } from "./samples.js";
import * as fiscal from "./fiscal.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const nf = (n) => Math.round(n).toLocaleString("pt-BR");

document.documentElement.classList.add("js");

/* ---------- count-up ---------- */
function countUp(el, to, { suffix = "", dur = 1500 } = {}) {
  if (reduce) { el.textContent = nf(to) + suffix; return; }
  const from = 0, t0 = performance.now();
  (function tick(now) {
    const p = Math.max(0, Math.min(1, (now - t0) / dur));
    el.textContent = nf(from + (to - from) * easeOut(p)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    // count-up numbers inside this block
    e.target.querySelectorAll("[data-count]").forEach((n) => {
      if (n._done) return; n._done = true;
      countUp(n, parseFloat(n.dataset.count), { suffix: n.dataset.suffix || "", dur: 1700 });
    });
    io.unobserve(e.target);
  }
}, { threshold: 0.18 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- scroll progress + topbar state ---------- */
const bar = document.getElementById("progress");
const topbar = document.getElementById("topbar");
function onScroll() {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  if (bar) bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  if (topbar) topbar.classList.toggle("is-scrolled", h.scrollTop > 60);
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- magnetic buttons ---------- */
if (fine && !reduce) {
  document.querySelectorAll("[data-magnetic]").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.4}px)`;
    });
    btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
  });
  /* poster tilt */
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const rx = (e.clientY - r.top - r.height / 2) / r.height;
      const ry = (e.clientX - r.left - r.width / 2) / r.width;
      card.style.transform = `perspective(900px) rotateX(${-rx * 6}deg) rotateY(${ry * 7}deg) translateY(-6px)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
  });
}

/* ---------- hero cursor spotlight ---------- */
if (fine && !reduce) {
  const cinema = document.querySelector(".cinema");
  if (cinema) cinema.addEventListener("mousemove", (e) => {
    const r = cinema.getBoundingClientRect();
    cinema.style.setProperty("--mx", (e.clientX - r.left) + "px");
    cinema.style.setProperty("--my", (e.clientY - r.top) + "px");
  });
}

/* ---------- ripple nos controles (follow-through) ---------- */
if (!reduce) {
  document.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".btn, .sample, .year, .chip");
    if (!t) return;
    const r = t.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.width = s.style.height = d + "px";
    s.style.left = (e.clientX - r.left) + "px";
    s.style.top = (e.clientY - r.top) + "px";
    t.appendChild(s);
    setTimeout(() => s.remove(), 560);
  });
}

/* ---------- hero teaser (números reais da amostra Indústria) ---------- */
(function heroCard() {
 try {
  const card = document.getElementById("herocard");
  if (!card) return;
  const doc = fiscal.parseNFe(SAMPLES[0].xml);
  const cur = fiscal.currentBreakdown(doc, 2025);
  const proj = fiscal.projectedBreakdown(doc, 2027);
  const maxV = Math.max(cur.total, proj.total);

  const elVal = document.getElementById("hcValue");
  const elLabel = document.getElementById("hcLabel");
  const elCarga = document.getElementById("hcCarga");
  const elReg = document.getElementById("hcReg");
  const barA = document.getElementById("hcBarA");
  const barB = document.getElementById("hcBarB");

  // preenche as barras (a transição CSS anima a partir de 0)
  requestAnimationFrame(() => {
    barA.style.width = (cur.total / maxV) * 100 + "%";
    barB.style.width = (proj.total / maxV) * 100 + "%";
  });

  const states = [
    { v: cur.total, carga: cur.carga, label: "carga hoje", reg: "regime atual", color: "var(--ink)" },
    { v: proj.total, carga: proj.carga, label: "carga em 2027", reg: "Reforma · CBS+IBS", color: "var(--teal)" },
  ];
  let i = 0;
  function show(s, animate) {
    elLabel.textContent = s.label;
    elCarga.textContent = `carga ${String(s.carga).replace(".", ",")}%`;
    elReg.textContent = s.reg;
    elVal.style.color = s.color;
    if (animate) countUp(elVal, s.v, { dur: 1100 }); else elVal.textContent = nf(s.v);
  }
  show(states[0], false);               // pinta o valor correto de imediato
  if (!reduce) {
    setTimeout(() => show(states[0], true), 350);   // depois conta suavemente
    setInterval(() => { i = (i + 1) % states.length; show(states[i], true); }, 3400);
  }
 } catch (e) { /* hero é decorativo: nunca derruba a página */ }
})();
