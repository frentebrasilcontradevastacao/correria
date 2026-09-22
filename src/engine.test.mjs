import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig, migrateConfig, computeAll, buildTerritories, getVagas,
  electoralRuleEngine, electorateEngine, funnelEngine, capacityEngine,
  triangular, mulberry32, runMonteCarlo, defaultBounds, fmtSig, fmtFaixa, deepMerge, territorialEngine,
  CANDIDATE_THRESHOLD, SOBRAS_PARTY_THRESHOLD, UF_DATA, MUNICIPIOS_POR_UF, getMunicipiosDaUf, PARAMS_TERRITORIAIS_PADRAO, FONTES, FONTE_DO_CAMPO, CHANNEL_DEFS,
  electionDates,
} from "./engine.js";

const REF_DATE = new Date("2026-08-30T12:00:00Z");
const run = (cfg, tracking) => computeAll(cfg, tracking ?? { realizado: 0, planejado: 0 }, REF_DATE);

/* -------------------------------------------------------------------------
   O exemplo obrigatório do briefing é o contrato do app: qualquer refatoração
   que mexa nele precisa quebrar aqui.
   ---------------------------------------------------------------------- */
test("exemplo obrigatório: Deputado Federal/SP, 110.000 votos", () => {
  const d = run(defaultConfig());
  assert.equal(Math.round(d.adjustedGoal), 161765);
  assert.equal(Math.round(d.totalContactsNeeded), 1078431);
  assert.equal(Math.round(d.dailyContacts), 23965);
});

/* ---------------------- regras eleitorais (correção principal) ------------ */

test("alocação usa QE/QP + sobras, não D'Hondt puro sobre todas as vagas", () => {
  // Partido com 900.000 votos, QE = 314.285,7 -> QP = 2.
  const r = electoralRuleEngine.allocate({
    parties: [
      { id: "own", name: "Minha legenda", votes: 900000 },
      { id: "x", name: "X", votes: 3200000 },
      { id: "y", name: "Y", votes: 2650000 },
      { id: "z", name: "Z", votes: 1450000 },
      { id: "resto", name: "Demais", votes: 13800000 },
    ],
    validVotes: 22000000,
    seats: 70,
  });
  const own = r.rows.find((p) => p.id === "own");
  assert.equal(own.qp, 2, "quociente partidário");
  // O total distribuído fecha exatamente nas vagas em disputa.
  assert.equal(r.rows.reduce((a, p) => a + p.seats, 0), 70);
  // As vagas do partido nunca ficam abaixo do seu quociente partidário.
  assert.ok(own.seats >= own.qp);
  // D'Hondt puro sobre as 4 legendas antigas dava 7 para a própria legenda;
  // a regra correta, com os votos válidos reais, dá bem menos.
  assert.ok(own.seats < 7, `esperado < 7, obtido ${own.seats}`);
});

test("QP e vagas exibidas são consistentes entre si", () => {
  const d = run(defaultConfig());
  const p = d.proportionalResult;
  assert.ok(p.ownSeats >= p.qp, "vagas totais não podem ser menores que o QP");
  assert.equal(p.ownSeats, p.qp + p.sobrasDaLegenda);
});

test("só concorre às sobras quem tem 80% do quociente eleitoral", () => {
  // QE = 1000. Partido pequeno (300 votos) está abaixo de 800 e não pode
  // receber sobras; o grande recebe todas.
  const r = electoralRuleEngine.allocate({
    parties: [
      { id: "grande", name: "Grande", votes: 9700 },
      { id: "pequeno", name: "Pequeno", votes: 300 },
    ],
    validVotes: 10000,
    seats: 10,
  });
  assert.equal(r.rows.find((p) => p.id === "pequeno").seats, 0);
  assert.equal(r.rows.find((p) => p.id === "grande").seats, 10);
  assert.equal(r.restrictedPool, true);
});

