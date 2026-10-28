# Tributa.AI — Agente de IA da Reforma Tributária

> Um agente autônomo que lê uma **NF-e real**, apura a carga tributária de **hoje**
> (ICMS, PIS/COFINS, IPI, ISS) direto do documento e **simula a Reforma Tributária**
> (CBS, IBS e Imposto Seletivo) ao longo da transição **2026 → 2033** — explicando
> o impacto em português, com o raciocínio e as *tool-calls* do agente ao vivo.

🔗 **Demo ao vivo:** https://brianlaureano.github.io/tributa-ai/
📂 **Código:** este repositório (backend Python + frontend)

---

## Por que esse projeto

Toda empresa brasileira vai sentir a Reforma Tributária nos próximos anos, e **ninguém
tem número "pronto"** para o novo regime — porque as alíquotas de referência de CBS/IBS
ainda serão fixadas por Resolução do Senado. É exatamente o tipo de problema onde uma
**camada de IA sobre dados fiscais** agrega valor: ler o documento, cruzar com a regra,
projetar cenários e **explicar** — sem substituir o motor de compliance, e sim
complementando-o.

Foi construído como demonstração técnica de:
- **Integração de LLM via tool-calling** (agente que escolhe e executa ferramentas);
- **Automação/pipeline** sobre documento fiscal estruturado (XML de NF-e → JSON);
- **API REST** (FastAPI) com contratos tipados (Pydantic) e streaming (SSE);
- **Domínio fiscal** (regra atual + Reforma Tributária).

## O que ele faz

1. **Lê a NF-e** (XML modelo 55) e extrai emitente, itens, NCM/CFOP e totais.
2. **Apura a carga atual** — usando os valores **já apurados no próprio XML**
   (`vICMS`, `vPIS`, `vCOFINS`, `vIPI`), então não é estimativa.
3. **Projeta a Reforma** para qualquer ano de 2026 a 2033, aplicando a transição real
   (CBS cheia em 2027, IBS gradual 2029-2033, ICMS/ISS decrescentes, Imposto Seletivo,
   redutores de cesta básica/saúde).
4. **Detecta inconsistências** (NCM/CFOP, CFOP interestadual, divergência de totais).
5. **Responde em linguagem natural** ("e se fosse 2030?", "tem algo errado?"), mostrando
   cada passo do agente: pensamento → ferramenta → observação → resposta.

## Arquitetura

```
tributa-ai/
├── backend/                 # Python — a prova técnica
│   ├── app/
│   │   ├── main.py          # FastAPI: /analyze, /chat, /agent/stream (SSE)
│   │   ├── models.py        # Pydantic — contratos JSON
│   │   ├── fiscal/
│   │   │   ├── rates.py     # transição 2026-2033 + alíquotas de referência (fontes citadas)
│   │   │   ├── engine.py    # motor PURO de cálculo (atual x reforma)
│   │   │   └── rules.py     # checagem de anomalias
│   │   ├── parsing/nfe.py   # parser de NF-e (XML → modelo)
│   │   ├── agent/
│   │   │   ├── agent.py     # loop ReAct (planeja → age → observa → responde)
│   │   │   ├── tools.py     # ferramentas do agente (schema + execução)
│   │   │   └── llm.py       # Anthropic (Claude) OU mock determinístico
│   │   └── samples.py       # 3 NF-e de exemplo embutidas
│   └── tests/               # pytest (10 testes) — garante que os números batem
└── web/                     # Frontend — a demo que roda sem setup
    ├── index.html
    ├── js/fiscal.js         # mesmo motor, portado para o navegador
    ├── js/agent.js          # agente de demo (offline) + cliente SSE do backend
    └── js/charts.js         # gráficos SVG (paleta acessível, validada)
```

**Decisão de design:** o cálculo numérico é idêntico no Python e no JavaScript (coberto
por testes nos dois lados), então a **demo ao vivo funciona 100% no navegador** — ótimo
para quem só quer ver — e o **backend real** entra quando você quer o agente movido a
Claude de verdade (via SSE). O frontend detecta o backend automaticamente.

## Como rodar

### Frontend (sem instalar nada)
```bash
cd web
python -m http.server 5500
# abra http://localhost:5500
```

### Backend (API + agente)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload       # http://localhost:8000/docs
```
- **Sem chave de API:** roda com o agente *mock* determinístico (zero configuração).
- **Com Claude:** copie `.env.example` para `.env` e defina `ANTHROPIC_API_KEY`.
  O mesmo loop passa a usar tool-calling nativo do Claude.

```bash
cd backend && python -m pytest        # 10 passed
```

## Precisão e fontes

- A **carga atual** vem dos valores apurados no XML — é o dado real do documento.
- As **alíquotas de CBS/IBS** são de **referência (estimativa oficial do Ministério da
  Fazenda: CBS 8,8% + IBS 17,7% ≈ 26,5%)** e serão fixadas por Resolução do Senado — por
  isso são **editáveis no próprio site** (sliders) e via API (`cbs_ref`/`ibs_ref`).
- **2026 é ano-teste**: CBS 0,9% e IBS 0,1% são **compensáveis** — a carga fica quase igual
  à de hoje (o modelo trata isso, não soma por cima). **2027**: CBS cheia, PIS/COFINS
  extintos, IPI → 0 (salvo ZFM), IS inicia, IBS a 0,1%. **2029–2033**: IBS 10/20/30/40/100%
  e ICMS/ISS 90/80/70/60/0%.
- Base legal: **EC 132/2023** e **LC 214/2025**; cronograma de transição do ADCT.
- Metodologia simplificada (também exposta na tela, em "Premissas"): valores nominais por
  item, não-cumulatividade plena; não modela substituição tributária, monofásico, regimes
  específicos (combustíveis/financeiro), Simples Nacional nem split payment.

## Stack
`Python` · `FastAPI` · `Pydantic` · `Anthropic/Claude (tool-calling)` · `pytest` ·
`JavaScript (ES modules)` · `SVG` · sem frameworks no front.

---
Projeto por **Brian Laureano** — [GitHub](https://github.com/BrianLaureano) ·
[portfólio](https://brianlaureano.github.io/)
