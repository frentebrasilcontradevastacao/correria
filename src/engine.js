/* ============================================================================
   FUNIL REVERSO DE ELEIÇÃO — MOTOR DE CÁLCULO
   Camada pura: sem React, sem DOM, sem acesso a rede. Todas as funções abaixo
   são determinísticas e testáveis isoladamente (ver src/engine.test.mjs) e
   podem ser portadas para um backend (Node/Python) sem alteração.
   ========================================================================== */

import {
  FONTES, FONTE_DO_CAMPO, ANOS_REFERENCIA, ELEITORADO_NACIONAL,
  UF_DATA, MUNICIPIOS_POR_UF,
} from "./dados-tse.js";

export { FONTES, FONTE_DO_CAMPO, ANOS_REFERENCIA, ELEITORADO_NACIONAL, UF_DATA, MUNICIPIOS_POR_UF };

/* ---------------------------- utilidades ---------------------------- */

export const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export const safeDiv = (a, b) => (!b || !Number.isFinite(b) ? 0 : a / b);
export const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

export function fmtInt(n) {
  if (!isFiniteNum(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}
export function fmtDec(n, digits = 1) {
  if (!isFiniteNum(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtPct(n, digits = 1) {
  if (!isFiniteNum(n)) return "—";
  return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
export function fmtMoney(n) {
  if (!isFiniteNum(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
/**
 * Número com ALGARISMOS SIGNIFICATIVOS, não com todos os dígitos que a conta
 * produziu. "1.078.431 contatos" sugere precisão à unidade num resultado que
 * saiu de uma taxa de conversão chutada; "1,08 mi" diz o que de fato se sabe.
 */
export function fmtSig(n, sig = 3) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs < 1000) {
    const casas = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
    return n.toLocaleString("pt-BR", { maximumFractionDigits: Math.min(casas, 2) });
  }
  const escalas = [
    { limite: 1e9, div: 1e9, suf: " bi" },
    { limite: 1e6, div: 1e6, suf: " mi" },
    { limite: 1e3, div: 1e3, suf: " mil" },
  ];
  const e = escalas.find((x) => abs >= x.limite);
  const v = n / e.div;
  const casas = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: Math.min(casas, 2) }) + e.suf;
}

/** Faixa "a – b" em algarismos significativos. */
export function fmtFaixa(min, max, sig = 2) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  return `${fmtSig(min, sig)} – ${fmtSig(max, sig)}`;
}

export function fmtSigned(n, formatter = fmtInt) {
  if (!isFiniteNum(n)) return "—";
  return `${n >= 0 ? "+" : "−"}${formatter(Math.abs(n))}`;
}

let uidCounter = 0;
export function uid(prefix = "id") {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

/** Merge recursivo usado na migração de configurações salvas. Arrays são
 *  substituídos inteiros (não mesclados item a item) de propósito. */
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  Object.keys(override).forEach((k) => {
    out[k] = k in base ? deepMerge(base[k], override[k]) : override[k];
  });
  return out;
}

/**
 * Datas do pleito a partir do ano. Lei 9.504/1997, art. 1º: 1º turno no
 * primeiro domingo de outubro, 2º turno no último domingo de outubro.
 * (O ano da eleição era um rótulo decorativo na barra de contexto.)
 */
export function electionDates(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return null;
  let primeiro = null;
  for (let d = 1; d <= 7 && !primeiro; d++) {
    const dt = new Date(Date.UTC(y, 9, d));
    if (dt.getUTCDay() === 0) primeiro = dt;
  }
  let segundo = null;
  for (let d = 31; d >= 25 && !segundo; d--) {
    const dt = new Date(Date.UTC(y, 9, d));
    if (dt.getUTCDay() === 0) segundo = dt;
  }
  const iso = (dt) => dt.toISOString().slice(0, 10);
  return { primeiroTurno: iso(primeiro), segundoTurno: iso(segundo) };
}

export const daysBetween = (isoStart, isoEnd) => {
  const a = new Date(`${isoStart}T00:00:00`);
  const b = new Date(`${isoEnd}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
};

/* ============================================================================
   ENGINES
   ========================================================================== */

export const electorateEngine = {
  turnoutFromAbstention: (abstentionRate) => clamp01(1 - clamp01(abstentionRate)),
  /** Eleitores que efetivamente comparecem — o teto físico de qualquer meta. */
  effectiveElectorate: (eligibleElectorate, turnoutRate) =>
    Math.max(0, eligibleElectorate) * clamp01(turnoutRate),
};

export const funnelEngine = {
  adjustedGoal: (voteGoal, fidelityRate, turnoutRate) => {
    const denom = clamp01(fidelityRate) * clamp01(turnoutRate);
    return denom > 0 ? Math.max(0, voteGoal) / denom : Infinity;
  },
  contactsForGoalShare: (adjustedGoal, share, conversionRate) => {
    const s = clamp01(share);
    // Ordem importa: um canal com 0% de participação custa 0 contatos mesmo
    // quando a meta ajustada é infinita (fidelidade 0). Multiplicar primeiro
    // produzia Infinity * 0 = NaN, que contaminava o total silenciosamente.
    if (s === 0) return 0;
    if (!isFiniteNum(adjustedGoal)) return Infinity;
    const goalShare = adjustedGoal * s;
    if (goalShare === 0) return 0;
    return conversionRate > 0 ? goalShare / conversionRate : Infinity;
  },
  dailyTarget: (operationalTotal, activeDays) => (activeDays > 0 ? operationalTotal / activeDays : Infinity),
};

export const conversionEngine = {
  chainMultiplier: (rates) => rates.reduce((acc, r) => acc * clamp01(r), 1),
  actionsNeeded: (contactsNeeded, chainMultiplier) =>
    (chainMultiplier > 0 ? contactsNeeded / chainMultiplier : Infinity),
};

export const networkEngine = {
  newContacts: (rawNetwork, activationRate, overlapRate) =>
    Math.max(0, rawNetwork) * clamp01(activationRate) * (1 - clamp01(overlapRate)),
  layeredReach: (baseCount, perLayerFanout, activationRate, overlapRate, layers) => {
    let count = Math.max(0, baseCount);
    const trail = [{ layer: 0, label: "Candidatura", count }];
    const labels = ["Coordenação", "Lideranças", "Mobilizadores", "Eleitores"];
    for (let i = 1; i <= layers; i++) {
      count = networkEngine.newContacts(count * perLayerFanout, activationRate, overlapRate);
      trail.push({ layer: i, label: labels[i - 1] || `Camada ${i}`, count });
    }
    return trail;
  },
};

export const TERRITORIAL_FIELDS = ["eleitorado", "historico", "comparecimento", "presenca", "capacidade", "logistica"];

export const territorialEngine = {
  /** Normaliza um campo para 0..1 dividindo pelo maior valor da lista. Todos os
   *  seis critérios passam por aqui — antes, "histórico" e "comparecimento"
   *  entravam como taxa bruta (~0,79) e distorciam os pesos. */
  normalizeField: (territories, field) => {
    const max = Math.max(...territories.map((t) => t[field] || 0), 0);
    return territories.map((t) => (max > 0 ? (t[field] || 0) / max : 0));
  },
  normalizeAll: (territories) => {
    const norms = {};
    TERRITORIAL_FIELDS.forEach((f) => { norms[f] = territorialEngine.normalizeField(territories, f); });
    return territories.map((t, i) => {
      const out = { ...t };
      TERRITORIAL_FIELDS.forEach((f) => { out[`${f}Norm`] = norms[f][i]; });
      return out;
    });
  },
  weightedScore: (t, w) => {
    const positive =
      t.eleitoradoNorm * (w.eleitorado || 0) +
      t.historicoNorm * (w.historico || 0) +
      t.comparecimentoNorm * (w.comparecimento || 0) +
      t.presencaNorm * (w.presenca || 0) +
      t.capacidadeNorm * (w.capacidade || 0);
    const penalty = t.logisticaNorm * (w.logistica || 0);
    return Math.max(0, positive - penalty);
  },
  distributeGoal: (territories, weights, totalGoal) => {
    const scores = territories.map((t) => territorialEngine.weightedScore(t, weights));
    const sum = scores.reduce((a, b) => a + b, 0);
    return territories.map((t, i) => ({
      ...t,
      score: scores[i],
      share: sum > 0 ? scores[i] / sum : 0,
      metaTerritorial: sum > 0 ? (scores[i] / sum) * totalGoal : 0,
    }));
  },
};

export const capacityEngine = {
  /** Contatos que a estrutura entrega em um dia "cheio" (rua + reuniões + eventos). */
  dailyCapacity: ({ mobilizadores = 0, horasDia = 0, contatosHora = 0, reunioesDia = 0, contatosPorReuniao = 0, eventosDia = 0, contatosPorEvento = 0 } = {}) =>
    mobilizadores * horasDia * contatosHora + reunioesDia * contatosPorReuniao + eventosDia * contatosPorEvento,
  /** Capacidade acumulada no período, respeitando quantos dias cada frente
   *  realmente opera (dias de rua / dias de eventos vindos da Agenda). */
  campaignCapacity: (team = {}, agenda = {}) => {
    const rua = (team.mobilizadores || 0) * (team.horasDia || 0) * (team.contatosHora || 0)
      + (team.reunioesDia || 0) * (team.contatosPorReuniao || 0);
    const eventos = (team.eventosDia || 0) * (team.contatosPorEvento || 0);
    return rua * Math.max(0, agenda.diasRua || 0) + eventos * Math.max(0, agenda.diasEventos || 0);
  },
  gap: (demand, capacity) => capacity - demand,
  status: (demand, capacity) => {
    if (!isFiniteNum(demand) || demand <= 0) return "sem_demanda";
    if (!isFiniteNum(capacity) || capacity <= 0) return "insuficiente";
    const ratio = safeDiv(capacity, demand);
    if (ratio < 0.9) return "insuficiente";
    if (ratio <= 1.15) return "suficiente";
    return "excedente";
  },
};

export const budgetEngine = {
  totalCost: ({ totalContacts, custoPorContato, eventos, custoPorEvento, diasAtivos, custoLogisticoDia }) => {
    if (!isFiniteNum(totalContacts)) return Infinity;
    return totalContacts * custoPorContato + eventos * custoPorEvento + diasAtivos * custoLogisticoDia;
  },
  costPerSupport: (totalCost, adjustedGoal) => safeDiv(totalCost, adjustedGoal),
};

/* ============================================================================
   REGRAS ELEITORAIS — sistema proporcional brasileiro.

   ATENÇÃO: a versão anterior deste arquivo aplicava D'Hondt puro sobre a
   totalidade das vagas. Isso NÃO é a regra brasileira e produzia resultado
   incompatível com o quociente partidário exibido na mesma tela.

   Regra implementada (Lei 9.504/1997, arts. 106–109, com a redação da Lei
   14.211/2021):
     1. Quociente eleitoral  QE = votos válidos / vagas  (parte inteira)
     2. Quociente partidário QP = parte inteira de (votos do partido / QE)
     3. As vagas restantes ("sobras") são distribuídas por maiores médias,
        uma a uma, usando  média = votos do partido / (vagas obtidas + 1)
     4. Só concorre às sobras o partido que alcançou ao menos 80% do QE
        (art. 109, §2º). Se nenhum alcançar, todos concorrem (§3º).
     5. Só pode ocupar vaga o candidato com ao menos 20% do QE (§2º).

   Simplificações declaradas na interface: não modelamos o esgotamento da
   lista de candidatos do partido nem coligações majoritárias.
   ========================================================================== */

export const SOBRAS_PARTY_THRESHOLD = 0.8;   // 80% do QE — art. 109, §2º
export const CANDIDATE_THRESHOLD = 0.1;      // 10% do QE — art. 108 (nominal mínimo)
export const SOBRAS_CANDIDATE_THRESHOLD = 0.2; // 20% do QE — art. 109, §2º

export const electoralRuleEngine = {
  quocienteEleitoral: (votosValidos, vagas) => safeDiv(votosValidos, Math.max(1, vagas)),

  quocientePartidario: (votosPartido, qe) => (qe > 0 ? Math.floor(votosPartido / qe) : 0),

  /**
   * Alocação proporcional brasileira completa.
   * @param {{id:string,name:string,votes:number}[]} parties
   * @param {number} validVotes votos válidos da circunscrição
   * @param {number} seats vagas em disputa
   * @returns {{qe:number, rows:Array, sobras:number, steps:Array, seatsFromQuotient:number}}
   */
  allocate: ({ parties, validVotes, seats }) => {
    const totalSeats = Math.max(0, Math.floor(seats) || 0);
    const qe = electoralRuleEngine.quocienteEleitoral(validVotes, totalSeats);
    const rows = parties.map((p) => {
      const qp = electoralRuleEngine.quocientePartidario(p.votes, qe);
      return { ...p, qp, seats: qp, sobrasSeats: 0, eligibleForSobras: p.votes >= SOBRAS_PARTY_THRESHOLD * qe };
    });

    const seatsFromQuotient = rows.reduce((a, r) => a + r.qp, 0);
    let remaining = totalSeats - seatsFromQuotient;
    const steps = [];

    // Se os quocientes partidários já excedem as vagas (só ocorre com votos
    // declarados inconsistentes), devolve sem distribuir sobras e sinaliza.
    const overAllocated = remaining < 0;
    if (overAllocated) remaining = 0;

    const anyEligible = rows.some((r) => r.eligibleForSobras);
    const pool = anyEligible ? rows.filter((r) => r.eligibleForSobras) : rows; // art. 109, §3º

    while (remaining > 0 && pool.length > 0) {
      let best = null;
      let bestAvg = -Infinity;
      pool.forEach((r) => {
        const avg = safeDiv(r.votes, r.seats + 1);
        if (avg > bestAvg) { bestAvg = avg; best = r; }
      });
      if (!best || bestAvg <= 0) break;
      best.seats += 1;
      best.sobrasSeats += 1;
      remaining -= 1;
      steps.push({ id: best.id, name: best.name, media: bestAvg, ordem: steps.length + 1 });
    }

    return {
      qe,
      rows,
      seatsFromQuotient,
      sobras: Math.max(0, totalSeats - seatsFromQuotient),
      sobrasNaoDistribuidas: remaining,
      steps,
      overAllocated,
      restrictedPool: anyEligible,
    };
  },

  /**
   * Ranking interno da legenda: quem ocupa as vagas que o partido conquistou.
   * Candidato abaixo de 20% do QE não pode ocupar vaga (art. 109, §2º).
   */
  partyInternalRanking: ({ myVotes, competitors = [], partySeats, qe }) => {
    const minimo = SOBRAS_CANDIDATE_THRESHOLD * qe;
    const list = [
      { id: "self", nome: "Minha candidatura", votos: myVotes, self: true },
      ...competitors.map((c) => ({ id: c.id, nome: c.nome, votos: c.votos, self: false })),
    ]
      .map((c) => ({ ...c, apto: c.votos >= minimo }))
      .sort((a, b) => b.votos - a.votos);

    let occupied = 0;
    return list.map((c) => {
      const elected = c.apto && occupied < partySeats;
      if (elected) occupied += 1;
      return { ...c, rank: list.indexOf(c) + 1, elected, minimoIndividual: minimo };
    });
  },
};

/* ============================================================================
   SIMULAÇÃO DE INCERTEZA (Monte Carlo)
   ========================================================================== */

export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distribuição triangular. A moda é fixada dentro de [min,max]: antes, uma
 *  moda fora dos limites gerava amostras fora do intervalo declarado. */
export function triangular(rng, min, mode, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= lo) return lo;
  const m = Math.min(hi, Math.max(lo, mode));
  const u = rng();
  const c = (m - lo) / (hi - lo);
  if (u < c) return lo + Math.sqrt(u * (hi - lo) * (m - lo));
  return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - m));
}

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function histogram(values, bins = 24) {
  const finite = values.filter(isFiniteNum);
  if (!finite.length) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return [{ x0: min, x1: max, count: finite.length, mid: min }];
  const width = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    x0: min + i * width, x1: min + (i + 1) * width, count: 0,
    mid: min + (i + 0.5) * width,
  }));
  finite.forEach((v) => {
    const i = Math.min(bins - 1, Math.floor((v - min) / width));
    buckets[i].count += 1;
  });
  return buckets;
}

const summarize = (sorted) => ({
  p10: percentile(sorted, 0.1), p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5),
  p75: percentile(sorted, 0.75), p90: percentile(sorted, 0.9),
  min: sorted[0], max: sorted[sorted.length - 1],
  media: sorted.reduce((a, b) => a + b, 0) / sorted.length,
});

/**
 * Monte Carlo sobre o funil COMPLETO — cada iteração roda o mix de canais
 * configurado, não uma taxa média única. A incerteza de conversão entra como
 * multiplicador aplicado a cada canal, preservando as cadeias próprias.
 */
/**
 * Limites padrão da incerteza, derivados das próprias premissas do plano.
 * Vivia dentro da tela de Simulações; subiu para o motor porque a faixa deixou
 * de ser um extra escondido e passou a ser o que a Visão Geral exibe.
 */
export function defaultBounds(cfg) {
  return {
    abstentionMin: Math.max(0, Math.round((cfg.abstentionRate - 0.07) * 100) / 100),
    abstentionMax: Math.min(1, Math.round((cfg.abstentionRate + 0.07) * 100) / 100),
    fidelityMin: Math.max(0, Math.round((cfg.fidelityRate - 0.12) * 100) / 100),
    fidelityMax: Math.min(1, Math.round((cfg.fidelityRate + 0.08) * 100) / 100),
    conversionMultMin: 0.7,
    conversionMultMax: 1.3,
    iterations: 3000,
  };
}

export function runMonteCarlo({ cfg, bounds, iterations = 3000, seed = 42, channelDefs = CHANNEL_DEFS }) {
  const rng = mulberry32(seed);
  const n = Math.max(1, Math.min(50000, Math.floor(iterations) || 0));
  const adjustedGoals = [];
  const contactsArr = [];
  const dailyArr = [];
  const costArr = [];
  const enabled = channelDefs.filter((def) => cfg.channels?.[def.id]?.enabled);
  // O custo depende dos contatos, então ele carrega a mesma incerteza — antes
  // a simulação parava nos contatos e o orçamento seguia exibido como exato.
  const preset = getScenarioPreset(cfg);
  const eventos = (cfg.team?.eventosDia || 0) * Math.max(0, cfg.agenda?.diasEventos || 0);

  for (let i = 0; i < n; i++) {
    const abst = triangular(rng, bounds.abstentionMin, cfg.abstentionRate, bounds.abstentionMax);
    const fid = triangular(rng, bounds.fidelityMin, cfg.fidelityRate, bounds.fidelityMax);
    const convMult = triangular(rng, bounds.conversionMultMin, 1, bounds.conversionMultMax);
    const turnout = electorateEngine.turnoutFromAbstention(abst);
    const adj = funnelEngine.adjustedGoal(cfg.voteGoal, fid, turnout);

    let contacts = 0;
    for (const def of enabled) {
      const st = cfg.channels[def.id];
      const conv = clamp01(st.conversion * convMult);
      contacts += funnelEngine.contactsForGoalShare(adj, st.share, conv);
    }
    adjustedGoals.push(adj);
    contactsArr.push(contacts);
    dailyArr.push(funnelEngine.dailyTarget(contacts, cfg.campaignDays));
    costArr.push(budgetEngine.totalCost({
      totalContacts: contacts, custoPorContato: cfg.budget?.custoPorContato || 0,
      eventos, custoPorEvento: cfg.budget?.custoPorEvento || 0,
      diasAtivos: cfg.campaignDays, custoLogisticoDia: cfg.budget?.custoLogisticoDia || 0,
    }) * (preset.costMultiplier || 1));
  }

  const finiteContacts = contactsArr.filter(isFiniteNum);
  const sortedGoals = [...adjustedGoals].filter(isFiniteNum).sort((a, b) => a - b);
  const sortedContacts = [...finiteContacts].sort((a, b) => a - b);
  const sortedDaily = dailyArr.filter(isFiniteNum).sort((a, b) => a - b);
  const sortedCost = costArr.filter(isFiniteNum).sort((a, b) => a - b);

  return {
    iterations: n,
    descartadas: n - finiteContacts.length,
    adjustedGoal: summarize(sortedGoals),
    contacts: summarize(sortedContacts),
    daily: summarize(sortedDaily),
    cost: summarize(sortedCost),
    contactsHistogram: histogram(finiteContacts, 24),
    raw: { contacts: sortedContacts },
  };
}

/* ============================================================================
   DADOS DE REFERÊNCIA

   Proveniência: TUDO o que é dado externo mora em src/dados-tse.js, gerado por
   scripts/gerar-dados-tse.mjs a partir dos arquivos originais do Portal de
   Dados Abertos do TSE. Cada campo declara sua fonte em FONTE_DO_CAMPO, e cada
   fonte declara órgão, dataset, URL, data de referência e método de apuração.

   O que NÃO é dado e por isso não mora lá: desempenho histórico da candidatura,
   presença de campanha, capacidade instalada e dificuldade logística de cada
   território. Não existe fonte pública para nenhum dos quatro — são julgamentos
   da equipe. Entram como PREMISSA editável, com valor neutro por padrão, para
   que ninguém confunda opinião com medição.
   ========================================================================== */

export const PROV = {
  OFICIAL: "oficial",
  HISTORICO: "historico",
  PREMISSA: "premissa",
  ESTIMATIVA: "estimativa",
};

/** Classifica um campo territorial: veio de fonte ou é julgamento da equipe? */
export const PROV_DO_CAMPO = {
  eleitorado: PROV.OFICIAL,
  comparecimento: PROV.HISTORICO,
  historico: PROV.PREMISSA,
  presenca: PROV.PREMISSA,
  capacidade: PROV.PREMISSA,
  logistica: PROV.PREMISSA,
};

/**
 * Os quatro critérios sem fonte pública começam NEUTROS (0,5 para todos).
 * Valor neutro importa: normalizeField divide pelo maior da lista, então
 * quatro valores iguais viram 1,0 para todo mundo e o critério não desempata
 * nada até que a equipe efetivamente informe o que sabe. A versão anterior
 * trazia números inventados por território (São Paulo 0,62 de "histórico",
 * Osasco 0,37) que pareciam medição e enviesavam a distribuição da meta.
 */
export const PARAMS_TERRITORIAIS_PADRAO = { historico: 0.5, presenca: 0.5, capacidade: 0.5, logistica: 0.5 };
export const PARAMS_TERRITORIAIS_CAMPOS = ["historico", "presenca", "capacidade", "logistica"];

/** Parâmetros informados pela equipe para um território, com o padrão neutro. */
export function getParamsTerritorio(cfg, id) {
  const salvos = cfg?.territorioParams?.[id] || {};
  const out = { ...PARAMS_TERRITORIAIS_PADRAO };
  for (const c of PARAMS_TERRITORIAIS_CAMPOS) {
    if (isFiniteNum(salvos[c])) out[c] = clamp01(salvos[c]);
  }
  return out;
}

/** Municípios detalhados da UF (os 12 maiores por eleitorado). */
export function getMunicipiosDaUf(uf) {
  return MUNICIPIOS_POR_UF[uf] || [];
}

/** Comparecimento do território no ano de referência, com queda para 2022. */
export function comparecimentoDe(entidade, ano) {
  const h = entidade?.hist || {};
  return h[ano]?.comparecimento ?? h[2022]?.comparecimento ?? h[2018]?.comparecimento ?? 0;
}

export const OFFICES = [
  { id: "PRESIDENTE", label: "Presidente da República", tipo: "majoritario", nivel: "nacional", vice: "VICE_PRESIDENTE" },
  { id: "VICE_PRESIDENTE", label: "Vice-Presidente", tipo: "chapa", nivel: "nacional", titular: "PRESIDENTE" },
  { id: "GOVERNADOR", label: "Governador", tipo: "majoritario", nivel: "estadual", vice: "VICE_GOVERNADOR" },
  { id: "VICE_GOVERNADOR", label: "Vice-Governador", tipo: "chapa", nivel: "estadual", titular: "GOVERNADOR" },
  { id: "SENADOR", label: "Senador", tipo: "majoritario", nivel: "estadual" },
  { id: "DEPUTADO_FEDERAL", label: "Deputado Federal", tipo: "proporcional", nivel: "estadual", vagasField: "vagasCamara" },
  { id: "DEPUTADO_ESTADUAL", label: "Deputado Estadual", tipo: "proporcional", nivel: "estadual", vagasField: "vagasAssembleia" },
  { id: "DEPUTADO_DISTRITAL", label: "Deputado Distrital", tipo: "proporcional", nivel: "estadual", vagasField: "vagasAssembleia" },
  { id: "PREFEITO", label: "Prefeito", tipo: "majoritario", nivel: "municipal", vice: "VICE_PREFEITO" },
  { id: "VICE_PREFEITO", label: "Vice-Prefeito", tipo: "chapa", nivel: "municipal", titular: "PREFEITO" },
  { id: "VEREADOR", label: "Vereador", tipo: "proporcional", nivel: "municipal" },
];

/* Etapas do funil. `kind` separa VOLUME (pessoas/contatos — comparáveis entre
   si) de ESTRUTURA (contagens de configuração). Antes as duas famílias
   dividiam a mesma escala visual, o que fazia "7 segmentos" e "1.078.431
   contatos" aparecerem como barras da mesma natureza. */
export const FUNNEL_STAGES_META = [
  { key: "meta", label: "Meta de votos", prov: PROV.PREMISSA, kind: "volume", unit: "votos" },
  { key: "ajustada", label: "Meta ajustada", prov: PROV.ESTIMATIVA, kind: "volume", unit: "votos" },
  { key: "apoios", label: "Apoios necessários", prov: PROV.ESTIMATIVA, kind: "volume", unit: "apoios" },
  { key: "eleitoresAlvo", label: "Eleitores-alvo (universo)", prov: PROV.ESTIMATIVA, kind: "volume", unit: "eleitores" },
  { key: "contatos", label: "Contatos necessários", prov: PROV.ESTIMATIVA, kind: "volume", unit: "contatos" },
  { key: "atividades", label: "Atividades necessárias", prov: PROV.ESTIMATIVA, kind: "volume", unit: "ações" },
  { key: "metaDiaria", label: "Meta diária", prov: PROV.ESTIMATIVA, kind: "volume", unit: "contatos/dia" },
  { key: "metaAgente", label: "Meta por mobilizador / dia", prov: PROV.ESTIMATIVA, kind: "volume", unit: "contatos/dia" },
  { key: "segmentos", label: "Segmentos eleitorais", prov: PROV.PREMISSA, kind: "estrutura", unit: "segmentos" },
  { key: "territorios", label: "Territórios prioritários", prov: PROV.ESTIMATIVA, kind: "estrutura", unit: "territórios" },
  { key: "canais", label: "Canais de contato", prov: PROV.PREMISSA, kind: "estrutura", unit: "canais" },
  { key: "equipe", label: "Equipe necessária", prov: PROV.PREMISSA, kind: "estrutura", unit: "pessoas" },
  { key: "dias", label: "Dias disponíveis", prov: PROV.PREMISSA, kind: "estrutura", unit: "dias" },
];

export const CHANNEL_DEFS = [
  {
    id: "liderancas", label: "Lideranças / rede organizada", icon: "Handshake", unit: "lideranças ativadas",
    defaultShare: 0, defaultConversion: 0.20,
    fields: [
      { key: "contatosPorLideranca", label: "Contatos potenciais por liderança", def: 30, min: 5, max: 100, step: 1 },
      { key: "taxaAtivacao", label: "Taxa de ativação", def: 0.6, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaSobreposicao", label: "Taxa de sobreposição/duplicação", def: 0.25, min: 0, max: 0.9, step: 0.01, pct: true },
    ],
    chain: (p) => p.contatosPorLideranca * p.taxaAtivacao * (1 - p.taxaSobreposicao),
  },
  {
    id: "reunioes", label: "Reuniões", icon: "UsersRound", unit: "reuniões",
    defaultShare: 0, defaultConversion: 0.50,
    fields: [
      { key: "participantesPorReuniao", label: "Participantes por reunião", def: 25, min: 5, max: 300, step: 1 },
      { key: "contatosPorParticipante", label: "Contatos indicados por participante", def: 3, min: 0, max: 20, step: 0.5 },
      { key: "fidelidade", label: "Fidelidade dos contatos indicados", def: 0.7, min: 0, max: 1, step: 0.01, pct: true },
    ],
    chain: (p) => p.participantesPorReuniao * p.contatosPorParticipante * p.fidelidade,
  },
  {
    id: "corpoACorpo", label: "Corpo a corpo", icon: "Footprints", unit: "abordagens",
    defaultShare: 1, defaultConversion: 0.15,
    fields: [
      { key: "taxaContatoValido", label: "Taxa de contato válido por abordagem", def: 0.65, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaRepeticao", label: "Taxa de repetição (abordagens que reencontram alguém já contatado)", def: 0.3, min: 0, max: 0.95, step: 0.01, pct: true },
    ],
    // taxaRepeticao agora entra na cadeia: abordagem repetida não gera contato
    // novo. Antes o campo era rotulado "informativo" e não afetava nada.
    chain: (p) => p.taxaContatoValido * (1 - p.taxaRepeticao),
  },
  {
    id: "portaAPorta", label: "Porta a porta", icon: "DoorOpen", unit: "domicílios",
    defaultShare: 0, defaultConversion: 0.12,
    fields: [
      { key: "pessoasPorDomicilio", label: "Pessoas por domicílio", def: 2.4, min: 1, max: 8, step: 0.1 },
      { key: "taxaContato", label: "Taxa de contato (porta aberta)", def: 0.55, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaReceptividade", label: "Taxa de receptividade", def: 0.6, min: 0, max: 1, step: 0.01, pct: true },
    ],
    chain: (p) => p.pessoasPorDomicilio * p.taxaContato * p.taxaReceptividade,
  },
  {
    id: "eventos", label: "Eventos", icon: "PartyPopper", unit: "eventos",
    defaultShare: 0, defaultConversion: 0.10,
    fields: [
      { key: "participantesPorEvento", label: "Participantes por evento", def: 120, min: 10, max: 5000, step: 10 },
      { key: "contatosPorParticipante", label: "Contatos qualificados por participante", def: 2, min: 0, max: 10, step: 0.1 },
    ],
    chain: (p) => p.participantesPorEvento * p.contatosPorParticipante,
  },
  {
    id: "digital", label: "Digital", icon: "Smartphone", unit: "impressões",
    defaultShare: 0, defaultConversion: 0.02,
    fields: [
      { key: "taxaAlcance", label: "Alcance / impressão", def: 0.4, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaEngajamento", label: "Cliques / visualização", def: 0.05, min: 0, max: 1, step: 0.001, pct: true },
      { key: "taxaLead", label: "Leads / clique", def: 0.2, min: 0, max: 1, step: 0.01, pct: true },
    ],
    chain: (p) => p.taxaAlcance * p.taxaEngajamento * p.taxaLead,
  },
  {
    id: "whatsapp", label: "WhatsApp / SMS / e-mail", icon: "MessageSquare", unit: "mensagens",
    defaultShare: 0, defaultConversion: 0.06,
    fields: [
      { key: "taxaEntrega", label: "Taxa de entrega", def: 0.9, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaResposta", label: "Taxa de resposta", def: 0.18, min: 0, max: 1, step: 0.01, pct: true },
      { key: "taxaQualificacao", label: "Taxa de qualificação", def: 0.4, min: 0, max: 1, step: 0.01, pct: true },
    ],
    chain: (p) => p.taxaEntrega * p.taxaResposta * p.taxaQualificacao,
  },
];

export const FAIXAS_ETARIAS_PADRAO = ["16–24", "25–34", "35–44", "45–59", "60+"];
export const TEMATICAS_SUGERIDAS = ["Educação", "Saúde", "Mobilidade", "Meio ambiente", "Agricultura", "Cultura", "Trabalho", "Empreendedorismo", "Juventude", "Direitos humanos", "Desenvolvimento regional"];

export const SCENARIO_PRESETS = {
  conservador: { id: "conservador", label: "Conservador", abstentionDelta: 0.05, fidelityDelta: -0.08, conversionMultiplier: 0.8, custom: false },
  central: { id: "central", label: "Central", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1, custom: false },
  otimista: { id: "otimista", label: "Otimista", abstentionDelta: -0.05, fidelityDelta: 0.06, conversionMultiplier: 1.2, custom: false },
  maior_mobilizacao: { id: "maior_mobilizacao", label: "Maior mobilização", abstentionDelta: -0.02, fidelityDelta: 0.03, conversionMultiplier: 1.1, capacityMultiplier: 1.4, custom: false },
  menor_conversao: { id: "menor_conversao", label: "Menor conversão", abstentionDelta: 0.02, fidelityDelta: -0.02, conversionMultiplier: 0.65, custom: false },
  restricao_territorial: { id: "restricao_territorial", label: "Restrição territorial", abstentionDelta: 0.03, fidelityDelta: -0.01, conversionMultiplier: 0.9, costMultiplier: 1.35, custom: false },
};

export const scenarioEngine = {
  apply: (baseAbstention, baseFidelity, preset) => ({
    abstentionRate: clamp01(baseAbstention + (preset.abstentionDelta || 0)),
    fidelityRate: clamp01(baseFidelity + (preset.fidelityDelta || 0)),
    conversionMultiplier: preset.conversionMultiplier ?? 1,
    capacityMultiplier: preset.capacityMultiplier ?? 1,
    costMultiplier: preset.costMultiplier ?? 1,
  }),
};

/* ============================================================================
   CONFIGURAÇÃO — valores padrão, versionamento e migração.

   O `schemaVersion` existe porque a versão anterior restaurava o objeto salvo
   no localStorage sem nenhuma checagem: qualquer campo novo no código quebrava
   o app com tela branca e sem saída. `migrateConfig` faz merge profundo sobre
   os padrões atuais, então uma configuração antiga sempre carrega.
   ========================================================================== */

export const SCHEMA_VERSION = 2;

export const STORAGE_KEYS = {
  models: "modelos-planejamento-v1",
  log: "registro-operacional-v1",
  lastConfig: "config-atual-v1",
  mode: "modo-exibicao-v1",
};

export function defaultChannelState() {
  const state = {};
  CHANNEL_DEFS.forEach((c) => {
    const params = {};
    c.fields.forEach((f) => { params[f.key] = f.def; });
    state[c.id] = { enabled: true, share: c.defaultShare, conversion: c.defaultConversion, params };
  });
  return state;
}

export function defaultConfig() {
  return {
    schemaVersion: SCHEMA_VERSION,
    eleicaoAno: 2026,
    histRefYear: 2022,
    office: "DEPUTADO_FEDERAL",
    uf: "SP",
    municipioId: "sp-sao-paulo",
    scenarioId: "central",
    voteGoal: 110000,
    campaignDays: 45,
    abstentionRate: 0.20,
    fidelityRate: 0.85,
    channels: defaultChannelState(),
    network: { numLiderancas: 400, fanout: 30, taxaAtivacao: 0.6, taxaSobreposicao: 0.25, camadas: 3 },
    territorialWeights: { eleitorado: 0.40, historico: 0.20, comparecimento: 0.10, presenca: 0.15, capacidade: 0.10, logistica: 0.05 },
    territoriosSelecionados: getMunicipiosDaUf("SP").map((m) => m.id),
    // Julgamentos da equipe por território (sem fonte externa). Vazio = neutro.
    territorioParams: {},
    incluirRestoDoEstado: true,
    publicos: { tematicos: [], faixas: FAIXAS_ETARIAS_PADRAO },
    team: { coordenadores: 8, mobilizadores: 180, horasDia: 3, contatosHora: 6, reunioesDia: 4, contatosPorReuniao: 25, eventosDia: 0.3, contatosPorEvento: 150 },
    agenda: { dataInicio: "2026-08-18", dataFim: "2026-10-04", diasRua: 30, diasDigitais: 45, diasEventos: 10, diasDescanso: 3 },
    budget: { custoPorContato: 0.8, custoPorEvento: 4000, custoLogisticoDia: 1200, orcamentoTotal: 800000 },
    customScenarios: [],
    proportional: {
      vagasOverride: null,
      vagasCamaraMunicipal: 55,
      votosValidosCircunscricao: 22000000,
      votosPartido: 900000,
      incluirDemaisLegendas: true,
      concorrentes: [
        { id: "conc_a", nome: "Candidato A (mesma legenda)", votos: 180000 },
        { id: "conc_b", nome: "Candidato B (mesma legenda)", votos: 95000 },
      ],
      outrosPartidos: [
        { id: "part_x", nome: "Federação X", votos: 3200000 },
        { id: "part_y", nome: "Federação Y", votos: 2650000 },
        { id: "part_z", nome: "Partido Z", votos: 1450000 },
      ],
    },
    majoritario: { segundoTurno: true, margemSeguranca: 0.05 },
  };
}

/** Carrega uma configuração salva sobre os padrões atuais, tolerando ausências,
 *  campos extras e formatos antigos. Nunca lança. */
export function migrateConfig(stored) {
  const base = defaultConfig();
  // Arrays e primitivos são lixo do ponto de vista de configuração: deepMerge
  // trata array como substituição total e devolveria um array no lugar do cfg.
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  let merged;
  try {
    merged = deepMerge(base, stored);
  } catch {
    return base;
  }
  // Canais: garante que todo canal do código existe no estado carregado, com
  // todos os seus parâmetros — inclusive os introduzidos depois.
  const channels = {};
  CHANNEL_DEFS.forEach((def) => {
    const savedChannel = merged.channels?.[def.id] || {};
    const params = {};
    def.fields.forEach((f) => {
      const v = savedChannel.params?.[f.key];
      params[f.key] = isFiniteNum(v) ? v : f.def;
    });
    channels[def.id] = {
      enabled: savedChannel.enabled !== false,
      share: isFiniteNum(savedChannel.share) ? savedChannel.share : def.defaultShare,
      conversion: isFiniteNum(savedChannel.conversion) ? savedChannel.conversion : def.defaultConversion,
      params,
    };
  });
  merged.channels = channels;

  if (!UF_DATA.some((u) => u.code === merged.uf)) merged.uf = base.uf;
  if (!OFFICES.some((o) => o.id === merged.office)) merged.office = base.office;
  if (!Array.isArray(merged.territoriosSelecionados) || !merged.territoriosSelecionados.length) {
    merged.territoriosSelecionados = base.territoriosSelecionados;
  }
  if (!Array.isArray(merged.customScenarios)) merged.customScenarios = [];
  if (!merged.publicos || !Array.isArray(merged.publicos.tematicos)) merged.publicos = base.publicos;
  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

/* ============================================================================
   SELETORES E ORQUESTRAÇÃO
   ========================================================================== */

export function getScenarioPreset(cfg) {
  if (SCENARIO_PRESETS[cfg.scenarioId]) return SCENARIO_PRESETS[cfg.scenarioId];
  const custom = (cfg.customScenarios || []).find((s) => s.id === cfg.scenarioId);
  return custom || SCENARIO_PRESETS.central;
}
export function getOffice(cfg) {
  return OFFICES.find((o) => o.id === cfg.office) || OFFICES[0];
}
export function getUf(cfg) {
  return UF_DATA.find((u) => u.code === cfg.uf) || UF_DATA[0];
}
export function getMunicipio(cfg) {
  return getMunicipiosDaUf(cfg.uf).find((m) => m.id === cfg.municipioId) || null;
}

/** Vagas em disputa — derivadas do cargo + UF (antes eram um "70" fixo que não
 *  mudava ao trocar de estado, apesar de o dado existir em UF_DATA). */
export function getVagas(cfg) {
  const override = cfg.proportional?.vagasOverride;
  if (isFiniteNum(override) && override > 0) return Math.floor(override);
  const office = getOffice(cfg);
  const uf = getUf(cfg);
  if (office.nivel === "municipal") return Math.max(1, Math.floor(cfg.proportional?.vagasCamaraMunicipal || 9));
  const field = office.vagasField || "vagasCamara";
  return uf[field] || uf.vagasCamara || 1;
}

/**
 * Territórios em disputa, respeitando o NÍVEL do cargo:
 *   nacional  -> as 27 UFs
 *   estadual  -> municípios detalhados (SP) + "Restante do estado", ou a UF inteira
 *   municipal -> apenas o município selecionado
 * A versão anterior distribuía a meta entre 8 municípios de SP mesmo para
 * Prefeito ou Presidente.
 */
export function buildTerritories(cfg) {
  const uf = getUf(cfg);
  const office = getOffice(cfg);
  const ano = ANOS_REFERENCIA.includes(cfg.histRefYear) ? cfg.histRefYear : ANOS_REFERENCIA[0];
  const ufComparecimento = comparecimentoDe(uf, ano);
  const municipios = getMunicipiosDaUf(cfg.uf);

  /** Monta o território juntando dado medido (eleitorado, comparecimento) com
   *  os quatro parâmetros que a equipe informa. */
  const montar = (base) => ({
    ...base,
    ...getParamsTerritorio(cfg, base.id),
    eleitorado: base.eleitores,
  });

  if (office.nivel === "municipal") {
    const m = getMunicipio(cfg);
    // Sem recorte detalhado para o município escolhido, usa a média da UF em vez
    // de fingir um número: eleitorado da UF dividido pelos municípios dela.
    const base = m
      ? { id: m.id, name: m.name, eleitores: m.eleitores, zonas: m.zonas, comparecimento: comparecimentoDe(m, ano), estimado: false }
      : { id: `${uf.code}-municipio-medio`, name: `${uf.name} — município médio`,
          eleitores: Math.round(uf.eleitores / Math.max(1, uf.municipios)), zonas: null,
          comparecimento: ufComparecimento, estimado: true };
    return territorialEngine.normalizeAll([montar(base)]);
  }

  if (office.nivel === "nacional") {
    return territorialEngine.normalizeAll(UF_DATA.map((u) => montar({
      id: u.code, name: u.name, eleitores: u.eleitores, zonas: u.zonas,
      comparecimento: comparecimentoDe(u, ano), estimado: false,
    })));
  }

  // Nível estadual: os municípios detalhados da UF + o que sobra do estado.
  if (municipios.length) {
    const escolhidos = municipios.filter((m) => cfg.territoriosSelecionados.includes(m.id));
    const lista = escolhidos.length ? escolhidos : municipios;
    const base = lista.map((m) => montar({
      id: m.id, name: m.name, eleitores: m.eleitores, zonas: m.zonas,
      comparecimento: comparecimentoDe(m, ano), resto: false, estimado: false,
    }));
    // Bucket do restante do estado: sem ele, 100% da meta era distribuída entre
    // municípios que somam uma fração do eleitorado da UF, assumindo
    // implicitamente zero voto em todo o resto.
    const cobertura = base.reduce((a, t) => a + t.eleitores, 0);
    const restante = Math.max(0, uf.eleitores - cobertura);
    if (cfg.incluirRestoDoEstado && restante > 0) {
      const municipiosRestantes = Math.max(0, uf.municipios - lista.length);
      base.push(montar({
        id: "__resto__", name: `Restante do estado (${fmtInt(municipiosRestantes)} municípios)`,
        eleitores: restante, zonas: Math.max(0, uf.zonas - base.reduce((a, t) => a + (t.zonas || 0), 0)),
        comparecimento: ufComparecimento, resto: true, estimado: false,
      }));
    }
    return territorialEngine.normalizeAll(base);
  }

  return territorialEngine.normalizeAll([montar({
    id: uf.code, name: uf.name, eleitores: uf.eleitores, zonas: uf.zonas,
    comparecimento: ufComparecimento, resto: false, estimado: false,
  })]);
}

/**
 * Orquestra todos os engines. Puro em relação às entradas.
 * @param {object} cfg configuração completa
 * @param {{realizado:number, planejado:number, entradas:number}} tracking
 *        totais do registro operacional (planejado × realizado)
 * @param {Date} today data de referência — injetada para tornar testável
 */
export function computeAll(cfg, tracking = { realizado: 0, planejado: 0, entradas: 0 }, today = new Date()) {
  const office = getOffice(cfg);
  const uf = getUf(cfg);
  const preset = getScenarioPreset(cfg);
  const scenario = scenarioEngine.apply(cfg.abstentionRate, cfg.fidelityRate, preset);
  const turnoutRate = electorateEngine.turnoutFromAbstention(scenario.abstentionRate);
  const adjustedGoal = funnelEngine.adjustedGoal(cfg.voteGoal, scenario.fidelityRate, turnoutRate);

  /* ---- território e universo eleitoral ---- */
  const territoriesRaw = buildTerritories(cfg);
  const distributed = territorialEngine.distributeGoal(territoriesRaw, cfg.territorialWeights, adjustedGoal);
  const weightSum = Object.values(cfg.territorialWeights).reduce((a, b) => a + b, 0);
  const eleitoradoTotal = distributed.reduce((a, t) => a + t.eleitores, 0);
  // `penetracaoNecessaria` torna auditável o resultado da ponderação: quanto
  // dos votos daquele território a meta territorial exige. É o que revela um
  // peso mal calibrado — um território pequeno com score alto passa a mostrar
  // uma penetração implausível em vez de esconder o problema em um "score".
  //
  // O comparecimento usado aqui é o MEDIDO naquele território no ano de
  // referência, não a premissa global de abstenção. São coisas diferentes: a
  // premissa diz o que a equipe espera do pleito que vem; o comparecimento
  // histórico é o que de fato aconteceu, e é ele que diferencia um território
  // do outro. Antes, os dois se confundiam — o seletor de ano de referência
  // não mexia em nenhum número de saída.
  const territories = distributed.map((t) => {
    const votantes = Math.max(0, t.eleitores) * clamp01(t.comparecimento);
    return {
      ...t,
      eleitoradoShare: safeDiv(t.eleitores, eleitoradoTotal),
      votantesEstimados: votantes,
      penetracaoNecessaria: safeDiv(t.metaTerritorial, votantes),
    };
  });

  const eleitoradoElegivel = territories.reduce((a, t) => a + t.eleitores, 0);
  const eleitoradoEfetivo = territories.reduce((a, t) => a + t.votantesEstimados, 0);
  const comparecimentoHistorico = safeDiv(eleitoradoEfetivo, eleitoradoElegivel);
  const anoReferenciaEfetivo = ANOS_REFERENCIA.includes(cfg.histRefYear) ? cfg.histRefYear : ANOS_REFERENCIA[0];
  const territoriosPrioritarios = territories.filter((t) => !t.resto);
  const eleitoresAlvo = territoriosPrioritarios.reduce((a, t) => a + t.votantesEstimados, 0);
  const goalShareOfElectorate = safeDiv(cfg.voteGoal, eleitoradoEfetivo);

  /* ---- canais ---- */
  const channelResults = CHANNEL_DEFS.map((def) => {
    const st = cfg.channels[def.id];
    const conversion = clamp01(st.conversion * scenario.conversionMultiplier);
    const contactsNeeded = st.enabled ? funnelEngine.contactsForGoalShare(adjustedGoal, st.share, conversion) : 0;
    const chainMultiplier = def.chain(st.params);
    const actionsNeeded = st.enabled ? conversionEngine.actionsNeeded(contactsNeeded, chainMultiplier) : 0;
    return { ...def, enabled: st.enabled, share: st.share, conversion, contactsNeeded, chainMultiplier, actionsNeeded, params: st.params };
  });
  const totalContactsNeeded = channelResults.reduce((a, c) => a + c.contactsNeeded, 0);
  const totalActions = channelResults.reduce((a, c) => a + (c.enabled ? c.actionsNeeded : 0), 0);
  const enabledChannels = channelResults.filter((c) => c.enabled);
  const enabledShareSum = enabledChannels.reduce((a, c) => a + c.share, 0);

  const networkTrail = networkEngine.layeredReach(cfg.network.numLiderancas, cfg.network.fanout, cfg.network.taxaAtivacao, cfg.network.taxaSobreposicao, cfg.network.camadas);
  const networkFinalReach = networkTrail[networkTrail.length - 1]?.count || 0;

  /* ---- tempo ---- */
  const diasCorridos = daysBetween(cfg.agenda.dataInicio, cfg.agenda.dataFim);
  const diasAtivosAgenda = Math.max(0, diasCorridos - (cfg.agenda.diasDescanso || 0));
  const hojeISO = today.toISOString().slice(0, 10);
  const diasRestantes = Math.max(0, Math.min(cfg.campaignDays, daysBetween(hojeISO, cfg.agenda.dataFim)));

  const dailyContacts = funnelEngine.dailyTarget(totalContactsNeeded, cfg.campaignDays);
  const weeklyContacts = isFiniteNum(dailyContacts) ? dailyContacts * 7 : Infinity;

  /* ---- capacidade ---- */
  const dailyCapacityBase = capacityEngine.dailyCapacity(cfg.team);
  const dailyCapacity = dailyCapacityBase * (scenario.capacityMultiplier || 1);
  const capacityGap = capacityEngine.gap(dailyContacts, dailyCapacity);
  const capacityStatus = capacityEngine.status(dailyContacts, dailyCapacity);
  // Capacidade acumulada usa os dias por frente vindos da Agenda (dias de rua,
  // dias de eventos) — antes esses campos existiam na tela e não entravam em
  // nenhum cálculo.
  const campaignCapacity = capacityEngine.campaignCapacity(cfg.team, cfg.agenda) * (scenario.capacityMultiplier || 1);
  const campaignCapacityGap = capacityEngine.gap(totalContactsNeeded, campaignCapacity);
  const campaignCapacityStatus = capacityEngine.status(totalContactsNeeded, campaignCapacity);

  /* ---- orçamento ---- */
  const eventosTotal = (cfg.team.eventosDia || 0) * Math.max(0, cfg.agenda.diasEventos || 0);
  const totalCostBase = budgetEngine.totalCost({
    totalContacts: totalContactsNeeded, custoPorContato: cfg.budget.custoPorContato,
    eventos: eventosTotal, custoPorEvento: cfg.budget.custoPorEvento,
    diasAtivos: cfg.campaignDays, custoLogisticoDia: cfg.budget.custoLogisticoDia,
  });
  const totalCost = totalCostBase * (scenario.costMultiplier || 1);
  const costPerSupport = budgetEngine.costPerSupport(totalCost, adjustedGoal);
  const budgetGap = cfg.budget.orcamentoTotal - totalCost;

  const metaPorEquipe = safeDiv(totalContactsNeeded, Math.max(1, cfg.team.coordenadores));
  const metaPorMobilizador = safeDiv(dailyContacts, Math.max(1, cfg.team.mobilizadores));

  /* ---- rastreamento (planejado × realizado) ---- */
  const realizado = Math.max(0, tracking?.realizado || 0);
  const planejado = Math.max(0, tracking?.planejado || 0);
  const deficitContatos = isFiniteNum(totalContactsNeeded) ? totalContactsNeeded - realizado : Infinity;
  const progressoFunil = clamp01(safeDiv(realizado, totalContactsNeeded));
  const diasDecorridos = Math.max(0, cfg.campaignDays - diasRestantes);
  const esperadoAteAgora = isFiniteNum(dailyContacts) ? dailyContacts * diasDecorridos : 0;
  const ritmoVsEsperado = esperadoAteAgora > 0 ? safeDiv(realizado, esperadoAteAgora) : null;

  /* ---- públicos ---- */
  const faixas = cfg.publicos?.faixas?.length || 0;
  const tematicos = cfg.publicos?.tematicos?.length || 0;
  const segmentsCount = faixas + tematicos;

  /* ---- regras do cargo ---- */
  let proportionalResult = null;
  if (office.tipo === "proporcional") {
    const p = cfg.proportional;
    const vagas = getVagas(cfg);
    const somaOutros = p.outrosPartidos.reduce((a, o) => a + (o.votos || 0), 0);
    const somaDeclarada = somaOutros + (p.votosPartido || 0);
    const restante = Math.max(0, (p.votosValidosCircunscricao || 0) - somaDeclarada);

    const parties = [
      { id: "own", name: "Minha legenda", votes: p.votosPartido || 0 },
      ...p.outrosPartidos.map((o) => ({ id: o.id, name: o.nome, votes: o.votos || 0 })),
    ];
    // Sem este bucket, as vagas eram distribuídas apenas entre as legendas
    // listadas, ignorando os votos válidos declarados que sobram.
    if (p.incluirDemaisLegendas && restante > 0) {
      parties.push({ id: "__demais__", name: "Demais legendas (resto declarado)", votes: restante, residual: true });
    }

    const alloc = electoralRuleEngine.allocate({
      parties, validVotes: p.votosValidosCircunscricao || somaDeclarada, seats: vagas,
    });
    const ownRow = alloc.rows.find((r) => r.id === "own");
    const ownSeats = ownRow?.seats || 0;
    const limiarIndividual = alloc.qe * CANDIDATE_THRESHOLD;
    const limiarSobras = alloc.qe * SOBRAS_CANDIDATE_THRESHOLD;
    const ranking = electoralRuleEngine.partyInternalRanking({
      myVotes: cfg.voteGoal, competitors: p.concorrentes || [], partySeats: ownSeats, qe: alloc.qe,
    });
    const minhaLinha = ranking.find((c) => c.self);
    const totalConcorrentesVotos = (p.concorrentes || []).reduce((a, c) => a + (c.votos || 0), 0) + cfg.voteGoal;

    proportionalResult = {
      vagas, qe: alloc.qe, qp: ownRow?.qp || 0, ownSeats,
      sobrasDaLegenda: ownRow?.sobrasSeats || 0,
      rows: alloc.rows, steps: alloc.steps, sobras: alloc.sobras,
      seatsFromQuotient: alloc.seatsFromQuotient, restrictedPool: alloc.restrictedPool,
      overAllocated: alloc.overAllocated,
      limiarIndividual, limiarSobras, ranking, minhaLinha,
      somaDeclarada, restanteDeclarado: restante,
      faixaInternaShare: safeDiv(cfg.voteGoal, totalConcorrentesVotos), totalConcorrentesVotos,
    };
  }

  let majoritarioResult = null;
  if (office.tipo === "majoritario") {
    majoritarioResult = {
      minVotosSeguranca: adjustedGoal * (1 + (cfg.majoritario?.margemSeguranca || 0)),
      segundoTurno: !!cfg.majoritario?.segundoTurno,
    };
  }

  /* ---- alertas ---- */
  const alerts = [];
  const push = (level, text) => alerts.push({ level, text });

  if (!isFiniteNum(dailyContacts) || cfg.campaignDays <= 0) {
    push("critico", "Meta diária impossível: número de dias de campanha insuficiente ou igual a zero.");
  }
  // Teto físico: a meta não pode superar quem efetivamente comparece.
  if (eleitoradoEfetivo > 0 && cfg.voteGoal > eleitoradoEfetivo) {
    push("critico", `Meta de ${fmtInt(cfg.voteGoal)} votos é maior que todo o eleitorado que deve comparecer na circunscrição (${fmtInt(eleitoradoEfetivo)}). A meta é matematicamente inatingível.`);
  } else if (eleitoradoEfetivo > 0 && goalShareOfElectorate > 0.5) {
    push("critico", `A meta equivale a ${fmtPct(goalShareOfElectorate)} de todos os votos esperados na circunscrição — patamar de maioria absoluta.`);
  } else if (eleitoradoEfetivo > 0 && office.tipo === "proporcional" && goalShareOfElectorate > 0.15) {
    push("atencao", `A meta equivale a ${fmtPct(goalShareOfElectorate)} dos votos esperados na circunscrição — muito alto para uma disputa proporcional. Revise a meta ou a circunscrição.`);
  }
  if (adjustedGoal > eleitoradoEfetivo && eleitoradoEfetivo > 0 && cfg.voteGoal <= eleitoradoEfetivo) {
    push("atencao", `A meta ajustada (cerca de ${fmtSig(adjustedGoal)}) supera o eleitorado que deve comparecer (${fmtInt(eleitoradoEfetivo)}): as premissas de abstenção e fidelidade tornam a meta original inalcançável.`);
  }
  if (capacityStatus === "insuficiente") {
    push("critico", `Capacidade operacional diária (${fmtInt(dailyCapacity)} contatos) abaixo da demanda diária (~${fmtSig(dailyContacts)} contatos).`);
  }
  if (campaignCapacityStatus === "insuficiente" && isFiniteNum(totalContactsNeeded)) {
    push("critico", `Somando os dias de rua e de eventos da Agenda, a estrutura entrega ${fmtInt(campaignCapacity)} contatos no período — a meta exige cerca de ${fmtSig(totalContactsNeeded)}.`);
  }
  if (totalCost > cfg.budget.orcamentoTotal) {
    push("atencao", `Custo estimado (cerca de ${fmtSig(totalCost)}) acima do orçamento disponível (${fmtMoney(cfg.budget.orcamentoTotal)}).`);
  }
  const maxChannelShare = enabledChannels.reduce((max, c) => Math.max(max, c.share), 0);
  if (maxChannelShare > 0.6) {
    const dep = enabledChannels.find((c) => c.share === maxChannelShare);
    push("atencao", `Excesso de dependência de um único canal (${dep?.label}, ${fmtPct(maxChannelShare)} da meta).`);
  }
  if (Math.abs(enabledShareSum - 1) > 0.01) {
    push("atencao", `A soma das participações dos canais é ${fmtPct(enabledShareSum)} (deveria ser 100%).`);
  }
  if (Math.abs(weightSum - 1) > 0.01) {
    push("atencao", `A soma dos pesos territoriais é ${fmtPct(weightSum)} (deveria ser 100%).`);
  }
  const territorioImpossivel = territories.filter((t) => t.penetracaoNecessaria > 1);
  const territorioForcado = territories.filter((t) => t.penetracaoNecessaria > 0.35 && t.penetracaoNecessaria <= 1);
  if (territorioImpossivel.length) {
    push("critico", `Meta territorial inatingível em: ${territorioImpossivel.map((t) => t.name).join(", ")} — exige mais votos do que o total de votantes esperados no território. Reveja os pesos em Territórios.`);
  } else if (territorioForcado.length) {
    push("atencao", `Penetração muito alta exigida em: ${territorioForcado.map((t) => `${t.name} (${fmtPct(t.penetracaoNecessaria)})`).join(", ")}. Reveja os pesos territoriais.`);
  }
  const somaFrentes = Math.max(cfg.agenda.diasRua || 0, cfg.agenda.diasEventos || 0);
  if (diasAtivosAgenda > 0 && somaFrentes > diasAtivosAgenda) {
    push("atencao", `A Agenda declara mais dias por frente (${fmtInt(somaFrentes)}) do que os dias ativos do período (${fmtInt(diasAtivosAgenda)}).`);
  }
  if (diasAtivosAgenda > 0 && Math.abs(diasAtivosAgenda - cfg.campaignDays) > 1) {
    push("atencao", `"Dias de campanha" (${fmtInt(cfg.campaignDays)}) não bate com a janela da Agenda (${fmtInt(diasAtivosAgenda)} dias ativos).`);
  }
  if (proportionalResult) {
    if (cfg.voteGoal < proportionalResult.limiarIndividual) {
      push("atencao", `A meta (${fmtInt(cfg.voteGoal)}) está abaixo do mínimo nominal de 10% do quociente eleitoral (${fmtInt(proportionalResult.limiarIndividual)}) exigido para concorrer às vagas.`);
    }
    if (!proportionalResult.overAllocated && proportionalResult.somaDeclarada > (cfg.proportional.votosValidosCircunscricao || 0)) {
      push("atencao", `As legendas listadas somam ${fmtInt(proportionalResult.somaDeclarada)} votos, acima dos votos válidos declarados (${fmtInt(cfg.proportional.votosValidosCircunscricao)}).`);
    }
    if (proportionalResult.minhaLinha && !proportionalResult.minhaLinha.elected) {
      push("atencao", `Com esta meta, a candidatura ficaria em ${proportionalResult.minhaLinha.rank}º na legenda, que conquista ${proportionalResult.ownSeats} vaga(s) — insuficiente para eleger.`);
    }
  }
  if (planejado > 0 && ritmoVsEsperado !== null && ritmoVsEsperado < 0.85) {
    push("atencao", `Ritmo abaixo do plano: ${fmtInt(realizado)} contatos registrados contra ${fmtInt(esperadoAteAgora)} esperados até aqui (${fmtPct(ritmoVsEsperado)}).`);
  }
  // Consistência entre o ano do pleito escolhido na barra de contexto e a
  // janela da Agenda. Antes, trocar 2026 por 2028 deixava "dias restantes"
  // contando para a eleição antiga, e o único aviso era um texto cinza
  // escondido dentro de um card da Agenda.
  const datasDoPleito = electionDates(cfg.eleicaoAno);
  if (datasDoPleito && cfg.agenda?.dataFim && cfg.agenda.dataFim !== datasDoPleito.primeiroTurno) {
    const anoDaAgenda = String(cfg.agenda.dataFim).slice(0, 4);
    const nivel = anoDaAgenda === String(cfg.eleicaoAno) ? "atencao" : "critico";
    push(nivel, `A data final da campanha (${cfg.agenda.dataFim}) não é a data do 1º turno de ${cfg.eleicaoAno} (${datasDoPleito.primeiroTurno}). Todo prazo do plano — dias restantes, meta diária — está sendo contado para a data errada. Ajuste em Agenda.`);
  }
  // A premissa de abstenção contra o que de fato foi medido na circunscrição.
  const abstencaoMedida = 1 - comparecimentoHistorico;
  if (comparecimentoHistorico > 0 && Math.abs(cfg.abstentionRate - abstencaoMedida) > 0.05) {
    push("atencao", `A premissa de abstenção (${fmtPct(cfg.abstentionRate)}) está distante da abstenção medida na circunscrição em ${anoReferenciaEfetivo} (${fmtPct(abstencaoMedida)}). Confira em Meta Eleitoral.`);
  }
  push("info", `Eleitorado e comparecimento vêm dos arquivos do Portal de Dados Abertos do TSE (eleitorado de ${FONTES.ELEITORADO_2026.dataReferencia}; comparecimento apurado em ${anoReferenciaEfetivo}). São uma fotografia: o app não consulta o TSE em tempo real. Veja origem, método e link de cada número em Dados.`);

  return {
    office, uf, preset, scenario, turnoutRate, adjustedGoal,
    channelResults, enabledChannels, totalContactsNeeded, totalActions, enabledShareSum,
    networkTrail, networkFinalReach,
    dailyContacts, weeklyContacts, diasCorridos, diasAtivosAgenda, diasRestantes, diasDecorridos,
    territories, territoriosPrioritarios, weightSum,
    eleitoradoElegivel, eleitoradoEfetivo, eleitoresAlvo, goalShareOfElectorate,
    comparecimentoHistorico, anoReferencia: anoReferenciaEfetivo,
    dailyCapacity, dailyCapacityBase, capacityGap, capacityStatus,
    campaignCapacity, campaignCapacityGap, campaignCapacityStatus,
    totalCost, totalCostBase, costPerSupport, budgetGap, eventosTotal,
    metaPorEquipe, metaPorMobilizador,
    realizado, planejado, deficitContatos, progressoFunil, esperadoAteAgora, ritmoVsEsperado,
    segmentsCount, proportionalResult, majoritarioResult, alerts,
  };
}

/** Resumo enxuto de um cenário, usado na tabela comparativa. */
export function computeScenarioSummary(cfg, presetOrCustom) {
  const scenario = scenarioEngine.apply(cfg.abstentionRate, cfg.fidelityRate, presetOrCustom);
  const turnout = electorateEngine.turnoutFromAbstention(scenario.abstentionRate);
  const adjustedGoal = funnelEngine.adjustedGoal(cfg.voteGoal, scenario.fidelityRate, turnout);
  let totalContacts = 0;
  CHANNEL_DEFS.forEach((def) => {
    const st = cfg.channels[def.id];
    if (!st?.enabled) return;
    const conv = clamp01(st.conversion * scenario.conversionMultiplier);
    totalContacts += funnelEngine.contactsForGoalShare(adjustedGoal, st.share, conv);
  });
  const capacity = capacityEngine.dailyCapacity(cfg.team) * (scenario.capacityMultiplier || 1);
  const dailyContacts = funnelEngine.dailyTarget(totalContacts, cfg.campaignDays);
  return { adjustedGoal, totalContacts, dailyContacts, capacity, gap: capacity - dailyContacts };
}