test("se nenhum partido atinge 80% do QE, todos concorrem às sobras (art. 109, §3º)", () => {
  const r = electoralRuleEngine.allocate({
    parties: [
      { id: "a", name: "A", votes: 300 },
      { id: "b", name: "B", votes: 200 },
    ],
    validVotes: 10000, // QE = 1000; ninguém alcança 800
    seats: 10,
  });
  assert.equal(r.restrictedPool, false);
  assert.equal(r.rows.reduce((a, p) => a + p.seats, 0), 10);
});

test("candidato abaixo de 20% do QE não ocupa vaga da legenda", () => {
  const ranking = electoralRuleEngine.partyInternalRanking({
    myVotes: 100, competitors: [{ id: "c", nome: "Concorrente", votos: 5000 }],
    partySeats: 2, qe: 1000, // limiar = 200
  });
  const eu = ranking.find((c) => c.self);
  assert.equal(eu.apto, false);
  assert.equal(eu.elected, false, "candidato inapto não pode ser eleito mesmo sobrando vaga");
});

test("vagas em disputa acompanham a UF e o cargo", () => {
  const cfg = defaultConfig();
  assert.equal(getVagas(cfg), 70); // SP, Deputado Federal
  assert.equal(getVagas({ ...cfg, uf: "MG" }), 53);
  assert.equal(getVagas({ ...cfg, uf: "RR" }), 8);
  assert.equal(getVagas({ ...cfg, office: "DEPUTADO_ESTADUAL" }), UF_DATA[0].vagasAssembleia);
});

/* ---------------------- teto eleitoral ---------------------------------- */

test("meta acima do eleitorado que comparece gera alerta crítico", () => {
  const cfg = { ...defaultConfig(), uf: "RR", voteGoal: 5000000, territoriosSelecionados: [] };
  const d = run(cfg);
  const critico = d.alerts.find((a) => a.level === "critico" && /inatingível|matematicamente/i.test(a.text));
  assert.ok(critico, "esperava alerta de meta inatingível");
  assert.ok(d.eleitoradoEfetivo < cfg.voteGoal);
});

test("votos esperados saem do comparecimento MEDIDO, não da premissa de abstenção", () => {
  const d = run(defaultConfig());
  // Soma dos votantes por território, cada um com o comparecimento que o TSE
  // registrou naquele município. Antes era eleitorado × (1 - abstenção), o que
  // fazia o seletor de ano de referência não mexer em nada.
  const esperado = d.territories.reduce((a, t) => a + t.eleitores * t.comparecimento, 0);
  assert.ok(Math.abs(d.eleitoradoEfetivo - esperado) < 1, "eleitoradoEfetivo deve somar os votantes medidos");
  assert.notEqual(Math.round(d.eleitoradoEfetivo), Math.round(d.eleitoradoElegivel * d.turnoutRate));
  assert.ok(d.comparecimentoHistorico > 0.5 && d.comparecimentoHistorico < 1);
  assert.ok(d.goalShareOfElectorate > 0 && d.goalShareOfElectorate < 1);
});

/* ---------------------- território -------------------------------------- */

test("SP inclui o restante do estado — a meta não é 100% nos maiores municípios", () => {
  const d = run(defaultConfig());
  const resto = d.territories.find((t) => t.resto);
  assert.ok(resto, "esperava bucket 'Restante do estado'");
  const soma = d.territories.reduce((a, t) => a + t.eleitores, 0);
  const uf = UF_DATA.find((u) => u.code === "SP");
  assert.equal(soma, uf.eleitores, "a cobertura territorial deve fechar no eleitorado da UF");
  assert.ok(Math.abs(d.territories.reduce((a, t) => a + t.share, 0) - 1) < 1e-9);
});

