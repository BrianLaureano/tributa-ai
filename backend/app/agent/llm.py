"""
Abstração de LLM — isola o provedor do resto do código.

Suporta a API da Anthropic (Claude) via tool-calling nativo. Se não houver
chave configurada, cai num MockLLM determinístico: a aplicação roda 100% sem
nenhum segredo (essencial para a demo), e o código real de integração fica
visível no repositório.
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional


class LLMResult:
    """Resposta normalizada do modelo: ou um texto, ou uma chamada de ferramenta."""
    def __init__(self, text: str = "", tool: Optional[str] = None,
                 arguments: Optional[dict] = None):
        self.text = text
        self.tool = tool
        self.arguments = arguments or {}

    @property
    def wants_tool(self) -> bool:
        return self.tool is not None


class BaseLLM:
    name = "base"

    def complete(self, messages: list[dict], tools: list[dict]) -> LLMResult:
        raise NotImplementedError


class AnthropicLLM(BaseLLM):
    """Integração real com a API da Anthropic (Claude)."""
    name = "anthropic"

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5"):
        # Import tardio: a lib só é exigida quando há chave de verdade.
        from anthropic import Anthropic
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def complete(self, messages: list[dict], tools: list[dict]) -> LLMResult:
        system = ""
        conv = []
        for m in messages:
            if m["role"] == "system":
                system = m["content"]
            else:
                conv.append(m)
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system,
            tools=[{
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            } for t in tools],
            messages=conv,
        )
        for block in resp.content:
            if block.type == "tool_use":
                return LLMResult(tool=block.name, arguments=block.input)
        text = "".join(b.text for b in resp.content if b.type == "text")
        return LLMResult(text=text)


class MockLLM(BaseLLM):
    """
    Planejador determinístico baseado em regras — imita o loop de um agente
    sem chamar nenhuma API. Escolhe ferramentas pela intenção da pergunta.
    """
    name = "mock"

    def complete(self, messages: list[dict], tools: list[dict]) -> LLMResult:
        # A PERGUNTA é a 1ª mensagem do usuário; as demais 'user' são observações
        # de ferramenta (têm _tool) e não devem influenciar o plano.
        user = next((m["content"] for m in messages
                     if m["role"] == "user" and not m.get("_tool")), "").lower()
        called = {m.get("_tool") for m in messages if m.get("_tool")}

        plan = self._plan(user)
        for step in plan:
            if step not in called:
                return LLMResult(tool=step, arguments={})

        return LLMResult(text=self._summarize(user, messages))

    def _plan(self, user: str) -> list[str]:
        if any(w in user for w in ("errad", "anomal", "inconsist", "problema", "valid")):
            return ["parse_nfe", "check_anomalies"]
        if any(w in user for w in ("2033", "transi", "ano a ano", "cronograma", "evolu")):
            return ["parse_nfe", "compute_current", "build_timeline"]
        return ["parse_nfe", "compute_current", "project_reform"]

    def _summarize(self, user: str, messages: list[dict]) -> str:
        obs = {m["_tool"]: m["content"] for m in messages if m.get("_tool")}
        cur = _safe(obs.get("compute_current"))
        proj = _safe(obs.get("project_reform"))
        if cur and proj:
            d = proj["total"] - cur["total"]
            arrow = "aumenta" if d > 0 else "reduz"
            return (
                f"No regime atual a nota recolhe R$ {cur['total']:.2f} "
                f"({cur['carga_efetiva']:.1f}% de carga efetiva). No regime da Reforma "
                f"({proj['year']}), a carga {arrow} para R$ {proj['total']:.2f} "
                f"({proj['carga_efetiva']:.1f}%) — variação de R$ {d:+.2f}. "
                "CBS e IBS substituem PIS/COFINS/IPI e ICMS/ISS com não-cumulatividade plena."
            )
        anomalies = _safe(obs.get("check_anomalies"))
        if anomalies:
            n = len(anomalies) if isinstance(anomalies, list) else 0
            return f"Encontrei {n} ponto(s) de atenção na nota — veja os passos acima."
        return "Processei a nota com as ferramentas fiscais. Veja o detalhamento acima."


def _safe(raw: Any):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def make_llm() -> BaseLLM:
    """Fábrica: usa Anthropic se houver chave; senão, Mock determinístico."""
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if key:
        model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
        try:
            return AnthropicLLM(key, model)
        except Exception:
            # Sem a lib instalada ou erro de init -> degrada para mock, sem quebrar.
            return MockLLM()
    return MockLLM()
