/* ===========================================================================
 * map.js — mapa de calor (tile-grid) dos estados.
 * Dados REAIS: alíquota de ICMS interna 2026 por UF (fontes fiscais) + direção
 * do impacto da Reforma pelo princípio do destino (estudo IPEA).
 * Perdem arrecadação (origem/produção): AM, ES, MT, MS, SP, RO.
 * Ganham (consumo): os demais 18 estados + DF.
 * ===========================================================================*/
const PERDE = new Set(["AM", "ES", "MT", "MS", "SP", "RO"]);

// icms = alíquota interna 2026 (%). r/c = posição aproximada no grid (geográfica).
const RAW = [
  ["RR", "Roraima", 20, 0, 2], ["AP", "Amapá", 18, 0, 3],
  ["AM", "Amazonas", 20, 1, 1], ["PA", "Pará", 19, 1, 3], ["MA", "Maranhão", 23, 1, 4], ["CE", "Ceará", 20, 1, 5], ["RN", "Rio Grande do Norte", 20, 1, 6],
  ["AC", "Acre", 19, 2, 0], ["RO", "Rondônia", 19.5, 2, 1], ["TO", "Tocantins", 20, 2, 3], ["PI", "Piauí", 22.5, 2, 4], ["PB", "Paraíba", 20, 2, 5], ["PE", "Pernambuco", 20.5, 2, 6],
  ["MT", "Mato Grosso", 17, 3, 2], ["GO", "Goiás", 19, 3, 3], ["BA", "Bahia", 20.5, 3, 4], ["AL", "Alagoas", 20.5, 3, 5], ["SE", "Sergipe", 19, 3, 6],
  ["MS", "Mato Grosso do Sul", 17, 4, 2], ["DF", "Distrito Federal", 20, 4, 3], ["MG", "Minas Gerais", 18, 4, 4], ["ES", "Espírito Santo", 17, 4, 5],
  ["SP", "São Paulo", 18, 5, 3], ["RJ", "Rio de Janeiro", 20, 5, 4],
  ["PR", "Paraná", 19.5, 6, 3],
  ["SC", "Santa Catarina", 17, 7, 3],
  ["RS", "Rio Grande do Sul", 17, 8, 3],
];

export const ESTADOS = RAW.map(([uf, nome, icms, r, c]) => ({
  uf, nome, icms, r, c, perde: PERDE.has(uf),
}));

const ICMS_MIN = 17, ICMS_MAX = 23;
const GAIN = "#2dd4bf", LOSE = "#e06a6a";

function lerpHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "#" + p.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const rateColor = (icms) => lerpHex("#17324e", "#5ab0ff", Math.max(0, Math.min(1, (icms - ICMS_MIN) / (ICMS_MAX - ICMS_MIN))));
const fmt = (n) => String(n).replace(".", ",") + "%";

export function renderMap(gridEl, legendEl, detailEl, mode = "impact") {
  gridEl.innerHTML = "";
  for (const e of ESTADOS) {
    const color = mode === "impact" ? (e.perde ? LOSE : GAIN) : rateColor(e.icms);
    const tile = document.createElement("button");
    tile.className = "uf"; tile.type = "button";
    tile.style.gridRow = e.r + 1; tile.style.gridColumn = e.c + 1;
    tile.style.background = color;
    tile.style.color = mode === "rate" && e.icms < 19.5 ? "#dfeaf7" : "#06121a";
    tile.innerHTML = `<b>${e.uf}</b><small>${fmt(e.icms)}</small>`;
    const show = () => showDetail(detailEl, e);
    tile.addEventListener("mouseenter", show);
    tile.addEventListener("focus", show);
    tile.addEventListener("click", show);
    gridEl.appendChild(tile);
  }
  legendEl.innerHTML = mode === "impact"
    ? `<span class="legend-item"><i style="background:${GAIN}"></i>Tende a ganhar (consumo)</span>
       <span class="legend-item"><i style="background:${LOSE}"></i>Tende a perder (produção)</span>`
    : `<span class="legend-item"><i style="background:${rateColor(17)}"></i>ICMS 17%</span>
       <span class="legend-item"><i style="background:${rateColor(20)}"></i>~20%</span>
       <span class="legend-item"><i style="background:${rateColor(23)}"></i>23%</span>`;
  if (!detailEl.dataset.touched) showDefault(detailEl);
}

function showDefault(el) {
  el.innerHTML = `<div class="mapd__hint">Passe o mouse (ou toque) num estado.</div>
    <div class="mapd__note">No regime novo, o imposto estadual (IBS) é cobrado no <b>destino</b> e com alíquota <b>uniforme</b> no país — hoje cada estado tem a sua. A partilha migra gradualmente até 2078.</div>`;
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
    <div class="mapd__row"><span>No novo regime</span><b>IBS (referência ~17,7%, nacional)</b></div>
    <div class="mapd__note">${motivo}</div>`;
}
