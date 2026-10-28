"""
Motor de cálculo tributário — PURO (sem I/O), testável em Node... digo, em pytest.

Compara o regime ATUAL (ICMS/PIS/COFINS/IPI/ISS) com o regime da Reforma
(CBS/IBS/IS) para um ano-alvo da transição, item a item de uma NF-e.

Metodologia (assumida e documentada, para honestidade):
  * Tributos atuais: usa os valores já apurados no XML quando existem
    (vICMS, vPIS, vCOFINS, vIPI); senão estima por alíquotas nominais padrão.
  * Tributos novos (CBS/IBS/IS): alíquota de referência x base do item,
    assumindo não-cumulatividade plena (crédito financeiro amplo).
  * Valores nominais "por item" — não modela substituição tributária,
    monofásico, regimes especiais nem crédito de etapas anteriores.
"""
from __future__ import annotations

from ..models import NFeDocument, NFeItem, TaxBreakdown
from . import rates

# Alíquotas nominais padrão do regime atual (fallback quando o XML não traz o valor).
PIS_PADRAO = 1.65       # % não-cumulativo
COFINS_PADRAO = 7.6     # % não-cumulativo
ICMS_PADRAO = 18.0      # % interno típico
ISS_PADRAO = 5.0        # % serviços


def _regime(year: int) -> str:
    if year <= 2025:
        return "atual"
    if year >= 2033:
        return "pleno"
    return "transicao"


def current_breakdown(doc: NFeDocument, year: int = 2025) -> TaxBreakdown:
    """Carga do regime atual (sem Reforma)."""
    prof = rates.profile_for(year)
    base = round(sum(i.valor for i in doc.itens), 2)
    bd = TaxBreakdown(year=year, regime="atual", base=base,
                      note="Regime atual: ICMS/ISS + PIS/COFINS + IPI.")
    for item in doc.itens:
        if item.servico or doc.is_servico:
            bd.iss += item.viss or (item.valor * ISS_PADRAO / 100)
        else:
            bd.icms += item.vicms or (item.valor * ICMS_PADRAO / 100)
            bd.ipi += item.vipi
        if prof.pis_cofins_active:
            bd.pis += item.vpis or (item.valor * PIS_PADRAO / 100)
            bd.cofins += item.vcofins or (item.valor * COFINS_PADRAO / 100)
    _round(bd)
    return bd


def projected_breakdown(doc: NFeDocument, year: int,
                        cbs_ref: float | None = None, ibs_ref: float | None = None) -> TaxBreakdown:
    """Carga no regime da Reforma para o ano-alvo (mistura legado + novo).

    cbs_ref/ibs_ref permitem sobrescrever as alíquotas de REFERÊNCIA (editáveis
    no front e via API) — porque elas ainda serão fixadas por Resolução do Senado.
    """
    prof = rates.profile_for(year,
                             rates.REF_CBS if cbs_ref is None else cbs_ref,
                             rates.REF_IBS if ibs_ref is None else ibs_ref)
    base = round(sum(i.valor for i in doc.itens), 2)
    bd = TaxBreakdown(year=year, regime=_regime(year), base=base, note=prof.note)

    for item in doc.itens:
        v = item.valor
        # --- Legado remanescente (ICMS/ISS reduzidos pela fração do ano) ---
        if prof.legacy_fraction > 0:
            if item.servico or doc.is_servico:
                legacy_iss = (item.viss or v * ISS_PADRAO / 100)
                bd.iss += legacy_iss * prof.legacy_fraction
            else:
                legacy_icms = (item.vicms or v * ICMS_PADRAO / 100)
                bd.icms += legacy_icms * prof.legacy_fraction
        # IPI/PIS/COFINS: ativos só enquanto o perfil indicar
        if prof.ipi_active:
            bd.ipi += item.vipi
        if prof.pis_cofins_active:
            bd.pis += item.vpis or (v * PIS_PADRAO / 100)
            bd.cofins += item.vcofins or (v * COFINS_PADRAO / 100)

        # --- Novo regime (CBS/IBS) ---
        # 2026 é ano-teste: CBS/IBS são COMPENSÁVEIS, então não acrescentam carga.
        if not prof.compensavel:
            # Redutor da LC 214/2025: saúde/educação (-60%), cesta básica (alíq. zero).
            red = rates.reduction_for_ncm(item.ncm)
            bd.cbs += v * prof.cbs / 100 * red
            bd.ibs += v * prof.ibs / 100 * red
            if prof.is_active:
                bd.iseletivo += v * rates.selective_rate_for_ncm(item.ncm) / 100

    _round(bd)
    return bd


def build_timeline(doc: NFeDocument, cbs_ref: float | None = None,
                   ibs_ref: float | None = None) -> list[TaxBreakdown]:
    """Carga ano a ano de 2026 a 2033 — alimenta o gráfico da transição."""
    return [projected_breakdown(doc, y, cbs_ref, ibs_ref) for y in rates.all_years()]


def _round(bd: TaxBreakdown) -> None:
    for f in ("icms", "iss", "pis", "cofins", "ipi", "cbs", "ibs", "iseletivo"):
        setattr(bd, f, round(getattr(bd, f), 2))
