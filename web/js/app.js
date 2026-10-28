/* ===========================================================================
 * app.js — orquestra a interface.
 * Análise numérica: sempre o motor local (instantâneo, mesmos números do backend).
 * Raciocínio/chat: usa o backend FastAPI via SSE se ele estiver no ar; senão,
 * o agente de demonstração (DemoAgent) roda tudo offline.
 * ===========================================================================*/
import { SAMPLES } from "./samples.js";
import * as fiscal from "./fiscal.js";
import { DemoAgent, BackendAgent, backendHealth } from "./agent.js";
import { renderCompare, renderTimeline, renderLegend } from "./charts.js";
import { examplePortfolio, analyzeBatch } from "./batch.js";
import { renderMap } from "./map.js";

const $ = (s) => document.querySelector(s);
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* count-up numérico com formatador custom */
function countUp(el, to, fmt, dur = 1100) {
  if (REDUCE) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function tick(now) {
    const p = Math.max(0, Math.min(1, (now - t0) / dur));
    el.textContent = fmt(to * easeOut(p));
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* digita um texto char-a-char (efeito "agente respondendo") */
function typeText(el, text, dur = 900) {
  if (REDUCE) { el.textContent = text; return; }
  const t0 = performance.now(), n = text.length;
  (function tick(now) {
    const p = Math.max(0, Math.min(1, (now - t0) / dur));
    el.textContent = text.slice(0, Math.round(n * p));
    if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
  })(t0);
}

const BACKEND_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? `${location.protocol}//${location.hostname}:8000` : "http://localhost:8000";

const state = {
  sampleId: null, xml: null, doc: null, year: 2027,
  backend: null, analysis: null, running: false, batchDocs: null,
};

/* ---------- boot ---------- */
function boot() {
  renderSamples();
  renderYears();
  renderLegend($("#legend"));
  $("#xmlInput").addEventListener("input", onXmlInput);
  $("#analyzeBtn").addEventListener("click", analyze);
  $("#chatForm").addEventListener("submit", onChat);
  $("#copyBtn").addEventListener("click", copyResumo);
  $("#exportBtn").addEventListener("click", exportJSON);
  setupRates();
  setupDrop();
  setupLote();
  setupMap();
  probeBackend();
  autoRunFromUrl();
}

/* ---------- mapa de estados ---------- */
function setupMap() {
  const grid = $("#mapGrid"), legend = $("#mapLegend"), detail = $("#mapDetail"), seg = $("#mapSeg");
  if (!grid) return;
  let mode = "impact";
  renderMap(grid, legend, detail, mode);
  seg.querySelectorAll(".seg__btn").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    seg.querySelectorAll(".seg__btn").forEach((x) => x.classList.toggle("is-on", x === b));
    renderMap(grid, legend, detail, mode);
  }));
}

/* ---------- análise em lote ---------- */
function setupLote() {
  $("#loteExample").addEventListener("click", () => loadBatch(examplePortfolio()));
  const drop = $("#loteDrop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", async (e) => {
    const files = [...e.dataTransfer.files].filter((f) => /\.xml$/i.test(f.name));
    if (!files.length) return flashError("Solte arquivos .xml de NF-e.");
    const docs = [];
    for (const f of files) {
      try { const d = fiscal.parseNFe(await f.text()); d._setor = d.natureza || "Importada"; if (d.itens.length) docs.push(d); } catch (_) {}
    }
    if (docs.length) loadBatch(docs); else flashError("Nenhum XML válido.");
  });
}

function loadBatch(docs) { state.batchDocs = docs; renderBatch(); $("#loteResults").scrollIntoView({ behavior: "smooth", block: "start" }); }

