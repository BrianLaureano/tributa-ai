"""Checagens de consistência fiscal — viram 'anomalias' que o agente comenta."""
from __future__ import annotations

from ..models import Anomaly, NFeDocument

# CFOPs de serviço não existem (ISS é municipal). CFOP começa com 1/2/3 (entrada)
# ou 5/6/7 (saída). Regra simplificada, suficiente para a demo.
_CFOP_SAIDA = ("5", "6", "7")
_CFOP_ENTRADA = ("1", "2", "3")


def check(doc: NFeDocument) -> list[Anomaly]:
    out: list[Anomaly] = []

    for item in doc.itens:
        # NCM ausente ou malformado (deve ter 8 dígitos)
        ncm = "".join(ch for ch in (item.ncm or "") if ch.isdigit())
        if not doc.is_servico and len(ncm) != 8:
            out.append(Anomaly(severity="aviso", item=item.numero, code="NCM_INVALIDO",
                               message=f"NCM '{item.ncm}' não tem 8 dígitos — "
                                       "impacta IS e enquadramento no novo regime."))

        # CFOP ausente
        cfop = "".join(ch for ch in (item.cfop or "") if ch.isdigit())
        if not doc.is_servico and len(cfop) != 4:
            out.append(Anomaly(severity="aviso", item=item.numero, code="CFOP_INVALIDO",
                               message=f"CFOP '{item.cfop}' inválido (esperado 4 dígitos)."))
        elif cfop:
            interestadual = doc.uf_origem and doc.uf_destino and doc.uf_origem != doc.uf_destino
            if interestadual and cfop[0] == "5":
                out.append(Anomaly(severity="erro", item=item.numero, code="CFOP_UF",
                                   message=f"CFOP {cfop} é interno, mas a operação é "
                                           f"interestadual ({doc.uf_origem}→{doc.uf_destino})."))

        # ICMS destacado zerado em operação de saída mercantil (sem CST de isenção)
        if (not doc.is_servico and item.vicms == 0 and item.aliq_icms == 0
                and cfop[:1] in _CFOP_SAIDA):
            out.append(Anomaly(severity="info", item=item.numero, code="ICMS_ZERO",
                               message="ICMS zerado na saída — confirme isenção/ST. "
                                       "No regime novo vira IBS com crédito amplo."))

    # Soma dos itens x total declarado
    soma = round(sum(i.valor for i in doc.itens), 2)
    if doc.valor_total and abs(soma - doc.valor_total) > 0.02:
        out.append(Anomaly(severity="erro", code="TOTAL_DIVERGENTE",
                           message=f"Soma dos itens (R$ {soma:.2f}) difere do total "
                                   f"declarado (R$ {doc.valor_total:.2f})."))

    if not out:
        out.append(Anomaly(severity="info", code="OK",
                           message="Nenhuma inconsistência estrutural encontrada."))
    return out
