"""
Parser de NF-e (modelo 55) — lê o XML oficial e devolve um NFeDocument.

Tolerante a namespace (o XML da SEFAZ usa http://www.portalfiscal.inf.br/nfe)
e a campos ausentes. Não valida assinatura — foco é extração estruturada.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

from ..models import NFeDocument, NFeItem

NS = {"n": "http://www.portalfiscal.inf.br/nfe"}


def _find(el, path):
    """Busca com e sem namespace."""
    r = el.find(path, NS)
    if r is None:
        r = el.find(path.replace("n:", ""))
    return r


def _findall(el, path):
    r = el.findall(path, NS)
    return r or el.findall(path.replace("n:", ""))


def _text(el, path, default=""):
    r = _find(el, path)
    return r.text.strip() if r is not None and r.text else default


def _num(el, path, default=0.0):
    try:
        return float(_text(el, path, "") or default)
    except (ValueError, TypeError):
        return default


def parse(xml_str: str) -> NFeDocument:
    root = ET.fromstring(xml_str)
    inf = _find(root, ".//n:infNFe")
    if inf is None:
        inf = root

    ide = _find(inf, "n:ide")
    emit = _find(inf, "n:emit")
    dest = _find(inf, "n:dest")
    total = _find(inf, ".//n:ICMSTot")

    doc = NFeDocument(
        chave=(inf.get("Id") or "").replace("NFe", "") or None,
        numero=_text(ide, "n:nNF") if ide is not None else None,
        natureza_operacao=_text(ide, "n:natOp") if ide is not None else None,
        emitente=_text(emit, "n:xNome") if emit is not None else None,
        destinatario=_text(dest, "n:xNome") if dest is not None else None,
        uf_origem=_text(_find(emit, "n:enderEmit"), "n:UF") if emit is not None else None,
        uf_destino=_text(_find(dest, "n:enderDest"), "n:UF") if dest is not None else None,
        # base = total de produtos/serviços (vProd), não o vNF (que inclui IPI/frete/ST)
        valor_total=_num(total, "n:vProd") if total is not None else 0.0,
    )

    for det in _findall(inf, "n:det"):
        prod = _find(det, "n:prod")
        imp = _find(det, "n:imposto")
        if prod is None:
            continue
        item = NFeItem(
            numero=int(det.get("nItem") or len(doc.itens) + 1),
            descricao=_text(prod, "n:xProd", "(sem descrição)"),
            ncm=_text(prod, "n:NCM") or None,
            cfop=_text(prod, "n:CFOP") or None,
            quantidade=_num(prod, "n:qCom", 1.0),
            valor=_num(prod, "n:vProd"),
        )
        if imp is not None:
            icms = _find(imp, ".//n:ICMS")
            if icms is not None:
                item.vicms = _num(icms, ".//n:vICMS")
                item.aliq_icms = _num(icms, ".//n:pICMS")
                item.cst = _text(icms, ".//n:CST") or _text(icms, ".//n:CSOSN") or None
            item.vipi = _num(imp, ".//n:IPI//n:vIPI")
            item.vpis = _num(imp, ".//n:PIS//n:vPIS")
            item.vcofins = _num(imp, ".//n:COFINS//n:vCOFINS")
            # Serviço dentro da NF-e (bloco ISSQN)
            issqn = _find(imp, ".//n:ISSQN")
            if issqn is not None:
                item.servico = True
                item.viss = _num(issqn, "n:vISSQN")
                item.aliq_iss = _num(issqn, "n:vAliq")
        doc.itens.append(item)

    doc.is_servico = bool(doc.itens) and all(i.servico for i in doc.itens)
    if not doc.valor_total:
        doc.valor_total = round(sum(i.valor for i in doc.itens), 2)
    return doc
