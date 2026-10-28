/* Notas de exemplo — mesmos XMLs do backend (app/samples.py). */
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

export const SAMPLES = [
  {
    id: "industria", label: "Indústria", icon: "⚙",
    desc: "Venda interestadual SP→MG com ICMS, IPI e PIS/COFINS.",
    xml: `${HEAD}
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>
<infNFe versao="4.00" Id="NFe35250114200166000187550010000000112100000129">
  <ide><nNF>1121</nNF><natOp>Venda de producao do estabelecimento</natOp></ide>
  <emit><xNome>Metalurgica Primor Industria LTDA</xNome><enderEmit><UF>SP</UF></enderEmit></emit>
  <dest><xNome>Distribuidora Minas Gerais LTDA</xNome><enderDest><UF>MG</UF></enderDest></dest>
  <det nItem="1"><prod><xProd>Motor eletrico trifasico 5cv</xProd><NCM>85015290</NCM><CFOP>6101</CFOP><qCom>2.0000</qCom><vProd>3000.00</vProd></prod>
    <imposto><ICMS><ICMS00><CST>00</CST><pICMS>12.00</pICMS><vICMS>360.00</vICMS></ICMS00></ICMS>
      <IPI><IPITrib><vIPI>150.00</vIPI></IPITrib></IPI>
      <PIS><PISAliq><vPIS>49.50</vPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><vCOFINS>228.00</vCOFINS></COFINSAliq></COFINS></imposto></det>
  <det nItem="2"><prod><xProd>Bomba centrifuga industrial</xProd><NCM>84137090</NCM><CFOP>6101</CFOP><qCom>1.0000</qCom><vProd>1800.00</vProd></prod>
    <imposto><ICMS><ICMS00><CST>00</CST><pICMS>12.00</pICMS><vICMS>216.00</vICMS></ICMS00></ICMS>
      <IPI><IPITrib><vIPI>97.20</vIPI></IPITrib></IPI>
      <PIS><PISAliq><vPIS>29.70</vPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><vCOFINS>136.80</vCOFINS></COFINSAliq></COFINS></imposto></det>
  <total><ICMSTot><vProd>4800.00</vProd><vNF>5097.20</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`,
  },
  {
    id: "servico", label: "Serviço", icon: "🛠",
    desc: "Consultoria com ISS — o setor mais impactado pela unificação.",
    xml: `${HEAD}
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>
<infNFe versao="4.00" Id="NFe35250133444455000190550010000002201200002201">
  <ide><nNF>2201</nNF><natOp>Prestacao de servico - consultoria</natOp></ide>
  <emit><xNome>Studio Nova Consultoria e Automacao LTDA</xNome><enderEmit><UF>SP</UF></enderEmit></emit>
  <dest><xNome>Grupo Corporativo Atlas S.A.</xNome><enderDest><UF>SP</UF></enderDest></dest>
  <det nItem="1"><prod><xProd>Consultoria em automacao de processos com IA</xProd><CFOP>5933</CFOP><qCom>1.0000</qCom><vProd>10000.00</vProd></prod>
    <imposto><ISSQN><vBC>10000.00</vBC><vAliq>5.00</vAliq><vISSQN>500.00</vISSQN></ISSQN>
      <PIS><PISAliq><vPIS>165.00</vPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><vCOFINS>760.00</vCOFINS></COFINSAliq></COFINS></imposto></det>
  <total><ICMSTot><vProd>10000.00</vProd><vNF>10000.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`,
  },
  {
    id: "bebida", label: "Bebida · Imposto Seletivo", icon: "🍺",
    desc: "Cerveja (NCM 2203) — entra o Imposto Seletivo a partir de 2027.",
    xml: `${HEAD}
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>
<infNFe versao="4.00" Id="NFe43250188777766000155550010000003301200003301">
  <ide><nNF>3301</nNF><natOp>Venda de mercadoria</natOp></ide>
  <emit><xNome>Cervejaria Alto Malte LTDA</xNome><enderEmit><UF>RS</UF></enderEmit></emit>
  <dest><xNome>Bar e Distribuidora Boa Praca LTDA</xNome><enderDest><UF>RS</UF></enderDest></dest>
  <det nItem="1"><prod><xProd>Cerveja Pilsen 350ml - caixa 12un</xProd><NCM>22030000</NCM><CFOP>5101</CFOP><qCom>100.0000</qCom><vProd>5000.00</vProd></prod>
    <imposto><ICMS><ICMS00><CST>00</CST><pICMS>25.00</pICMS><vICMS>1250.00</vICMS></ICMS00></ICMS>
      <IPI><IPITrib><vIPI>300.00</vIPI></IPITrib></IPI>
      <PIS><PISAliq><vPIS>82.50</vPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><vCOFINS>380.00</vCOFINS></COFINSAliq></COFINS></imposto></det>
  <total><ICMSTot><vProd>5000.00</vProd><vNF>6012.50</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`,
  },
];
