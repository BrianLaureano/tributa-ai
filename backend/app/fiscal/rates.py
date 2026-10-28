"""
Tabela de transição da Reforma Tributária (EC 132/2023 + LC 214/2025).

Fontes (conferidas):
  * LC 214/2025 (Planalto): https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
  * ADCT / cronograma de transição 2026-2033.
  * Nota Técnica de alíquotas de referência — Ministério da Fazenda (2024):
    CBS 8,8% + IBS 17,7% = 26,5% (ESTIMATIVA; "não deve ser interpretada como a
    alíquota final"). A alíquota de referência DEFINITIVA será fixada por
    Resolução do Senado Federal (art. 156-A, CF).

Por isso tudo aqui é parametrizável de propósito: quando a resolução sair, basta
trocar os números — a lógica do motor não muda. Os tributos do regime ATUAL,
quando a nota traz os valores apurados no XML, NÃO são estimados: o motor usa o
valor real do documento (ver engine.py).

Cronograma (resumo):
  2026 ......... CBS 0,9% + IBS 0,1% (ano-teste, compensável com PIS/COFINS)
  2027-2028 .... CBS cheia; PIS/COFINS extintos; IPI -> 0 (salvo ZFM); IS começa; IBS 0,1%
  2029 ......... IBS a 10% da referência | ICMS/ISS a 90%
  2030 ......... IBS a 20% da referência | ICMS/ISS a 80%
  2031 ......... IBS a 30% da referência | ICMS/ISS a 70%
  2032 ......... IBS a 40% da referência | ICMS/ISS a 60%
  2033 ......... regime pleno; ICMS e ISS extintos
"""
from __future__ import annotations

from dataclasses import dataclass

# --- Alíquotas de referência do regime pleno (estimativa MF, a confirmar) ---
REF_CBS = 8.8          # % — substitui PIS/COFINS (e IPI)
REF_IBS = 17.7         # % — substitui ICMS + ISS
REF_TOTAL = REF_CBS + REF_IBS  # ~26,5%

# Redutores da alíquota de referência (LC 214/2025). O tributo (CBS+IBS) incide
# sobre uma FRAÇÃO da referência conforme o regime do bem/serviço:
#   1.00 = alíquota cheia | 0.40 = redução de 60% | 0.00 = alíquota zero.
# Mapa ILUSTRATIVO por prefixo de NCM (a LC traz anexos extensos; aqui é amostra).
REDUCAO_CHEIA = 1.0
REDUCAO_60 = 0.40     # saúde, educação, medicamentos, insumos agropecuários…
REDUCAO_100 = 0.0     # cesta básica nacional, alguns medicamentos/dispositivos

REDUCTION_BY_NCM_PREFIX = {
    "1006": REDUCAO_100,   # arroz (cesta básica)
    "0713": REDUCAO_100,   # feijão (cesta básica)
    "0401": REDUCAO_100,   # leite (cesta básica)
    "3004": REDUCAO_60,    # medicamentos
    "3002": REDUCAO_60,    # produtos de saúde
}

# Imposto Seletivo ("imposto do pecado"): incide só sobre bens específicos.
# Chave = prefixo de NCM; valor = alíquota estimada. Lista ilustrativa.
IS_BY_NCM_PREFIX = {
    "2402": 40.0,   # cigarros / charutos
    "2203": 10.0,   # cervejas
    "2204": 10.0,   # vinhos
    "2208": 12.0,   # bebidas destiladas
    "2202": 5.0,    # refrigerantes / bebidas açucaradas
    "8703": 8.0,    # automóveis de passageiros
}


@dataclass(frozen=True)
class YearProfile:
    """Perfil (já resolvido) de um ano da transição."""
    year: int
    cbs: float            # alíquota CBS vigente (%)
    ibs: float            # alíquota IBS vigente (%)
    legacy_fraction: float  # fração de ICMS/ISS ainda cobrada (0..1)
    pis_cofins_active: bool
    ipi_active: bool
    is_active: bool
    compensavel: bool     # 2026: CBS/IBS são compensáveis -> carga adicional ~0
    note: str = ""


