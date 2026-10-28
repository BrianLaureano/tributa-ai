/* ===========================================================================
 * fiscal.js — motor fiscal da Reforma Tributária, porta fiel do backend Python.
 * Roda 100% no navegador: parse de NF-e (DOMParser) + cálculo atual x reforma.
 * Os números batem com backend/app/fiscal/engine.py (coberto por pytest).
 * ===========================================================================*/
// Alíquotas de REFERÊNCIA do regime pleno (editáveis — ainda serão fixadas por
// Resolução do Senado). Padrão = estimativa oficial do Ministério da Fazenda.
export const DEFAULT_CBS = 8.8, DEFAULT_IBS = 17.7;
export const CONFIG = { cbsRef: DEFAULT_CBS, ibsRef: DEFAULT_IBS };
export function setRates({ cbs, ibs } = {}) {
  if (cbs != null && isFinite(cbs) && cbs >= 0) CONFIG.cbsRef = cbs;
  if (ibs != null && isFinite(ibs) && ibs >= 0) CONFIG.ibsRef = ibs;
}
export function refRates() {
  return { cbs: CONFIG.cbsRef, ibs: CONFIG.ibsRef, total: Math.round((CONFIG.cbsRef + CONFIG.ibsRef) * 100) / 100 };
}

const PIS_PADRAO = 1.65, COFINS_PADRAO = 7.6, ICMS_PADRAO = 18.0, ISS_PADRAO = 5.0;

// Imposto Seletivo por prefixo de NCM (ilustrativo).
const IS_NCM = { "2402": 40, "2203": 10, "2204": 10, "2208": 12, "2202": 5, "8703": 8 };
// Redutores da LC 214/2025: fração da alíquota de referência.
const REDUCAO_NCM = { "1006": 0, "0713": 0, "0401": 0, "3004": 0.4, "3002": 0.4 };

// Cronograma. cbs:null => usa a referência (CONFIG.cbsRef). ibs: ['abs',x] fixa
// em lei, ou ['frac',f] fração da referência. 2026 comp=true (compensável/neutro).
const SCHEDULE = {
  2025: { cbs: 0,    ibs: ["abs", 0],    legacy: 1,   pisco: true,  ipi: true,  is: false, comp: false, note: "Regime atual, sem CBS/IBS." },
  2026: { cbs: 0.9,  ibs: ["abs", 0.1],  legacy: 1,   pisco: true,  ipi: true,  is: false, comp: true,  note: "Ano-teste: CBS 0,9% e IBS 0,1% são compensáveis — carga praticamente igual à de hoje." },
  2027: { cbs: null, ibs: ["abs", 0.1],  legacy: 1,   pisco: false, ipi: false, is: true,  comp: false, note: "CBS cheia; PIS/COFINS extintos; IPI zerado (salvo ZFM); IS começa; IBS a 0,1%." },
  2028: { cbs: null, ibs: ["abs", 0.1],  legacy: 1,   pisco: false, ipi: false, is: true,  comp: false, note: "CBS cheia; IBS a 0,1%; ICMS/ISS integrais." },
  2029: { cbs: null, ibs: ["frac", 0.10], legacy: 0.9, pisco: false, ipi: false, is: true, comp: false, note: "IBS a 10% da referência; ICMS/ISS a 90%." },
  2030: { cbs: null, ibs: ["frac", 0.20], legacy: 0.8, pisco: false, ipi: false, is: true, comp: false, note: "IBS a 20%; ICMS/ISS a 80%." },
  2031: { cbs: null, ibs: ["frac", 0.30], legacy: 0.7, pisco: false, ipi: false, is: true, comp: false, note: "IBS a 30%; ICMS/ISS a 70%." },
  2032: { cbs: null, ibs: ["frac", 0.40], legacy: 0.6, pisco: false, ipi: false, is: true, comp: false, note: "IBS a 40%; ICMS/ISS a 60%." },
  2033: { cbs: null, ibs: ["frac", 1.0],  legacy: 0,   pisco: false, ipi: false, is: true, comp: false, note: "Regime pleno: ICMS e ISS extintos." },
};
export const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