function renderBatch() {
  const b = analyzeBatch(state.batchDocs, state.year);
  $("#loteResults").hidden = false;
  const delta = b.timeline[b.timeline.length - 1].total - b.current.total;
  const dpct = b.current.total ? (100 * delta) / b.current.total : 0;
  const tiles = [
    { k: "Notas", n: b.count, money: false, s: `base ${brl0(b.base)}` },
    { k: "Hoje", n: b.current.total, money: true, s: `carga ${b.current.carga}%` },
    { k: `Em ${state.year}`, n: b.projected.total, money: true, s: `carga ${b.projected.carga}%`, cls: "accent" },
    { k: "Regime pleno 2033", n: b.timeline[b.timeline.length - 1].total, money: true, s: `carga ${b.timeline[b.timeline.length - 1].carga}%` },
    { k: "Variação até 2033", n: Math.abs(delta), money: true, sign: delta > 0 ? "+" : "−", s: `${delta > 0 ? "+" : "−"}${Math.abs(dpct).toFixed(1)}%`, cls: delta > 0 ? "bad" : "good" },
  ];
  $("#loteKpis").innerHTML = tiles.map((t, i) => `
    <div class="kpi ${t.cls || ""}" style="--kd:${i * 70}ms">
      <span class="kpi__k">${t.k}</span>
      <span class="kpi__v" data-count="${t.n}" data-money="${t.money}" data-sign="${t.sign || ""}">${t.sign || ""}${t.money ? brl0(t.n) : t.n}</span>
      <span class="kpi__s">${t.s}</span>
    </div>`).join("");
  $("#loteKpis").querySelectorAll(".kpi__v").forEach((el) => {
    const money = el.dataset.money === "true", sign = el.dataset.sign || "";
    countUp(el, parseFloat(el.dataset.count), (v) => sign + (money ? brl0(v) : Math.round(v)), 1100);
  });

  renderTimeline($("#loteChart"), b.timeline, b.current.total);
  renderLegend($("#loteLegend"));

  $("#loteSetores").innerHTML = b.bySetor.map((s) => {
    const up = s.deltaPct > 0;
    return `<div class="setor">
      <div class="setor__h"><b>${s.setor}</b><span>${s.count} nota(s)</span></div>
      <div class="setor__b"><span>${brl0(s.hoje)} → ${brl0(s.pleno)}</span>
      <span class="badge ${up ? "badge--bad" : "badge--good"}">${up ? "+" : "−"}${Math.abs(s.deltaPct).toFixed(1)}%</span></div>
    </div>`;
  }).join("");

  const rows = b.perNote.slice(0, 8).map((n) => {
    const up = n.deltaPct > 0;
    return `<tr><td>${n.setor}</td><td class="mono right">${brl0(n.base)}</td><td class="mono right">${brl0(n.hoje)}</td><td class="mono right">${brl0(n.pleno)}</td>
      <td class="right"><span class="badge ${up ? "badge--bad" : "badge--good"}">${up ? "+" : "−"}${Math.abs(n.deltaPct).toFixed(1)}%</span></td></tr>`;
  }).join("");
  $("#loteTable").innerHTML = `<table class="doc__table"><thead><tr><th>Setor</th><th class="right">Base</th><th class="right">Hoje</th><th class="right">2033</th><th class="right">Δ carga</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- alíquotas de referência editáveis ---------- */
const fmtPct = (n) => String(Math.round(n * 100) / 100).replace(".", ",") + "%";
function setupRates() {
  const cbs = $("#cbsRange"), ibs = $("#ibsRange");
  const sync = () => {
    fiscal.setRates({ cbs: parseFloat(cbs.value), ibs: parseFloat(ibs.value) });
    const r = fiscal.refRates();
    $("#cbsVal").textContent = fmtPct(r.cbs);
    $("#ibsVal").textContent = fmtPct(r.ibs);
    $("#ivaTotal").textContent = fmtPct(r.total);
    const custom = r.cbs !== fiscal.DEFAULT_CBS || r.ibs !== fiscal.DEFAULT_IBS;
    $("#resetRates").classList.toggle("is-shown", custom);
    if (state.analysis) recomputeProjection();
    if (state.batchDocs) renderBatch();
  };
  cbs.addEventListener("input", sync);
  ibs.addEventListener("input", sync);
  $("#resetRates").addEventListener("click", () => { cbs.value = fiscal.DEFAULT_CBS; ibs.value = fiscal.DEFAULT_IBS; sync(); });
  sync();
}

function recomputeProjection() {
  state.analysis.projected = fiscal.projectedBreakdown(state.doc, state.year);
  state.analysis.timeline = fiscal.buildTimeline(state.doc);
  renderKPIs();
  renderCompare($("#compareChart"), state.analysis.current, state.analysis.projected, String(state.year));
  $("#compareSub").textContent = `hoje × ${state.year}`;
  renderTimeline($("#timelineChart"), state.analysis.timeline, state.analysis.current.total);
}

function copyResumo() {
  if (!state.analysis) return;
  const { current: c, projected: p, timeline } = state.analysis;
  const d = state.doc, pleno = timeline[timeline.length - 1];
  const txt = `Tributa.AI — ${d.emitente || "nota"} (NF-e ${d.numero || ""})\n`
    + `Base: ${brl(d.valorTotal)}\n`
    + `Hoje: ${brl(c.total)} (${c.carga}%)\n`
    + `${p.year}: ${brl(p.total)} (${p.carga}%)\n`
    + `Regime pleno 2033: ${brl(pleno.total)} (${pleno.carga}%)`;
  navigator.clipboard?.writeText(txt).then(() => flashBtn($("#copyBtn"), "Copiado ✓"));
}

function exportJSON() {
  if (!state.analysis) return;
  const blob = new Blob([JSON.stringify({ documento: state.doc, ...state.analysis }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tributa-ai-${state.doc.numero || "analise"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  flashBtn($("#exportBtn"), "Baixado ✓");
}

function flashBtn(btn, msg) {
  const prev = btn.textContent;
  btn.textContent = msg; btn.classList.add("is-ok");
  setTimeout(() => { btn.textContent = prev; btn.classList.remove("is-ok"); }, 1800);
}

/* Deep-link: ?nota=industria|servico|bebida & ?ano=2030 abre já analisado.
   Adiado para depois do motion.js montar os reveals (evita corrida de scroll). */
function autoRunFromUrl() {
  const p = new URLSearchParams(location.search);
  const ano = parseInt(p.get("ano"));
  if (fiscal.YEARS.includes(ano)) setYear(ano);
  const nota = p.get("nota");
  if (nota && SAMPLES.some((s) => s.id === nota))
    setTimeout(() => { selectSample(nota); analyze(); }, 120);
}

function renderSamples() {
  const host = $("#samples");
  SAMPLES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "sample"; b.dataset.id = s.id;
    b.innerHTML = `<span class="sample__ico">${s.icon}</span>
      <span class="sample__body"><b>${s.label}</b><small>${s.desc}</small></span>`;
    b.addEventListener("click", () => selectSample(s.id));
    host.appendChild(b);
  });
}

function selectSample(id) {
  state.sampleId = id;
  state.xml = SAMPLES.find((s) => s.id === id).xml;
  $("#xmlInput").value = "";
  document.querySelectorAll(".sample").forEach((el) => el.classList.toggle("is-on", el.dataset.id === id));
  $("#analyzeBtn").disabled = false;
}

function onXmlInput(e) {
  const v = e.target.value.trim();
  if (v) {
    state.sampleId = null; state.xml = v;
    document.querySelectorAll(".sample").forEach((el) => el.classList.remove("is-on"));
    $("#analyzeBtn").disabled = false;
  } else if (!state.sampleId) {
    $("#analyzeBtn").disabled = true;
  }
}

function renderYears() {
  const host = $("#years");
  fiscal.YEARS.forEach((y) => {
    const b = document.createElement("button");
    b.className = "year" + (y === state.year ? " is-on" : "");
    b.textContent = y; b.dataset.y = y;
    if (y === 2027) b.classList.add("year--key");
    b.addEventListener("click", () => setYear(y));
    host.appendChild(b);
  });
}

function setYear(y) {
  state.year = y;
  document.querySelectorAll(".year").forEach((el) => el.classList.toggle("is-on", +el.dataset.y === y));
  if (state.analysis) refreshYearViews();
  if (state.batchDocs) renderBatch();
}

/* ---------- backend probe ---------- */
async function probeBackend() {
  const h = await backendHealth(BACKEND_BASE);
  state.backend = h;
  const badge = $("#engineBadge"), label = $("#engineLabel");
  if (h) {
    badge.classList.add("is-live");
    label.textContent = h.llm === "anthropic" ? "API + Claude" : "API FastAPI";
  } else {
    label.textContent = "motor local";
  }
}

/* ---------- análise ---------- */
function analyze() {
  if (state.running) return;
  let doc;
  try { doc = fiscal.parseNFe(state.xml); }
  catch (err) { flashError("Não consegui ler esse XML. Confira se é uma NF-e válida."); return; }
  if (!doc.itens.length) { flashError("A nota não tem itens legíveis."); return; }

  state.doc = doc;
  const current = fiscal.currentBreakdown(doc, 2025);
  const projected = fiscal.projectedBreakdown(doc, state.year);
  const timeline = fiscal.buildTimeline(doc);
  const anomalies = fiscal.checkAnomalies(doc);
  state.analysis = { current, projected, timeline, anomalies };

  $("#results").hidden = false;
  renderKPIs(); renderCharts(); renderDoc(); renderAnomalies();
  renderChatSuggest();
  $("#chatLog").innerHTML = "";
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  runAgent("Qual o impacto da Reforma Tributária nessa nota?", $("#agentSteps"), true);
}

function refreshYearViews() {
  state.analysis.projected = fiscal.projectedBreakdown(state.doc, state.year);
  renderKPIs();
  renderCompare($("#compareChart"), state.analysis.current, state.analysis.projected, String(state.year));
  $("#compareSub").textContent = `hoje × ${state.year}`;
}

function renderKPIs() {
  const { current: c, projected: p, timeline } = state.analysis;
  const pleno = timeline[timeline.length - 1];
  const delta = p.total - c.total, dpct = c.total ? (100 * delta) / c.total : 0;
  const up = delta > 0;
  const tiles = [
    { k: "Hoje", n: c.total, sign: "", s: `carga ${c.carga}%`, cls: "" },
    { k: `Em ${p.year}`, n: p.total, sign: "", s: `carga ${p.carga}%`, cls: "accent" },
    { k: "Variação", n: Math.abs(delta), sign: up ? "+" : "−", s: `${up ? "+" : "−"}${Math.abs(dpct).toFixed(1)}%`, cls: up ? "bad" : "good" },
    { k: "Regime pleno 2033", n: pleno.total, sign: "", s: `carga ${pleno.carga}%`, cls: "" },
  ];
  $("#kpis").innerHTML = tiles.map((t, i) => `
    <div class="kpi ${t.cls}" style="--kd:${i * 80}ms">
      <span class="kpi__k">${t.k}</span>
      <span class="kpi__v" data-count="${t.n}" data-sign="${t.sign}">${t.sign}${brl0(t.n)}</span>
      <span class="kpi__s">${t.s}</span>
    </div>`).join("");
  $("#kpis").querySelectorAll(".kpi__v").forEach((el) => {
    const sign = el.dataset.sign || "";
    countUp(el, parseFloat(el.dataset.count), (v) => sign + brl0(v), 1200);
  });
}

function renderCharts() {
  renderCompare($("#compareChart"), state.analysis.current, state.analysis.projected, String(state.year));
  $("#compareSub").textContent = `hoje × ${state.year}`;
  renderTimeline($("#timelineChart"), state.analysis.timeline, state.analysis.current.total);
  renderLegend($("#legend"));
}

function renderDoc() {
  const d = state.doc;
  $("#resultTitle").textContent = d.emitente ? `Análise · ${d.emitente}` : "Análise";
  $("#docKey").textContent = d.numero ? `NF-e nº ${d.numero}` : "";
  const itens = d.itens.map((i) => `
    <tr><td>${i.descricao}</td><td class="mono">${i.ncm || i.cfop || "—"}</td><td class="mono right">${brl(i.valor)}</td></tr>`).join("");
  $("#docBody").innerHTML = `
    <div class="doc__meta">
      <div><span>Emitente</span><b>${d.emitente || "—"}</b></div>
      <div><span>Destinatário</span><b>${d.destinatario || "—"}</b></div>
      <div><span>Operação</span><b>${d.ufOrigem || "?"} → ${d.ufDestino || "?"}${d.isServico ? " · serviço" : ""}</b></div>
      <div><span>Base (produtos)</span><b>${brl(d.valorTotal)}</b></div>
    </div>
    <table class="doc__table"><thead><tr><th>Item</th><th>NCM/CFOP</th><th class="right">Valor</th></tr></thead><tbody>${itens}</tbody></table>`;
}

function renderAnomalies() {
  const icon = { info: "ℹ", aviso: "⚠", erro: "✕" };
  $("#anomalies").innerHTML = state.analysis.anomalies.map((a) => `
    <div class="anom anom--${a.severity}">
      <span class="anom__ico">${icon[a.severity] || "•"}</span>
      <span>${a.item ? `<b>Item ${a.item}</b> · ` : ""}${a.message}</span>
    </div>`).join("");
}

/* ---------- agente (raciocínio ao vivo) ---------- */
function makeAgent() {
  if (state.backend) return new BackendAgent(BACKEND_BASE, state.sampleId, state.sampleId ? null : state.xml, state.year, fiscal.refRates());
  return new DemoAgent(state.doc, state.year);
}

async function runAgent(question, container, reset) {
  state.running = true;
  $("#analyzeBtn").classList.add("is-loading");
  $("#agentSrc").textContent = state.backend ? (state.backend.llm === "anthropic" ? "Claude · ao vivo" : "FastAPI · ao vivo") : "demo · ao vivo";
  if (reset) container.innerHTML = "";
  const agent = makeAgent();
  let answer = "";
  try {
    for await (const step of agent.run(question)) {
      appendStep(container, step);
      if (step.kind === "answer") answer = step.content;
    }
  } catch (err) {
    appendStep(container, { kind: "answer", content: "Falha ao consultar o agente — usando o motor local." });
    const demo = new DemoAgent(state.doc, state.year);
    for await (const step of demo.run(question)) { appendStep(container, step); if (step.kind === "answer") answer = step.content; }
  }
  state.running = false;
  $("#analyzeBtn").classList.remove("is-loading");
  return answer;
}

const TOOL_LABEL = {
  parse_nfe: "parse_nfe", compute_current: "compute_current", project_reform: "project_reform",
  build_timeline: "build_timeline", check_anomalies: "check_anomalies", reference_rates: "reference_rates",
};

function appendStep(container, step) {
  if (step.kind === "tool_call") {
    const card = document.createElement("div");
    card.className = "trace";
    card.innerHTML = `
      <div class="trace__head">
        <span class="trace__spin" aria-hidden="true"></span>
        <span class="trace__tool mono">${TOOL_LABEL[step.tool] || step.tool}</span>
        <span class="trace__label">${step.content || ""}</span>
      </div>
      <div class="trace__body"></div>`;
    container.appendChild(card);
    container._open = card;
    pop(card);
  } else if (step.kind === "observation") {
    const card = container._open;
    if (card) {
      card.classList.add("is-done");
      card.querySelector(".trace__body").innerHTML = formatObs(step.tool, step.result);
      container._open = null;
    }
  } else if (step.kind === "answer") {
    const node = document.createElement("div");
    node.className = "astep__answer";
    container.appendChild(node);
    typeText(node, step.content || "", 900);
    pop(node);
  }
  container.scrollTop = container.scrollHeight;
}

function pop(node) {
  if (REDUCE) return;
  node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
}

/* observações viram resumos legíveis (chips/mini-tabela), não JSON cru */
function chip(label, val) { return `<span class="ochip"><b>${label}</b>${val}</span>`; }

function formatObs(tool, r) {
  if (r == null) return "";
  try {
    if (tool === "parse_nfe")
      return chip("emitente", escapeHtml((r.emitente || "—").split(" ").slice(0, 2).join(" ")))
        + chip("UF", escapeHtml(r.uf || "—")) + chip("itens", r.itens) + chip("base", brl0(r.valor_total || 0));
    if (tool === "compute_current" || tool === "project_reform") {
      const parts = [["ICMS", r.icms], ["ISS", r.iss], ["PIS", r.pis], ["COFINS", r.cofins], ["IPI", r.ipi], ["CBS", r.cbs], ["IBS", r.ibs], ["IS", r.iseletivo]]
        .filter(([, v]) => v > 0.005).map(([k, v]) => chip(k, brl0(v))).join("");
      return `<div class="ohead"><b>${brl(r.total)}</b><span>carga ${r.carga}%</span></div>${parts}`;
    }
    if (tool === "build_timeline" && Array.isArray(r)) {
      const a = r[0], z = r[r.length - 1];
      return `<div class="ospark">${spark(r.map((b) => b.total))}</div>`
        + chip(a.year, `${a.carga}%`) + chip(z.year, `${z.carga}%`);
    }
    if (tool === "check_anomalies" && Array.isArray(r)) {
      return r.map((a) => `<div class="oanom oanom--${a.severity}">${escapeHtml(a.message)}</div>`).join("");
    }
    if (tool === "reference_rates") return chip("CBS", r.cbs + "%") + chip("IBS", r.ibs + "%") + chip("total", r.total + "%");
  } catch (e) { /* cai no genérico */ }
  const s = JSON.stringify(r);
  return `<span class="omono mono">${escapeHtml(s.length > 160 ? s.slice(0, 157) + "…" : s)}</span>`;
}

/* mini sparkline inline (SVG) da carga ano a ano */
function spark(vals) {
  const w = 160, h = 34, max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" class="sparksvg" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#8b7bff"/></linearGradient></defs></svg>`;
}

