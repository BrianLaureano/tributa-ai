/* ===========================================================================
 * agent.js — o agente autônomo visto pelo front.
 *  - DemoAgent: roda offline, planeja pela intenção e chama o motor fiscal real
 *    (fiscal.js). Os passos saem "aos poucos" para mostrar o raciocínio ao vivo.
 *  - BackendAgent: conversa com a API FastAPI via SSE quando ela está no ar.
 * ===========================================================================*/
import * as fiscal from "./fiscal.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* Planeja a sequência de ferramentas a partir da pergunta. */
function plan(q) {
  const s = (q || "").toLowerCase();
  if (/(errad|anomal|inconsist|problema|valid|confere|erro)/.test(s))
    return ["parse_nfe", "check_anomalies"];
  if (/(2033|transi|ano a ano|cronograma|evolu|linha do tempo|futuro)/.test(s))
    return ["parse_nfe", "compute_current", "build_timeline"];
  return ["parse_nfe", "compute_current", "project_reform"];
}

const LABELS = {
  parse_nfe: "Lendo a NF-e (emitente, itens, NCM/CFOP)…",
  compute_current: "Apurando a carga no regime atual…",
  project_reform: "Projetando o regime da Reforma (CBS/IBS/IS)…",
  build_timeline: "Montando a transição ano a ano (2026→2033)…",
  check_anomalies: "Verificando consistência fiscal…",
};

export class DemoAgent {
  constructor(doc, targetYear = 2027) { this.doc = doc; this.year = targetYear; }

  async *run(question) {
    const steps = plan(question);
    const obs = {};
    for (const tool of steps) {
      yield { kind: "tool_call", tool, content: LABELS[tool] };
      await sleep(430);
      const result = this._exec(tool);
      obs[tool] = result;
      yield { kind: "observation", tool, result, content: preview(result) };
      await sleep(190);
    }
    await sleep(200);
    yield { kind: "answer", content: this._answer(question, obs) };
  }

  _exec(tool) {
    switch (tool) {
      case "parse_nfe":
        return { numero: this.doc.numero, emitente: this.doc.emitente,
          uf: `${this.doc.ufOrigem}→${this.doc.ufDestino}`, itens: this.doc.itens.length,
          valor_total: this.doc.valorTotal, produtos: this.doc.itens.map((i) => i.descricao) };
      case "compute_current": return fiscal.currentBreakdown(this.doc, 2025);
      case "project_reform": return fiscal.projectedBreakdown(this.doc, this.year);
      case "build_timeline": return fiscal.buildTimeline(this.doc);
      case "check_anomalies": return fiscal.checkAnomalies(this.doc);
      default: return null;
    }
  }

  _answer(q, obs) {
    const cur = obs.compute_current, pr = obs.project_reform;
    if (cur && pr) {
      const d = pr.total - cur.total, up = d > 0;
      return `No regime atual esta nota recolhe ${brl(cur.total)} (carga efetiva de ${cur.carga}%). ` +
        `No regime da Reforma em ${pr.year}, a carga ${up ? "sobe" : "cai"} para ${brl(pr.total)} ` +
        `(${pr.carga}%) — variação de ${brl(Math.abs(d))} ${up ? "a mais" : "a menos"}. ` +
        `CBS e IBS substituem PIS/COFINS/IPI e ICMS/ISS com não-cumulatividade plena.`;
    }
    if (obs.build_timeline) {
      const tl = obs.build_timeline, a = tl[0], z = tl[tl.length - 1];
      return `Ao longo da transição, a carga sai de ${a.carga}% em ${a.year} para ${z.carga}% ` +
        `no regime pleno (${z.year}). O ICMS/ISS vai sendo substituído gradualmente pelo IBS entre 2029 e 2033.`;
    }
    if (obs.check_anomalies) {
      const list = obs.check_anomalies, bad = list.filter((a) => a.code !== "OK");
      return bad.length
        ? `Encontrei ${bad.length} ponto(s) de atenção: ${bad.map((a) => a.message).join(" ")}`
        : `Nenhuma inconsistência estrutural. A nota está pronta para o enquadramento no novo regime.`;
    }
    return "Processei a nota com as ferramentas fiscais — veja o detalhamento acima.";
  }
}

/* Agente real via SSE (usado quando o backend FastAPI está no ar). */
export class BackendAgent {
  constructor(base, sample, xml, targetYear, rates) {
    this.base = base; this.sample = sample; this.xml = xml; this.year = targetYear; this.rates = rates || {};
  }
  async *run(question) {
    const resp = await fetch(`${this.base}/api/agent/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, sample: this.sample, xml: this.xml, target_year: this.year,
        cbs_ref: this.rates.cbs, ibs_ref: this.rates.ibs }),
    });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop();
      for (const p of parts) {
        const line = p.replace(/^data: /, "").trim();
        if (!line || line === "[DONE]") continue;
        yield JSON.parse(line);
      }
    }
  }
}

function preview(obj) {
  try { const s = JSON.stringify(obj); return s.length > 240 ? s.slice(0, 237) + "…" : s; }
  catch { return String(obj); }
}

export async function backendHealth(base) {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1200) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