test("histórico e comparecimento são critérios independentes", () => {
  const cfg = defaultConfig();
  // "histórico" é julgamento da equipe; "comparecimento" é medição do TSE.
  cfg.territorioParams = { "sp-sao-paulo": { historico: 0.9 } };
  const t = buildTerritories(cfg);
  const capital = t.find((x) => x.id === "sp-sao-paulo");
  assert.notEqual(capital.historicoNorm, capital.comparecimentoNorm);
  // e ambos estão normalizados em 0..1, como os demais critérios
  t.forEach((x) => {
    ["eleitorado", "historico", "comparecimento", "presenca", "capacidade", "logistica"].forEach((f) => {
      const v = x[`${f}Norm`];
      assert.ok(v >= 0 && v <= 1, `${x.name}.${f}Norm fora de 0..1: ${v}`);
    });
  });
});

test("o nível do cargo define o território", () => {
  const cfg = defaultConfig();
  assert.equal(buildTerritories({ ...cfg, office: "PREFEITO", municipioId: "campinas" }).length, 1);
  assert.equal(buildTerritories({ ...cfg, office: "PRESIDENTE" }).length, UF_DATA.length);
  assert.ok(buildTerritories({ ...cfg, office: "DEPUTADO_FEDERAL" }).length > 1);
});

test("penetração necessária é exposta por território", () => {
  const d = run(defaultConfig());
  d.territories.forEach((t) => {
    assert.ok(Number.isFinite(t.penetracaoNecessaria));
    assert.ok(Number.isFinite(t.eleitoradoShare));
  });
});

/* ---------------------- capacidade, agenda, orçamento -------------------- */

test("dias de rua e de eventos da Agenda entram na capacidade do período", () => {
  const cfg = defaultConfig();
  const base = run(cfg).campaignCapacity;
  const dobro = run({ ...cfg, agenda: { ...cfg.agenda, diasRua: cfg.agenda.diasRua * 2 } }).campaignCapacity;
  assert.ok(dobro > base, "mudar dias de rua precisa alterar a capacidade acumulada");
});

test("eventos do orçamento vêm dos dias de eventos da Agenda", () => {
  const cfg = defaultConfig();
  const a = run(cfg).eventosTotal;
  const b = run({ ...cfg, agenda: { ...cfg.agenda, diasEventos: cfg.agenda.diasEventos * 2 } }).eventosTotal;
  assert.equal(b, a * 2);
});

/* ---------------------- rastreamento ------------------------------------ */

test("déficit usa os contatos realizados registrados", () => {
  const cfg = defaultConfig();
  const d = run(cfg, { realizado: 200000, planejado: 250000 });
  assert.equal(Math.round(d.realizado), 200000);
  assert.equal(Math.round(d.deficitContatos), Math.round(d.totalContactsNeeded) - 200000);
  assert.ok(d.progressoFunil > 0 && d.progressoFunil < 1);
});

/* ---------------------- segmentos --------------------------------------- */

test("contagem de segmentos reflete o que está configurado em Públicos", () => {
  const cfg = defaultConfig();
  assert.equal(run(cfg).segmentsCount, 5);
  const comTemas = { ...cfg, publicos: { ...cfg.publicos, tematicos: ["Saúde", "Educação"] } };
  assert.equal(run(comTemas).segmentsCount, 7);
});

/* ---------------------- Monte Carlo ------------------------------------- */

test("triangular nunca sai dos limites, mesmo com moda fora do intervalo", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 5000; i++) {
    const v = triangular(rng, 0.10, 0.90, 0.15); // moda acima do máximo
    assert.ok(v >= 0.10 && v <= 0.15, `amostra ${v} fora de [0.10, 0.15]`);
  }
  const rng2 = mulberry32(9);
  for (let i = 0; i < 5000; i++) {
    const v = triangular(rng2, 0.40, 0.01, 0.60); // moda abaixo do mínimo
    assert.ok(v >= 0.40 && v <= 0.60);
  }
});