# Cronograma ano a ano. 'cbs' None => usa a REFERÊNCIA (editável).
# 'ibs' = ("abs", x%) alíquota fixa em lei, ou ("frac", f) fração da referência.
# Os valores de 2026 (0,9/0,1) são FIXOS em lei; só a referência 2027+ é estimativa.
_SCHEDULE: dict[int, dict] = {
    2025: dict(cbs=0.0,  ibs=("abs", 0.0), legacy=1.0, pisco=True,  ipi=True,  isel=False, comp=False,
               note="Regime atual, sem CBS/IBS."),
    2026: dict(cbs=0.9,  ibs=("abs", 0.1), legacy=1.0, pisco=True,  ipi=True,  isel=False, comp=True,
               note="Ano-teste: CBS 0,9% e IBS 0,1% são compensáveis — a carga fica praticamente igual à de hoje."),
    2027: dict(cbs=None, ibs=("abs", 0.1), legacy=1.0, pisco=False, ipi=False, isel=True,  comp=False,
               note="CBS cheia; PIS/COFINS extintos; IPI zerado (salvo ZFM); IS começa; IBS ainda a 0,1%."),
    2028: dict(cbs=None, ibs=("abs", 0.1), legacy=1.0, pisco=False, ipi=False, isel=True,  comp=False,
               note="CBS cheia; IBS a 0,1%; ICMS/ISS integrais."),
    2029: dict(cbs=None, ibs=("frac", 0.10), legacy=0.90, pisco=False, ipi=False, isel=True, comp=False,
               note="IBS a 10% da referência; ICMS/ISS reduzidos a 90%."),
    2030: dict(cbs=None, ibs=("frac", 0.20), legacy=0.80, pisco=False, ipi=False, isel=True, comp=False,
               note="IBS a 20%; ICMS/ISS a 80%."),
    2031: dict(cbs=None, ibs=("frac", 0.30), legacy=0.70, pisco=False, ipi=False, isel=True, comp=False,
               note="IBS a 30%; ICMS/ISS a 70%."),
    2032: dict(cbs=None, ibs=("frac", 0.40), legacy=0.60, pisco=False, ipi=False, isel=True, comp=False,
               note="IBS a 40%; ICMS/ISS a 60%."),
    2033: dict(cbs=None, ibs=("frac", 1.0),  legacy=0.0,  pisco=False, ipi=False, isel=True, comp=False,
               note="Regime pleno: ICMS e ISS extintos."),
}

MIN_YEAR = min(_SCHEDULE)
MAX_YEAR = max(_SCHEDULE)


def profile_for(year: int, cbs_ref: float = REF_CBS, ibs_ref: float = REF_IBS) -> YearProfile:
    """Resolve o perfil do ano com as alíquotas de referência dadas (editáveis)."""
    year = max(MIN_YEAR, min(MAX_YEAR, year))
    s = _SCHEDULE[year]
    cbs = cbs_ref if s["cbs"] is None else s["cbs"]
    kind, val = s["ibs"]
    ibs = val if kind == "abs" else round(ibs_ref * val, 4)
    return YearProfile(year, cbs, ibs, s["legacy"], s["pisco"], s["ipi"], s["isel"], s["comp"], s["note"])


def reduction_for_ncm(ncm: str | None) -> float:
    """Fração da alíquota de referência aplicável ao NCM (redutor da LC 214/2025)."""
    if not ncm:
        return REDUCAO_CHEIA
    digits = "".join(ch for ch in ncm if ch.isdigit())
    for prefix, frac in REDUCTION_BY_NCM_PREFIX.items():
        if digits.startswith(prefix):
            return frac
    return REDUCAO_CHEIA


def selective_rate_for_ncm(ncm: str | None) -> float:
    """Alíquota estimada de Imposto Seletivo para um NCM (0 se não listado)."""
    if not ncm:
        return 0.0
    digits = "".join(ch for ch in ncm if ch.isdigit())
    for prefix, rate in IS_BY_NCM_PREFIX.items():
        if digits.startswith(prefix):
            return rate
    return 0.0


def all_years() -> list[int]:
    return sorted(y for y in _SCHEDULE if y >= 2026)