"""Testes do motor fiscal, parser e agente — garantem que os números batem."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.agent import FiscalAgent          # noqa: E402
from app.agent.tools import Toolbox              # noqa: E402
from app.fiscal import engine, rates             # noqa: E402
from app.parsing import nfe                      # noqa: E402
from app.samples import BEBIDA, INDUSTRIA, SERVICO  # noqa: E402


# ---------- parser ----------
def test_parse_industria():
    doc = nfe.parse(INDUSTRIA)
    assert len(doc.itens) == 2
    assert doc.uf_origem == "SP" and doc.uf_destino == "MG"
    assert doc.valor_total == 4800.00
    assert doc.itens[0].vicms == 360.00
    assert not doc.is_servico


def test_parse_servico_marca_servico():
    doc = nfe.parse(SERVICO)
    assert doc.is_servico is True
    assert doc.itens[0].viss == 500.00


# ---------- regime atual: apurado do XML ----------
def test_current_usa_valores_do_xml():
    doc = nfe.parse(INDUSTRIA)
    cur = engine.current_breakdown(doc, 2025)
    # ICMS = 360 + 216; PIS = 49.50 + 29.70; COFINS = 228 + 136.80; IPI = 150 + 97.20
    assert cur.icms == 576.00
    assert cur.pis == 79.20
    assert cur.cofins == 364.80
    assert cur.ipi == 247.20
    assert cur.iss == 0.0


# ---------- 2026: ano-teste é NEUTRO (CBS/IBS compensáveis) ----------
def test_2026_compensavel_nao_muda_carga():
    doc = nfe.parse(INDUSTRIA)
    atual = engine.current_breakdown(doc, 2025)
    bd2026 = engine.projected_breakdown(doc, 2026)
    assert bd2026.cbs == 0.0 and bd2026.ibs == 0.0   # compensáveis -> sem carga extra
    assert abs(bd2026.total - atual.total) < 0.01    # 2026 ≈ hoje


# ---------- 2027: PIS/COFINS/IPI zeram, CBS entra, IBS a 0,1%, ICMS fica ----------
def test_2027_extingue_pis_cofins_ipi():
    doc = nfe.parse(INDUSTRIA)
    bd = engine.projected_breakdown(doc, 2027)
    assert bd.pis == 0.0 and bd.cofins == 0.0 and bd.ipi == 0.0
    assert bd.icms == 576.00                        # ICMS ainda integral em 2027
    assert bd.cbs == round(4800 * rates.REF_CBS / 100, 2)   # CBS cheia
    assert bd.ibs == round(4800 * 0.1 / 100, 2)             # IBS a 0,1% em 2027


# ---------- alíquotas de referência editáveis ----------
def test_referencia_editavel():
    doc = nfe.parse(INDUSTRIA)
    padrao = engine.projected_breakdown(doc, 2033)
    custom = engine.projected_breakdown(doc, 2033, cbs_ref=9.3, ibs_ref=18.0)
    assert custom.cbs == round(4800 * 9.3 / 100, 2)
    assert custom.ibs == round(4800 * 18.0 / 100, 2)
    assert custom.total > padrao.total              # alíquotas maiores -> carga maior


# ---------- 2033: regime pleno, ICMS some ----------
def test_2033_regime_pleno():
    doc = nfe.parse(INDUSTRIA)
    bd = engine.projected_breakdown(doc, 2033)
    assert bd.icms == 0.0 and bd.iss == 0.0
    assert bd.cbs == round(4800 * rates.REF_CBS / 100, 2)
    assert bd.ibs == round(4800 * rates.REF_IBS / 100, 2)
    esperado = round(4800 * rates.REF_TOTAL / 100, 2)
    assert abs(bd.total - esperado) < 0.05


# ---------- Imposto Seletivo na bebida ----------
def test_imposto_seletivo_bebida():
    doc = nfe.parse(BEBIDA)
    bd2025 = engine.projected_breakdown(doc, 2025)
    bd2027 = engine.projected_breakdown(doc, 2027)
    assert bd2025.iseletivo == 0.0                # IS não existe em 2025
    assert bd2027.iseletivo > 0.0                 # IS entra em 2027 p/ NCM 2203


# ---------- serviço quase dobra de carga até 2033 ----------
def test_servico_sobe_ate_2033():
    doc = nfe.parse(SERVICO)
    cur = engine.current_breakdown(doc, 2025)
    pleno = engine.projected_breakdown(doc, 2033)
    assert pleno.total > cur.total * 1.5          # unificação pesa no serviço


# ---------- cesta básica: alíquota zero no novo regime ----------
def test_cesta_basica_reduz_a_zero():
    assert rates.reduction_for_ncm("10063010") == 0.0   # arroz
    assert rates.reduction_for_ncm("85011019") == 1.0   # motor: cheia


# ---------- timeline cobre 2026..2033 ----------
def test_timeline_completa():
    doc = nfe.parse(INDUSTRIA)
    tl = engine.build_timeline(doc)
    anos = [b.year for b in tl]
    assert anos == [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]


# ---------- agente (mock) roda o loop e responde ----------
def test_agente_mock_responde():
    tb = Toolbox(xml=INDUSTRIA, target_year=2027)
    agent = FiscalAgent(tb)
    steps = list(agent.run("Qual o impacto da reforma nessa nota?"))
    kinds = [s.kind for s in steps]
    assert "tool_call" in kinds and "answer" in kinds
    assert any(s.tool == "parse_nfe" for s in steps if s.kind == "tool_call")
    final = [s for s in steps if s.kind == "answer"][-1]
    assert "R$" in final.content