test("Monte Carlo respeita o mix de canais, não uma taxa média única", () => {
  const cfg = defaultConfig();
  const bounds = { abstentionMin: 0.13, abstentionMax: 0.27, fidelityMin: 0.73, fidelityMax: 0.93, conversionMultMin: 0.7, conversionMultMax: 1.3 };
  const soCorpoACorpo = runMonteCarlo({ cfg, bounds, iterations: 800, seed: 1 });

  // Move metade da meta para o digital (conversão 2%): a mediana de contatos
  // tem de subir muito. Com uma taxa média única isso não apareceria.
  const misto = structuredClone(cfg);
  misto.channels.corpoACorpo.share = 0.5;
  misto.channels.digital.share = 0.5;
  const comDigital = runMonteCarlo({ cfg: misto, bounds, iterations: 800, seed: 1 });

  assert.ok(comDigital.contacts.p50 > soCorpoACorpo.contacts.p50 * 3,
    `mix de canais precisa alterar a distribuição (${comDigital.contacts.p50} vs ${soCorpoACorpo.contacts.p50})`);
});

test("Monte Carlo é reprodutível e ordenado", () => {
  const cfg = defaultConfig();
  const bounds = { abstentionMin: 0.13, abstentionMax: 0.27, fidelityMin: 0.73, fidelityMax: 0.93, conversionMultMin: 0.8, conversionMultMax: 1.2 };
  const a = runMonteCarlo({ cfg, bounds, iterations: 500, seed: 42 });
  const b = runMonteCarlo({ cfg, bounds, iterations: 500, seed: 42 });
  assert.deepEqual(a.contacts, b.contacts);
  assert.ok(a.contacts.p10 <= a.contacts.p50 && a.contacts.p50 <= a.contacts.p90);
  assert.ok(a.contactsHistogram.length > 1, "histograma real, não barras de percentil");
});

/* ---------------------- migração de configuração ------------------------ */

test("configuração antiga (sem canais novos) carrega sem quebrar", () => {
  const antiga = {
    voteGoal: 50000, campaignDays: 30,
    channels: { corpoACorpo: { enabled: true, share: 1, conversion: 0.2, params: {} } }, // faltam 6 canais
    uf: "ZZ", office: "CARGO_INEXISTENTE",
  };
  const cfg = migrateConfig(antiga);
  CHANNEL_DEFS.forEach((def) => {
    assert.ok(cfg.channels[def.id], `canal ${def.id} ausente após migração`);
    def.fields.forEach((f) => assert.ok(Number.isFinite(cfg.channels[def.id].params[f.key])));
  });
  assert.equal(cfg.voteGoal, 50000, "preserva o que o usuário tinha");
  assert.equal(cfg.uf, "SP", "UF inválida volta ao padrão");
  assert.equal(cfg.office, "DEPUTADO_FEDERAL");
  assert.doesNotThrow(() => run(cfg));
});

test("migrateConfig tolera lixo", () => {
  [null, undefined, 42, "texto", [], {}].forEach((v) => {
    const cfg = migrateConfig(v);
    assert.doesNotThrow(() => run(cfg), `quebrou com ${JSON.stringify(v)}`);
  });
});

test("deepMerge substitui arrays em vez de mesclar item a item", () => {
  assert.deepEqual(deepMerge({ a: [1, 2, 3] }, { a: [9] }).a, [9]);
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } }).a, { b: 1, c: 3 });
});

/* ---------------------- robustez numérica -------------------------------- */

test("entradas degeneradas não produzem NaN silencioso", () => {
  const cfg = defaultConfig();
  const casos = [
    { ...cfg, campaignDays: 0 },
    { ...cfg, voteGoal: 0 },
    { ...cfg, fidelityRate: 0 },
    { ...cfg, abstentionRate: 1 },
    { ...cfg, team: { ...cfg.team, mobilizadores: 0, reunioesDia: 0, eventosDia: 0 } },
  ];
  casos.forEach((c, i) => {
    const d = run(c);
    assert.ok(!Number.isNaN(d.adjustedGoal), `caso ${i}: adjustedGoal NaN`);
    assert.ok(!Number.isNaN(d.totalContactsNeeded), `caso ${i}: contatos NaN`);
    assert.ok(!Number.isNaN(d.totalCost), `caso ${i}: custo NaN`);
    assert.ok(Array.isArray(d.alerts));
  });
});