const digits = (s) => (s || "").replace(/\D/g, "");
function profile(y) {
  const s = SCHEDULE[Math.min(2033, Math.max(2025, y))];
  const cbs = s.cbs == null ? CONFIG.cbsRef : s.cbs;
  const ibs = s.ibs[0] === "abs" ? s.ibs[1] : Math.round(CONFIG.ibsRef * s.ibs[1] * 1e4) / 1e4;
  return { ...s, cbs, ibs };
}
function selectiveRate(ncm) {
  const d = digits(ncm);
  for (const p in IS_NCM) if (d.startsWith(p)) return IS_NCM[p];
  return 0;
}
function reduction(ncm) {
  const d = digits(ncm);
  for (const p in REDUCAO_NCM) if (d.startsWith(p)) return REDUCAO_NCM[p];
  return 1;
}

/* ---------- parser de NF-e (XML) ---------- */
export function parseNFe(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML inválido.");
  const q = (el, tag) => el ? el.getElementsByTagName(tag)[0] : null;
  const t = (el, tag) => { const n = q(el, tag); return n ? n.textContent.trim() : ""; };
  const num = (el, tag) => parseFloat(t(el, tag)) || 0;

  const inf = doc.getElementsByTagName("infNFe")[0] || doc.documentElement;
  const emit = q(inf, "emit"), dest = q(inf, "dest"), tot = q(inf, "ICMSTot");
  const out = {
    numero: t(inf, "nNF"), natureza: t(inf, "natOp"),
    emitente: emit ? t(emit, "xNome") : "", destinatario: dest ? t(dest, "xNome") : "",
    ufOrigem: emit ? t(q(emit, "enderEmit"), "UF") : "",
    ufDestino: dest ? t(q(dest, "enderDest"), "UF") : "",
    valorTotal: tot ? num(tot, "vProd") : 0, itens: [], isServico: false,
  };
  const dets = inf.getElementsByTagName("det");
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i], prod = q(det, "prod"), imp = q(det, "imposto");
    if (!prod) continue;
    const it = {
      numero: parseInt(det.getAttribute("nItem")) || i + 1,
      descricao: t(prod, "xProd") || "(sem descrição)",
      ncm: t(prod, "NCM") || null, cfop: t(prod, "CFOP") || null,
      valor: num(prod, "vProd"),
      vicms: 0, vipi: 0, vpis: 0, vcofins: 0, viss: 0, aliqIcms: 0, servico: false,
    };
    if (imp) {
      const icms = q(imp, "ICMS");
      if (icms) { it.vicms = num(icms, "vICMS"); it.aliqIcms = num(icms, "pICMS"); }
      it.vipi = num(imp, "vIPI"); it.vpis = num(imp, "vPIS"); it.vcofins = num(imp, "vCOFINS");
      const iss = q(imp, "ISSQN");
      if (iss) { it.servico = true; it.viss = num(iss, "vISSQN"); }
    }
    out.itens.push(it);
  }
  out.isServico = out.itens.length > 0 && out.itens.every((i) => i.servico);
  if (!out.valorTotal) out.valorTotal = round(out.itens.reduce((s, i) => s + i.valor, 0));
  return out;
}

const round = (n) => Math.round(n * 100) / 100;
function finalize(bd) {
  for (const k of ["icms", "iss", "pis", "cofins", "ipi", "cbs", "ibs", "iseletivo"]) bd[k] = round(bd[k]);
  bd.total = round(bd.icms + bd.iss + bd.pis + bd.cofins + bd.ipi + bd.cbs + bd.ibs + bd.iseletivo);
  bd.carga = bd.base ? round((100 * bd.total) / bd.base) : 0;
  return bd;
}
const blank = (year, base, note) => ({
  year, base, note, icms: 0, iss: 0, pis: 0, cofins: 0, ipi: 0, cbs: 0, ibs: 0, iseletivo: 0,
});

