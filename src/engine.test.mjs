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
   The briefing's reference example is the app's contract: any refactor that
   moves it has to fail here.
   ---------------------------------------------------------------------- */
test("reference example: Federal Deputy/SP, 110,000 votes", () => {
  const d = run(defaultConfig());
  assert.equal(Math.round(d.adjustedGoal), 161765);
  assert.equal(Math.round(d.totalContactsNeeded), 1078431);
  assert.equal(Math.round(d.dailyContacts), 23965);
});

/* ---------------------- electoral rules ---------------------------------- */

test("allocation uses QE/QP + leftovers, not pure D'Hondt over every seat", () => {
  // A party with 900,000 votes, QE = 314,285.7 -> QP = 2.
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
  // The distributed total lands exactly on the seats in dispute.
  assert.equal(r.rows.reduce((a, p) => a + p.seats, 0), 70);
  // A party's seats never fall below its party quotient.
  assert.ok(own.seats >= own.qp);
  // Pure D'Hondt over the 4 parties gave the party itself 7; the correct rule,
  // against the real valid votes, gives far fewer.
  assert.ok(own.seats < 7, `esperado < 7, obtido ${own.seats}`);
});

test("the displayed QP and seat count agree with each other", () => {
  const d = run(defaultConfig());
  const p = d.proportionalResult;
  assert.ok(p.ownSeats >= p.qp, "vagas totais não podem ser menores que o QP");
  assert.equal(p.ownSeats, p.qp + p.sobrasDaLegenda);
});