test("canal com conversão zero não contamina o total com NaN", () => {
  const cfg = defaultConfig();
  cfg.channels.corpoACorpo.conversion = 0;
  const d = run(cfg);
  assert.equal(d.totalContactsNeeded, Infinity);
  assert.ok(!Number.isNaN(d.totalContactsNeeded));
});

test("canal desabilitado com participação > 0 não gera contatos", () => {
  const cfg = defaultConfig();
  cfg.channels.corpoACorpo.enabled = false;
  const d = run(cfg);
  assert.equal(d.totalContactsNeeded, 0);
});

test("datas do pleito são derivadas do ano, não fixas", () => {
  assert.deepEqual(electionDates(2026), { primeiroTurno: "2026-10-04", segundoTurno: "2026-10-25" });
  assert.deepEqual(electionDates(2028), { primeiroTurno: "2028-10-01", segundoTurno: "2028-10-29" });
  assert.deepEqual(electionDates(2022), { primeiroTurno: "2022-10-02", segundoTurno: "2022-10-30" });
  assert.equal(electionDates("lixo"), null);
});

test("ano de referência histórica muda o comparecimento usado", () => {
  const cfg = defaultConfig();
  const a = run({ ...cfg, uf: "MG", histRefYear: 2022 });
  const b = run({ ...cfg, uf: "MG", histRefYear: 2018 });
  assert.notEqual(a.territories[0].comparecimento, b.territories[0].comparecimento);
});

/* ---------------------- proveniência dos dados --------------------------- */