/* ---------- chat ---------- */
function renderChatSuggest() {
  const qs = ["Tem algo errado na nota?", "E se fosse 2030?", "Mostra a evolução ano a ano", "Por que o serviço é mais impactado?"];
  $("#chatSuggest").innerHTML = qs.map((q) => `<button class="chip" type="button">${q}</button>`).join("");
  $("#chatSuggest").querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => { $("#chatInput").value = b.textContent; $("#chatForm").requestSubmit(); }));
}

async function onChat(e) {
  e.preventDefault();
  const input = $("#chatInput"), q = input.value.trim();
  if (!q || state.running || !state.analysis) return;
  input.value = "";
  const log = $("#chatLog");
  const userBubble = document.createElement("div");
  userBubble.className = "bubble bubble--user"; userBubble.textContent = q;
  log.appendChild(userBubble);
  const wrap = document.createElement("div");
  wrap.className = "bubble bubble--agent";
  const steps = document.createElement("div"); steps.className = "bubble__steps";
  wrap.appendChild(steps); log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  await runAgent(q, steps, false);
}

/* ---------- drop zone ---------- */
function setupDrop() {
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { $("#xmlInput").value = r.result; onXmlInput({ target: $("#xmlInput") }); };
    r.readAsText(f);
  });
}

function flashError(msg) {
  const btn = $("#analyzeBtn");
  const prev = $("#analyzeLabel").textContent;
  $("#analyzeLabel").textContent = msg;
  btn.classList.add("is-error");
  setTimeout(() => { $("#analyzeLabel").textContent = prev; btn.classList.remove("is-error"); }, 2600);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

boot();
