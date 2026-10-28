"""Modelos de dados (Pydantic) — contratos JSON da API e do agente."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, computed_field


class NFeItem(BaseModel):
    """Item (produto/serviço) de uma nota fiscal."""
    numero: int
    descricao: str
    ncm: Optional[str] = None
    cfop: Optional[str] = None
    cst: Optional[str] = None
    quantidade: float = 1.0
    valor: float = Field(..., description="Valor total do item (vProd), em R$")
    # Tributos já apurados no documento (quando presentes no XML)
    vicms: float = 0.0
    vipi: float = 0.0
    vpis: float = 0.0
    vcofins: float = 0.0
    viss: float = 0.0
    aliq_icms: float = 0.0
    aliq_iss: float = 0.0
    servico: bool = False


class NFeDocument(BaseModel):
    """Representação normalizada de uma NF-e."""
    chave: Optional[str] = None
    numero: Optional[str] = None
    emitente: Optional[str] = None
    destinatario: Optional[str] = None
    uf_origem: Optional[str] = None
    uf_destino: Optional[str] = None
    natureza_operacao: Optional[str] = None
    is_servico: bool = False
    valor_total: float = 0.0
    itens: list[NFeItem] = Field(default_factory=list)


class TaxBreakdown(BaseModel):
    """Decomposição de tributos de um cenário (um ano)."""
    year: int
    regime: Literal["atual", "transicao", "pleno"]
    base: float
    icms: float = 0.0
    iss: float = 0.0
    pis: float = 0.0
    cofins: float = 0.0
    ipi: float = 0.0
    cbs: float = 0.0
    ibs: float = 0.0
    iseletivo: float = 0.0
    note: str = ""

    @computed_field
    @property
    def total(self) -> float:
        return round(
            self.icms + self.iss + self.pis + self.cofins
            + self.ipi + self.cbs + self.ibs + self.iseletivo,
            2,
        )

    @computed_field
    @property
    def carga_efetiva(self) -> float:
        """Carga tributária efetiva sobre a base (%)."""
        return round(100 * self.total / self.base, 2) if self.base else 0.0


class Anomaly(BaseModel):
    """Inconsistência/alerta detectado na nota."""
    severity: Literal["info", "aviso", "erro"]
    item: Optional[int] = None
    code: str
    message: str


class AnalysisResult(BaseModel):
    """Resultado completo da análise de uma nota."""
    document: NFeDocument
    current: TaxBreakdown
    projected: TaxBreakdown
    delta_valor: float
    delta_pct: float
    anomalies: list[Anomaly] = Field(default_factory=list)
    timeline: list[TaxBreakdown] = Field(default_factory=list)


# ---- Agente ----

class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentStep(BaseModel):
    """Um passo do loop do agente (pensamento + ação + observação)."""
    kind: Literal["thought", "tool_call", "observation", "answer"]
    content: str = ""
    tool: Optional[str] = None
    arguments: dict[str, Any] = Field(default_factory=dict)
    result: Optional[Any] = None


class ChatRequest(BaseModel):
    message: str
    document_id: Optional[str] = None
    target_year: int = 2027


class ChatResponse(BaseModel):
    answer: str
    steps: list[AgentStep] = Field(default_factory=list)
    used_llm: bool = False