test("only parties at 80% of the electoral quotient run for leftovers", () => {
  // QE = 1000. The small party (300 votes) sits below 800 and takes no
  // leftovers; the large one takes them all.
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

test("if no party reaches 80% of the QE, all of them run for leftovers (art. 109, §3)", () => {
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

test("a candidate below 20% of the QE takes no seat", () => {
  const ranking = electoralRuleEngine.partyInternalRanking({
    myVotes: 100, competitors: [{ id: "c", nome: "Concorrente", votos: 5000 }],
    partySeats: 2, qe: 1000, // limiar = 200
  });
  const eu = ranking.find((c) => c.self);
  assert.equal(eu.apto, false);
  assert.equal(eu.elected, false, "candidato inapto não pode ser eleito mesmo sobrando vaga");
});

test("seats in dispute follow the state and the office", () => {
  const cfg = defaultConfig();
  assert.equal(getVagas(cfg), 70); // SP, Deputado Federal
  assert.equal(getVagas({ ...cfg, uf: "MG" }), 53);
  assert.equal(getVagas({ ...cfg, uf: "RR" }), 8);
  assert.equal(getVagas({ ...cfg, office: "DEPUTADO_ESTADUAL" }), UF_DATA[0].vagasAssembleia);
});

/* ---------------------- electoral ceiling -------------------------------- */

test("a goal above the turning-out electorate raises a critical alert", () => {
  const cfg = { ...defaultConfig(), uf: "RR", voteGoal: 5000000, territoriosSelecionados: [] };
  const d = run(cfg);
  const critico = d.alerts.find((a) => a.level === "critico" && /inatingível|matematicamente/i.test(a.text));
  assert.ok(critico, "esperava alerta de meta inatingível");
  assert.ok(d.eleitoradoEfetivo < cfg.voteGoal);
});

test("expected votes come from measured turnout, not the abstention assumption", () => {
  const d = run(defaultConfig());
  // Voters summed per territory, each with the turnout the TSE recorded for
  // that municipality.
  const esperado = d.territories.reduce((a, t) => a + t.eleitores * t.comparecimento, 0);
  assert.ok(Math.abs(d.eleitoradoEfetivo - esperado) < 1, "eleitoradoEfetivo deve somar os votantes medidos");
  assert.notEqual(Math.round(d.eleitoradoEfetivo), Math.round(d.eleitoradoElegivel * d.turnoutRate));
  assert.ok(d.comparecimentoHistorico > 0.5 && d.comparecimentoHistorico < 1);
  assert.ok(d.goalShareOfElectorate > 0 && d.goalShareOfElectorate < 1);
});

/* ---------------------- territory ---------------------------------------- */

test("SP includes the rest of the state: the goal is not 100% in the largest municipalities", () => {
  const d = run(defaultConfig());
  const resto = d.territories.find((t) => t.resto);
  assert.ok(resto, "esperava bucket 'Restante do estado'");
  const soma = d.territories.reduce((a, t) => a + t.eleitores, 0);
  const uf = UF_DATA.find((u) => u.code === "SP");
  assert.equal(soma, uf.eleitores, "a cobertura territorial deve fechar no eleitorado da UF");
  assert.ok(Math.abs(d.territories.reduce((a, t) => a + t.share, 0) - 1) < 1e-9);
});

test("historical performance and turnout are independent criteria", () => {
  const cfg = defaultConfig();
  // "historical" is team judgement; "turnout" is TSE measurement.
  cfg.territorioParams = { "sp-sao-paulo": { historico: 0.9 } };
  const t = buildTerritories(cfg);
  const capital = t.find((x) => x.id === "sp-sao-paulo");
  assert.notEqual(capital.historicoNorm, capital.comparecimentoNorm);
  // and both are normalized to 0..1, like the other criteria
  t.forEach((x) => {
    ["eleitorado", "historico", "comparecimento", "presenca", "capacidade", "logistica"].forEach((f) => {
      const v = x[`${f}Norm`];
      assert.ok(v >= 0 && v <= 1, `${x.name}.${f}Norm fora de 0..1: ${v}`);
    });
  });
});

test("the office level defines the territory", () => {
  const cfg = defaultConfig();
  assert.equal(buildTerritories({ ...cfg, office: "PREFEITO", municipioId: "campinas" }).length, 1);
  assert.equal(buildTerritories({ ...cfg, office: "PRESIDENTE" }).length, UF_DATA.length);
  assert.ok(buildTerritories({ ...cfg, office: "DEPUTADO_FEDERAL" }).length > 1);
});

test("required penetration is exposed per territory", () => {
  const d = run(defaultConfig());
  d.territories.forEach((t) => {
    assert.ok(Number.isFinite(t.penetracaoNecessaria));
    assert.ok(Number.isFinite(t.eleitoradoShare));
  });
});

/* ---------------------- capacity, schedule, budget ----------------------- */

test("street days and event days from the Schedule enter the period capacity", () => {
  const cfg = defaultConfig();
  const base = run(cfg).campaignCapacity;
  const dobro = run({ ...cfg, agenda: { ...cfg.agenda, diasRua: cfg.agenda.diasRua * 2 } }).campaignCapacity;
  assert.ok(dobro > base, "mudar dias de rua precisa alterar a capacidade acumulada");
});

test("budget events come from the Schedule's event days", () => {
  const cfg = defaultConfig();
  const a = run(cfg).eventosTotal;
  const b = run({ ...cfg, agenda: { ...cfg.agenda, diasEventos: cfg.agenda.diasEventos * 2 } }).eventosTotal;
  assert.equal(b, a * 2);
});

/* ---------------------- tracking ----------------------------------------- */

test("the deficit uses the logged completed contacts", () => {
  const cfg = defaultConfig();
  const d = run(cfg, { realizado: 200000, planejado: 250000 });
  assert.equal(Math.round(d.realizado), 200000);
  assert.equal(Math.round(d.deficitContatos), Math.round(d.totalContactsNeeded) - 200000);
  assert.ok(d.progressoFunil > 0 && d.progressoFunil < 1);
});

/* ---------------------- segments ----------------------------------------- */

test("the segment count reflects what is configured in Audiences", () => {
  const cfg = defaultConfig();
  assert.equal(run(cfg).segmentsCount, 5);
  const comTemas = { ...cfg, publicos: { ...cfg.publicos, tematicos: ["Saúde", "Educação"] } };
  assert.equal(run(comTemas).segmentsCount, 7);
});

/* ---------------------- Monte Carlo ------------------------------------- */

test("triangular never leaves its bounds, even with a mode outside the range", () => {
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

test("Monte Carlo respects the channel mix, not a single average rate", () => {
  const cfg = defaultConfig();
  const bounds = { abstentionMin: 0.13, abstentionMax: 0.27, fidelityMin: 0.73, fidelityMax: 0.93, conversionMultMin: 0.7, conversionMultMax: 1.3 };
  const soCorpoACorpo = runMonteCarlo({ cfg, bounds, iterations: 800, seed: 1 });

  // Move half the goal to digital (2% conversion): the median contact count
  // has to rise sharply. A single average rate would not show this.
  const misto = structuredClone(cfg);
  misto.channels.corpoACorpo.share = 0.5;
  misto.channels.digital.share = 0.5;
  const comDigital = runMonteCarlo({ cfg: misto, bounds, iterations: 800, seed: 1 });

  assert.ok(comDigital.contacts.p50 > soCorpoACorpo.contacts.p50 * 3,
    `mix de canais precisa alterar a distribuição (${comDigital.contacts.p50} vs ${soCorpoACorpo.contacts.p50})`);
});

test("Monte Carlo is reproducible and ordered", () => {
  const cfg = defaultConfig();
  const bounds = { abstentionMin: 0.13, abstentionMax: 0.27, fidelityMin: 0.73, fidelityMax: 0.93, conversionMultMin: 0.8, conversionMultMax: 1.2 };
  const a = runMonteCarlo({ cfg, bounds, iterations: 500, seed: 42 });
  const b = runMonteCarlo({ cfg, bounds, iterations: 500, seed: 42 });
  assert.deepEqual(a.contacts, b.contacts);
  assert.ok(a.contacts.p10 <= a.contacts.p50 && a.contacts.p50 <= a.contacts.p90);
  assert.ok(a.contactsHistogram.length > 1, "histograma real, não barras de percentil");
});

/* ---------------------- config migration --------------------------------- */

test("an old config, missing the newer channels, loads without breaking", () => {
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

test("migrateConfig tolerates garbage", () => {
  [null, undefined, 42, "texto", [], {}].forEach((v) => {
    const cfg = migrateConfig(v);
    assert.doesNotThrow(() => run(cfg), `quebrou com ${JSON.stringify(v)}`);
  });
});

test("deepMerge replaces arrays instead of merging item by item", () => {
  assert.deepEqual(deepMerge({ a: [1, 2, 3] }, { a: [9] }).a, [9]);
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } }).a, { b: 1, c: 3 });
});

/* ---------------------- numeric robustness ------------------------------- */

test("degenerate inputs produce no silent NaN", () => {
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

test("a channel with zero conversion does not contaminate the total with NaN", () => {
  const cfg = defaultConfig();
  cfg.channels.corpoACorpo.conversion = 0;
  const d = run(cfg);
  assert.equal(d.totalContactsNeeded, Infinity);
  assert.ok(!Number.isNaN(d.totalContactsNeeded));
});

test("a disabled channel with a share > 0 generates no contacts", () => {
  const cfg = defaultConfig();
  cfg.channels.corpoACorpo.enabled = false;
  const d = run(cfg);
  assert.equal(d.totalContactsNeeded, 0);
});

test("poll dates are derived from the year, not hardcoded", () => {
  assert.deepEqual(electionDates(2026), { primeiroTurno: "2026-10-04", segundoTurno: "2026-10-25" });
  assert.deepEqual(electionDates(2028), { primeiroTurno: "2028-10-01", segundoTurno: "2028-10-29" });
  assert.deepEqual(electionDates(2022), { primeiroTurno: "2022-10-02", segundoTurno: "2022-10-30" });
  assert.equal(electionDates("lixo"), null);
});

test("the historical reference year changes the turnout used", () => {
  const cfg = defaultConfig();
  const a = run({ ...cfg, uf: "MG", histRefYear: 2022 });
  const b = run({ ...cfg, uf: "MG", histRefYear: 2018 });
  assert.notEqual(a.territories[0].comparecimento, b.territories[0].comparecimento);
});

/* ---------------------- data provenance ---------------------------------- */

test("every data field declares a source that exists", () => {
  for (const [campo, fonteId] of Object.entries(FONTE_DO_CAMPO)) {
    const f = FONTES[fonteId];
    assert.ok(f, `campo ${campo} aponta para fonte inexistente ${fonteId}`);
    for (const chave of ["orgao", "url", "dataReferencia", "metodo"]) {
      assert.ok(f[chave], `fonte ${fonteId} sem ${chave}`);
    }
    assert.match(f.url, /^https:\/\//, `fonte ${fonteId} sem URL navegável`);
  }
});

test("all 27 states have electorate, turnout for both years and coherent seats", () => {
  assert.equal(UF_DATA.length, 27);
  for (const u of UF_DATA) {
    assert.ok(u.eleitores > 0, `${u.code} sem eleitorado`);
    assert.ok(u.municipios > 0 && u.zonas > 0, `${u.code} sem municípios/zonas`);
    for (const ano of [2022, 2018]) {
      const c = u.hist[ano]?.comparecimento;
      assert.ok(c > 0.5 && c < 1, `${u.code}/${ano} comparecimento implausível: ${c}`);
    }
    // Constitution art. 27: triple up to 36; past 12 federal seats, +1 state seat each.
    const esperado = u.vagasCamara <= 12 ? u.vagasCamara * 3 : 36 + (u.vagasCamara - 12);
    assert.equal(u.vagasAssembleia, esperado, `${u.code}: vagas de Assembleia fora da regra do art. 27`);
  }
  assert.equal(UF_DATA.reduce((a, u) => a + u.vagasCamara, 0), 513, "a Câmara tem 513 cadeiras em 2026");
});

test("turnout follows no synthetic pattern between 2018 and 2022", () => {
  // A fixed offset across all 27 states is the signature of invented data:
  // with real data the delta changes sign.
  const deltas = UF_DATA.map((u) => u.hist[2018].comparecimento - u.hist[2022].comparecimento);
  assert.ok(deltas.some((d) => d > 0) && deltas.some((d) => d < 0),
    "esperava UFs com comparecimento maior e menor em 2018 do que em 2022");
});

test("changing the reference year changes the expected votes", () => {
  const cfg = defaultConfig();
  const a = run({ ...cfg, histRefYear: 2022 });
  const b = run({ ...cfg, histRefYear: 2018 });
  assert.notEqual(Math.round(a.eleitoradoEfetivo), Math.round(b.eleitoradoEfetivo));
  assert.equal(a.anoReferencia, 2022);
  assert.equal(b.anoReferencia, 2018);
});

test("every state has a municipal breakdown, not just SP", () => {
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

test("the four sourceless criteria start neutral and break no tie", () => {
  const t = buildTerritories(defaultConfig());
  for (const campo of ["historico", "presenca", "capacidade", "logistica"]) {
    assert.equal(PARAMS_TERRITORIAIS_PADRAO[campo], 0.5);
    const distintos = new Set(t.map((x) => x[`${campo}Norm`]));
    assert.equal(distintos.size, 1, `${campo} deveria ser igual para todos até a equipe informar`);
  }
});

/* ---------------------- honest precision --------------------------------- */

test("fmtSig cuts false precision instead of dumping every digit", () => {
  assert.equal(fmtSig(1078431), "1,08 mi");
  assert.equal(fmtSig(161765), "162 mil");
  assert.equal(fmtSig(8), "8");
  assert.equal(fmtSig(0), "0");
  assert.equal(fmtSig(NaN), "—");
  assert.equal(fmtSig(Infinity), "—");
  assert.equal(fmtSig(-1250000), "-1,25 mi");
  assert.match(fmtFaixa(781000, 1620000), /781 mil – 1,6 mi/);
});

test("the simulation returns a range for goal, contacts, daily target and cost", () => {
  const cfg = defaultConfig();
  const r = runMonteCarlo({ cfg, bounds: defaultBounds(cfg), iterations: 800, seed: 42 });
  for (const chave of ["adjustedGoal", "contacts", "daily", "cost"]) {
    const f = r[chave];
    assert.ok(f, `faltou a faixa de ${chave}`);
    assert.ok(f.p10 <= f.p50 && f.p50 <= f.p90, `${chave}: percentis fora de ordem`);
    assert.ok(f.p90 > f.p10, `${chave}: faixa degenerada — a incerteza sumiu`);
  }
});

test("the simulated cost envelopes the deterministic cost", () => {
  const cfg = defaultConfig();
  const d = run(cfg);
  const r = runMonteCarlo({ cfg, bounds: defaultBounds(cfg), iterations: 2000, seed: 42 });
  assert.ok(r.cost.p10 <= d.totalCost && d.totalCost <= r.cost.p90,
    `custo determinístico ${d.totalCost} fora da faixa ${r.cost.p10}–${r.cost.p90}`);
});

test("same seed, same range: the simulation is reproducible", () => {
  const cfg = defaultConfig();
  const b = defaultBounds(cfg);
  const a1 = runMonteCarlo({ cfg, bounds: b, iterations: 500, seed: 7 });
  const a2 = runMonteCarlo({ cfg, bounds: b, iterations: 500, seed: 7 });
  assert.deepEqual(a1.contacts, a2.contacts);
});

test("defaultBounds derives the bounds from the plan's assumptions", () => {
  const b = defaultBounds({ ...defaultConfig(), abstentionRate: 0.30, fidelityRate: 0.70 });
  assert.equal(b.abstentionMin, 0.23);
  assert.equal(b.abstentionMax, 0.37);
  assert.equal(b.fidelityMin, 0.58);
  assert.equal(b.fidelityMax, 0.78);
});