test("todo campo de dado declara uma fonte existente", () => {
  for (const [campo, fonteId] of Object.entries(FONTE_DO_CAMPO)) {
    const f = FONTES[fonteId];
    assert.ok(f, `campo ${campo} aponta para fonte inexistente ${fonteId}`);
    for (const chave of ["orgao", "url", "dataReferencia", "metodo"]) {
      assert.ok(f[chave], `fonte ${fonteId} sem ${chave}`);
    }
    assert.match(f.url, /^https:\/\//, `fonte ${fonteId} sem URL navegável`);
  }
});

test("as 27 UFs têm eleitorado, comparecimento dos dois anos e vagas coerentes", () => {
  assert.equal(UF_DATA.length, 27);
  for (const u of UF_DATA) {
    assert.ok(u.eleitores > 0, `${u.code} sem eleitorado`);
    assert.ok(u.municipios > 0 && u.zonas > 0, `${u.code} sem municípios/zonas`);
    for (const ano of [2022, 2018]) {
      const c = u.hist[ano]?.comparecimento;
      assert.ok(c > 0.5 && c < 1, `${u.code}/${ano} comparecimento implausível: ${c}`);
    }
    // CF art. 27: o triplo até 36; acima de 12 federais, +1 estadual por federal.
    const esperado = u.vagasCamara <= 12 ? u.vagasCamara * 3 : 36 + (u.vagasCamara - 12);
    assert.equal(u.vagasAssembleia, esperado, `${u.code}: vagas de Assembleia fora da regra do art. 27`);
  }
  assert.equal(UF_DATA.reduce((a, u) => a + u.vagasCamara, 0), 513, "a Câmara tem 513 cadeiras em 2026");
});

test("o comparecimento não segue um padrão sintético entre 2018 e 2022", () => {
  // A versão anterior tinha 2018 = 2022 + 0,02 para TODAS as UFs, o que é o
  // carimbo de dado inventado. Com dado real, o delta varia de sinal.
  const deltas = UF_DATA.map((u) => u.hist[2018].comparecimento - u.hist[2022].comparecimento);
  assert.ok(deltas.some((d) => d > 0) && deltas.some((d) => d < 0),
    "esperava UFs com comparecimento maior e menor em 2018 do que em 2022");
});

test("trocar o ano de referência muda os votos esperados", () => {
  const cfg = defaultConfig();
  const a = run({ ...cfg, histRefYear: 2022 });
  const b = run({ ...cfg, histRefYear: 2018 });
  assert.notEqual(Math.round(a.eleitoradoEfetivo), Math.round(b.eleitoradoEfetivo));
  assert.equal(a.anoReferencia, 2022);
  assert.equal(b.anoReferencia, 2018);
});

test("toda UF tem recorte municipal, não só SP", () => {
  for (const u of UF_DATA) {
    const lista = getMunicipiosDaUf(u.code);
    assert.ok(lista.length > 0, `${u.code} sem municípios detalhados`);
    assert.ok(lista.length <= 12);
    const soma = lista.reduce((a, m) => a + m.eleitores, 0);
    assert.ok(soma <= u.eleitores, `${u.code}: municípios somam mais que a UF`);
    for (let i = 1; i < lista.length; i++) {
      assert.ok(lista[i - 1].eleitores >= lista[i].eleitores, `${u.code} fora de ordem`);
    }
  }
});

test("os quatro critérios sem fonte começam neutros e não desempatam nada", () => {
  const t = buildTerritories(defaultConfig());
  for (const campo of ["historico", "presenca", "capacidade", "logistica"]) {
    assert.equal(PARAMS_TERRITORIAIS_PADRAO[campo], 0.5);
    const distintos = new Set(t.map((x) => x[`${campo}Norm`]));
    assert.equal(distintos.size, 1, `${campo} deveria ser igual para todos até a equipe informar`);
  }
});

/* ---------------------- precisão honesta -------------------------------- */

test("fmtSig corta a precisão falsa em vez de despejar todos os dígitos", () => {
  assert.equal(fmtSig(1078431), "1,08 mi");
  assert.equal(fmtSig(161765), "162 mil");
  assert.equal(fmtSig(8), "8");
  assert.equal(fmtSig(0), "0");
  assert.equal(fmtSig(NaN), "—");
  assert.equal(fmtSig(Infinity), "—");
  assert.equal(fmtSig(-1250000), "-1,25 mi");
  assert.match(fmtFaixa(781000, 1620000), /781 mil – 1,6 mi/);
});

test("a simulação devolve faixa para meta, contatos, diária e custo", () => {
  const cfg = defaultConfig();
  const r = runMonteCarlo({ cfg, bounds: defaultBounds(cfg), iterations: 800, seed: 42 });
  for (const chave of ["adjustedGoal", "contacts", "daily", "cost"]) {
    const f = r[chave];
    assert.ok(f, `faltou a faixa de ${chave}`);
    assert.ok(f.p10 <= f.p50 && f.p50 <= f.p90, `${chave}: percentis fora de ordem`);
    assert.ok(f.p90 > f.p10, `${chave}: faixa degenerada — a incerteza sumiu`);
  }
});

test("o custo simulado envolve o custo determinístico", () => {
  const cfg = defaultConfig();
  const d = run(cfg);
  const r = runMonteCarlo({ cfg, bounds: defaultBounds(cfg), iterations: 2000, seed: 42 });
  assert.ok(r.cost.p10 <= d.totalCost && d.totalCost <= r.cost.p90,
    `custo determinístico ${d.totalCost} fora da faixa ${r.cost.p10}–${r.cost.p90}`);
});

test("mesma semente, mesma faixa — a simulação é reprodutível", () => {
  const cfg = defaultConfig();
  const b = defaultBounds(cfg);
  const a1 = runMonteCarlo({ cfg, bounds: b, iterations: 500, seed: 7 });
  const a2 = runMonteCarlo({ cfg, bounds: b, iterations: 500, seed: 7 });
  assert.deepEqual(a1.contacts, a2.contacts);
});

test("defaultBounds deriva os limites das premissas do plano", () => {
  const b = defaultBounds({ ...defaultConfig(), abstentionRate: 0.30, fidelityRate: 0.70 });
  assert.equal(b.abstentionMin, 0.23);
  assert.equal(b.abstentionMax, 0.37);
  assert.equal(b.fidelityMin, 0.58);
  assert.equal(b.fidelityMax, 0.78);
});
