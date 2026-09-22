/* Gera src/dados-tse.js a partir dos arquivos originais do TSE. */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const SP = process.env.TSE_CACHE || "./.cache-tse";
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const REGIAO = { AC:"Norte",AM:"Norte",AP:"Norte",PA:"Norte",RO:"Norte",RR:"Norte",TO:"Norte",
  AL:"Nordeste",BA:"Nordeste",CE:"Nordeste",MA:"Nordeste",PB:"Nordeste",PE:"Nordeste",PI:"Nordeste",RN:"Nordeste",SE:"Nordeste",
  DF:"Centro-Oeste",GO:"Centro-Oeste",MS:"Centro-Oeste",MT:"Centro-Oeste",
  ES:"Sudeste",MG:"Sudeste",RJ:"Sudeste",SP:"Sudeste", PR:"Sul",RS:"Sul",SC:"Sul" };
const NOME = { AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",
  ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MG:"Minas Gerais",MS:"Mato Grosso do Sul",MT:"Mato Grosso",
  PA:"Pará",PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",
  RO:"Rondônia",RR:"Roraima",RS:"Rio Grande do Sul",SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins" };
/* Distribuição mantida pelo STF (ADI 7.362 / out. 2025) para o pleito de 2026. */
const VAGAS_CAMARA = { SP:70, MG:53, RJ:46, BA:39, RS:31, PR:30, PE:25, CE:22, MA:18, PA:17, GO:17, SC:16,
  PB:12, ES:10, PI:10, AL:9, RN:8, MT:8, AM:8, DF:8, MS:8, SE:8, RO:8, TO:8, AC:8, AP:8, RR:8 };

/** CF art. 27: o triplo da representação na Câmara até 36; acima de 12 federais,
 *  acrescenta-se um estadual por federal excedente. */
const vagasAssembleia = (federais) => (federais <= 12 ? federais * 3 : 36 + (federais - 12));

const sh = (cmd) => execSync(cmd, { cwd: SP, maxBuffer: 1 << 30, shell: "/bin/bash" }).toString();

console.error("→ agregando eleitorado 2026 (UF, município, zonas)…");
const elei = sh(`for f in $(unzip -l eleitorado2026.zip | awk '{print $4}' | grep -E "^perfil.*csv$" | grep -vE "BRASIL|ZZ"); do unzip -p eleitorado2026.zip "$f"; done | iconv -f latin1 -t utf8 | awk -F';' '{for(i=1;i<=NF;i++) gsub(/"/,"",$i)} $4!="SG_UF" && $4!="" { e[$4"\\t"$5"\\t"$6] += $24; z[$4"\\t"$5"\\t"$7]=1 } END { for(k in e) print "E\\t" k "\\t" e[k]; for(k in z){ split(k,a,"\\t"); print "Z\\t" a[1] "\\t" a[2] } }'`);

const mun = new Map();   // "UF|CD" -> { uf, cd, nome, eleitores, zonas }
for (const linha of elei.split("\n")) {
  if (!linha) continue;
  const p = linha.split("\t");
  if (p[0] === "E") {
    const [, uf, cd, nome, qt] = p;
    const k = `${uf}|${cd}`;
    const m = mun.get(k) || { uf, cd, nome, eleitores: 0, zonas: 0 };
    m.eleitores += Number(qt); m.nome = nome; mun.set(k, m);
  } else if (p[0] === "Z") {
    const k = `${p[1]}|${p[2]}`;
    const m = mun.get(k) || { uf: p[1], cd: p[2], nome: "", eleitores: 0, zonas: 0 };
    m.zonas += 1; mun.set(k, m);
  }
}
console.error(`   ${mun.size} municípios`);

const comparecimento = (zip, ano) => {
  console.error(`→ agregando comparecimento ${ano}…`);
  const txt = sh(`for f in $(unzip -l ${zip} | awk '{print $4}' | grep -E "^detalhe.*csv$" | grep -v BRASIL); do unzip -p ${zip} "$f"; done | iconv -f latin1 -t utf8 | awk -F';' '{for(i=1;i<=NF;i++) gsub(/"/,"",$i)} $3!="ANO_ELEICAO" && $6==1 && $18=="Deputado Federal" && $27=="N" && $11!="ZZ" { ap[$11"\\t"$14] += $19; cp[$11"\\t"$14] += $24 } END { for(k in ap) print k "\\t" ap[k] "\\t" cp[k] }'`);
  const porMun = new Map(), porUf = new Map();
  for (const linha of txt.split("\n")) {
    if (!linha) continue;
    const [uf, cd, aptos, comp] = linha.split("\t");
    porMun.set(`${uf}|${cd}`, { aptos: +aptos, comp: +comp });
    const u = porUf.get(uf) || { aptos: 0, comp: 0 };
    u.aptos += +aptos; u.comp += +comp; porUf.set(uf, u);
  }
  return { porMun, porUf };
};
const c22 = comparecimento("det2022.zip", 2022);
const c18 = comparecimento("det2018.zip", 2018);

const r4 = (x) => Math.round(x * 10000) / 10000;
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- UF ---------- */
const ufs = UFS.map((uf) => {
  const lista = [...mun.values()].filter((m) => m.uf === uf);
  const eleitores = lista.reduce((a, m) => a + m.eleitores, 0);
  const zonas = lista.reduce((a, m) => a + m.zonas, 0);
  const a22 = c22.porUf.get(uf), a18 = c18.porUf.get(uf);
  const federais = VAGAS_CAMARA[uf];
  return { code: uf, name: NOME[uf], regiao: REGIAO[uf], eleitores, municipios: lista.length, zonas,
    vagasCamara: federais, vagasAssembleia: vagasAssembleia(federais),
    hist: { 2022: { aptos: a22.aptos, comparecimento: r4(a22.comp / a22.aptos) },
            2018: { aptos: a18.aptos, comparecimento: r4(a18.comp / a18.aptos) } } };
}).sort((a, b) => b.eleitores - a.eleitores);

/* ---------- municípios: os 12 maiores de cada UF ---------- */
const TOPO = 12;
const porUf = {};
for (const uf of UFS) {
  const lista = [...mun.values()].filter((m) => m.uf === uf && m.eleitores > 0)
    .sort((a, b) => b.eleitores - a.eleitores).slice(0, TOPO);
  porUf[uf] = lista.map((m) => {
    const k = `${uf}|${m.cd}`;
    const h22 = c22.porMun.get(k), h18 = c18.porMun.get(k);
    const nome = m.nome.replace(/\b\p{Lu}[\p{Ll}]*/gu, (w) => w);
    const o = { id: `${uf.toLowerCase()}-${slug(m.nome)}`, cdTse: m.cd, name: titulo(m.nome),
      eleitores: m.eleitores, zonas: m.zonas, hist: {} };
    if (h22?.aptos) o.hist[2022] = { aptos: h22.aptos, comparecimento: r4(h22.comp / h22.aptos) };
    if (h18?.aptos) o.hist[2018] = { aptos: h18.aptos, comparecimento: r4(h18.comp / h18.aptos) };
    return o;
  });
}
function titulo(s) {
  const minus = new Set(["de","da","do","das","dos","e","d'"]);
  return s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && minus.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

const j = (x) => JSON.stringify(x);
const linhaUf = (u) => `  { code: ${j(u.code)}, name: ${j(u.name)}, regiao: ${j(u.regiao)}, eleitores: ${u.eleitores}, municipios: ${u.municipios}, zonas: ${u.zonas}, vagasCamara: ${u.vagasCamara}, vagasAssembleia: ${u.vagasAssembleia}, hist: { 2022: { aptos: ${u.hist[2022].aptos}, comparecimento: ${u.hist[2022].comparecimento} }, 2018: { aptos: ${u.hist[2018].aptos}, comparecimento: ${u.hist[2018].comparecimento} } } },`;
const linhaMun = (m) => `    { id: ${j(m.id)}, cdTse: ${j(m.cdTse)}, name: ${j(m.name)}, eleitores: ${m.eleitores}, zonas: ${m.zonas}, hist: { ${m.hist[2022] ? `2022: { aptos: ${m.hist[2022].aptos}, comparecimento: ${m.hist[2022].comparecimento} }` : ""}${m.hist[2022] && m.hist[2018] ? ", " : ""}${m.hist[2018] ? `2018: { aptos: ${m.hist[2018].aptos}, comparecimento: ${m.hist[2018].comparecimento} }` : ""} } },`;

const hoje = "2026-09-15";
const cabecalho = `/**
 * ARQUIVO GERADO AUTOMATICAMENTE — não edite à mão.
 *
 * Gerado por scripts/gerar-dados-tse.mjs a partir dos arquivos originais do
 * Portal de Dados Abertos do TSE, em ${hoje}. Cada número aqui tem origem
 * rastreável: nenhum valor foi estimado, arredondado "a olho" ou inventado.
 *
 * O que NÃO está neste arquivo, por não existir fonte pública: desempenho
 * histórico da candidatura, presença de campanha, capacidade instalada e
 * dificuldade logística por território. Esses quatro são julgamentos da equipe
 * e entram como PREMISSA editável (ver PARAMS_TERRITORIAIS_PADRAO em engine.js).
 */

export const FONTES = {
  ELEITORADO_2026: {
    id: "ELEITORADO_2026",
    rotulo: "Eleitorado 2026",
    orgao: "Tribunal Superior Eleitoral",
    dataset: "Eleitorado 2026 — Portal de Dados Abertos do TSE",
    arquivo: "perfil_eleitorado_2026.zip",
    url: "https://dadosabertos.tse.jus.br/dataset/eleitorado-2026",
    dataReferencia: "2026-07-14",
    dataColeta: ${j(hoje)},
    metodo: "Soma de QT_ELEITORES por SG_UF e por CD_MUNICIPIO; zonas = contagem de NR_ZONA distintos. Exclui a UF 'ZZ' (eleitorado no exterior).",
  },
  COMPARECIMENTO_2022: {
    id: "COMPARECIMENTO_2022",
    rotulo: "Comparecimento — eleições 2022",
    orgao: "Tribunal Superior Eleitoral",
    dataset: "Resultados 2022 — Detalhe da apuração por município e zona",
    arquivo: "detalhe_votacao_munzona_2022.zip",
    url: "https://dadosabertos.tse.jus.br/dataset/resultados-2022",
    dataReferencia: "2022-10-02",
    dataColeta: ${j(hoje)},
    metodo: "QT_COMPARECIMENTO ÷ QT_APTOS, somados no 1º turno, cargo Deputado Federal, excluindo voto em trânsito (ST_VOTO_EM_TRANSITO = 'N') e a UF 'ZZ'.",
  },
  COMPARECIMENTO_2018: {
    id: "COMPARECIMENTO_2018",
    rotulo: "Comparecimento — eleições 2018",
    orgao: "Tribunal Superior Eleitoral",
    dataset: "Resultados 2018 — Detalhe da apuração por município e zona",
    arquivo: "detalhe_votacao_munzona_2018.zip",
    url: "https://dadosabertos.tse.jus.br/dataset/resultados-2018",
    dataReferencia: "2018-10-07",
    dataColeta: ${j(hoje)},
    metodo: "Mesmo método de 2022.",
  },
  VAGAS_CAMARA_2026: {
    id: "VAGAS_CAMARA_2026",
    rotulo: "Cadeiras na Câmara por UF (2026)",
    orgao: "Supremo Tribunal Federal / Tribunal Superior Eleitoral",
    dataset: "Distribuição de 513 cadeiras mantida para o pleito de 2026",
    url: "https://noticias.stf.jus.br/postsnoticias/supremo-mantem-numero-de-deputados-federais-para-2026/",
    dataReferencia: "2025-10-01",
    dataColeta: ${j(hoje)},
    metodo: "Em outubro de 2025 o STF suspendeu a redistribuição e manteve, para 2026, a mesma composição por estado eleita em 2022 — 513 cadeiras. A redistribuição (531) passa a valer em 2030.",
  },
  ASSEMBLEIA_CF27: {
    id: "ASSEMBLEIA_CF27",
    rotulo: "Cadeiras na Assembleia Legislativa",
    orgao: "Constituição Federal, art. 27",
    dataset: "Regra constitucional — valor calculado, não tabelado",
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
    dataReferencia: "1988-10-05",
    dataColeta: ${j(hoje)},
    metodo: "O triplo da representação do estado na Câmara; atingido 36, acrescenta-se um deputado estadual para cada deputado federal acima de 12.",
  },
  DATAS_LEI_9504: {
    id: "DATAS_LEI_9504",
    rotulo: "Datas do pleito",
    orgao: "Lei 9.504/1997, art. 1º",
    dataset: "Regra legal — data calculada a partir do ano",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9504.htm",
    dataReferencia: "1997-09-30",
    dataColeta: ${j(hoje)},
    metodo: "1º turno no primeiro domingo de outubro; 2º turno no último domingo de outubro.",
  },
};

/** De qual fonte vem cada campo dos dados territoriais. */
export const FONTE_DO_CAMPO = {
  eleitores: "ELEITORADO_2026",
  municipios: "ELEITORADO_2026",
  zonas: "ELEITORADO_2026",
  vagasCamara: "VAGAS_CAMARA_2026",
  vagasAssembleia: "ASSEMBLEIA_CF27",
  comparecimento2022: "COMPARECIMENTO_2022",
  comparecimento2018: "COMPARECIMENTO_2018",
};

/** Anos de referência histórica disponíveis. */
export const ANOS_REFERENCIA = [2022, 2018];

/** Eleitorado nacional apurado (27 UFs; não inclui o exterior). */
export const ELEITORADO_NACIONAL = ${ufs.reduce((a, u) => a + u.eleitores, 0)};
`;

const corpo = `
export const UF_DATA = [
${ufs.map(linhaUf).join("\n")}
];

/**
 * Os 12 maiores municípios de cada UF, por eleitorado. Não é o estado inteiro:
 * o que sobra entra como "Restante do estado" no cálculo territorial.
 */
export const MUNICIPIOS_POR_UF = {
${UFS.map((uf) => `  ${uf}: [\n${porUf[uf].map(linhaMun).join("\n")}\n  ],`).join("\n")}
};
`;

fs.writeFileSync(new URL("../src/dados-tse.js", import.meta.url), cabecalho + corpo);
console.error("→ src/dados-tse.js escrito");
console.error("   UFs:", ufs.length, "| nacional:", ufs.reduce((a, u) => a + u.eleitores, 0));