/* ---------- regime atual (usa valores apurados do XML) ---------- */
export function currentBreakdown(doc, year = 2025) {
  const p = profile(year), base = round(doc.itens.reduce((s, i) => s + i.valor, 0));
  const bd = blank(year, base, "Regime atual: ICMS/ISS + PIS/COFINS + IPI.");
  for (const it of doc.itens) {
    if (it.servico || doc.isServico) bd.iss += it.viss || (it.valor * ISS_PADRAO) / 100;
    else { bd.icms += it.vicms || (it.valor * ICMS_PADRAO) / 100; bd.ipi += it.vipi; }
    if (p.pisco) { bd.pis += it.vpis || (it.valor * PIS_PADRAO) / 100; bd.cofins += it.vcofins || (it.valor * COFINS_PADRAO) / 100; }
  }
  return finalize(bd);
}

/* ---------- regime da Reforma para o ano-alvo ---------- */
export function projectedBreakdown(doc, year) {
  const p = profile(year), base = round(doc.itens.reduce((s, i) => s + i.valor, 0));
  const bd = blank(year, base, p.note);
  for (const it of doc.itens) {
    const v = it.valor;
    if (p.legacy > 0) {
      if (it.servico || doc.isServico) bd.iss += (it.viss || (v * ISS_PADRAO) / 100) * p.legacy;
      else bd.icms += (it.vicms || (v * ICMS_PADRAO) / 100) * p.legacy;
    }
    if (p.ipi) bd.ipi += it.vipi;
    if (p.pisco) { bd.pis += it.vpis || (v * PIS_PADRAO) / 100; bd.cofins += it.vcofins || (v * COFINS_PADRAO) / 100; }
    // 2026 (comp): CBS/IBS são compensáveis -> não acrescentam carga.
    if (!p.comp) {
      const red = reduction(it.ncm);
      bd.cbs += (v * p.cbs) / 100 * red;
      bd.ibs += (v * p.ibs) / 100 * red;
      if (p.is) bd.iseletivo += (v * selectiveRate(it.ncm)) / 100;
    }
  }
  return finalize(bd);
}

export function buildTimeline(doc) { return YEARS.map((y) => projectedBreakdown(doc, y)); }

/* ---------- checagem de anomalias ---------- */
export function checkAnomalies(doc) {
  const out = [];
  for (const it of doc.itens) {
    const ncm = digits(it.ncm), cfop = digits(it.cfop);
    if (!doc.isServico && ncm.length !== 8)
      out.push({ severity: "aviso", item: it.numero, code: "NCM_INVALIDO", message: `NCM '${it.ncm}' não tem 8 dígitos — impacta IS e enquadramento no novo regime.` });
    if (!doc.isServico && cfop.length !== 4)
      out.push({ severity: "aviso", item: it.numero, code: "CFOP_INVALIDO", message: `CFOP '${it.cfop}' inválido (esperado 4 dígitos).` });
    else if (cfop && doc.ufOrigem && doc.ufDestino && doc.ufOrigem !== doc.ufDestino && cfop[0] === "5")
      out.push({ severity: "erro", item: it.numero, code: "CFOP_UF", message: `CFOP ${cfop} é interno, mas a operação é interestadual (${doc.ufOrigem}→${doc.ufDestino}).` });
  }
  const soma = round(doc.itens.reduce((s, i) => s + i.valor, 0));
  if (doc.valorTotal && Math.abs(soma - doc.valorTotal) > 0.02)
    out.push({ severity: "erro", code: "TOTAL_DIVERGENTE", message: `Soma dos itens (R$ ${soma.toFixed(2)}) difere do total declarado (R$ ${doc.valorTotal.toFixed(2)}).` });
  if (!out.length) out.push({ severity: "info", code: "OK", message: "Nenhuma inconsistência estrutural encontrada." });
  return out;
}
