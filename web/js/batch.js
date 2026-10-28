/* ===========================================================================
 * batch.js — análise em LOTE: o impacto da Reforma na operação inteira.
 * Reaproveita o motor fiscal por nota e agrega (total, por setor, piores notas).
 * É o caso de uso real de uma empresa como a S2M: milhões de notas, não uma.
 * ===========================================================================*/
import * as fiscal from "./fiscal.js";
import { SAMPLES } from "./samples.js";

const round = (n) => Math.round(n * 100) / 100;
const FIELDS = ["icms", "iss", "pis", "cofins", "ipi", "cbs", "ibs", "iseletivo"];

/* clona uma nota e escala os valores (para gerar uma carteira variada) */
function scaleDoc(doc, f, setor) {
  const d = JSON.parse(JSON.stringify(doc));
  d.itens.forEach((it) => ["valor", "vicms", "vipi", "vpis", "vcofins", "viss"]
    .forEach((k) => { it[k] = round((it[k] || 0) * f); }));
  d.valorTotal = round(d.valorTotal * f);
  d._setor = setor;
  return d;
}

/* carteira de demonstração: 12 notas (indústria, serviço, bebida) com portes variados */
export function examplePortfolio() {
  const plan = [
    ["industria", [0.6, 1, 1.5, 2.2, 3]],
    ["servico", [0.5, 1, 1.8, 3]],
    ["bebida", [0.7, 1, 1.6]],
  ];
  const docs = [];
  for (const [id, factors] of plan) {
    const s = SAMPLES.find((x) => x.id === id);
    const base = fiscal.parseNFe(s.xml);
    for (const f of factors) docs.push(scaleDoc(base, f, s.label));
  }
  return docs;
}

function sumBreakdowns(list) {
  const o = { base: 0 };
  FIELDS.forEach((k) => (o[k] = 0));
  for (const b of list) {
    o.base += b.base || 0;
    FIELDS.forEach((k) => (o[k] += b[k] || 0));
  }
  o.base = round(o.base);
  FIELDS.forEach((k) => (o[k] = round(o[k])));
  o.total = round(FIELDS.reduce((s, k) => s + o[k], 0));
  o.carga = o.base ? round((100 * o.total) / o.base) : 0;
  return o;
}

export function analyzeBatch(docs, year) {
  const cur = docs.map((d) => fiscal.currentBreakdown(d, 2025));
  const proj = docs.map((d) => fiscal.projectedBreakdown(d, year));
  const tls = docs.map((d) => fiscal.buildTimeline(d));

  const current = sumBreakdowns(cur);
  const projected = sumBreakdowns(proj);
  const timeline = fiscal.YEARS.map((y, j) => {
    const agg = sumBreakdowns(tls.map((t) => t[j]));
    agg.year = y;
    return agg;
  });

  const perNote = docs.map((d, i) => {
    const c = cur[i], pleno = tls[i][tls[i].length - 1];
    return {
      setor: d._setor || "Nota", emitente: d.emitente, numero: d.numero,
      base: d.valorTotal, hoje: c.total, cargaHoje: c.carga,
      pleno: pleno.total, cargaPleno: pleno.carga,
      delta: round(pleno.total - c.total),
      deltaPct: c.total ? round((100 * (pleno.total - c.total)) / c.total) : 0,
    };
  }).sort((a, b) => b.deltaPct - a.deltaPct);

  // resumo por setor
  const setores = {};
  perNote.forEach((n) => {
    const s = setores[n.setor] || (setores[n.setor] = { setor: n.setor, count: 0, hoje: 0, pleno: 0 });
    s.count++; s.hoje += n.hoje; s.pleno += n.pleno;
  });
  const bySetor = Object.values(setores).map((s) => ({
    ...s, hoje: round(s.hoje), pleno: round(s.pleno),
    deltaPct: s.hoje ? round((100 * (s.pleno - s.hoje)) / s.hoje) : 0,
  })).sort((a, b) => b.deltaPct - a.deltaPct);

  return { count: docs.length, base: current.base, current, projected, timeline, perNote, bySetor };
}
