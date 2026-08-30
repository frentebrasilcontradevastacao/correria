import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig, migrateConfig, computeAll, buildTerritories, getVagas,
  electoralRuleEngine, electorateEngine, funnelEngine, capacityEngine,
  triangular, mulberry32, runMonteCarlo, deepMerge, territorialEngine,
  CANDIDATE_THRESHOLD, SOBRAS_PARTY_THRESHOLD, UF_DATA, SP_MUNICIPIOS, CHANNEL_DEFS,
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

test("effectiveElectorate é efetivamente usado no cálculo", () => {
  const d = run(defaultConfig());
  assert.equal(Math.round(d.eleitoradoEfetivo), Math.round(35e6 * 0.8));
  assert.ok(d.goalShareOfElectorate > 0 && d.goalShareOfElectorate < 1);
});

/* ---------------------- território -------------------------------------- */

test("SP inclui o restante do estado — a meta não é 100% em 40% do eleitorado", () => {
  const d = run(defaultConfig());
  const resto = d.territories.find((t) => t.resto);
  assert.ok(resto, "esperava bucket 'Restante do estado'");
  const soma = d.territories.reduce((a, t) => a + t.eleitoradoM, 0);
  assert.ok(Math.abs(soma - 35.0) < 0.001, `eleitorado coberto ${soma} deveria fechar em 35M`);
  assert.ok(Math.abs(d.territories.reduce((a, t) => a + t.share, 0) - 1) < 1e-9);
});

test("histórico e comparecimento são critérios independentes", () => {
  const t = buildTerritories(defaultConfig());
  const capital = t.find((x) => x.id === "sp-capital");
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
