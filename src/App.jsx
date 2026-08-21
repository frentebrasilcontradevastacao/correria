import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, Target, Filter, Map, Users, Radio, Calendar, Banknote,
  Network, Dice5, Database, FileText, ChevronDown, ChevronRight, Info,
  AlertTriangle, CheckCircle2, Settings2, Download, Save, Plus, Minus,
  Building2, Vote, TrendingUp, TrendingDown, Layers, Compass, Menu,
  RefreshCw, Sliders, BarChart3, Clock, Send, Handshake, Footprints,
  DoorOpen, PartyPopper, Smartphone, MessageSquare, UsersRound, Award,
  HelpCircle, X, ArrowRight, GitBranch, ChevronUp, Percent, ShieldCheck,
  ClipboardList, Search,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ScatterChart, Scatter, ZAxis, ComposedChart, Area, Legend,
  ReferenceLine,
} from "recharts";

/* ============================================================================
   FUNIL REVERSO DE ELEIÇÃO
   Calculadora + simulador + painel operacional de planejamento eleitoral.
   Motor matemático (engines) separado da interface — cada bloco abaixo
   corresponde a um módulo da seção 38 do briefing e é uma função pura.
   ========================================================================== */

/* ---------------------------- utilidades ---------------------------- */

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const safeDiv = (a, b) => (!b || !Number.isFinite(b) ? 0 : a / b);
const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

