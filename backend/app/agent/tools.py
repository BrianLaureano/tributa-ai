"""
Ferramentas do agente — cada uma é uma função pura sobre a nota em contexto.

O registro expõe schema JSON (estilo OpenAI/Anthropic tool-calling) + a função.
É assim que um agente autônomo "age": o LLM escolhe a ferramenta, nós executamos
e devolvemos a observação para o próximo passo do loop.
"""
from __future__ import annotations

from typing import Any, Callable

from ..fiscal import engine, rates, rules
from ..models import NFeDocument
from ..parsing import nfe


class Toolbox:
    """Guarda o estado da nota entre chamadas de ferramenta dentro de uma sessão."""
    def __init__(self, xml: str = "", doc: NFeDocument | None = None,
                 target_year: int = 2027, cbs_ref: float | None = None,
                 ibs_ref: float | None = None):
        self._xml = xml
        self._doc = doc
        self.target_year = target_year
        self.cbs_ref = cbs_ref
        self.ibs_ref = ibs_ref

    # ---- ferramentas ----
    def parse_nfe(self) -> dict[str, Any]:
        if self._doc is None:
            self._doc = nfe.parse(self._xml)
        d = self._doc
        return {
            "numero": d.numero, "emitente": d.emitente, "destinatario": d.destinatario,
            "uf": f"{d.uf_origem}->{d.uf_destino}", "itens": len(d.itens),
            "valor_total": round(d.valor_total, 2),
            "produtos": [i.descricao for i in d.itens][:5],
        }

    def compute_current(self) -> dict[str, Any]:
        bd = engine.current_breakdown(self._require_doc(), 2025)
        return _bd_dict(bd)

    def project_reform(self, year: int | None = None) -> dict[str, Any]:
        y = year or self.target_year
        bd = engine.projected_breakdown(self._require_doc(), y, self.cbs_ref, self.ibs_ref)
        return _bd_dict(bd)

    def build_timeline(self) -> list[dict[str, Any]]:
        return [_bd_dict(bd) for bd in engine.build_timeline(self._require_doc(), self.cbs_ref, self.ibs_ref)]

    def check_anomalies(self) -> list[dict[str, Any]]:
        return [a.model_dump() for a in rules.check(self._require_doc())]

    def reference_rates(self) -> dict[str, Any]:
        cbs = rates.REF_CBS if self.cbs_ref is None else self.cbs_ref
        ibs = rates.REF_IBS if self.ibs_ref is None else self.ibs_ref
        return {"cbs": cbs, "ibs": ibs, "total": round(cbs + ibs, 2),
                "observacao": "Alíquotas de referência estimadas (a fixar por Resolução do Senado)."}

    # ---- infra ----
    def _require_doc(self) -> NFeDocument:
        if self._doc is None:
            self._doc = nfe.parse(self._xml)
        return self._doc

    def run(self, name: str, arguments: dict | None = None) -> Any:
        fn: Callable = getattr(self, name, None)
        if fn is None or name not in TOOL_NAMES:
            raise ValueError(f"Ferramenta desconhecida: {name}")
        return fn(**(arguments or {}))


def _bd_dict(bd) -> dict[str, Any]:
    d = bd.model_dump()
    d["total"] = bd.total
    d["carga_efetiva"] = bd.carga_efetiva
    return d


# Schemas expostos ao LLM (tool-calling).
TOOL_SCHEMAS: list[dict] = [
    {"name": "parse_nfe", "description": "Lê o XML da NF-e e extrai emitente, itens, NCM/CFOP e totais.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "compute_current", "description": "Calcula a carga tributária no regime ATUAL (ICMS/PIS/COFINS/IPI/ISS).",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "project_reform", "description": "Projeta a carga no regime da Reforma (CBS/IBS/IS) para um ano-alvo.",
     "parameters": {"type": "object",
                    "properties": {"year": {"type": "integer", "description": "Ano da transição (2026-2033)."}},
                    "required": []}},
    {"name": "build_timeline", "description": "Carga ano a ano de 2026 a 2033 (transição completa).",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "check_anomalies", "description": "Verifica inconsistências de NCM, CFOP, ICMS e totais.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "reference_rates", "description": "Retorna as alíquotas de referência estimadas de CBS e IBS.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
]

TOOL_NAMES = {t["name"] for t in TOOL_SCHEMAS}
