"""
API FastAPI do Tributa.AI.

Endpoints:
  GET  /api/health                  -> status + se há LLM configurado
  GET  /api/samples                 -> notas de exemplo embutidas
  POST /api/analyze                 -> análise completa (atual x reforma + timeline + anomalias)
  POST /api/chat                    -> resposta do agente (passos + resposta final)
  POST /api/agent/stream            -> mesmos passos via SSE (raciocínio ao vivo)
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import config
from .agent.agent import FiscalAgent
from .agent.tools import Toolbox
from .fiscal import engine, rates, rules
from .models import AnalysisResult, ChatResponse
from .parsing import nfe
from .samples import SAMPLES, sample_xml

app = FastAPI(title="Tributa.AI", version="1.0.0",
              description="Agente fiscal da Reforma Tributária (CBS/IBS/IS).")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    xml: Optional[str] = None
    sample: Optional[str] = None
    target_year: int = 2027
    cbs_ref: Optional[float] = None   # sobrescreve a alíquota de referência de CBS
    ibs_ref: Optional[float] = None   # sobrescreve a alíquota de referência de IBS


class ChatBody(BaseModel):
    message: str
    xml: Optional[str] = None
    sample: Optional[str] = None
    target_year: int = 2027
    cbs_ref: Optional[float] = None
    ibs_ref: Optional[float] = None


def _resolve_xml(xml: Optional[str], sample: Optional[str]) -> str:
    if xml and xml.strip():
        return xml
    if sample:
        x = sample_xml(sample)
        if x:
            return x
        raise HTTPException(404, f"Exemplo '{sample}' não encontrado.")
    raise HTTPException(400, "Informe 'xml' ou 'sample'.")


@app.get("/api/health")
def health():
    return {"status": "ok", "llm": "anthropic" if config.HAS_LLM_KEY else "mock",
            "ref_rates": {"cbs": rates.REF_CBS, "ibs": rates.REF_IBS, "total": rates.REF_TOTAL}}


@app.get("/api/samples")
def samples():
    return [{"id": s["id"], "label": s["label"], "desc": s["desc"]} for s in SAMPLES]


@app.post("/api/analyze", response_model=AnalysisResult)
def analyze(req: AnalyzeRequest):
    xml = _resolve_xml(req.xml, req.sample)
    try:
        doc = nfe.parse(xml)
    except Exception as e:
        raise HTTPException(422, f"XML inválido: {e}")

    current = engine.current_breakdown(doc, 2025)
    projected = engine.projected_breakdown(doc, req.target_year, req.cbs_ref, req.ibs_ref)
    delta = round(projected.total - current.total, 2)
    delta_pct = round(100 * delta / current.total, 2) if current.total else 0.0

    return AnalysisResult(
        document=doc, current=current, projected=projected,
        delta_valor=delta, delta_pct=delta_pct,
        anomalies=rules.check(doc),
        timeline=engine.build_timeline(doc, req.cbs_ref, req.ibs_ref),
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(body: ChatBody):
    xml = _resolve_xml(body.xml, body.sample)
    tb = Toolbox(xml=xml, target_year=body.target_year, cbs_ref=body.cbs_ref, ibs_ref=body.ibs_ref)
    agent = FiscalAgent(tb)
    steps = list(agent.run(body.message))
    answer = next((s.content for s in reversed(steps) if s.kind == "answer"), "")
    return ChatResponse(answer=answer, steps=steps, used_llm=agent.used_llm)


@app.post("/api/agent/stream")
def agent_stream(body: ChatBody):
    xml = _resolve_xml(body.xml, body.sample)
    tb = Toolbox(xml=xml, target_year=body.target_year, cbs_ref=body.cbs_ref, ibs_ref=body.ibs_ref)
    agent = FiscalAgent(tb)

    def gen():
        for step in agent.run(body.message):
            yield f"data: {json.dumps(step.model_dump(), ensure_ascii=False, default=str)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