function fmtInt(n) {
  if (!isFiniteNum(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}
function fmtDec(n, digits = 1) {
  if (!isFiniteNum(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n, digits = 1) {
  if (!isFiniteNum(n)) return "—";
  return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
function fmtMoney(n) {
  if (!isFiniteNum(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function cx(...args) {
  return args.filter(Boolean).join(" ");
}
let uidCounter = 0;
function uid(prefix = "id") {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

/* ============================================================================
   MOTOR DE CÁLCULO (engines) — funções puras, testáveis isoladamente.
   ========================================================================== */

const electorateEngine = {
  turnoutFromAbstention: (abstentionRate) => clamp01(1 - clamp01(abstentionRate)),
  effectiveElectorate: (eligibleElectorate, turnoutRate) => Math.max(0, eligibleElectorate) * clamp01(turnoutRate),
};

const funnelEngine = {
  adjustedGoal: (voteGoal, fidelityRate, turnoutRate) => {
    const denom = clamp01(fidelityRate) * clamp01(turnoutRate);
    return denom > 0 ? Math.max(0, voteGoal) / denom : Infinity;
  },
  contactsForGoalShare: (adjustedGoal, share, conversionRate) => {
    const goalShare = adjustedGoal * clamp01(share);
    return conversionRate > 0 ? goalShare / conversionRate : Infinity;
  },
  dailyTarget: (operationalTotal, activeDays) => (activeDays > 0 ? operationalTotal / activeDays : Infinity),
};

const conversionEngine = {
  chainMultiplier: (rates) => rates.reduce((acc, r) => acc * clamp01(r), 1),
  actionsNeeded: (contactsNeeded, chainMultiplier) => (chainMultiplier > 0 ? contactsNeeded / chainMultiplier : Infinity),
};

const networkEngine = {
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

const territorialEngine = {
  normalizeField: (territories, field) => {
    const max = Math.max(...territories.map((t) => t[field] || 0), 0);
    return territories.map((t) => (max > 0 ? (t[field] || 0) / max : 0));
  },
  weightedScore: (t, w) => {
    const positive =
      t.eleitoradoNorm * w.eleitorado +
      t.historicoNorm * w.historico +
      t.comparecimentoNorm * w.comparecimento +
      t.presencaNorm * w.presenca +
      t.capacidadeNorm * w.capacidade;
    const penalty = t.logisticaNorm * w.logistica;
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

const capacityEngine = {
  dailyCapacity: ({ mobilizadores = 0, horasDia = 0, contatosHora = 0, reunioesDia = 0, contatosPorReuniao = 0, eventosDia = 0, contatosPorEvento = 0 }) =>
    mobilizadores * horasDia * contatosHora + reunioesDia * contatosPorReuniao + eventosDia * contatosPorEvento,
  gap: (demand, capacity) => capacity - demand,
  status: (demand, capacity) => {
    if (demand <= 0) return "sem_demanda";
    if (capacity <= 0) return "insuficiente";
    const ratio = safeDiv(capacity, demand);
    if (ratio < 0.9) return "insuficiente";
    if (ratio <= 1.15) return "suficiente";
    return "excedente";
  },
};

const budgetEngine = {
  totalCost: ({ totalContacts, custoPorContato, eventos, custoPorEvento, diasAtivos, custoLogisticoDia }) =>
    totalContacts * custoPorContato + eventos * custoPorEvento + diasAtivos * custoLogisticoDia,
  costPerSupport: (totalCost, adjustedGoal) => safeDiv(totalCost, adjustedGoal),
};

const SCENARIO_PRESETS = {
  conservador: { id: "conservador", label: "Conservador", abstentionDelta: 0.05, fidelityDelta: -0.08, conversionMultiplier: 0.8, custom: false },
  central: { id: "central", label: "Central", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1, custom: false },
  otimista: { id: "otimista", label: "Otimista", abstentionDelta: -0.05, fidelityDelta: 0.06, conversionMultiplier: 1.2, custom: false },
  maior_mobilizacao: { id: "maior_mobilizacao", label: "Maior mobilização", abstentionDelta: -0.02, fidelityDelta: 0.03, conversionMultiplier: 1.1, capacityMultiplier: 1.4, custom: false },
  menor_conversao: { id: "menor_conversao", label: "Menor conversão", abstentionDelta: 0.02, fidelityDelta: -0.02, conversionMultiplier: 0.65, custom: false },
  restricao_territorial: { id: "restricao_territorial", label: "Restrição territorial", abstentionDelta: 0.03, fidelityDelta: -0.01, conversionMultiplier: 0.9, costMultiplier: 1.35, custom: false },
};

const scenarioEngine = {
  apply: (baseAbstention, baseFidelity, preset) => ({
    abstentionRate: clamp01(baseAbstention + (preset.abstentionDelta || 0)),
    fidelityRate: clamp01(baseFidelity + (preset.fidelityDelta || 0)),
    conversionMultiplier: preset.conversionMultiplier ?? 1,
    capacityMultiplier: preset.capacityMultiplier ?? 1,
    costMultiplier: preset.costMultiplier ?? 1,
  }),
};

const historicalEngine = {
  absoluteChange: (current, previous) => current - previous,
  percentChange: (current, previous) => (previous > 0 ? (current - previous) / previous : null),
};

const electoralRuleEngine = {
  quocienteEleitoral: (votosValidos, vagas) => safeDiv(votosValidos, Math.max(1, vagas)),
  quocientePartidario: (votosPartido, qe) => (qe > 0 ? Math.floor(votosPartido / qe) : 0),
  dhondtAllocation: (parties, totalSeats) => {
    const seats = parties.map((p) => ({ ...p, seats: 0 }));
    for (let s = 0; s < totalSeats; s++) {
      let bestIdx = -1;
      let bestQuotient = -1;
      seats.forEach((p, idx) => {
        const quotient = p.votes / (p.seats + 1);
        if (quotient > bestQuotient) {
          bestQuotient = quotient;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0) seats[bestIdx].seats += 1;
    }
    return seats;
  },
  estadualSeatsFromFederal: (federalSeats) => (federalSeats <= 12 ? federalSeats * 3 : 36 + (federalSeats - 12)),
};

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function triangular(rng, min, mode, max) {
  if (max <= min) return min;
  const u = rng();
  const c = clamp01((mode - min) / (max - min));
  if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
function percentile(sorted, p) {
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function runMonteCarlo({ voteGoal, abstentionBounds, fidelityBounds, conversionBounds, iterations = 3000, seed = 42 }) {
  const rng = mulberry32(seed);
  const adjustedGoals = [];
  const contactsArr = [];
  for (let i = 0; i < iterations; i++) {
    const abst = triangular(rng, abstentionBounds.min, abstentionBounds.mode, abstentionBounds.max);
    const fid = triangular(rng, fidelityBounds.min, fidelityBounds.mode, fidelityBounds.max);
    const conv = triangular(rng, conversionBounds.min, conversionBounds.mode, conversionBounds.max);
    const turnout = electorateEngine.turnoutFromAbstention(abst);
    const adj = funnelEngine.adjustedGoal(voteGoal, fid, turnout);
    adjustedGoals.push(adj);
    contactsArr.push(safeDiv(adj, conv));
  }
  adjustedGoals.sort((a, b) => a - b);
  contactsArr.sort((a, b) => a - b);
  const pick = (arr) => ({
    p10: percentile(arr, 0.1), p25: percentile(arr, 0.25), p50: percentile(arr, 0.5),
    p75: percentile(arr, 0.75), p90: percentile(arr, 0.9), min: arr[0], max: arr[arr.length - 1],
  });
  return { adjustedGoal: pick(adjustedGoals), contacts: pick(contactsArr), iterations };
}

/* ============================================================================
   DADOS — camada de dados. Os números abaixo são ILUSTRATIVOS/SINTÉTICOS,
   usados apenas para demonstrar a arquitetura antes da conexão real com o
   Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br) e o IBGE. Nunca
   tratar estes valores como dado oficial — ver módulo "Dados" no app.
   ========================================================================== */

const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

// eleitorado em milhões (ordem de grandeza ilustrativa), vagas na Câmara dos
// Deputados = composição vigente (dado histórico, confirmar resolução do TSE
// para o pleito antes de uso real). Histórico 2022/2018 = comparecimento e
// abstenção ilustrativos por UF.
const UF_DATA = [
  { code: "SP", name: "São Paulo", regiao: "Sudeste", eleitoradoM: 35.0, vagasCamara: 70, municipios: 645, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "MG", name: "Minas Gerais", regiao: "Sudeste", eleitoradoM: 16.5, vagasCamara: 53, municipios: 853, hist: { 2022: { comparecimento: 0.80, abstencao: 0.20 }, 2018: { comparecimento: 0.82, abstencao: 0.18 } } },
  { code: "RJ", name: "Rio de Janeiro", regiao: "Sudeste", eleitoradoM: 13.0, vagasCamara: 46, municipios: 92, hist: { 2022: { comparecimento: 0.76, abstencao: 0.24 }, 2018: { comparecimento: 0.78, abstencao: 0.22 } } },
  { code: "BA", name: "Bahia", regiao: "Nordeste", eleitoradoM: 11.2, vagasCamara: 39, municipios: 417, hist: { 2022: { comparecimento: 0.78, abstencao: 0.22 }, 2018: { comparecimento: 0.80, abstencao: 0.20 } } },
  { code: "RS", name: "Rio Grande do Sul", regiao: "Sul", eleitoradoM: 8.8, vagasCamara: 31, municipios: 497, hist: { 2022: { comparecimento: 0.82, abstencao: 0.18 }, 2018: { comparecimento: 0.84, abstencao: 0.16 } } },
  { code: "PR", name: "Paraná", regiao: "Sul", eleitoradoM: 8.4, vagasCamara: 30, municipios: 399, hist: { 2022: { comparecimento: 0.81, abstencao: 0.19 }, 2018: { comparecimento: 0.83, abstencao: 0.17 } } },
  { code: "CE", name: "Ceará", regiao: "Nordeste", eleitoradoM: 7.1, vagasCamara: 22, municipios: 184, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "PE", name: "Pernambuco", regiao: "Nordeste", eleitoradoM: 7.0, vagasCamara: 25, municipios: 185, hist: { 2022: { comparecimento: 0.78, abstencao: 0.22 }, 2018: { comparecimento: 0.80, abstencao: 0.20 } } },
  { code: "PA", name: "Pará", regiao: "Norte", eleitoradoM: 5.9, vagasCamara: 17, municipios: 144, hist: { 2022: { comparecimento: 0.74, abstencao: 0.26 }, 2018: { comparecimento: 0.76, abstencao: 0.24 } } },
  { code: "SC", name: "Santa Catarina", regiao: "Sul", eleitoradoM: 5.7, vagasCamara: 16, municipios: 295, hist: { 2022: { comparecimento: 0.83, abstencao: 0.17 }, 2018: { comparecimento: 0.85, abstencao: 0.15 } } },
  { code: "MA", name: "Maranhão", regiao: "Nordeste", eleitoradoM: 4.9, vagasCamara: 18, municipios: 217, hist: { 2022: { comparecimento: 0.76, abstencao: 0.24 }, 2018: { comparecimento: 0.78, abstencao: 0.22 } } },
  { code: "GO", name: "Goiás", regiao: "Centro-Oeste", eleitoradoM: 4.8, vagasCamara: 17, municipios: 246, hist: { 2022: { comparecimento: 0.80, abstencao: 0.20 }, 2018: { comparecimento: 0.82, abstencao: 0.18 } } },
  { code: "PB", name: "Paraíba", regiao: "Nordeste", eleitoradoM: 3.0, vagasCamara: 12, municipios: 223, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "ES", name: "Espírito Santo", regiao: "Sudeste", eleitoradoM: 2.9, vagasCamara: 10, municipios: 78, hist: { 2022: { comparecimento: 0.81, abstencao: 0.19 }, 2018: { comparecimento: 0.83, abstencao: 0.17 } } },
  { code: "AM", name: "Amazonas", regiao: "Norte", eleitoradoM: 2.6, vagasCamara: 8, municipios: 62, hist: { 2022: { comparecimento: 0.72, abstencao: 0.28 }, 2018: { comparecimento: 0.74, abstencao: 0.26 } } },
  { code: "RN", name: "Rio Grande do Norte", regiao: "Nordeste", eleitoradoM: 2.6, vagasCamara: 8, municipios: 167, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "MT", name: "Mato Grosso", regiao: "Centro-Oeste", eleitoradoM: 2.5, vagasCamara: 8, municipios: 141, hist: { 2022: { comparecimento: 0.78, abstencao: 0.22 }, 2018: { comparecimento: 0.80, abstencao: 0.20 } } },
  { code: "PI", name: "Piauí", regiao: "Nordeste", eleitoradoM: 2.5, vagasCamara: 10, municipios: 224, hist: { 2022: { comparecimento: 0.80, abstencao: 0.20 }, 2018: { comparecimento: 0.82, abstencao: 0.18 } } },
  { code: "AL", name: "Alagoas", regiao: "Nordeste", eleitoradoM: 2.3, vagasCamara: 9, municipios: 102, hist: { 2022: { comparecimento: 0.76, abstencao: 0.24 }, 2018: { comparecimento: 0.78, abstencao: 0.22 } } },
  { code: "DF", name: "Distrito Federal", regiao: "Centro-Oeste", eleitoradoM: 2.2, vagasCamara: 8, municipios: 1, hist: { 2022: { comparecimento: 0.83, abstencao: 0.17 }, 2018: { comparecimento: 0.85, abstencao: 0.15 } } },
  { code: "MS", name: "Mato Grosso do Sul", regiao: "Centro-Oeste", eleitoradoM: 1.9, vagasCamara: 8, municipios: 79, hist: { 2022: { comparecimento: 0.81, abstencao: 0.19 }, 2018: { comparecimento: 0.83, abstencao: 0.17 } } },
  { code: "SE", name: "Sergipe", regiao: "Nordeste", eleitoradoM: 1.7, vagasCamara: 8, municipios: 75, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "RO", name: "Rondônia", regiao: "Norte", eleitoradoM: 1.2, vagasCamara: 8, municipios: 52, hist: { 2022: { comparecimento: 0.77, abstencao: 0.23 }, 2018: { comparecimento: 0.79, abstencao: 0.21 } } },
  { code: "TO", name: "Tocantins", regiao: "Norte", eleitoradoM: 1.1, vagasCamara: 8, municipios: 139, hist: { 2022: { comparecimento: 0.79, abstencao: 0.21 }, 2018: { comparecimento: 0.81, abstencao: 0.19 } } },
  { code: "AC", name: "Acre", regiao: "Norte", eleitoradoM: 0.6, vagasCamara: 8, municipios: 22, hist: { 2022: { comparecimento: 0.75, abstencao: 0.25 }, 2018: { comparecimento: 0.77, abstencao: 0.23 } } },
  { code: "AP", name: "Amapá", regiao: "Norte", eleitoradoM: 0.55, vagasCamara: 8, municipios: 16, hist: { 2022: { comparecimento: 0.73, abstencao: 0.27 }, 2018: { comparecimento: 0.75, abstencao: 0.25 } } },
  { code: "RR", name: "Roraima", regiao: "Norte", eleitoradoM: 0.4, vagasCamara: 8, municipios: 15, hist: { 2022: { comparecimento: 0.74, abstencao: 0.26 }, 2018: { comparecimento: 0.76, abstencao: 0.24 } } },
];

// Recorte ilustrativo de municípios de SP para demonstrar a profundidade
// Estado -> Município -> Zona -> Local -> Seção no exemplo obrigatório
// (Deputado Federal / SP). Demais UFs entram apenas em nível agregado até
// que uma importação real do TSE seja conectada.
const SP_MUNICIPIOS = [
  { id: "sp-capital", name: "São Paulo (capital)", eleitoradoM: 9.4, zonas: 79, presenca: 0.55, capacidade: 0.6, logistica: 0.35 },
  { id: "guarulhos", name: "Guarulhos", eleitoradoM: 1.0, zonas: 6, presenca: 0.4, capacidade: 0.45, logistica: 0.3 },
  { id: "campinas", name: "Campinas", eleitoradoM: 0.9, zonas: 5, presenca: 0.5, capacidade: 0.55, logistica: 0.4 },
  { id: "sbc", name: "São Bernardo do Campo", eleitoradoM: 0.65, zonas: 3, presenca: 0.45, capacidade: 0.5, logistica: 0.35 },
  { id: "santo-andre", name: "Santo André", eleitoradoM: 0.58, zonas: 3, presenca: 0.4, capacidade: 0.45, logistica: 0.4 },
  { id: "osasco", name: "Osasco", eleitoradoM: 0.55, zonas: 2, presenca: 0.35, capacidade: 0.4, logistica: 0.3 },
  { id: "santos", name: "Santos", eleitoradoM: 0.34, zonas: 2, presenca: 0.5, capacidade: 0.5, logistica: 0.5 },
  { id: "sjc", name: "São José dos Campos", eleitoradoM: 0.53, zonas: 2, presenca: 0.42, capacidade: 0.48, logistica: 0.45 },
];

const OFFICES = [
  { id: "PRESIDENTE", label: "Presidente da República", tipo: "majoritario", nivel: "nacional", vice: "VICE_PRESIDENTE" },
  { id: "VICE_PRESIDENTE", label: "Vice-Presidente", tipo: "chapa", nivel: "nacional", titular: "PRESIDENTE" },
  { id: "GOVERNADOR", label: "Governador", tipo: "majoritario", nivel: "estadual", vice: "VICE_GOVERNADOR" },
  { id: "VICE_GOVERNADOR", label: "Vice-Governador", tipo: "chapa", nivel: "estadual", titular: "GOVERNADOR" },
  { id: "SENADOR", label: "Senador", tipo: "majoritario", nivel: "estadual" },
  { id: "DEPUTADO_FEDERAL", label: "Deputado Federal", tipo: "proporcional", nivel: "estadual" },
  { id: "DEPUTADO_ESTADUAL", label: "Deputado Estadual", tipo: "proporcional", nivel: "estadual" },
  { id: "DEPUTADO_DISTRITAL", label: "Deputado Distrital", tipo: "proporcional", nivel: "estadual" },
  { id: "PREFEITO", label: "Prefeito", tipo: "majoritario", nivel: "municipal", vice: "VICE_PREFEITO" },
  { id: "VICE_PREFEITO", label: "Vice-Prefeito", tipo: "chapa", nivel: "municipal", titular: "PREFEITO" },
  { id: "VEREADOR", label: "Vereador", tipo: "proporcional", nivel: "municipal" },
];

const FUNNEL_STAGES_META = [
  { key: "meta", label: "Meta de votos", prov: "premissa" },
  { key: "ajustada", label: "Meta ajustada", prov: "estimativa" },
  { key: "apoios", label: "Apoios necessários", prov: "estimativa" },
  { key: "eleitoresAlvo", label: "Eleitores-alvo", prov: "estimativa" },
  { key: "segmentos", label: "Segmentos eleitorais", prov: "premissa" },
  { key: "territorios", label: "Territórios prioritários", prov: "estimativa" },
  { key: "canais", label: "Canais de contato", prov: "premissa" },
  { key: "contatos", label: "Contatos necessários", prov: "estimativa" },
  { key: "atividades", label: "Atividades necessárias", prov: "estimativa" },
  { key: "equipe", label: "Equipe necessária", prov: "estimativa" },
  { key: "dias", label: "Dias disponíveis", prov: "premissa" },
  { key: "metaDiaria", label: "Meta diária", prov: "estimativa" },
  { key: "metaAgente", label: "Meta por agente/mobilizador", prov: "estimativa" },
];

// Canais de conversão — cada um com cadeia própria (nunca uma taxa média
// única, conforme seção 9/41 do briefing).
const CHANNEL_DEFS = [
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
      { key: "taxaRetorno", label: "Taxa de retorno / repetição (informativo)", def: 0.3, min: 0, max: 1, step: 0.01, pct: true },
    ],
    chain: (p) => p.taxaContatoValido,
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

const ICONS = {
  Handshake, UsersRound, Footprints, DoorOpen, PartyPopper, Smartphone, MessageSquare,
};

function defaultChannelState() {
  const state = {};
  CHANNEL_DEFS.forEach((c) => {
    const params = {};
    c.fields.forEach((f) => { params[f.key] = f.def; });
    state[c.id] = { enabled: true, share: c.defaultShare, conversion: c.defaultConversion, params };
  });
  return state;
}

const STORAGE_KEYS = {
  models: "modelos-planejamento-v1",
  log: "registro-operacional-v1",
  lastConfig: "config-atual-v1",
};

function defaultConfig() {
  return {
    eleicaoAno: 2026,
    office: "DEPUTADO_FEDERAL",
    uf: "SP",
    municipioId: "sp-capital",
    scenarioId: "central",
    voteGoal: 110000,
    campaignDays: 45,
    abstentionRate: 0.20,
    fidelityRate: 0.85,
    channels: defaultChannelState(),
    network: { numLiderancas: 400, fanout: 30, taxaAtivacao: 0.6, taxaSobreposicao: 0.25, camadas: 3 },
    territorialWeights: { eleitorado: 0.40, historico: 0.20, comparecimento: 0.10, presenca: 0.15, capacidade: 0.10, logistica: 0.05 },
    territoriosSelecionados: SP_MUNICIPIOS.map((m) => m.id),
    team: { coordenadores: 8, mobilizadores: 180, horasDia: 3, contatosHora: 6, reunioesDia: 4, contatosPorReuniao: 25, eventosDia: 0.3, contatosPorEvento: 150 },
    agenda: { dataInicio: "2026-08-18", dataFim: "2026-10-04", diasRua: 30, diasDigitais: 45, diasEventos: 10, diasDescanso: 3 },
    budget: { custoPorContato: 0.8, custoPorEvento: 4000, custoLogisticoDia: 1200, orcamentoTotal: 800000 },
    customScenarios: [],
    proportional: {
      vagas: 70, votosValidosCircunscricao: 22000000, votosPartido: 900000, limiarIndividualPercent: 0.10,
      concorrentes: [
        { id: uid("c"), nome: "Candidato A (mesma legenda)", votos: 180000 },
        { id: uid("c"), nome: "Candidato B (mesma legenda)", votos: 95000 },
      ],
      outrosPartidos: [
        { id: uid("p"), nome: "Federação X", votos: 3200000 },
        { id: uid("p"), nome: "Federação Y", votos: 2650000 },
        { id: uid("p"), nome: "Partido Z", votos: 1450000 },
      ],
    },
    majoritario: { segundoTurno: true, margemSeguranca: 0.05 },
  };
}

/* ============================================================================
   computeAll — orquestra os engines acima. Puro em relação a `cfg`; a UI
   apenas lê o resultado. Pode ser extraído para um serviço de backend sem
   alterações (ver módulo "Motor de cálculo", seção 38 do briefing).
   ========================================================================== */

function getScenarioPreset(cfg) {
  if (SCENARIO_PRESETS[cfg.scenarioId]) return SCENARIO_PRESETS[cfg.scenarioId];
  const custom = (cfg.customScenarios || []).find((s) => s.id === cfg.scenarioId);
  return custom || SCENARIO_PRESETS.central;
}

function getOffice(cfg) {
  return OFFICES.find((o) => o.id === cfg.office) || OFFICES[0];
}

function getUf(cfg) {
  return UF_DATA.find((u) => u.code === cfg.uf) || UF_DATA[0];
}

function buildTerritories(cfg) {
  const uf = getUf(cfg);
  if (cfg.uf === "SP") {
    const list = SP_MUNICIPIOS.filter((m) => cfg.territoriosSelecionados.includes(m.id));
    const base = list.length ? list : SP_MUNICIPIOS;
    const eleitoradoNorm = territorialEngine.normalizeField(base, "eleitoradoM");
    const presencaNorm = territorialEngine.normalizeField(base, "presenca");
    const capacidadeNorm = territorialEngine.normalizeField(base, "capacidade");
    const logisticaNorm = territorialEngine.normalizeField(base, "logistica");
    const hist2022 = uf.hist[2022].comparecimento;
    return base.map((m, i) => {
      // pequena variação ilustrativa por município em torno da média estadual —
      // ainda sintética, apenas evita repetir o mesmo valor em todas as linhas.
      const localComparecimento = clamp01(hist2022 + (m.presenca - 0.45) * 0.06);
      return {
        id: m.id, name: m.name, eleitoradoM: m.eleitoradoM,
        eleitoradoNorm: eleitoradoNorm[i], historicoNorm: localComparecimento, comparecimentoNorm: localComparecimento,
        presencaNorm: presencaNorm[i], capacidadeNorm: capacidadeNorm[i], logisticaNorm: logisticaNorm[i],
      };
    });
  }
  // Demais UFs: nível agregado único até conexão real com dados municipais.
  return [{
    id: uf.code, name: uf.name, eleitoradoM: uf.eleitoradoM,
    eleitoradoNorm: 1, historicoNorm: uf.hist[2022].comparecimento, comparecimentoNorm: uf.hist[2022].comparecimento,
    presencaNorm: 0.5, capacidadeNorm: 0.5, logisticaNorm: 0.3,
  }];
}

function computeAll(cfg) {
  const office = getOffice(cfg);
  const uf = getUf(cfg);
  const preset = getScenarioPreset(cfg);
  const scenario = scenarioEngine.apply(cfg.abstentionRate, cfg.fidelityRate, preset);
  const turnoutRate = electorateEngine.turnoutFromAbstention(scenario.abstentionRate);
  const adjustedGoal = funnelEngine.adjustedGoal(cfg.voteGoal, scenario.fidelityRate, turnoutRate);

  const channelResults = CHANNEL_DEFS.map((def) => {
    const st = cfg.channels[def.id];
    const conversion = clamp01(st.conversion * scenario.conversionMultiplier);
    const contactsNeeded = st.enabled ? funnelEngine.contactsForGoalShare(adjustedGoal, st.share, conversion) : 0;
    const chainMultiplier = def.chain(st.params);
    const actionsNeeded = st.enabled ? conversionEngine.actionsNeeded(contactsNeeded, chainMultiplier) : 0;
    return { ...def, enabled: st.enabled, share: st.share, conversion, contactsNeeded, chainMultiplier, actionsNeeded, params: st.params };
  });
  const totalContactsNeeded = channelResults.reduce((a, c) => a + c.contactsNeeded, 0);
  const enabledShareSum = channelResults.filter((c) => c.enabled).reduce((a, c) => a + c.share, 0);

  const networkTrail = networkEngine.layeredReach(cfg.network.numLiderancas, cfg.network.fanout, cfg.network.taxaAtivacao, cfg.network.taxaSobreposicao, cfg.network.camadas);
  const networkFinalReach = networkTrail[networkTrail.length - 1]?.count || 0;

  const dailyContacts = funnelEngine.dailyTarget(totalContactsNeeded, cfg.campaignDays);
  const weeklyContacts = isFiniteNum(dailyContacts) ? dailyContacts * 7 : Infinity;

  const territoriesRaw = buildTerritories(cfg);
  const territories = territorialEngine.distributeGoal(territoriesRaw, cfg.territorialWeights, adjustedGoal);
  const weightSum = Object.values(cfg.territorialWeights).reduce((a, b) => a + b, 0);

  const dailyCapacityBase = capacityEngine.dailyCapacity(cfg.team);
  const dailyCapacity = dailyCapacityBase * (scenario.capacityMultiplier || 1);
  const capacityGap = capacityEngine.gap(dailyContacts, dailyCapacity);
  const capacityStatus = capacityEngine.status(dailyContacts, dailyCapacity);

  const eventosTotal = (cfg.team.eventosDia || 0) * cfg.campaignDays;
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

  // Módulo proporcional
  let proportionalResult = null;
  if (office.tipo === "proporcional") {
    const qe = electoralRuleEngine.quocienteEleitoral(cfg.proportional.votosValidosCircunscricao, cfg.proportional.vagas);
    const qp = electoralRuleEngine.quocientePartidario(cfg.proportional.votosPartido, qe);
    const limiarIndividual = qe * (cfg.proportional.limiarIndividualPercent ?? 0.10);
    const allParties = [
      { id: "own", name: "Minha legenda", votes: cfg.proportional.votosPartido },
      ...cfg.proportional.outrosPartidos.map((p) => ({ id: p.id, name: p.nome, votes: p.votos })),
    ];
    const allocation = electoralRuleEngine.dhondtAllocation(allParties, cfg.proportional.vagas);
    const ownSeats = allocation.find((a) => a.id === "own")?.seats || 0;
    const totalConcorrentesVotos = cfg.proportional.concorrentes.reduce((a, c) => a + c.votos, 0) + cfg.voteGoal;
    const faixaInternaShare = safeDiv(cfg.voteGoal, totalConcorrentesVotos);
    proportionalResult = { qe, qp, limiarIndividual, allocation, ownSeats, faixaInternaShare, totalConcorrentesVotos };
  }

  let majoritarioResult = null;
  if (office.tipo === "majoritario") {
    majoritarioResult = {
      minVotosSeguranca: adjustedGoal * (1 + (cfg.majoritario?.margemSeguranca || 0)),
      segundoTurno: !!cfg.majoritario?.segundoTurno,
    };
  }

  // Alertas (secao 25)
  const alerts = [];
  if (!isFiniteNum(dailyContacts) || cfg.campaignDays <= 0) {
    alerts.push({ level: "critico", text: "Meta diária impossível: número de dias de campanha insuficiente ou igual a zero." });
  }
  if (capacityStatus === "insuficiente") {
    alerts.push({ level: "critico", text: `Capacidade operacional diária (${fmtInt(dailyCapacity)} contatos) abaixo da demanda diária (${fmtInt(dailyContacts)} contatos).` });
  }
  if (totalCost > cfg.budget.orcamentoTotal) {
    alerts.push({ level: "atencao", text: `Custo estimado (${fmtMoney(totalCost)}) acima do orçamento disponível (${fmtMoney(cfg.budget.orcamentoTotal)}).` });
  }
  const maxChannelShare = channelResults.filter((c) => c.enabled).reduce((max, c) => Math.max(max, c.share), 0);
  if (maxChannelShare > 0.6) {
    const dep = channelResults.find((c) => c.share === maxChannelShare);
    alerts.push({ level: "atencao", text: `Excesso de dependência de um único canal (${dep?.label}, ${fmtPct(maxChannelShare)} da meta).` });
  }
  if (Math.abs(enabledShareSum - 1) > 0.01) {
    alerts.push({ level: "atencao", text: `A soma das participações dos canais é ${fmtPct(enabledShareSum)} (deveria ser 100%).` });
  }
  if (Math.abs(weightSum - 1) > 0.01) {
    alerts.push({ level: "atencao", text: `A soma dos pesos territoriais é ${fmtPct(weightSum)} (deveria ser 100%).` });
  }
  alerts.push({ level: "info", text: "Dados territoriais e históricos desta demonstração são sintéticos — conecte o Portal de Dados Abertos do TSE e o IBGE antes de uso operacional real." });

  return {
    office, uf, preset, scenario, turnoutRate, adjustedGoal, channelResults, totalContactsNeeded,
    enabledShareSum, networkTrail, networkFinalReach, dailyContacts, weeklyContacts, territories,
    weightSum, dailyCapacity, dailyCapacityBase, capacityGap, capacityStatus, totalCost, totalCostBase,
    costPerSupport, budgetGap, metaPorEquipe, metaPorMobilizador, proportionalResult, majoritarioResult, alerts,
  };
}

/* ============================================================================
   ESTILO — sistema visual próprio (institucional, alta densidade, desktop-
   first). IBM Plex Sans para texto, IBM Plex Mono para todo dado numérico —
   a intenção é que qualquer número na tela pareça medido, não decorado.
   ========================================================================== */

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');

.fr-app {
  --ink: #10162B; --ink-2: #1A2340; --ink-3: #2B3560; --ink-line: #34406E;
  --paper: #F2F3F6; --card: #FFFFFF; --line: #E1E4EA; --line-2: #ECEEF2;
  --text: #14182B; --text-soft: #5A6178; --text-faint: #9096AA;
  --invert: #EDEFF7; --invert-soft: #A6ACC6;
  --brand: #21418F; --brand-deep: #16305F; --brand-soft: #E7ECF9;
  --gold: #AD8324; --gold-soft: #F6EEDA;
  --oficial: #187A56; --oficial-soft: #E1F3EB;
  --historico: #6A5AA8; --historico-soft: #ECE7F8;
  --premissa: #B9821F; --premissa-soft: #F8EFD9;
  --estimativa: #3D6BA8; --estimativa-soft: #E6EDF7;
  --danger: #B3271E; --danger-soft: #FBE8E6;
  --font-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
  --r-sm: 3px; --r-md: 6px;
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--paper);
  width: 100%;
  min-height: 100vh;
  display: flex;
  position: relative;
  line-height: 1.45;
}
.fr-app, .fr-app * { box-sizing: border-box; }
.fr-app *:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.fr-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.fr-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 600; }

/* ---------- sidebar ---------- */
.fr-sidebar {
  width: 236px; flex: 0 0 236px; background: var(--ink); color: var(--invert);
  min-height: 100vh; position: sticky; top: 0; align-self: flex-start;
  display: flex; flex-direction: column; z-index: 20;
}
.fr-brand-block { padding: 20px 18px 16px; border-bottom: 1px solid var(--ink-line); }
.fr-brand-name { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--invert); }
.fr-brand-sub { font-size: 10.5px; color: var(--invert-soft); margin-top: 6px; line-height: 1.4; }
.fr-nav { flex: 1; padding: 10px 10px; overflow-y: auto; }
.fr-nav-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 9px 10px; border-radius: var(--r-sm); border: none; background: transparent;
  color: var(--invert-soft); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500;
  cursor: pointer; margin-bottom: 2px; transition: background 0.12s ease, color 0.12s ease;
  position: relative;
}
.fr-nav-item:hover { background: var(--ink-2); color: var(--invert); }
.fr-nav-item.active { background: var(--ink-2); color: #fff; }
.fr-nav-item.active::before {
  content: ""; position: absolute; left: -10px; top: 6px; bottom: 6px; width: 3px;
  background: var(--gold); border-radius: 0 2px 2px 0;
}
.fr-nav-item svg { flex: 0 0 auto; opacity: 0.9; }
.fr-sidebar-foot { padding: 12px 18px 16px; border-top: 1px solid var(--ink-line); }
.fr-mode-toggle { display: flex; background: var(--ink-2); border-radius: var(--r-sm); padding: 3px; gap: 2px; }
.fr-mode-btn { flex: 1; padding: 6px 4px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; border: none; background: transparent; color: var(--invert-soft); border-radius: 3px; cursor: pointer; }
.fr-mode-btn.active { background: var(--brand); color: #fff; }

/* ---------- main / topbar ---------- */
.fr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fr-topbar {
  position: sticky; top: 0; z-index: 15; background: var(--card); border-bottom: 1px solid var(--line);
  padding: 10px 22px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.fr-ctx-pill {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--paper); font-size: 11.5px; color: var(--text-soft);
}
.fr-ctx-pill label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
.fr-ctx-pill select, .fr-ctx-pill input {
  border: none; background: transparent; font-family: var(--font-mono); font-size: 12px; font-weight: 600;
  color: var(--text); cursor: pointer;
}
.fr-topbar-spacer { flex: 1; }
.fr-content { padding: 22px 26px 60px; max-width: 1360px; width: 100%; margin: 0 auto; }

/* ---------- generic building blocks ---------- */
.fr-section-head { margin-bottom: 16px; }
.fr-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--brand); margin-bottom: 4px; }
.fr-h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
.fr-h2 { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
.fr-desc { font-size: 12.5px; color: var(--text-soft); max-width: 640px; }
.fr-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 16px 18px; }
.fr-grid { display: grid; gap: 14px; }
.fr-grid-2 { grid-template-columns: repeat(2, 1fr); }
.fr-grid-3 { grid-template-columns: repeat(3, 1fr); }
.fr-grid-4 { grid-template-columns: repeat(4, 1fr); }
.fr-grid-5 { grid-template-columns: repeat(5, 1fr); }
.fr-row { display: flex; align-items: center; gap: 10px; }
.fr-stack { display: flex; flex-direction: column; gap: 14px; }
.fr-divider { height: 1px; background: var(--line); margin: 14px 0; border: none; }
.fr-hint { font-size: 11px; color: var(--text-faint); }

/* ---------- provenance badges ---------- */
.fr-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 2.5px 7px; border-radius: 20px; white-space: nowrap; }
.fr-badge .dot { width: 6px; height: 6px; border-radius: 50%; }
.fr-badge.oficial { background: var(--oficial-soft); color: var(--oficial); }
.fr-badge.oficial .dot { background: var(--oficial); }
.fr-badge.historico { background: var(--historico-soft); color: var(--historico); }
.fr-badge.historico .dot { background: var(--historico); }
.fr-badge.premissa { background: var(--premissa-soft); color: var(--premissa); }
.fr-badge.premissa .dot { background: var(--premissa); }
.fr-badge.estimativa { background: var(--estimativa-soft); color: var(--estimativa); }
.fr-badge.estimativa .dot { background: var(--estimativa); }

/* ---------- kpi ---------- */
.fr-kpi { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fr-kpi-label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
.fr-kpi-value { font-family: var(--font-mono); font-size: 21px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
.fr-kpi-sub { font-size: 11px; color: var(--text-soft); }

/* ---------- formula disclosure ---------- */
.fr-disclosure { border: 1px dashed var(--line); border-radius: var(--r-sm); overflow: hidden; }
.fr-disclosure-btn { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 8px 10px; background: var(--paper); border: none; cursor: pointer; font-size: 11.5px; font-weight: 600; color: var(--brand); }
.fr-disclosure-body { padding: 10px 12px; font-size: 12px; color: var(--text-soft); background: #fff; border-top: 1px dashed var(--line); }
.fr-formula-box { font-family: var(--font-mono); font-size: 12px; background: var(--ink); color: var(--invert); padding: 8px 10px; border-radius: var(--r-sm); margin: 6px 0; overflow-x: auto; white-space: pre; }

/* ---------- inputs ---------- */
.fr-field { display: flex; flex-direction: column; gap: 5px; }
.fr-field-label { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: var(--text); }
.fr-field input[type=number], .fr-field input[type=text], .fr-field input[type=date], .fr-field select {
  font-family: var(--font-mono); font-size: 13px; padding: 7px 9px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: #fff; color: var(--text); width: 100%;
}
.fr-field input[type=range] { width: 100%; accent-color: var(--brand); }
.fr-field-row { display: flex; align-items: center; gap: 10px; }
.fr-field-row input[type=range] { flex: 1; }
.fr-field-row .fr-num { min-width: 54px; text-align: right; }

/* ---------- table ---------- */
.fr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.fr-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); font-weight: 700; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.fr-table td { padding: 8px 10px; border-bottom: 1px solid var(--line-2); vertical-align: middle; }
.fr-table tr:last-child td { border-bottom: none; }
.fr-table td.num, .fr-table th.num { text-align: right; font-family: var(--font-mono); }

/* ---------- buttons ---------- */
.fr-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--text); }
.fr-btn:hover { border-color: var(--brand); color: var(--brand); }
.fr-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.fr-btn.primary:hover { background: var(--brand-deep); border-color: var(--brand-deep); color: #fff; }
.fr-btn.ghost { border-color: transparent; background: transparent; }
.fr-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.fr-btn.sm { padding: 5px 9px; font-size: 11.5px; }
.fr-seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.fr-seg button { padding: 6px 12px; font-size: 11.5px; font-weight: 600; border: none; background: #fff; color: var(--text-soft); cursor: pointer; border-right: 1px solid var(--line); }
.fr-seg button:last-child { border-right: none; }
.fr-seg button.active { background: var(--brand); color: #fff; }

/* ---------- alerts ---------- */
.fr-alert { display: flex; gap: 9px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-sm); font-size: 12px; border: 1px solid; }
.fr-alert.critico { background: var(--danger-soft); border-color: #f0c4c0; color: var(--danger); }
.fr-alert.atencao { background: var(--premissa-soft); border-color: #ecd9ab; color: #8a611a; }
.fr-alert.info { background: var(--estimativa-soft); border-color: #c7d7ec; color: var(--brand-deep); }
.fr-alert svg { flex: 0 0 auto; margin-top: 1px; }

/* ---------- funnel diagram (elemento assinatura) ---------- */
.fr-funnel { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; }
.fr-funnel-stage { position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: filter 0.15s ease, transform 0.15s ease; border: none; padding: 0; }
.fr-funnel-stage:hover { filter: brightness(1.06); }
.fr-funnel-stage-inner { width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; color: #fff; }
.fr-funnel-label { font-size: 11px; font-weight: 600; text-align: left; }
.fr-funnel-value { font-family: var(--font-mono); font-weight: 700; font-size: 13.5px; }
.fr-funnel-connector { width: 1px; height: 6px; background: var(--line); }

/* ---------- network tree ---------- */
.fr-tree-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.fr-tree-node { flex: 1; text-align: center; padding: 10px 8px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); }
.fr-tree-node .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-faint); font-weight: 700; }
.fr-tree-node .val { font-family: var(--font-mono); font-weight: 700; font-size: 14px; margin-top: 3px; }
.fr-tree-arrow { color: var(--text-faint); flex: 0 0 auto; }

/* ---------- misc ---------- */
.fr-empty { text-align: center; padding: 50px 20px; color: var(--text-soft); }
.fr-scroll-x { overflow-x: auto; }
.fr-chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.fr-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 16px; border: 1px solid var(--line); font-size: 11.5px; cursor: pointer; background: #fff; }
.fr-chip.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-deep); font-weight: 600; }
.fr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--r-sm); border: 1px solid var(--line); background: #fff; cursor: pointer; color: var(--text-soft); }
.fr-icon-btn:hover { border-color: var(--brand); color: var(--brand); }
.fr-progress-track { height: 6px; background: var(--line-2); border-radius: 4px; overflow: hidden; }
.fr-progress-fill { height: 100%; background: var(--brand); }
.fr-mobile-topbar { display: none; }

@media (max-width: 980px) {
  .fr-app { flex-direction: column; }
  .fr-sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform 0.2s ease; width: 78vw; max-width: 300px; }
  .fr-sidebar.open { transform: translateX(0); }
  .fr-mobile-topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--ink); position: sticky; top: 0; z-index: 25; }
  .fr-mobile-topbar .fr-brand-name { color: #fff; font-size: 12px; }
  .fr-content { padding: 16px 14px 50px; }
  .fr-grid-2, .fr-grid-3, .fr-grid-4, .fr-grid-5 { grid-template-columns: 1fr 1fr; }
  .fr-topbar { padding: 8px 12px; }
  .fr-sidebar-scrim { position: fixed; inset: 0; background: rgba(10,14,28,0.5); z-index: 19; }
}
@media (max-width: 620px) {
  .fr-grid-2, .fr-grid-3, .fr-grid-4, .fr-grid-5 { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .fr-app * { transition: none !important; animation: none !important; }
}
`;

/* ============================================================================
   COMPONENTES DE APOIO (atoms)
   ========================================================================== */

const PROV_LABEL = { oficial: "Dado oficial", historico: "Dado histórico", premissa: "Premissa", estimativa: "Estimativa" };

function ProvBadge({ type }) {
  if (!type || !PROV_LABEL[type]) return null;
  return (
    <span className={cx("fr-badge", type)}>
      <span className="dot" />{PROV_LABEL[type]}
    </span>
  );
}

function Formula({ title = "Como este número foi calculado?", formula, variables = [], children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fr-disclosure">
      <button className="fr-disclosure-btn" onClick={() => setOpen((o) => !o)} type="button">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && (
        <div className="fr-disclosure-body">
          {formula && <div className="fr-formula-box">{formula}</div>}
          {variables.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {variables.map((v, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <span className="fr-mono" style={{ fontWeight: 600 }}>{v.name}</span>: {v.value}
                  {v.prov && <span style={{ marginLeft: 6 }}><ProvBadge type={v.prov} /></span>}
                </li>
              ))}
            </ul>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, prov }) {
  return (
    <div className="fr-kpi">
      <div className="fr-row" style={{ justifyContent: "space-between" }}>
        <span className="fr-kpi-label">{label}</span>
        {prov && <ProvBadge type={prov} />}
      </div>
      <div className="fr-kpi-value">{value}</div>
      {sub && <div className="fr-kpi-sub">{sub}</div>}
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix, prov, hint, mono = true }) {
  return (
    <div className="fr-field">
      <div className="fr-field-label">
        <span>{label}</span>
        {prov && <ProvBadge type={prov} />}
      </div>
      <div className="fr-row">
        <input
          type="number" value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step}
          onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
        />
        {suffix && <span className="fr-hint">{suffix}</span>}
      </div>
      {hint && <span className="fr-hint">{hint}</span>}
    </div>
  );
}

function SliderField({ label, value, onChange, min = 0, max = 1, step = 0.01, pct = true, prov, hint }) {
  return (
    <div className="fr-field">
      <div className="fr-field-label">
        <span>{label}</span>
        {prov && <ProvBadge type={prov} />}
      </div>
      <div className="fr-field-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
        <span className="fr-num">{pct ? fmtPct(value) : fmtDec(value, 2)}</span>
      </div>
      {hint && <span className="fr-hint">{hint}</span>}
    </div>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="fr-seg">
      {options.map((o) => (
        <button key={o.value} className={cx(value === o.value && "active")} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AlertList({ alerts }) {
  if (!alerts?.length) return null;
  const icon = { critico: <AlertTriangle size={15} />, atencao: <AlertTriangle size={15} />, info: <Info size={15} /> };
  return (
    <div className="fr-stack" style={{ gap: 8 }}>
      {alerts.map((a, i) => (
        <div key={i} className={cx("fr-alert", a.level)}>
          {icon[a.level]}
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ eyebrow, title, desc }) {
  return (
    <div className="fr-section-head">
      {eyebrow && <div className="fr-eyebrow">{eyebrow}</div>}
      <h1 className="fr-h1">{title}</h1>
      {desc && <p className="fr-desc">{desc}</p>}
    </div>
  );
}

/* ---------------------------- funil (elemento assinatura) ---------------------------- */

const PROV_COLOR = { oficial: "#187A56", historico: "#6A5AA8", premissa: "#B9821F", estimativa: "#3D6BA8" };

function FunnelDiagram({ stages, onSelect, activeKey }) {
  // stages: [{key,label,value,prov,displayValue}]
  const values = stages.map((s) => (isFiniteNum(s.value) && s.value > 0 ? s.value : 1));
  const maxV = Math.max(...values);
  const minWidthPct = 34;
  return (
    <div className="fr-funnel">
      {stages.map((s, i) => {
        const ratio = Math.sqrt((isFiniteNum(s.value) ? Math.max(s.value, 1) : 1) / maxV);
        const widthPct = minWidthPct + ratio * (100 - minWidthPct);
        return (
          <React.Fragment key={s.key}>
            <button
              type="button"
              className="fr-funnel-stage"
              style={{
                width: `${widthPct}%`, height: 40,
                background: activeKey === s.key ? PROV_COLOR[s.prov] : `${PROV_COLOR[s.prov]}${activeKey && activeKey !== s.key ? "cc" : "e6"}`,
                borderRadius: 3, boxShadow: activeKey === s.key ? "0 0 0 2px #10162B33" : "none",
              }}
              onClick={() => onSelect && onSelect(s.key)}
            >
              <span className="fr-funnel-stage-inner">
                <span className="fr-funnel-label">{i + 1}. {s.label}</span>
                <span className="fr-funnel-value">{s.displayValue ?? fmtInt(s.value)}</span>
              </span>
            </button>
            {i < stages.length - 1 && <div className="fr-funnel-connector" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function NetworkTree({ trail }) {
  return (
    <div className="fr-row" style={{ overflowX: "auto", paddingBottom: 6 }}>
      {trail.map((n, i) => (
        <React.Fragment key={n.layer}>
          <div className="fr-tree-node" style={{ minWidth: 120 }}>
            <div className="lbl">{n.label}</div>
            <div className="val fr-mono">{fmtInt(n.count)}</div>
          </div>
          {i < trail.length - 1 && <ArrowRight size={16} className="fr-tree-arrow" />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============================================================================
   VIEW: VISÃO GERAL — dashboard executivo (10 KPIs, seção 21) + alertas.
   ========================================================================== */

function ViewVisaoGeral({ cfg, derived, setActiveView }) {
  const d = derived;
  const progressoCobertura = clamp01(safeDiv(d.dailyCapacity, d.dailyContacts));
  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Painel executivo" title="Visão Geral"
        desc="Os dez indicadores que resumem a distância entre a meta e a operação — atualizados a cada alteração de premissa ou cenário." />
      <div className="fr-grid fr-grid-5">
        <Kpi label="Meta de votos" value={fmtInt(cfg.voteGoal)} prov="premissa" />
        <Kpi label="Meta ajustada" value={fmtInt(d.adjustedGoal)} sub={`comparecimento ${fmtPct(d.turnoutRate)} · fidelidade ${fmtPct(d.scenario.fidelityRate)}`} prov="estimativa" />
        <Kpi label="Contatos necessários" value={fmtInt(d.totalContactsNeeded)} prov="estimativa" />
        <Kpi label="Contatos realizados" value="0" sub="Registre em Relatórios → rastreamento" prov="estimativa" />
        <Kpi label="Déficit de contatos" value={fmtInt(d.totalContactsNeeded)} sub="realizados − necessários" prov="estimativa" />
        <Kpi label="Dias restantes" value={fmtInt(cfg.campaignDays)} prov="premissa" />
        <Kpi label="Meta diária" value={fmtInt(d.dailyContacts)} prov="estimativa" />
        <Kpi label="Capacidade diária" value={fmtInt(d.dailyCapacity)} sub={d.capacityStatus === "insuficiente" ? "abaixo da meta diária" : "dentro ou acima da meta diária"} prov="estimativa" />
        <Kpi label="Cobertura territorial" value={`${d.territories.length} território(s)`} sub={`peso somado ${fmtPct(d.weightSum)}`} prov="estimativa" />
        <Kpi label="Custo estimado" value={fmtMoney(d.totalCost)} sub={`${fmtMoney(d.costPerSupport)} por apoio`} prov="estimativa" />
      </div>

      <div className="fr-grid fr-grid-2">
        <div className="fr-card">
          <h2 className="fr-h2">Capacidade × demanda diária</h2>
          <p className="fr-desc">Comparação entre o que a estrutura atual consegue entregar por dia e o que o funil exige.</p>
          <div style={{ marginTop: 12 }}>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span>Capacidade: <b className="fr-num">{fmtInt(d.dailyCapacity)}</b></span>
              <span>Demanda: <b className="fr-num">{fmtInt(d.dailyContacts)}</b></span>
            </div>
            <div className="fr-progress-track">
              <div className="fr-progress-fill" style={{ width: `${Math.min(100, progressoCobertura * 100)}%`, background: d.capacityStatus === "insuficiente" ? "var(--danger)" : "var(--oficial)" }} />
            </div>
          </div>
          <button className="fr-btn sm" style={{ marginTop: 12 }} onClick={() => setActiveView("equipes")}>Ajustar equipe <ArrowRight size={13} /></button>
        </div>
        <div className="fr-card">
          <h2 className="fr-h2">Alertas ativos</h2>
          <p className="fr-desc">Verificações automáticas sobre a consistência do plano atual.</p>
          <div style={{ marginTop: 12 }}>
            <AlertList alerts={d.alerts} />
          </div>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Funil — visão rápida</h2>
        <p className="fr-desc">Abra "Funil Reverso" para navegar as 13 etapas em detalhe, com fórmulas e gargalos.</p>
        <div style={{ marginTop: 12 }}>
          <FunnelDiagram
            stages={[
              { key: "meta", label: "Meta de votos", value: cfg.voteGoal, prov: "premissa" },
              { key: "ajustada", label: "Meta ajustada", value: d.adjustedGoal, prov: "estimativa" },
              { key: "contatos", label: "Contatos necessários", value: d.totalContactsNeeded, prov: "estimativa" },
              { key: "diaria", label: "Meta diária", value: d.dailyContacts, prov: "estimativa" },
            ]}
            onSelect={() => setActiveView("funil")}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: META ELEITORAL — tela inicial (seção 35): meta, cargo, circunscrição,
   dias -> CALCULAR FUNIL -> cascata de resultado com fórmulas abertas.
   ========================================================================== */

function ViewMetaEleitoral({ cfg, update, derived }) {
  const [pending, setPending] = useState({ voteGoal: cfg.voteGoal, office: cfg.office, uf: cfg.uf, campaignDays: cfg.campaignDays });
  const [calculated, setCalculated] = useState(true);
  const office = OFFICES.find((o) => o.id === pending.office);
  const d = derived;

  const applyCalc = () => {
    update({ voteGoal: pending.voteGoal, office: pending.office, uf: pending.uf, campaignDays: pending.campaignDays });
    setCalculated(true);
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Ponto de partida" title="Meta Eleitoral"
        desc="Transforme uma meta de votos em território, público, contatos, atividades, tempo e recursos." />

      <div className="fr-card">
        <div className="fr-grid fr-grid-4">
          <NumberField label="Qual é a sua meta de votos?" value={pending.voteGoal} onChange={(v) => setPending((p) => ({ ...p, voteGoal: v }))} min={0} step={1000} prov="premissa" />
          <div className="fr-field">
            <div className="fr-field-label"><span>Para qual cargo?</span><ProvBadge type="premissa" /></div>
            <select value={pending.office} onChange={(e) => setPending((p) => ({ ...p, office: e.target.value }))}>
              {OFFICES.filter((o) => o.tipo !== "chapa").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="fr-field">
            <div className="fr-field-label"><span>Qual é a circunscrição (UF)?</span><ProvBadge type="premissa" /></div>
            <select value={pending.uf} onChange={(e) => setPending((p) => ({ ...p, uf: e.target.value }))}>
              {UF_DATA.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
          <NumberField label="Dias de campanha operacional" value={pending.campaignDays} onChange={(v) => setPending((p) => ({ ...p, campaignDays: v }))} min={1} max={365} prov="premissa" />
        </div>
        <div className="fr-row" style={{ marginTop: 14 }}>
          <button className="fr-btn primary" onClick={applyCalc}><Target size={14} /> Calcular Funil</button>
          {office?.tipo === "chapa" && <span className="fr-hint">Vices concorrem na chapa do titular — selecione o cargo titular para o cálculo de votos.</span>}
        </div>
      </div>

      {calculated && office && <OfficeRulesCard cfg={cfg} update={update} derived={d} />}

      {calculated && (
        <div className="fr-card">
          <h2 className="fr-h2">Resultado</h2>
          <div style={{ marginTop: 14, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            <FunnelDiagram
              stages={[
                { key: "meta", label: "Meta", value: cfg.voteGoal, prov: "premissa" },
                { key: "ajustada", label: "Meta ajustada", value: d.adjustedGoal, prov: "estimativa" },
                { key: "contatos", label: "Contatos necessários", value: d.totalContactsNeeded, prov: "estimativa" },
                { key: "diaria", label: "Contatos / dia", value: d.dailyContacts, prov: "estimativa" },
                { key: "capacidade", label: "Capacidade atual", value: d.dailyCapacity, prov: "estimativa" },
                { key: "deficit", label: d.capacityGap >= 0 ? "Superávit diário" : "Déficit diário", value: Math.abs(d.capacityGap), prov: "estimativa" },
              ]}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <Formula
              title="Veja como chegamos a este número"
              formula={`META_AJUSTADA = META_VOTOS / (TAXA_FIDELIDADE × TAXA_COMPARECIMENTO)\nTAXA_COMPARECIMENTO = 1 − TAXA_ABSTENÇÃO\n\nCONTATOS_NECESSÁRIOS = Σ canal [ (META_AJUSTADA × PARTICIPAÇÃO_CANAL) / CONVERSÃO_CANAL ]\n\nCONTATOS/DIA = CONTATOS_NECESSÁRIOS / DIAS_DE_CAMPANHA`}
              variables={[
                { name: "META_VOTOS", value: fmtInt(cfg.voteGoal), prov: "premissa" },
                { name: "TAXA_ABSTENÇÃO", value: fmtPct(d.scenario.abstentionRate), prov: "premissa" },
                { name: "TAXA_FIDELIDADE", value: fmtPct(d.scenario.fidelityRate), prov: "premissa" },
                { name: "DIAS_DE_CAMPANHA", value: fmtInt(cfg.campaignDays), prov: "premissa" },
                { name: "CENÁRIO ATIVO", value: d.preset.label, prov: "premissa" },
              ]}
            >
              <p style={{ marginTop: 8 }}>Cada canal (corpo a corpo, porta a porta, digital etc.) tem sua própria taxa de conversão — ajuste em <b>Canais</b>. Nenhum arredondamento ocorre nos cálculos internos, apenas na exibição.</p>
            </Formula>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   VIEW: FUNIL REVERSO — cascata completa (13 etapas), navegação bidirecional,
   identificação de gargalos, e o Grafo Eleitoral Operacional (seção 42).
   ========================================================================== */

function ViewFunilReverso({ cfg, derived }) {
  const d = derived;
  const [direction, setDirection] = useState("down");
  const [activeKey, setActiveKey] = useState(null);

  const totalActions = d.channelResults.reduce((a, c) => a + (c.enabled ? c.actionsNeeded : 0), 0);
  const totalTeam = cfg.team.coordenadores + cfg.team.mobilizadores;
  const segmentsCount = 5 + 2; // faixas etárias padrão + gêneros — ver módulo Públicos

  const stageValues = {
    meta: cfg.voteGoal, ajustada: d.adjustedGoal, apoios: d.adjustedGoal, eleitoresAlvo: d.adjustedGoal,
    segmentos: segmentsCount, territorios: d.territories.length, canais: d.channelResults.filter((c) => c.enabled).length,
    contatos: d.totalContactsNeeded, atividades: totalActions, equipe: totalTeam, dias: cfg.campaignDays,
    metaDiaria: d.dailyContacts, metaAgente: d.metaPorMobilizador,
  };
  const bottleneckKeys = d.capacityStatus === "insuficiente" ? ["equipe", "dias", "metaDiaria", "metaAgente"] : [];

  const stages = FUNNEL_STAGES_META.map((s) => ({ ...s, value: stageValues[s.key] }));
  const ordered = direction === "down" ? stages : [...stages].reverse();
  const activeStage = stages.find((s) => s.key === activeKey);

  const stageDetail = {
    meta: { formula: "Entrada direta.", vars: [] },
    ajustada: { formula: "META_VOTOS / (TAXA_FIDELIDADE × TAXA_COMPARECIMENTO)", vars: [["TAXA_COMPARECIMENTO", fmtPct(d.turnoutRate)], ["TAXA_FIDELIDADE", fmtPct(d.scenario.fidelityRate)]] },
    apoios: { formula: "≈ META_AJUSTADA (mesmo patamar; refinado por canal em 'Canais').", vars: [] },
    eleitoresAlvo: { formula: "Universo de eleitores compatível com a meta ajustada, antes da segmentação.", vars: [] },
    segmentos: { formula: "Contagem de segmentos configurados em Públicos.", vars: [] },
    territorios: { formula: "Territórios selecionados em Territórios, ponderados pelos pesos definidos.", vars: [] },
    canais: { formula: "Canais habilitados em Canais.", vars: [] },
    contatos: { formula: "Σ canal [ (META_AJUSTADA × PARTICIPAÇÃO_CANAL) / CONVERSÃO_CANAL ]", vars: d.channelResults.filter((c) => c.enabled).map((c) => [c.label, fmtInt(c.contactsNeeded)]) },
    atividades: { formula: "Σ canal [ CONTATOS_NECESSÁRIOS_CANAL / MULTIPLICADOR_DA_CADEIA_CANAL ]", vars: d.channelResults.filter((c) => c.enabled).map((c) => [`${c.label} (${c.unit})`, fmtInt(c.actionsNeeded)]) },
    equipe: { formula: "Coordenadores + mobilizadores configurados em Equipes.", vars: [["Coordenadores", fmtInt(cfg.team.coordenadores)], ["Mobilizadores", fmtInt(cfg.team.mobilizadores)]] },
    dias: { formula: "Entrada direta (Meta Eleitoral / Agenda).", vars: [] },
    metaDiaria: { formula: "CONTATOS_NECESSÁRIOS / DIAS_DE_CAMPANHA", vars: [] },
    metaAgente: { formula: "META_DIÁRIA / Nº_MOBILIZADORES", vars: [] },
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Princípio central" title="Funil Reverso"
        desc="Da meta de votos até a meta por agente — e o caminho inverso, para localizar onde a operação trava." />

      <div className="fr-card">
        <div className="fr-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <SegmentedControl
            options={[{ value: "down", label: "Meta → Ação" }, { value: "up", label: "Ação → Meta" }]}
            value={direction} onChange={setDirection}
          />
          {bottleneckKeys.length > 0 && (
            <span className="fr-badge" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <AlertTriangle size={11} /> Gargalo detectado a partir de "Equipe necessária"
            </span>
          )}
        </div>
        <FunnelDiagram stages={ordered} onSelect={setActiveKey} activeKey={activeKey} />
        {activeStage && (
          <div style={{ marginTop: 14 }}>
            <Formula
              title={`Como "${activeStage.label}" foi calculado?`}
              formula={stageDetail[activeStage.key]?.formula}
              variables={(stageDetail[activeStage.key]?.vars || []).map(([name, value]) => ({ name, value }))}
            />
          </div>
        )}
        {!activeStage && <p className="fr-hint" style={{ marginTop: 10 }}>Clique em qualquer etapa para ver a fórmula e as variáveis que a compõem.</p>}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Grafo Eleitoral Operacional</h2>
        <p className="fr-desc">Estrutura da candidatura em quatro ramos. O ramo com gargalo aparece destacado.</p>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 14 }}>
          {[
            { title: "Território", icon: <Map size={14} />, items: d.territories.map((t) => `${t.name} — ${fmtInt(t.metaTerritorial)} votos`), gargalo: false },
            { title: "Públicos", icon: <Users size={14} />, items: [`${segmentsCount} segmentos configurados`], gargalo: false },
            { title: "Canais", icon: <Radio size={14} />, items: d.channelResults.filter((c) => c.enabled).map((c) => `${c.label} — ${fmtInt(c.contactsNeeded)} contatos`), gargalo: false },
            { title: "Equipes", icon: <UsersRound size={14} />, items: [`${cfg.team.coordenadores} coordenação`, `${cfg.team.mobilizadores} mobilização`], gargalo: bottleneckKeys.length > 0 },
          ].map((branch) => (
            <div key={branch.title} className="fr-card" style={{ padding: 12, borderColor: branch.gargalo ? "var(--danger)" : "var(--line)", background: branch.gargalo ? "var(--danger-soft)" : "var(--paper)" }}>
              <div className="fr-row" style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>{branch.icon} {branch.title}{branch.gargalo && <AlertTriangle size={13} color="var(--danger)" />}</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "var(--text-soft)" }}>
                {branch.items.slice(0, 5).map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: TERRITÓRIOS — pesos, distribuição da meta, matriz potencial x esforço.
   ========================================================================== */

const WEIGHT_LABELS = { eleitorado: "Eleitorado", historico: "Histórico eleitoral", comparecimento: "Comparecimento", presenca: "Presença territorial", capacidade: "Capacidade operacional", logistica: "Logística (custo)" };

function ViewTerritorios({ cfg, update, derived }) {
  const d = derived;
  const toggleTerritorio = (id) => {
    const sel = cfg.territoriosSelecionados.includes(id)
      ? cfg.territoriosSelecionados.filter((x) => x !== id)
      : [...cfg.territoriosSelecionados, id];
    update({ territoriosSelecionados: sel.length ? sel : cfg.territoriosSelecionados });
  };
  const setWeight = (key, v) => update({ territorialWeights: { ...cfg.territorialWeights, [key]: v } });

  const matrixData = d.territories.map((t) => ({
    name: t.name, potencial: Math.round(t.score * 1000) / 10, esforco: Math.round(t.logisticaNorm * 100),
  }));

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Capilaridade" title="Territórios"
        desc="Selecione territórios, ajuste os pesos e veja como a meta ajustada se distribui no mapa operacional." />

      {cfg.uf !== "SP" && (
        <div className="fr-alert info"><Info size={15} /><span>Esta demonstração detalha o recorte município a município apenas para São Paulo (o exemplo obrigatório do briefing, Deputado Federal/SP). Para {getUf(cfg).name}, o cálculo usa o estado como território único até a importação real do TSE.</span></div>
      )}

      <div className="fr-grid" style={{ gridTemplateColumns: "1.3fr 1fr", alignItems: "start" }}>
        <div className="fr-card">
          <h2 className="fr-h2">Distribuição da meta por território</h2>
          <p className="fr-desc">META_TERRITORIAL = META_TOTAL × PESO_TERRITORIAL (pesos editáveis ao lado)</p>
          <div className="fr-scroll-x" style={{ marginTop: 12 }}>
            <table className="fr-table">
              <thead><tr><th>Território</th><th className="num">Eleitorado (M)</th><th className="num">Comparecimento hist.</th><th className="num">Score</th><th className="num">Participação</th><th className="num">Meta territorial</th></tr></thead>
              <tbody>
                {d.territories.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">{fmtDec(t.eleitoradoM, 1)}</td>
                    <td className="num">{fmtPct(t.comparecimentoNorm)}</td>
                    <td className="num">{fmtDec(t.score, 2)}</td>
                    <td className="num">{fmtPct(t.share)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtInt(t.metaTerritorial)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cfg.uf === "SP" && (
            <>
              <div className="fr-hint" style={{ marginTop: 12, marginBottom: 6 }}>Municípios incluídos na distribuição:</div>
              <div className="fr-chip-list">
                {SP_MUNICIPIOS.map((m) => (
                  <button key={m.id} type="button" className={cx("fr-chip", cfg.territoriosSelecionados.includes(m.id) && "on")} onClick={() => toggleTerritorio(m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="fr-card">
          <h2 className="fr-h2">Pesos territoriais</h2>
          <ProvBadge type="premissa" />
          <div className="fr-stack" style={{ marginTop: 10, gap: 12 }}>
            {Object.entries(cfg.territorialWeights).map(([key, val]) => (
              <SliderField key={key} label={WEIGHT_LABELS[key]} value={val} onChange={(v) => setWeight(key, v)} min={0} max={0.6} step={0.01} />
            ))}
          </div>
          <div className="fr-hint" style={{ marginTop: 8 }}>Soma atual: <b className="fr-num">{fmtPct(d.weightSum)}</b> (ideal: 100%)</div>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Matriz de prioridade — potencial × esforço</h2>
        <p className="fr-desc">Classificação operacional derivada dos parâmetros inseridos — não é um veredito sobre "melhores territórios".</p>
        <div style={{ height: 300, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#E1E4EA" />
              <XAxis type="number" dataKey="potencial" name="Potencial (score)" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <YAxis type="number" dataKey="esforco" name="Esforço logístico" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <ZAxis range={[80, 80]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} />
              <ReferenceLine x={matrixData.length ? matrixData.reduce((a, m) => a + m.potencial, 0) / matrixData.length : 0} stroke="#C7CCD6" />
              <ReferenceLine y={matrixData.length ? matrixData.reduce((a, m) => a + m.esforco, 0) / matrixData.length : 0} stroke="#C7CCD6" />
              <Scatter data={matrixData} fill="#21418F" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: PÚBLICOS — segmentação territorial e demográfica agregada. Nunca
   infere atributos sensíveis de indivíduos (seção 11 e 30 do briefing).
   ========================================================================== */

const FAIXAS_ETARIAS_PADRAO = ["16–24", "25–34", "35–44", "45–59", "60+"];
const TEMATICAS_SUGERIDAS = ["Educação", "Saúde", "Mobilidade", "Meio ambiente", "Agricultura", "Cultura", "Trabalho", "Empreendedorismo", "Juventude", "Direitos humanos", "Desenvolvimento regional"];

function ViewPublicos({ cfg, update }) {
  const publicos = cfg.publicos || { tematicos: [], faixas: FAIXAS_ETARIAS_PADRAO };
  const [novoTema, setNovoTema] = useState("");

  const toggleTema = (tema) => {
    const atual = publicos.tematicos.includes(tema) ? publicos.tematicos.filter((t) => t !== tema) : [...publicos.tematicos, tema];
    update({ publicos: { ...publicos, tematicos: atual } });
  };
  const addTemaCustom = () => {
    if (novoTema.trim() && !publicos.tematicos.includes(novoTema.trim())) {
      update({ publicos: { ...publicos, tematicos: [...publicos.tematicos, novoTema.trim()] } });
      setNovoTema("");
    }
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Microsegmentação" title="Públicos"
        desc="Segmentos geográficos, demográficos agregados e temáticos — nunca perfis individuais." />

      <div className="fr-alert info"><ShieldCheck size={15} /><span>Este módulo trabalha exclusivamente com agregados estatísticos e classificações voluntárias da equipe. O sistema não infere atributos sensíveis de indivíduos nem produz listas de pessoas por características pessoais.</span></div>

      <div className="fr-grid fr-grid-2">
        <div className="fr-card">
          <h2 className="fr-h2">Geográficas</h2>
          <ProvBadge type="oficial" />
          <p className="fr-desc" style={{ marginTop: 6 }}>UF, município, zona, local, seção, urbano/rural — herdadas do módulo Territórios.</p>
          <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12.5 }}>
            <li>{getUf(cfg).name} ({getUf(cfg).regiao})</li>
            {cfg.uf === "SP" && SP_MUNICIPIOS.filter((m) => cfg.territoriosSelecionados.includes(m.id)).map((m) => <li key={m.id}>{m.name}</li>)}
          </ul>
        </div>

        <div className="fr-card">
          <h2 className="fr-h2">Demográficas agregadas</h2>
          <ProvBadge type="oficial" />
          <p className="fr-desc" style={{ marginTop: 6 }}>Faixas etárias publicadas pelo TSE para o eleitorado da circunscrição (agregado, sem identificação individual).</p>
          <div className="fr-chip-list" style={{ marginTop: 10 }}>
            {FAIXAS_ETARIAS_PADRAO.map((f) => <span key={f} className="fr-chip on" style={{ cursor: "default" }}>{f}</span>)}
          </div>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Temáticas</h2>
        <ProvBadge type="premissa" />
        <p className="fr-desc" style={{ marginTop: 6 }}>Segmentos voluntários ou contextuais criados pela equipe (pautas, agendas, territórios de interesse).</p>
        <div className="fr-chip-list" style={{ marginTop: 10 }}>
          {TEMATICAS_SUGERIDAS.map((t) => (
            <button key={t} type="button" className={cx("fr-chip", publicos.tematicos.includes(t) && "on")} onClick={() => toggleTema(t)}>{t}</button>
          ))}
        </div>
        <div className="fr-row" style={{ marginTop: 12, maxWidth: 360 }}>
          <input type="text" placeholder="Novo segmento temático" value={novoTema} onChange={(e) => setNovoTema(e.target.value)}
            style={{ fontFamily: "var(--font-sans)", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 3, flex: 1, fontSize: 12.5 }} />
          <button className="fr-btn sm" onClick={addTemaCustom}><Plus size={13} /> Adicionar</button>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Socioeconômicas (integração futura)</h2>
        <p className="fr-desc">Renda agregada, infraestrutura, mobilidade e indicadores sociais/ambientais — via IBGE/Censo. Não conectado nesta demonstração; ver módulo Dados.</p>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: CANAIS — cada canal com cadeia própria, matriz canal × conversão,
   e o multiplicador de rede (dobras de funil, seções 9, 10, 12).
   ========================================================================== */

function ViewCanais({ cfg, update, derived }) {
  const d = derived;
  const setChannel = (id, patch) => update({ channels: { ...cfg.channels, [id]: { ...cfg.channels[id], ...patch } } });
  const setChannelParam = (id, key, v) => setChannel(id, { params: { ...cfg.channels[id].params, [key]: v } });
  const setNetwork = (patch) => update({ network: { ...cfg.network, ...patch } });

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Funil de conversão" title="Canais"
        desc="Cada canal tem cadeia, conversão e unidade operacional próprias — nunca uma taxa média única para todos." />

      <div className="fr-alert info"><Info size={15} /><span>Por padrão, 100% da meta ajustada está alocada ao corpo a corpo (15% de conversão) — reproduzindo exatamente o exemplo obrigatório do briefing. Redistribua a participação entre os canais abaixo para diversificar o funil; é essa diversificação, e não uma taxa média única, que o modelo recomenda para reduzir o risco de depender de um único canal.</span></div>

      <div className="fr-card">
        <h2 className="fr-h2">Matriz canal × conversão</h2>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead><tr><th>Canal</th><th className="num">Participação na meta</th><th className="num">Conversão (contato→apoio)</th><th className="num">Contatos necessários</th><th className="num">Unidade operacional necessária</th></tr></thead>
            <tbody>
              {d.channelResults.map((c) => (
                <tr key={c.id} style={{ opacity: c.enabled ? 1 : 0.4 }}>
                  <td>{c.label}</td>
                  <td className="num">{fmtPct(c.share)}</td>
                  <td className="num">{fmtPct(c.conversion)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtInt(c.contactsNeeded)}</td>
                  <td className="num">{fmtInt(c.actionsNeeded)} {c.unit}</td>
                </tr>
              ))}
              <tr><td style={{ fontWeight: 700 }}>Total</td><td className="num fr-num">{fmtPct(d.enabledShareSum)}</td><td /><td className="num fr-num" style={{ fontWeight: 700 }}>{fmtInt(d.totalContactsNeeded)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        {Math.abs(d.enabledShareSum - 1) > 0.01 && <p className="fr-hint" style={{ marginTop: 8, color: "var(--premissa)" }}>A soma das participações deveria fechar em 100%.</p>}
      </div>

      <div className="fr-grid fr-grid-2">
        {CHANNEL_DEFS.map((def) => {
          const st = cfg.channels[def.id];
          const res = d.channelResults.find((c) => c.id === def.id);
          const Icon = ICONS[def.icon] || Radio;
          return (
            <div key={def.id} className="fr-card">
              <div className="fr-row" style={{ justifyContent: "space-between" }}>
                <div className="fr-row" style={{ fontWeight: 700, fontSize: 13 }}><Icon size={15} /> {def.label}</div>
                <label className="fr-row" style={{ fontSize: 11, gap: 5 }}>
                  <input type="checkbox" checked={st.enabled} onChange={(e) => setChannel(def.id, { enabled: e.target.checked })} /> ativo
                </label>
              </div>
              <div className="fr-stack" style={{ marginTop: 10, gap: 10 }}>
                <SliderField label="Participação na meta ajustada" value={st.share} onChange={(v) => setChannel(def.id, { share: v })} min={0} max={1} step={0.01} />
                <SliderField label="Conversão (contato → apoio declarado)" value={st.conversion} onChange={(v) => setChannel(def.id, { conversion: v })} min={0} max={1} step={0.01} />
                {def.fields.map((f) => (
                  f.pct
                    ? <SliderField key={f.key} label={f.label} value={st.params[f.key]} onChange={(v) => setChannelParam(def.id, f.key, v)} min={f.min} max={f.max} step={f.step} />
                    : <NumberField key={f.key} label={f.label} value={st.params[f.key]} onChange={(v) => setChannelParam(def.id, f.key, v)} min={f.min} max={f.max} step={f.step} />
                ))}
              </div>
              <div className="fr-divider" />
              <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span>Contatos necessários</span><b className="fr-num">{fmtInt(res?.contactsNeeded)}</b>
              </div>
              <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span>{def.unit} necessári{def.unit.endsWith("s") ? "as" : "os"}</span><b className="fr-num">{fmtInt(res?.actionsNeeded)}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Multiplicador de rede — dobras do funil</h2>
        <p className="fr-desc">NOVOS_CONTATOS = REDE_BRUTA × TAXA_ATIVAÇÃO × (1 − TAXA_SOBREPOSIÇÃO), aplicado em camadas.</p>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 12 }}>
          <NumberField label="Lideranças na base" value={cfg.network.numLiderancas} onChange={(v) => setNetwork({ numLiderancas: v })} min={0} step={10} prov="premissa" />
          <NumberField label="Contatos potenciais por camada (fanout)" value={cfg.network.fanout} onChange={(v) => setNetwork({ fanout: v })} min={1} max={100} step={1} prov="premissa" />
          <SliderField label="Taxa de ativação" value={cfg.network.taxaAtivacao} onChange={(v) => setNetwork({ taxaAtivacao: v })} />
          <SliderField label="Taxa de sobreposição" value={cfg.network.taxaSobreposicao} onChange={(v) => setNetwork({ taxaSobreposicao: v })} />
        </div>
        <div style={{ marginTop: 16 }}>
          <NetworkTree trail={d.networkTrail} />
        </div>
        <p className="fr-hint" style={{ marginTop: 8 }}>Alcance final estimado após {cfg.network.camadas} camada(s): <b className="fr-num">{fmtInt(d.networkFinalReach)}</b> pessoas — compare com os contatos necessários do canal "Lideranças / rede organizada" acima.</p>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: EQUIPES — capacidade operacional diária × demanda (seção 18).
   ========================================================================== */

function ViewEquipes({ cfg, update, derived }) {
  const d = derived;
  const setTeam = (patch) => update({ team: { ...cfg.team, ...patch } });
  const statusLabel = { insuficiente: "Capacidade insuficiente", suficiente: "Capacidade suficiente", excedente: "Excesso de capacidade", sem_demanda: "Sem demanda calculada" };
  const statusColor = { insuficiente: "var(--danger)", suficiente: "var(--oficial)", excedente: "var(--estimativa)", sem_demanda: "var(--text-faint)" };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Estrutura" title="Equipes" desc="Capacidade operacional diária comparada à demanda gerada pelo funil." />

      <div className="fr-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="fr-card">
          <h2 className="fr-h2">Entradas de capacidade</h2>
          <ProvBadge type="premissa" />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <NumberField label="Coordenadores" value={cfg.team.coordenadores} onChange={(v) => setTeam({ coordenadores: v })} min={0} step={1} />
            <NumberField label="Mobilizadores" value={cfg.team.mobilizadores} onChange={(v) => setTeam({ mobilizadores: v })} min={0} step={1} />
            <NumberField label="Horas disponíveis / dia" value={cfg.team.horasDia} onChange={(v) => setTeam({ horasDia: v })} min={0} max={16} step={0.5} />
            <NumberField label="Contatos / hora / mobilizador" value={cfg.team.contatosHora} onChange={(v) => setTeam({ contatosHora: v })} min={0} step={0.5} />
            <NumberField label="Reuniões / dia (capacidade)" value={cfg.team.reunioesDia} onChange={(v) => setTeam({ reunioesDia: v })} min={0} step={1} />
            <NumberField label="Contatos / reunião (capacidade)" value={cfg.team.contatosPorReuniao} onChange={(v) => setTeam({ contatosPorReuniao: v })} min={0} step={1} />
            <NumberField label="Eventos / dia (capacidade)" value={cfg.team.eventosDia} onChange={(v) => setTeam({ eventosDia: v })} min={0} step={0.1} />
            <NumberField label="Contatos / evento (capacidade)" value={cfg.team.contatosPorEvento} onChange={(v) => setTeam({ contatosPorEvento: v })} min={0} step={10} />
          </div>
        </div>

        <div className="fr-stack">
          <div className="fr-card">
            <h2 className="fr-h2">Capacidade operacional diária</h2>
            <div className="fr-kpi-value" style={{ fontSize: 30, marginTop: 6 }}>{fmtInt(d.dailyCapacity)}</div>
            <p className="fr-desc">vs. demanda operacional diária de <b className="fr-num">{fmtInt(d.dailyContacts)}</b> contatos</p>
            <div className="fr-row" style={{ marginTop: 10, gap: 6 }}>
              <span className="fr-badge" style={{ background: "transparent", border: `1px solid ${statusColor[d.capacityStatus]}`, color: statusColor[d.capacityStatus] }}>
                {d.capacityStatus === "insuficiente" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} {statusLabel[d.capacityStatus]}
              </span>
            </div>
            <div className="fr-divider" />
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Gap diário</span><b className="fr-num" style={{ color: d.capacityGap < 0 ? "var(--danger)" : "var(--oficial)" }}>{d.capacityGap >= 0 ? "+" : ""}{fmtInt(d.capacityGap)}</b></div>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Meta por equipe (coordenação)</span><b className="fr-num">{fmtInt(d.metaPorEquipe)}</b></div>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Meta por mobilizador / dia</span><b className="fr-num">{fmtInt(d.metaPorMobilizador)}</b></div>
          </div>
          <Formula title="Como a capacidade é calculada" formula={"CAPACIDADE_DIÁRIA =\n  MOBILIZADORES × HORAS_DIA × CONTATOS_HORA\n+ REUNIÕES_DIA × CONTATOS_POR_REUNIÃO\n+ EVENTOS_DIA × CONTATOS_POR_EVENTO"} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: AGENDA — planejamento temporal (seção 17).
   ========================================================================== */

function ViewAgenda({ cfg, update, derived }) {
  const d = derived;
  const setAgenda = (patch) => update({ agenda: { ...cfg.agenda, ...patch } });
  const inicio = new Date(cfg.agenda.dataInicio);
  const fim = new Date(cfg.agenda.dataFim);
  const diasCorridos = Math.max(0, Math.round((fim - inicio) / 86400000));
  const diasAtivosCalc = Math.max(0, diasCorridos - cfg.agenda.diasDescanso);

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Tempo" title="Agenda" desc="Datas, dias ativos por frente e metas diária/semanal/por equipe/por mobilizador." />
      <div className="fr-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="fr-card">
          <h2 className="fr-h2">Janela de campanha</h2>
          <ProvBadge type="premissa" />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <div className="fr-field"><div className="fr-field-label"><span>Data inicial</span></div><input type="date" value={cfg.agenda.dataInicio} onChange={(e) => setAgenda({ dataInicio: e.target.value })} /></div>
            <div className="fr-field"><div className="fr-field-label"><span>Data final</span></div><input type="date" value={cfg.agenda.dataFim} onChange={(e) => setAgenda({ dataFim: e.target.value })} /></div>
            <NumberField label="Dias de rua" value={cfg.agenda.diasRua} onChange={(v) => setAgenda({ diasRua: v })} min={0} />
            <NumberField label="Dias digitais" value={cfg.agenda.diasDigitais} onChange={(v) => setAgenda({ diasDigitais: v })} min={0} />
            <NumberField label="Dias de eventos" value={cfg.agenda.diasEventos} onChange={(v) => setAgenda({ diasEventos: v })} min={0} />
            <NumberField label="Dias de descanso" value={cfg.agenda.diasDescanso} onChange={(v) => setAgenda({ diasDescanso: v })} min={0} />
          </div>
          <div className="fr-divider" />
          <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Dias corridos no período</span><b className="fr-num">{fmtInt(diasCorridos)}</b></div>
          <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Dias ativos calculados</span><b className="fr-num">{fmtInt(diasAtivosCalc)}</b></div>
          <button className="fr-btn sm" style={{ marginTop: 10 }} onClick={() => update({ campaignDays: diasAtivosCalc })}><RefreshCw size={12} /> Usar {fmtInt(diasAtivosCalc)} como dias de campanha</button>
          <p className="fr-hint" style={{ marginTop: 8 }}>"Dias de campanha operacional" (usado no Funil Reverso) é hoje <b className="fr-num">{fmtInt(cfg.campaignDays)}</b>.</p>
        </div>

        <div className="fr-stack">
          <div className="fr-card">
            <h2 className="fr-h2">Metas derivadas</h2>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5, marginTop: 8 }}><span>Meta diária</span><b className="fr-num">{fmtInt(d.dailyContacts)}</b></div>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Meta semanal</span><b className="fr-num">{fmtInt(d.weeklyContacts)}</b></div>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Meta por equipe (coordenação)</span><b className="fr-num">{fmtInt(d.metaPorEquipe)}</b></div>
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>Meta por mobilizador / dia</span><b className="fr-num">{fmtInt(d.metaPorMobilizador)}</b></div>
          </div>
          <div className="fr-card">
            <h2 className="fr-h2">Referência do calendário eleitoral 2026</h2>
            <ProvBadge type="oficial" />
            <p className="fr-desc" style={{ marginTop: 6 }}>1º turno: 4 de outubro de 2026 · 2º turno (se houver): 25 de outubro de 2026. Confirme sempre no site do TSE, pois prazos podem sofrer resoluções específicas por pleito.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: ORÇAMENTO — custo por contato/apoio/território (seção 19).
   ========================================================================== */

function ViewOrcamento({ cfg, update, derived }) {
  const d = derived;
  const setBudget = (patch) => update({ budget: { ...cfg.budget, ...patch } });
  const gapColor = d.budgetGap >= 0 ? "var(--oficial)" : "var(--danger)";
  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Recursos" title="Orçamento" desc="Custo estimado do plano — nunca apresentado como garantia de resultado." />
      <div className="fr-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="fr-card">
          <h2 className="fr-h2">Premissas de custo</h2>
          <ProvBadge type="premissa" />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <NumberField label="Custo por contato (R$)" value={cfg.budget.custoPorContato} onChange={(v) => setBudget({ custoPorContato: v })} min={0} step={0.05} />
            <NumberField label="Custo por evento (R$)" value={cfg.budget.custoPorEvento} onChange={(v) => setBudget({ custoPorEvento: v })} min={0} step={100} />
            <NumberField label="Custo logístico / dia (R$)" value={cfg.budget.custoLogisticoDia} onChange={(v) => setBudget({ custoLogisticoDia: v })} min={0} step={50} />
            <NumberField label="Orçamento total disponível (R$)" value={cfg.budget.orcamentoTotal} onChange={(v) => setBudget({ orcamentoTotal: v })} min={0} step={1000} />
          </div>
        </div>
        <div className="fr-stack">
          <div className="fr-grid fr-grid-2">
            <Kpi label="Custo total estimado" value={fmtMoney(d.totalCost)} prov="estimativa" />
            <Kpi label="Custo por apoio" value={fmtMoney(d.costPerSupport)} prov="estimativa" />
          </div>
          <div className="fr-card">
            <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>Saldo vs. orçamento disponível</span>
              <b className="fr-num" style={{ color: gapColor }}>{d.budgetGap >= 0 ? "+" : ""}{fmtMoney(d.budgetGap)}</b>
            </div>
          </div>
          <Formula title="Como o custo total é calculado" formula={"CUSTO_TOTAL =\n  CONTATOS_NECESSÁRIOS × CUSTO_POR_CONTATO\n+ EVENTOS_TOTAIS × CUSTO_POR_EVENTO\n+ DIAS_ATIVOS × CUSTO_LOGÍSTICO_DIA\n\nCUSTO_POR_APOIO = CUSTO_TOTAL / META_AJUSTADA"} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: CENÁRIOS — quatro modelos padrão + cenários personalizados (seção 24).
   ========================================================================== */

function computeScenarioSummary(cfg, presetOrCustom) {
  const scenario = scenarioEngine.apply(cfg.abstentionRate, cfg.fidelityRate, presetOrCustom);
  const turnout = electorateEngine.turnoutFromAbstention(scenario.abstentionRate);
  const adjustedGoal = funnelEngine.adjustedGoal(cfg.voteGoal, scenario.fidelityRate, turnout);
  let totalContacts = 0;
  CHANNEL_DEFS.forEach((def) => {
    const st = cfg.channels[def.id];
    if (!st.enabled) return;
    const conv = clamp01(st.conversion * scenario.conversionMultiplier);
    totalContacts += funnelEngine.contactsForGoalShare(adjustedGoal, st.share, conv);
  });
  const capacity = capacityEngine.dailyCapacity(cfg.team) * (scenario.capacityMultiplier || 1);
  const dailyContacts = funnelEngine.dailyTarget(totalContacts, cfg.campaignDays);
  return { adjustedGoal, totalContacts, dailyContacts, capacity, gap: capacity - dailyContacts };
}

function ViewCenarios({ cfg, update, derived }) {
  const allPresets = [SCENARIO_PRESETS.central, SCENARIO_PRESETS.conservador, SCENARIO_PRESETS.otimista, SCENARIO_PRESETS.maior_mobilizacao, SCENARIO_PRESETS.menor_conversao, SCENARIO_PRESETS.restricao_territorial, ...(cfg.customScenarios || [])];
  const [novo, setNovo] = useState({ label: "", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1 });

  const criarCenario = () => {
    if (!novo.label.trim()) return;
    const s = { id: uid("cenario"), label: novo.label.trim(), abstentionDelta: novo.abstentionDelta, fidelityDelta: novo.fidelityDelta, conversionMultiplier: novo.conversionMultiplier, custom: true };
    update({ customScenarios: [...(cfg.customScenarios || []), s] });
    setNovo({ label: "", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1 });
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Incerteza controlada" title="Cenários" desc="Compare hipóteses diferentes sobre comparecimento, fidelidade, conversão e capacidade." />

      <div className="fr-card">
        <h2 className="fr-h2">Cenário ativo</h2>
        <div className="fr-chip-list" style={{ marginTop: 10 }}>
          {allPresets.map((p) => (
            <button key={p.id} type="button" className={cx("fr-chip", cfg.scenarioId === p.id && "on")} onClick={() => update({ scenarioId: p.id })}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Comparação entre cenários</h2>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead><tr><th>Cenário</th><th className="num">Meta ajustada</th><th className="num">Contatos necessários</th><th className="num">Contatos / dia</th><th className="num">Capacidade / dia</th><th className="num">Gap</th></tr></thead>
            <tbody>
              {allPresets.map((p) => {
                const s = computeScenarioSummary(cfg, p);
                const active = cfg.scenarioId === p.id;
                return (
                  <tr key={p.id} style={active ? { background: "var(--brand-soft)" } : undefined}>
                    <td style={{ fontWeight: active ? 700 : 400 }}>{p.label}{p.custom && <span className="fr-hint"> (personalizado)</span>}</td>
                    <td className="num">{fmtInt(s.adjustedGoal)}</td>
                    <td className="num">{fmtInt(s.totalContacts)}</td>
                    <td className="num">{fmtInt(s.dailyContacts)}</td>
                    <td className="num">{fmtInt(s.capacity)}</td>
                    <td className="num" style={{ color: s.gap < 0 ? "var(--danger)" : "var(--oficial)", fontWeight: 700 }}>{s.gap >= 0 ? "+" : ""}{fmtInt(s.gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Criar cenário personalizado</h2>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 10 }}>
          <div className="fr-field"><div className="fr-field-label"><span>Nome</span></div><input type="text" value={novo.label} onChange={(e) => setNovo((n) => ({ ...n, label: e.target.value }))} placeholder="Ex.: Chuvas em outubro" /></div>
          <NumberField label="Delta de abstenção" value={novo.abstentionDelta} onChange={(v) => setNovo((n) => ({ ...n, abstentionDelta: v }))} step={0.01} suffix="ex.: 0.05 = +5pp" />
          <NumberField label="Delta de fidelidade" value={novo.fidelityDelta} onChange={(v) => setNovo((n) => ({ ...n, fidelityDelta: v }))} step={0.01} suffix="ex.: -0.05 = −5pp" />
          <NumberField label="Multiplicador de conversão" value={novo.conversionMultiplier} onChange={(v) => setNovo((n) => ({ ...n, conversionMultiplier: v }))} step={0.05} suffix="1 = sem alteração" />
        </div>
        <button className="fr-btn primary sm" style={{ marginTop: 10 }} onClick={criarCenario}><Plus size={13} /> Salvar cenário</button>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: SIMULAÇÕES — Monte Carlo (seção 20). Intervalos de incerteza, não
   previsão eleitoral.
   ========================================================================== */

function ViewSimulacoes({ cfg }) {
  const [bounds, setBounds] = useState({
    abstentionMin: Math.max(0, cfg.abstentionRate - 0.07), abstentionMax: cfg.abstentionRate + 0.07,
    fidelityMin: Math.max(0, cfg.fidelityRate - 0.12), fidelityMax: Math.min(1, cfg.fidelityRate + 0.08),
    conversionMin: 0.08, conversionMax: 0.22, iterations: 3000,
  });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const mc = runMonteCarlo({
        voteGoal: cfg.voteGoal,
        abstentionBounds: { min: bounds.abstentionMin, mode: cfg.abstentionRate, max: bounds.abstentionMax },
        fidelityBounds: { min: bounds.fidelityMin, mode: cfg.fidelityRate, max: bounds.fidelityMax },
        conversionBounds: { min: bounds.conversionMin, mode: (bounds.conversionMin + bounds.conversionMax) / 2, max: bounds.conversionMax },
        iterations: bounds.iterations,
      });
      setResult(mc);
      setRunning(false);
    }, 30);
  };

  const chartData = result ? ["min", "p10", "p25", "p50", "p75", "p90", "max"].map((k) => ({ name: k.toUpperCase(), contatos: result.contacts[k], meta: result.adjustedGoal[k] })) : [];

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Modo pesquisador" title="Simulações" desc="Milhares de simulações combinando comparecimento, fidelidade e conversão — o objetivo é mostrar a faixa de incerteza, não prever o resultado eleitoral." />
      <div className="fr-card">
        <div className="fr-grid fr-grid-4">
          <NumberField label="Abstenção — mínimo" value={bounds.abstentionMin} onChange={(v) => setBounds((b) => ({ ...b, abstentionMin: v }))} step={0.01} />
          <NumberField label="Abstenção — máximo" value={bounds.abstentionMax} onChange={(v) => setBounds((b) => ({ ...b, abstentionMax: v }))} step={0.01} />
          <NumberField label="Fidelidade — mínimo" value={bounds.fidelityMin} onChange={(v) => setBounds((b) => ({ ...b, fidelityMin: v }))} step={0.01} />
          <NumberField label="Fidelidade — máximo" value={bounds.fidelityMax} onChange={(v) => setBounds((b) => ({ ...b, fidelityMax: v }))} step={0.01} />
          <NumberField label="Conversão — mínimo" value={bounds.conversionMin} onChange={(v) => setBounds((b) => ({ ...b, conversionMin: v }))} step={0.01} />
          <NumberField label="Conversão — máximo" value={bounds.conversionMax} onChange={(v) => setBounds((b) => ({ ...b, conversionMax: v }))} step={0.01} />
          <NumberField label="Iterações" value={bounds.iterations} onChange={(v) => setBounds((b) => ({ ...b, iterations: v }))} step={500} min={500} max={20000} />
        </div>
        <button className="fr-btn primary" style={{ marginTop: 12 }} onClick={run} disabled={running}><Dice5 size={14} /> {running ? "Simulando…" : "Rodar simulação"}</button>
      </div>

      {result && (
        <div className="fr-card">
          <h2 className="fr-h2">Distribuição — contatos necessários ({fmtInt(result.iterations)} simulações)</h2>
          <div style={{ height: 300, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 6 }}>
                <CartesianGrid stroke="#E1E4EA" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtInt(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="contatos" fill="#3D6BA8" radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="fr-grid fr-grid-5" style={{ marginTop: 14 }}>
            <Kpi label="P10" value={fmtInt(result.contacts.p10)} prov="estimativa" />
            <Kpi label="P25" value={fmtInt(result.contacts.p25)} prov="estimativa" />
            <Kpi label="Mediana (P50)" value={fmtInt(result.contacts.p50)} prov="estimativa" />
            <Kpi label="P75" value={fmtInt(result.contacts.p75)} prov="estimativa" />
            <Kpi label="P90" value={fmtInt(result.contacts.p90)} prov="estimativa" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   VIEW: DADOS — registro de fontes (seção 5, 28) e status dos conectores.
   ========================================================================== */

const DATA_SOURCE_REGISTRY = [
  { indicador: "Eleitorado por UF", fonte: "Portal de Dados Abertos do TSE — dataset \"Eleitorado Atual\"", atualizado: "—", ano: "2026", nivel: "UF / Município / Zona / Seção", metodologia: "Extração direta do cadastro eleitoral", tipo: "oficial" },
  { indicador: "Candidatos e vagas", fonte: "Portal de Dados Abertos do TSE — dataset \"Candidatos\"", atualizado: "—", ano: "2026", nivel: "UF / Município", metodologia: "Registro de candidaturas (DivulgaCand)", tipo: "oficial" },
  { indicador: "Resultados eleitorais anteriores", fonte: "Portal de Dados Abertos do TSE — resultados por seção", atualizado: "—", ano: "2022 / 2018", nivel: "Seção / Zona / Município / UF", metodologia: "Totalização oficial", tipo: "historico" },
  { indicador: "Comparecimento e abstenção (demonstração)", fonte: "Valor ilustrativo — não conectado", atualizado: "Nesta sessão", ano: "N/A", nivel: "UF", metodologia: "Placeholder para fins de demonstração da arquitetura", tipo: "estimativa" },
  { indicador: "Taxas de conversão por canal", fonte: "Inseridas pela equipe de campanha", atualizado: "Contínuo", ano: "2026", nivel: "Canal", metodologia: "Premissa editável pelo usuário", tipo: "premissa" },
  { indicador: "Malha municipal / território", fonte: "IBGE — Malhas Territoriais e população estimada", atualizado: "—", ano: "2022 (Censo)", nivel: "Município", metodologia: "Não conectado nesta demonstração", tipo: "oficial" },
];

function ViewDados({ cfg }) {
  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Rastreabilidade" title="Dados" desc="Toda métrica calculada declara sua fonte. Uma estimativa nunca é exibida como se fosse dado oficial." />

      <div className="fr-grid fr-grid-3">
        <div className="fr-card">
          <div className="fr-row" style={{ justifyContent: "space-between" }}>
            <h2 className="fr-h2">TSE — Portal de Dados Abertos</h2>
            <span className="fr-badge" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Não conectado</span>
          </div>
          <p className="fr-desc" style={{ marginTop: 6 }}>dadosabertos.tse.jus.br — eleitorado, candidatos, resultados, prestação de contas, locais de votação. Distribuído em massa (CSV/ZIP por ano), sem autenticação; não é uma API REST tradicional.</p>
        </div>
        <div className="fr-card">
          <div className="fr-row" style={{ justifyContent: "space-between" }}>
            <h2 className="fr-h2">IBGE</h2>
            <span className="fr-badge" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Não conectado</span>
          </div>
          <p className="fr-desc" style={{ marginTop: 6 }}>Malhas territoriais, população estimada, indicadores do Censo — usados para cruzar com o eleitorado (o TSE não faz esse cruzamento nativamente).</p>
        </div>
        <div className="fr-card">
          <div className="fr-row" style={{ justifyContent: "space-between" }}>
            <h2 className="fr-h2">Fontes estaduais/municipais</h2>
            <span className="fr-badge" style={{ background: "var(--historico-soft)", color: "var(--historico)" }}>Variável por UF</span>
          </div>
          <p className="fr-desc" style={{ marginTop: 6 }}>Alguns TREs publicam webservices próprios (ex.: locais de votação em JSON). Conectores modulares, adicionados UF a UF.</p>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Registro de fontes por indicador</h2>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead><tr><th>Indicador</th><th>Fonte</th><th>Ano</th><th>Nível</th><th>Metodologia</th><th>Tipo</th></tr></thead>
            <tbody>
              {DATA_SOURCE_REGISTRY.map((r, i) => (
                <tr key={i}>
                  <td>{r.indicador}</td><td>{r.fonte}</td><td className="fr-mono">{r.ano}</td><td>{r.nivel}</td><td>{r.metodologia}</td>
                  <td><ProvBadge type={r.tipo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: RELATÓRIOS — exportação, modelos salvos e rastreamento operacional
   (planejado × realizado, seção 26 e 33). Persistência via localStorage —
   este é um site estático real, não um artifact do Claude.ai.
   ========================================================================== */

function readLocal(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCSV(rows) {
  return rows.map((r) => r.map((cell) => {
    const s = String(cell ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
}

function ViewRelatorios({ cfg, derived, onLoadModel }) {
  const d = derived;
  const [models, setModels] = useState(() => readLocal(STORAGE_KEYS.models, []));
  const [log, setLog] = useState(() => readLocal(STORAGE_KEYS.log, []));
  const [modelName, setModelName] = useState("Modelo de Planejamento v1.0");
  const [entry, setEntry] = useState({ data: new Date().toISOString().slice(0, 10), territorio: "", equipe: "", atividade: "", planejado: 0, realizado: 0 });

  const saveModel = () => {
    const list = [...models, { id: uid("modelo"), name: modelName || `Modelo ${models.length + 1}`, timestamp: new Date().toISOString(), cfg }];
    setModels(list); writeLocal(STORAGE_KEYS.models, list);
  };
  const deleteModel = (id) => {
    const list = models.filter((m) => m.id !== id);
    setModels(list); writeLocal(STORAGE_KEYS.models, list);
  };
  const addEntry = () => {
    const list = [...log, { ...entry, id: uid("log") }];
    setLog(list); writeLocal(STORAGE_KEYS.log, list);
    setEntry((e) => ({ ...e, planejado: 0, realizado: 0 }));
  };
  const removeEntry = (id) => {
    const list = log.filter((l) => l.id !== id);
    setLog(list); writeLocal(STORAGE_KEYS.log, list);
  };
  const clearAllData = () => {
    if (!window.confirm("Isso apaga modelos salvos e o registro operacional deste navegador. Continuar?")) return;
    writeLocal(STORAGE_KEYS.models, []); writeLocal(STORAGE_KEYS.log, []);
    setModels([]); setLog([]);
  };

  const exportJSON = () => {
    const payload = {
      geradoEm: new Date().toISOString(),
      cargo: d.office.label, uf: d.uf.name, cenario: d.preset.label,
      metaVotos: cfg.voteGoal, metaAjustada: d.adjustedGoal, contatosNecessarios: d.totalContactsNeeded,
      contatosDia: d.dailyContacts, capacidadeDia: d.dailyCapacity, custoEstimado: d.totalCost,
      territorios: d.territories.map((t) => ({ nome: t.name, metaTerritorial: Math.round(t.metaTerritorial) })),
      canais: d.channelResults.map((c) => ({ canal: c.label, contatosNecessarios: Math.round(c.contactsNeeded), unidadeOperacional: Math.round(c.actionsNeeded), unidade: c.unit })),
    };
    downloadBlob("plano-operacional.json", JSON.stringify(payload, null, 2), "application/json");
  };
  const exportCSV = () => {
    const rows = [["Território", "Meta territorial"], ...d.territories.map((t) => [t.name, Math.round(t.metaTerritorial)])];
    downloadBlob("plano-territorial.csv", toCSV(rows), "text/csv");
  };
  const exportChannelsCSV = () => {
    const rows = [["Canal", "Participação", "Conversão", "Contatos necessários", "Unidade operacional", "Quantidade"],
      ...d.channelResults.map((c) => [c.label, fmtPct(c.share), fmtPct(c.conversion), Math.round(c.contactsNeeded), c.unit, Math.round(c.actionsNeeded)])];
    downloadBlob("plano-canais.csv", toCSV(rows), "text/csv");
  };

  const totalPlanejado = log.reduce((a, l) => a + Number(l.planejado || 0), 0);
  const totalRealizado = log.reduce((a, l) => a + Number(l.realizado || 0), 0);
  const trackChart = log.map((l, i) => ({ name: `#${i + 1}`, planejado: Number(l.planejado || 0), realizado: Number(l.realizado || 0) }));

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Saída" title="Relatórios" desc="Exportação do plano, modelos salvos e rastreamento planejado × realizado." />

      <div className="fr-card">
        <h2 className="fr-h2">Exportar Plano Operacional</h2>
        <div className="fr-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button className="fr-btn primary" onClick={exportJSON}><Download size={14} /> JSON completo</button>
          <button className="fr-btn" onClick={exportCSV}><Download size={14} /> CSV — territórios</button>
          <button className="fr-btn" onClick={exportChannelsCSV}><Download size={14} /> CSV — canais</button>
        </div>
        <p className="fr-hint" style={{ marginTop: 8 }}>Exportação de relatório executivo em PDF e planilha completa (XLSX) ficam mais confiáveis geradas no servidor — ver observações técnicas no README do repositório.</p>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Modelos de planejamento salvos</h2>
        <div className="fr-row" style={{ marginTop: 10, maxWidth: 420 }}>
          <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} style={{ flex: 1, fontFamily: "var(--font-sans)", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 3, fontSize: 12.5 }} />
          <button className="fr-btn sm" onClick={saveModel}><Save size={13} /> Salvar modelo atual</button>
        </div>
        {models.length > 0 ? (
          <div className="fr-scroll-x" style={{ marginTop: 12 }}>
            <table className="fr-table">
              <thead><tr><th>Nome</th><th>Salvo em</th><th /></tr></thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="fr-mono">{new Date(m.timestamp).toLocaleString("pt-BR")}</td>
                    <td>
                      <div className="fr-row">
                        <button className="fr-btn sm" onClick={() => onLoadModel(m.cfg)}>Carregar</button>
                        <button className="fr-btn sm" onClick={() => deleteModel(m.id)}><X size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fr-hint" style={{ marginTop: 10 }}>Nenhum modelo salvo neste navegador ainda.</p>}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Rastreamento operacional — Planejado × Realizado</h2>
        <div className="fr-grid fr-grid-5" style={{ marginTop: 10 }}>
          <div className="fr-field"><div className="fr-field-label"><span>Data</span></div><input type="date" value={entry.data} onChange={(e) => setEntry((x) => ({ ...x, data: e.target.value }))} /></div>
          <div className="fr-field"><div className="fr-field-label"><span>Território</span></div><input type="text" value={entry.territorio} onChange={(e) => setEntry((x) => ({ ...x, territorio: e.target.value }))} /></div>
          <div className="fr-field"><div className="fr-field-label"><span>Equipe / atividade</span></div><input type="text" value={entry.atividade} onChange={(e) => setEntry((x) => ({ ...x, atividade: e.target.value }))} /></div>
          <NumberField label="Contatos planejados" value={entry.planejado} onChange={(v) => setEntry((x) => ({ ...x, planejado: v }))} min={0} />
          <NumberField label="Contatos realizados" value={entry.realizado} onChange={(v) => setEntry((x) => ({ ...x, realizado: v }))} min={0} />
        </div>
        <button className="fr-btn sm primary" style={{ marginTop: 10 }} onClick={addEntry}><Plus size={13} /> Registrar dia</button>

        {log.length > 0 && (
          <>
            <div className="fr-grid fr-grid-2" style={{ marginTop: 16 }}>
              <Kpi label="Total planejado" value={fmtInt(totalPlanejado)} />
              <Kpi label="Total realizado" value={fmtInt(totalRealizado)} sub={`${fmtPct(safeDiv(totalRealizado, totalPlanejado))} do planejado`} />
            </div>
            <div style={{ height: 220, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trackChart} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#E1E4EA" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="planejado" stroke="#9096AA" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="realizado" stroke="#21418F" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="fr-scroll-x" style={{ marginTop: 12 }}>
              <table className="fr-table">
                <thead><tr><th>Data</th><th>Território</th><th>Atividade</th><th className="num">Planejado</th><th className="num">Realizado</th><th /></tr></thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td className="fr-mono">{l.data}</td><td>{l.territorio}</td><td>{l.atividade}</td>
                      <td className="num">{fmtInt(l.planejado)}</td><td className="num">{fmtInt(l.realizado)}</td>
                      <td><button className="fr-icon-btn" onClick={() => removeEntry(l.id)}><X size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="fr-row" style={{ justifyContent: "flex-end" }}>
        <button className="fr-btn sm" onClick={clearAllData}>Limpar dados salvos neste navegador</button>
      </div>
    </div>
  );
}

/* ============================================================================
   CARD: regras jurídico-eleitorais — majoritário (2º turno, margem) e
   proporcional (quociente eleitoral, quociente partidário, D'Hondt).
   Parâmetros editáveis, nunca constantes fixas (seção 3).
   ========================================================================== */

function OfficeRulesCard({ cfg, update, derived }) {
  const office = derived.office;
  if (office.tipo === "majoritario") {
    const setMaj = (patch) => update({ majoritario: { ...cfg.majoritario, ...patch } });
    return (
      <div className="fr-card">
        <h2 className="fr-h2">Regras — eleição majoritária</h2>
        <p className="fr-desc">Vitória por maioria dos votos válidos; segundo turno quando nenhum candidato atinge maioria absoluta (cargos executivos, municípios com mais de 200 mil eleitores).</p>
        <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
          <label className="fr-row" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={cfg.majoritario.segundoTurno} onChange={(e) => setMaj({ segundoTurno: e.target.checked })} /> Considerar possibilidade de segundo turno
          </label>
          <SliderField label="Margem de segurança sobre a meta ajustada" value={cfg.majoritario.margemSeguranca} onChange={(v) => setMaj({ margemSeguranca: v })} min={0} max={0.3} />
        </div>
        <div className="fr-divider" />
        <div className="fr-row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
          <span>Meta com margem de segurança</span>
          <b className="fr-num">{fmtInt(derived.majoritarioResult?.minVotosSeguranca)}</b>
        </div>
      </div>
    );
  }
  if (office.tipo === "proporcional") {
    const p = cfg.proportional;
    const r = derived.proportionalResult;
    const setProp = (patch) => update({ proportional: { ...p, ...patch } });
    const setOutro = (id, votos) => setProp({ outrosPartidos: p.outrosPartidos.map((o) => (o.id === id ? { ...o, votos } : o)) });
    return (
      <div className="fr-card">
        <h2 className="fr-h2">Regras — eleição proporcional</h2>
        <p className="fr-desc">Quociente eleitoral, quociente partidário e distribuição das sobras (método D'Hondt / maiores médias). Parâmetros abaixo são editáveis — confirme sempre a resolução do TSE vigente para o pleito antes de uso real.</p>
        <div className="fr-grid fr-grid-3" style={{ marginTop: 12 }}>
          <NumberField label="Vagas em disputa" value={p.vagas} onChange={(v) => setProp({ vagas: v })} min={1} prov="historico" />
          <NumberField label="Votos válidos da circunscrição" value={p.votosValidosCircunscricao} onChange={(v) => setProp({ votosValidosCircunscricao: v })} min={0} step={10000} prov="premissa" />
          <NumberField label="Votação estimada da minha legenda" value={p.votosPartido} onChange={(v) => setProp({ votosPartido: v })} min={0} step={10000} prov="premissa" />
        </div>
        <div className="fr-grid fr-grid-2" style={{ marginTop: 10 }}>
          <Kpi label="Quociente eleitoral (QE)" value={fmtInt(r.qe)} prov="estimativa" />
          <Kpi label="Quociente partidário (QP)" value={fmtInt(r.qp)} sub="cadeiras via quociente, antes das sobras" prov="estimativa" />
        </div>
        <div className="fr-divider" />
        <h2 className="fr-h2" style={{ fontSize: 13 }}>Simulador de sobras — método D'Hondt</h2>
        <div className="fr-stack" style={{ marginTop: 8, gap: 6 }}>
          {p.outrosPartidos.map((o) => (
            <div key={o.id} className="fr-row">
              <span style={{ flex: 1, fontSize: 12 }}>{o.nome}</span>
              <input type="number" value={o.votos} onChange={(e) => setOutro(o.id, parseFloat(e.target.value) || 0)} style={{ width: 130 }} />
            </div>
          ))}
        </div>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead><tr><th>Legenda</th><th className="num">Votos</th><th className="num">Cadeiras (D'Hondt)</th></tr></thead>
            <tbody>
              {r.allocation.map((a) => (
                <tr key={a.id} style={a.id === "own" ? { background: "var(--brand-soft)" } : undefined}>
                  <td style={{ fontWeight: a.id === "own" ? 700 : 400 }}>{a.name}</td>
                  <td className="num">{fmtInt(a.votes)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{a.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-hint" style={{ marginTop: 8 }}>Cenário de competição interna — participação da minha candidatura no total de votos da legenda: <b className="fr-num">{fmtPct(r.faixaInternaShare)}</b>.</p>
      </div>
    );
  }
  return null;
}

/* ============================================================================
   SIDEBAR + BARRA DE CONTEXTO
   ========================================================================== */

const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  { id: "meta", label: "Meta Eleitoral", icon: Target },
  { id: "funil", label: "Funil Reverso", icon: Filter },
  { id: "territorios", label: "Territórios", icon: Map },
  { id: "publicos", label: "Públicos", icon: Users },
  { id: "canais", label: "Canais", icon: Radio },
  { id: "equipes", label: "Equipes", icon: UsersRound },
  { id: "agenda", label: "Agenda", icon: Calendar },
  { id: "orcamento", label: "Orçamento", icon: Banknote },
  { id: "cenarios", label: "Cenários", icon: GitBranch },
  { id: "simulacoes", label: "Simulações", icon: Dice5 },
  { id: "dados", label: "Dados", icon: Database },
  { id: "relatorios", label: "Relatórios", icon: FileText },
];

function Sidebar({ active, onSelect, mode, onModeChange, mobileOpen, onCloseMobile }) {
  return (
    <>
      {mobileOpen && <div className="fr-sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={cx("fr-sidebar", mobileOpen && "open")}>
        <div className="fr-brand-block">
          <div className="fr-brand-name">Funil Reverso de Eleição</div>
          <div className="fr-brand-sub">Transforme uma meta de votos em território, público, contatos, atividades, tempo e recursos.</div>
        </div>
        <nav className="fr-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={cx("fr-nav-item", active === item.id && "active")}
                onClick={() => { onSelect(item.id); onCloseMobile && onCloseMobile(); }}>
                <Icon size={15} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="fr-sidebar-foot">
          <div className="fr-hint" style={{ color: "var(--invert-soft)", marginBottom: 6 }}>Modo de exibição</div>
          <div className="fr-mode-toggle">
            <button className={cx("fr-mode-btn", mode === "assessor" && "active")} onClick={() => onModeChange("assessor")} type="button">Assessor</button>
            <button className={cx("fr-mode-btn", mode === "pesquisador" && "active")} onClick={() => onModeChange("pesquisador")} type="button">Pesquisador</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function TopContextBar({ cfg, update, derived, onOpenMobile }) {
  const office = derived.office;
  return (
    <>
      <div className="fr-mobile-topbar">
        <button className="fr-icon-btn" onClick={onOpenMobile} style={{ background: "transparent", borderColor: "var(--ink-line)", color: "#fff" }}><Menu size={16} /></button>
        <span className="fr-brand-name">Funil Reverso</span>
        <span style={{ width: 26 }} />
      </div>
      <div className="fr-topbar">
        <div className="fr-ctx-pill"><label>Eleição</label><span className="fr-mono">{cfg.eleicaoAno}</span></div>
        <div className="fr-ctx-pill">
          <label>Cargo</label>
          <select value={cfg.office} onChange={(e) => update({ office: e.target.value })}>
            {OFFICES.filter((o) => o.tipo !== "chapa").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="fr-ctx-pill">
          <label>UF</label>
          <select value={cfg.uf} onChange={(e) => update({ uf: e.target.value })}>
            {UF_DATA.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
        </div>
        {office.nivel === "municipal" && cfg.uf === "SP" && (
          <div className="fr-ctx-pill">
            <label>Município</label>
            <select value={cfg.municipioId} onChange={(e) => update({ municipioId: e.target.value })}>
              {SP_MUNICIPIOS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div className="fr-ctx-pill">
          <label>Cenário</label>
          <select value={cfg.scenarioId} onChange={(e) => update({ scenarioId: e.target.value })}>
            {[SCENARIO_PRESETS.central, SCENARIO_PRESETS.conservador, SCENARIO_PRESETS.otimista, SCENARIO_PRESETS.maior_mobilizacao, SCENARIO_PRESETS.menor_conversao, SCENARIO_PRESETS.restricao_territorial, ...(cfg.customScenarios || [])]
              .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="fr-ctx-pill"><label>Data</label><span className="fr-mono">{new Date().toLocaleDateString("pt-BR")}</span></div>
        <div className="fr-topbar-spacer" />
      </div>
    </>
  );
}

/* ============================================================================
   APP — estado global, persistência local e roteamento por visão.
   ========================================================================== */

export default function App() {
  const [cfg, setCfg] = useState(() => readLocal(STORAGE_KEYS.lastConfig, null) || defaultConfig());
  const [mode, setMode] = useState("assessor");
  const [activeView, setActiveView] = useState("visao-geral");
  const [mobileOpen, setMobileOpen] = useState(false);

  const update = useCallback((patch) => setCfg((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    const t = setTimeout(() => writeLocal(STORAGE_KEYS.lastConfig, cfg), 400);
    return () => clearTimeout(t);
  }, [cfg]);

  const derived = useMemo(() => computeAll(cfg), [cfg]);

  const viewProps = { cfg, update, derived, mode, setActiveView };

  let body;
  if (mode === "assessor" && activeView === "funil") {
    // Modo assessor (seção 37): apenas meta, território, contatos, atividades,
    // equipe, prazo, progresso e gargalos — sem o detalhamento de pesquisador.
    body = (
      <div className="fr-stack">
        <SectionHead eyebrow="Modo assessor" title="Painel simplificado" desc="Meta, território, contatos, atividades, equipe, prazo, progresso e gargalos." />
        <div className="fr-grid fr-grid-4">
          <Kpi label="Meta ajustada" value={fmtInt(derived.adjustedGoal)} prov="estimativa" />
          <Kpi label="Contatos necessários" value={fmtInt(derived.totalContactsNeeded)} prov="estimativa" />
          <Kpi label="Equipe (coord. + mobiliz.)" value={fmtInt(cfg.team.coordenadores + cfg.team.mobilizadores)} prov="premissa" />
          <Kpi label="Prazo" value={`${fmtInt(cfg.campaignDays)} dias`} prov="premissa" />
        </div>
        <AlertList alerts={derived.alerts.filter((a) => a.level !== "info")} />
        <p className="fr-hint">Ative o modo "Pesquisador" na barra lateral para ver todas as variáveis, fórmulas e distribuições.</p>
      </div>
    );
  } else {
    switch (activeView) {
      case "visao-geral": body = <ViewVisaoGeral {...viewProps} />; break;
      case "meta": body = <ViewMetaEleitoral {...viewProps} />; break;
      case "funil": body = <ViewFunilReverso {...viewProps} />; break;
      case "territorios": body = <ViewTerritorios {...viewProps} />; break;
      case "publicos": body = <ViewPublicos {...viewProps} />; break;
      case "canais": body = <ViewCanais {...viewProps} />; break;
      case "equipes": body = <ViewEquipes {...viewProps} />; break;
      case "agenda": body = <ViewAgenda {...viewProps} />; break;
      case "orcamento": body = <ViewOrcamento {...viewProps} />; break;
      case "cenarios": body = <ViewCenarios {...viewProps} />; break;
      case "simulacoes": body = <ViewSimulacoes {...viewProps} />; break;
      case "dados": body = <ViewDados {...viewProps} />; break;
      case "relatorios": body = <ViewRelatorios cfg={cfg} derived={derived} onLoadModel={(loadedCfg) => setCfg(loadedCfg)} />; break;
      default: body = <ViewVisaoGeral {...viewProps} />;
    }
  }

  return (
    <div className="fr-app">
      <style>{STYLE}</style>
      <Sidebar active={activeView} onSelect={setActiveView} mode={mode} onModeChange={setMode} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="fr-main">
        <TopContextBar cfg={cfg} update={update} derived={derived} onOpenMobile={() => setMobileOpen(true)} />
        <div className="fr-content">{body}</div>
      </div>
    </div>
  );
}
