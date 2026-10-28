"""
Agente autônomo (loop ReAct) — planeja, chama ferramentas, observa e responde.

Fluxo:
  1. monta o contexto (system + histórico)
  2. pergunta ao LLM a próxima ação
  3. se for ferramenta: executa, anexa a observação, repete
  4. se for texto: encerra com a resposta

Funciona com Claude (quando há ANTHROPIC_API_KEY) ou com o MockLLM determinístico.
Cada passo é registrado em AgentStep para o front mostrar o "raciocínio ao vivo".
"""
from __future__ import annotations

import json
from typing import Iterator

from ..models import AgentStep
from .llm import BaseLLM, make_llm
from .prompts import SYSTEM
from .tools import TOOL_SCHEMAS, Toolbox

MAX_ITERS = 8


class FiscalAgent:
    def __init__(self, toolbox: Toolbox, llm: BaseLLM | None = None):
        self.tb = toolbox
        self.llm = llm or make_llm()

    def run(self, question: str) -> Iterator[AgentStep]:
        """Executa o loop e emite cada passo (generator -> dá pra fazer streaming)."""
        messages: list[dict] = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": question},
        ]

        for _ in range(MAX_ITERS):
            result = self.llm.complete(messages, TOOL_SCHEMAS)

            if result.wants_tool:
                yield AgentStep(kind="tool_call", tool=result.tool,
                                arguments=result.arguments,
                                content=f"Chamando {result.tool}…")
                try:
                    observation = self.tb.run(result.tool, result.arguments)
                    ok = True
                except Exception as e:  # ferramenta falhou -> observação de erro
                    observation = {"error": str(e)}
                    ok = False

                yield AgentStep(kind="observation", tool=result.tool,
                                result=observation,
                                content=_preview(observation))
                # registra para o próximo passo do LLM
                messages.append({
                    "role": "assistant",
                    "content": f"[ferramenta {result.tool}]",
                    "_tool": result.tool,
                })
                messages.append({
                    "role": "user",
                    "content": json.dumps(observation, ensure_ascii=False, default=str),
                    "_tool": result.tool,
                })
                if not ok:
                    continue
            else:
                yield AgentStep(kind="answer", content=result.text or "(sem resposta)")
                return

        yield AgentStep(kind="answer",
                        content="Limite de passos atingido — veja as observações acima.")

    @property
    def used_llm(self) -> bool:
        return self.llm.name != "mock"


def _preview(obs) -> str:
    try:
        s = json.dumps(obs, ensure_ascii=False, default=str)
    except TypeError:
        s = str(obs)
    return s if len(s) <= 240 else s[:237] + "…"
