import React, { useState, useMemo, useEffect, useCallback, useRef, useContext, createContext } from "react";
import {
  LayoutDashboard, Target, Filter, Map, Users, Radio, Calendar, Banknote,
  Dice5, Database, FileText, ChevronDown, ChevronRight, Info,
  AlertTriangle, CheckCircle2, Download, Save, Plus,
  Menu, RefreshCw, Handshake, Footprints, DoorOpen, PartyPopper, Smartphone,
  MessageSquare, UsersRound, X, ArrowRight, GitBranch, ShieldCheck,
  Undo2, Redo2, RotateCcw, Trash2, Lock,
} from "lucide-react";
import {
  ResponsiveContainer, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ScatterChart, Scatter, ZAxis, Legend,
  ReferenceLine, BarChart,
} from "recharts";
import {
  clamp01, safeDiv, isFiniteNum, fmtInt, fmtDec, fmtPct, fmtMoney, fmtSigned, uid,
  PROV, UF_DATA, SP_MUNICIPIOS, OFFICES, CHANNEL_DEFS, FUNNEL_STAGES_META,
  FAIXAS_ETARIAS_PADRAO, TEMATICAS_SUGERIDAS, SCENARIO_PRESETS, STORAGE_KEYS,
  SOBRAS_PARTY_THRESHOLD,
  defaultConfig, migrateConfig, computeAll, computeScenarioSummary, runMonteCarlo,
  getUf, getVagas, getMunicipio, daysBetween, electionDates,
} from "./engine.js";

function cx(...args) { return args.filter(Boolean).join(" "); }

/* ============================================================================
   ESTILO — sistema visual próprio (institucional, alta densidade).
   Contraste: todos os tokens de texto passam em WCAG AA (4.5:1) sobre o fundo
   em que são efetivamente usados. A versão anterior usava #9096AA (2.9:1) nos
   rótulos de TODOS os KPIs, e corpos de texto de 9,5px.
   ========================================================================== */

const STYLE = `
.fr-app {
  --ink: #10162B; --ink-2: #1A2340; --ink-3: #2B3560; --ink-line: #34406E;
  --paper: #F2F3F6; --card: #FFFFFF; --line: #D7DBE3; --line-2: #E7EAF0;
  --text: #14182B; --text-soft: #4C5468; --text-faint: #5E6679;
  --invert: #EDEFF7; --invert-soft: #C3C9DE;
  --brand: #21418F; --brand-deep: #16305F; --brand-soft: #E7ECF9;
  --gold: #AD8324;
  --oficial: #187A56; --oficial-ink: #106143; --oficial-soft: #E1F3EB;
  --historico: #6A5AA8; --historico-ink: #574896; --historico-soft: #ECE7F8;
  --premissa: #B9821F; --premissa-ink: #7E5710; --premissa-soft: #F8EFD9;
  --estimativa: #3D6BA8; --estimativa-ink: #2F5688; --estimativa-soft: #E6EDF7;
  --danger: #B3271E; --danger-ink: #96201A; --danger-soft: #FBE8E6;
  --font-sans: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
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
.fr-app *:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 2px; }
.fr-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.fr-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 600; }
.fr-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* ---------- sidebar ---------- */
.fr-sidebar {
  width: 236px; flex: 0 0 236px; background: var(--ink); color: var(--invert);
  min-height: 100vh; position: sticky; top: 0; align-self: flex-start;
  display: flex; flex-direction: column; z-index: 20;
}
.fr-brand-block { padding: 20px 18px 16px; border-bottom: 1px solid var(--ink-line); }
.fr-brand-name { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--invert); }
.fr-brand-sub { font-size: 11.5px; color: var(--invert-soft); margin-top: 6px; line-height: 1.4; }
.fr-nav { flex: 1; padding: 10px; overflow-y: auto; }
.fr-nav-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 9px 10px; border-radius: var(--r-sm); border: none; background: transparent;
  color: var(--invert-soft); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500;
  cursor: pointer; margin-bottom: 2px; transition: background 0.12s ease, color 0.12s ease;
  position: relative;
}
.fr-nav-item:hover { background: var(--ink-2); color: #fff; }
.fr-nav-item.active { background: var(--ink-2); color: #fff; }
.fr-nav-item.active::before {
  content: ""; position: absolute; left: -10px; top: 6px; bottom: 6px; width: 3px;
  background: var(--gold); border-radius: 0 2px 2px 0;
}
.fr-nav-item svg { flex: 0 0 auto; }
.fr-sidebar-foot { padding: 12px 18px 16px; border-top: 1px solid var(--ink-line); }
.fr-mode-toggle { display: flex; background: var(--ink-2); border-radius: var(--r-sm); padding: 3px; gap: 2px; }
.fr-mode-btn { flex: 1; padding: 7px 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; border: none; background: transparent; color: var(--invert-soft); border-radius: 3px; cursor: pointer; font-family: var(--font-sans); }
.fr-mode-btn.active { background: var(--brand); color: #fff; }
.fr-mode-note { font-size: 11px; color: var(--invert-soft); margin-top: 8px; line-height: 1.35; }

/* ---------- main / topbar ---------- */
.fr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fr-topbar {
  position: sticky; top: 0; z-index: 15; background: var(--card); border-bottom: 1px solid var(--line);
  padding: 10px 22px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.fr-ctx-pill {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--paper); font-size: 12px; color: var(--text-soft);
}
.fr-ctx-pill label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); font-weight: 600; }
.fr-ctx-pill select, .fr-ctx-pill input {
  border: none; background: transparent; font-family: var(--font-mono); font-size: 12.5px; font-weight: 600;
  color: var(--text); cursor: pointer;
}
.fr-topbar-spacer { flex: 1; }
.fr-content { padding: 22px 26px 60px; max-width: 1360px; width: 100%; margin: 0 auto; }

/* ---------- blocos genéricos ---------- */
.fr-section-head { margin-bottom: 16px; }
.fr-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--brand); margin-bottom: 4px; }
.fr-h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
.fr-h2 { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
.fr-desc { font-size: 12.5px; color: var(--text-soft); max-width: 680px; }
.fr-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 16px 18px; }
.fr-grid { display: grid; gap: 14px; }
.fr-grid-2 { grid-template-columns: repeat(2, 1fr); }
.fr-grid-3 { grid-template-columns: repeat(3, 1fr); }
.fr-grid-4 { grid-template-columns: repeat(4, 1fr); }
.fr-grid-5 { grid-template-columns: repeat(5, 1fr); }
/* Estes dois substituem os style={{gridTemplateColumns}} inline, que venciam
   as media queries e mantinham duas colunas espremidas no celular. */
.fr-grid-split { grid-template-columns: 1.3fr 1fr; align-items: start; }
.fr-grid-half { grid-template-columns: 1fr 1fr; align-items: start; }
.fr-row { display: flex; align-items: center; gap: 10px; }
.fr-row-wrap { flex-wrap: wrap; }
.fr-between { justify-content: space-between; }
.fr-stack { display: flex; flex-direction: column; gap: 14px; }
.fr-divider { height: 1px; background: var(--line); margin: 14px 0; border: none; }
.fr-hint { font-size: 11.5px; color: var(--text-faint); }
.fr-line { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12.5px; padding: 2px 0; }

/* ---------- selos de proveniência ---------- */
.fr-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.fr-badge .dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.fr-badge.oficial { background: var(--oficial-soft); color: var(--oficial-ink); }
.fr-badge.oficial .dot { background: var(--oficial); }
.fr-badge.historico { background: var(--historico-soft); color: var(--historico-ink); }
.fr-badge.historico .dot { background: var(--historico); }
.fr-badge.premissa { background: var(--premissa-soft); color: var(--premissa-ink); }
.fr-badge.premissa .dot { background: var(--premissa); }
.fr-badge.estimativa { background: var(--estimativa-soft); color: var(--estimativa-ink); }
.fr-badge.estimativa .dot { background: var(--estimativa); }
.fr-badge.perigo { background: var(--danger-soft); color: var(--danger-ink); }
.fr-badge.perigo .dot { background: var(--danger); }

/* ---------- kpi ---------- */
.fr-kpi { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fr-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
.fr-kpi-value { font-family: var(--font-mono); font-size: 21px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); overflow-wrap: anywhere; }
.fr-kpi-sub { font-size: 11.5px; color: var(--text-soft); }

/* ---------- fórmulas ---------- */
.fr-disclosure { border: 1px dashed var(--line); border-radius: var(--r-sm); overflow: hidden; }
.fr-disclosure-btn { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 9px 10px; background: var(--paper); border: none; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--brand); font-family: var(--font-sans); }
.fr-disclosure-body { padding: 10px 12px; font-size: 12.5px; color: var(--text-soft); background: #fff; border-top: 1px dashed var(--line); }
.fr-formula-box { font-family: var(--font-mono); font-size: 12px; background: var(--ink); color: var(--invert); padding: 10px 12px; border-radius: var(--r-sm); margin: 6px 0; overflow-x: auto; white-space: pre; }

/* ---------- inputs ---------- */
.fr-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.fr-field-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 600; color: var(--text); }
.fr-field input[type=number], .fr-field input[type=text], .fr-field input[type=date], .fr-field select, .fr-input {
  font-family: var(--font-mono); font-size: 13px; padding: 7px 9px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: #fff; color: var(--text); width: 100%; min-width: 0;
}
.fr-input.text { font-family: var(--font-sans); }
.fr-field input[type=range] { width: 100%; accent-color: var(--brand); }
.fr-field-row { display: flex; align-items: center; gap: 10px; }
.fr-field-row input[type=range] { flex: 1; }
.fr-field-row .fr-num { min-width: 58px; text-align: right; }
.fr-field-error { font-size: 11.5px; color: var(--danger-ink); font-weight: 600; }

/* ---------- tabela ---------- */
.fr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.fr-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-faint); font-weight: 700; padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.fr-table td { padding: 8px 10px; border-bottom: 1px solid var(--line-2); vertical-align: middle; }
.fr-table tr:last-child td { border-bottom: none; }
.fr-table td.num, .fr-table th.num { text-align: right; font-family: var(--font-mono); }
.fr-table tr.resto td { background: var(--paper); font-style: italic; }
.fr-table tfoot td { font-weight: 700; border-top: 2px solid var(--line); }

/* ---------- botões ---------- */
.fr-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--text); font-family: var(--font-sans); }
.fr-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.fr-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.fr-btn.primary:hover:not(:disabled) { background: var(--brand-deep); border-color: var(--brand-deep); color: #fff; }
.fr-btn.danger { color: var(--danger-ink); border-color: #e6bdb9; }
.fr-btn.danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); color: var(--danger-ink); }
.fr-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.fr-btn.sm { padding: 6px 10px; font-size: 12px; }
.fr-seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.fr-seg button { padding: 7px 13px; font-size: 12px; font-weight: 600; border: none; background: #fff; color: var(--text-soft); cursor: pointer; border-right: 1px solid var(--line); font-family: var(--font-sans); }
.fr-seg button:last-child { border-right: none; }
.fr-seg button.active { background: var(--brand); color: #fff; }

/* ---------- alertas ---------- */
.fr-alert { display: flex; gap: 9px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-sm); font-size: 12.5px; border: 1px solid; }
.fr-alert.critico { background: var(--danger-soft); border-color: #e6bdb9; color: var(--danger-ink); }
.fr-alert.atencao { background: var(--premissa-soft); border-color: #e3cd9f; color: var(--premissa-ink); }
.fr-alert.info { background: var(--estimativa-soft); border-color: #c0d2ea; color: var(--brand-deep); }
.fr-alert svg { flex: 0 0 auto; margin-top: 1px; }

/* ---------- funil ---------- */
.fr-funnel { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; }
.fr-funnel-stage { position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: filter 0.15s ease; border: none; padding: 0; min-height: 42px; }
.fr-funnel-stage:hover { filter: brightness(1.08); }
.fr-funnel-stage-inner { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; color: #fff; }
.fr-funnel-label { font-size: 11.5px; font-weight: 600; text-align: left; }
.fr-funnel-value { font-family: var(--font-mono); font-weight: 700; font-size: 13.5px; white-space: nowrap; }
.fr-funnel-unit { font-size: 10.5px; opacity: 0.85; font-weight: 500; }
.fr-funnel-connector { width: 1px; height: 6px; background: var(--line); }
.fr-struct-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.fr-struct-card { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 10px 12px; background: var(--paper); text-align: left; cursor: pointer; font-family: var(--font-sans); }
.fr-struct-card.active { border-color: var(--brand); background: var(--brand-soft); }
.fr-struct-card .lbl { font-size: 11px; color: var(--text-faint); font-weight: 600; }
.fr-struct-card .val { font-family: var(--font-mono); font-weight: 700; font-size: 17px; margin-top: 2px; }

/* ---------- rede ---------- */
.fr-tree-node { flex: 1; text-align: center; padding: 10px 8px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); }
.fr-tree-node .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-faint); font-weight: 700; }
.fr-tree-node .val { font-family: var(--font-mono); font-weight: 700; font-size: 14px; margin-top: 3px; }
.fr-tree-arrow { color: var(--text-faint); flex: 0 0 auto; }

/* ---------- diversos ---------- */
.fr-scroll-x { overflow-x: auto; }
.fr-chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.fr-chip { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border-radius: 16px; border: 1px solid var(--line); font-size: 12px; cursor: pointer; background: #fff; color: var(--text); font-family: var(--font-sans); }
.fr-chip.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-deep); font-weight: 600; }
.fr-chip.static { cursor: default; }
.fr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--r-sm); border: 1px solid var(--line); background: #fff; cursor: pointer; color: var(--text-soft); }
.fr-icon-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.fr-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.fr-progress-track { height: 8px; background: var(--line-2); border-radius: 4px; overflow: hidden; }
.fr-progress-fill { height: 100%; background: var(--brand); transition: width 0.2s ease; }
.fr-mobile-topbar { display: none; }
.fr-sidebar-scrim { display: none; }
.fr-boundary { max-width: 620px; margin: 60px auto; padding: 26px; border: 1px solid var(--line); border-radius: var(--r-md); background: #fff; font-family: var(--font-sans); color: var(--text); }

@media (max-width: 980px) {
  .fr-app { flex-direction: column; }
  .fr-sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform 0.2s ease; width: 78vw; max-width: 300px; }
  .fr-sidebar.open { transform: translateX(0); }
  .fr-mobile-topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; background: var(--ink); position: sticky; top: 0; z-index: 25; }
  .fr-mobile-topbar .fr-brand-name { color: #fff; font-size: 12px; }
  .fr-content { padding: 16px 14px 50px; }
  .fr-grid-3, .fr-grid-4, .fr-grid-5 { grid-template-columns: 1fr 1fr; }
  .fr-grid-2, .fr-grid-split, .fr-grid-half { grid-template-columns: 1fr; }
  .fr-topbar { padding: 8px 12px; }
  .fr-sidebar-scrim { display: block; position: fixed; inset: 0; background: rgba(10,14,28,0.5); z-index: 19; }
}
@media (max-width: 620px) {
  .fr-grid-2, .fr-grid-3, .fr-grid-4, .fr-grid-5 { grid-template-columns: 1fr; }
  .fr-h1 { font-size: 19px; }
}
@media (prefers-reduced-motion: reduce) {
  .fr-app *, .fr-app *::before, .fr-app *::after { transition: none !important; animation: none !important; }
}
@media print {
  .fr-sidebar, .fr-topbar, .fr-mobile-topbar { display: none !important; }
  .fr-card { break-inside: avoid; }
}
`;

/* ============================================================================
   MODO DE EXIBIÇÃO — agora é global de verdade.
   Antes, o toggle "Assessor / Pesquisador" só alterava UMA tela (o Funil), o
   que escondia a funcionalidade-assinatura do app por trás de um controle não
   descoberto. Agora ele filtra a navegação e os blocos avançados em todas as
   views, via contexto.
   ========================================================================== */

const ModeContext = createContext("pesquisador");
const useMode = () => useContext(ModeContext);
const useIsResearcher = () => useContext(ModeContext) === "pesquisador";

/* ============================================================================
   COMPONENTES DE APOIO
   ========================================================================== */

const PROV_LABEL = {
  oficial: "Dado oficial",
  historico: "Referência histórica",
  premissa: "Premissa",
  estimativa: "Estimativa",
};
const PROV_HELP = {
  oficial: "Definido em lei ou vindo de fonte oficial conectada.",
  historico: "Referência congelada no código a partir de dados públicos anteriores. Não é uma consulta ao TSE.",
  premissa: "Valor informado pela equipe de campanha.",
  estimativa: "Resultado calculado a partir de premissas.",
};

function ProvBadge({ type }) {
  if (!type || !PROV_LABEL[type]) return null;
  return (
    <span className={cx("fr-badge", type)} title={PROV_HELP[type]}>
      <span className="dot" />{PROV_LABEL[type]}
    </span>
  );
}

/** Detalhamento de fórmula. Só aparece no modo Pesquisador. */
function Formula({ title = "Como este número foi calculado?", formula, variables = [], children }) {
  const [open, setOpen] = useState(false);
  if (!useIsResearcher()) return null;
  return (
    <div className="fr-disclosure">
      <button className="fr-disclosure-btn" onClick={() => setOpen((o) => !o)} type="button" aria-expanded={open}>
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

/** Bloco visível apenas no modo Pesquisador. */
function ResearcherOnly({ children }) {
  return useIsResearcher() ? <>{children}</> : null;
}

function Kpi({ label, value, sub, prov, tone }) {
  const color = tone === "danger" ? "var(--danger-ink)" : tone === "ok" ? "var(--oficial-ink)" : undefined;
  return (
    <div className="fr-kpi">
      <div className="fr-row fr-between">
        <span className="fr-kpi-label">{label}</span>
        {prov && <ProvBadge type={prov} />}
      </div>
      <div className="fr-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="fr-kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * Campo numérico com limites REALMENTE aplicados. Os atributos min/max do HTML
 * não impedem digitação; aqui o valor é sanitizado no blur, e o campo aceita
 * estado intermediário vazio sem virar 0 no meio da digitação.
 */
function NumberField({ label, value, onChange, min, max, step = 1, suffix, prov, hint, id }) {
  const [draft, setDraft] = useState(null);
  const fieldId = useRef(id || uid("num")).current;
  const shown = draft !== null ? draft : (isFiniteNum(value) ? String(value) : "");

  const commit = (raw) => {
    setDraft(null);
    if (raw === "" || raw === "-") { onChange(isFiniteNum(min) ? min : 0); return; }
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) { onChange(isFiniteNum(min) ? min : 0); return; }
    if (isFiniteNum(min)) v = Math.max(min, v);
    if (isFiniteNum(max)) v = Math.min(max, v);
    onChange(v);
  };

  return (
    <div className="fr-field">
      <label className="fr-field-label" htmlFor={fieldId}>
        <span>{label}</span>
        {prov && <ProvBadge type={prov} />}
      </label>
      <div className="fr-row">
        <input
          id={fieldId} type="number" inputMode="decimal" value={shown}
          min={min} max={max} step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); }}
        />
        {suffix && <span className="fr-hint" style={{ whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
      {hint && <span className="fr-hint">{hint}</span>}
    </div>
  );
}

function SliderField({ label, value, onChange, min = 0, max = 1, step = 0.01, pct = true, prov, hint }) {
  const fieldId = useRef(uid("rng")).current;
  return (
    <div className="fr-field">
      <label className="fr-field-label" htmlFor={fieldId}>
        <span>{label}</span>
        {prov && <ProvBadge type={prov} />}
      </label>
      <div className="fr-field-row">
        <input id={fieldId} type="range" min={min} max={max} step={step}
          value={isFiniteNum(value) ? value : min}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
        <span className="fr-num" aria-hidden="true">{pct ? fmtPct(value) : fmtDec(value, 2)}</span>
      </div>
      {hint && <span className="fr-hint">{hint}</span>}
    </div>
  );
}

function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="fr-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value}
          className={cx(value === o.value && "active")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AlertList({ alerts, empty = "Nenhum alerta ativo para o plano atual." }) {
  if (!alerts?.length) return <p className="fr-hint">{empty}</p>;
  return (
    <div className="fr-stack" style={{ gap: 8 }} role="status">
      {alerts.map((a, i) => (
        <div key={i} className={cx("fr-alert", a.level)}>
          {a.level === "info" ? <Info size={15} /> : <AlertTriangle size={15} />}
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

const PROV_COLOR = { oficial: "#187A56", historico: "#6A5AA8", premissa: "#B9821F", estimativa: "#3D6BA8" };

/**
 * Diagrama do funil. Só as etapas de VOLUME (pessoas, contatos, ações)
 * dividem a escala visual; as de ESTRUTURA (contagens de configuração) vão
 * para uma grade separada. Antes, "7 segmentos" e "1.078.431 contatos"
 * apareciam como barras da mesma natureza.
 */
function FunnelDiagram({ stages, onSelect, activeKey }) {
  const volume = stages.filter((s) => s.kind !== "estrutura");
  const estrutura = stages.filter((s) => s.kind === "estrutura");
  const finite = volume.map((s) => (isFiniteNum(s.value) && s.value > 0 ? s.value : 0));
  const maxV = Math.max(...finite, 1);
  const minWidthPct = 34;

  return (
    <div className="fr-stack" style={{ gap: 12 }}>
      <div className="fr-funnel">
        {volume.map((s, i) => {
          const v = isFiniteNum(s.value) && s.value > 0 ? s.value : 0;
          const ratio = Math.sqrt(Math.max(v, maxV * 0.02) / maxV);
          const widthPct = minWidthPct + ratio * (100 - minWidthPct);
          const active = activeKey === s.key;
          return (
            <React.Fragment key={s.key}>
              <button
                type="button" className="fr-funnel-stage"
                aria-pressed={active}
                style={{
                  width: `${widthPct}%`,
                  background: PROV_COLOR[s.prov] || "#3D6BA8",
                  opacity: activeKey && !active ? 0.72 : 1,
                  borderRadius: 3,
                  boxShadow: active ? "0 0 0 2px var(--ink)" : "none",
                }}
                onClick={() => onSelect && onSelect(s.key)}
              >
                <span className="fr-funnel-stage-inner">
                  <span className="fr-funnel-label">{i + 1}. {s.label}</span>
                  <span className="fr-funnel-value">
                    {s.displayValue ?? fmtInt(s.value)}
                    {s.unit && <span className="fr-funnel-unit"> {s.unit}</span>}
                  </span>
                </span>
              </button>
              {i < volume.length - 1 && <div className="fr-funnel-connector" />}
            </React.Fragment>
          );
        })}
      </div>

      {estrutura.length > 0 && (
        <div>
          <div className="fr-hint" style={{ marginBottom: 6 }}>
            Parâmetros de estrutura — contagens de configuração, não volumes comparáveis às etapas acima:
          </div>
          <div className="fr-struct-grid">
            {estrutura.map((s) => (
              <button key={s.key} type="button" aria-pressed={activeKey === s.key}
                className={cx("fr-struct-card", activeKey === s.key && "active")}
                onClick={() => onSelect && onSelect(s.key)}>
                <div className="lbl">{s.label}</div>
                <div className="val">{s.displayValue ?? fmtInt(s.value)} <span className="fr-funnel-unit" style={{ color: "var(--text-faint)" }}>{s.unit}</span></div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NetworkTree({ trail }) {
  return (
    <div className="fr-row fr-scroll-x" style={{ paddingBottom: 6 }}>
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
   ERROR BOUNDARY — a versão anterior restaurava a configuração salva sem
   validação; qualquer incompatibilidade derrubava o app em tela branca, e o
   único botão de limpeza vivia dentro de uma tela que não renderizava mais.
   ========================================================================== */

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fr-app" style={{ display: "block", padding: 20 }}>
        <style>{STYLE}</style>
        <div className="fr-boundary">
          <h1 className="fr-h1">Algo quebrou ao montar a tela</h1>
          <p className="fr-desc" style={{ marginBottom: 14 }}>
            O plano guardado neste navegador pode estar incompatível com esta versão do app.
            Você pode recarregar ou restaurar a configuração padrão — modelos salvos e o
            registro operacional são preservados no segundo caso.
          </p>
          <pre className="fr-formula-box" style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error?.message || this.state.error)}</pre>
          <div className="fr-row fr-row-wrap" style={{ marginTop: 14 }}>
            <button className="fr-btn primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Recarregar
            </button>
            <button className="fr-btn" onClick={() => {
              try { window.localStorage.removeItem(STORAGE_KEYS.lastConfig); } catch { /* ignora */ }
              window.location.reload();
            }}>
              <RotateCcw size={14} /> Restaurar configuração padrão
            </button>
            <button className="fr-btn danger" onClick={() => {
              try { Object.values(STORAGE_KEYS).forEach((k) => window.localStorage.removeItem(k)); } catch { /* ignora */ }
              window.location.reload();
            }}>
              <Trash2 size={14} /> Apagar tudo deste navegador
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/* ============================================================================
   VIEW: VISÃO GERAL
   ========================================================================== */

function ViewVisaoGeral({ cfg, derived, setActiveView }) {
  const d = derived;
  const coberturaCapacidade = clamp01(safeDiv(d.dailyCapacity, d.dailyContacts));
  const temRegistro = d.planejado > 0 || d.realizado > 0;

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Painel executivo" title="Visão Geral"
        desc="Os dez indicadores que resumem a distância entre a meta e a operação — atualizados a cada alteração de premissa ou cenário." />

      <div className="fr-grid fr-grid-5">
        <Kpi label="Meta de votos" value={fmtInt(cfg.voteGoal)} prov={PROV.PREMISSA} />
        <Kpi label="Meta ajustada" value={fmtInt(d.adjustedGoal)}
          sub={`comparecimento ${fmtPct(d.turnoutRate)} · fidelidade ${fmtPct(d.scenario.fidelityRate)}`} prov={PROV.ESTIMATIVA} />
        <Kpi label="Contatos necessários" value={fmtInt(d.totalContactsNeeded)} prov={PROV.ESTIMATIVA} />
        {/* Estes dois liam "0" fixo; agora vêm do registro operacional. */}
        <Kpi label="Contatos realizados" value={fmtInt(d.realizado)}
          sub={temRegistro ? `${fmtPct(d.progressoFunil)} da meta de contatos` : "Registre em Relatórios → rastreamento"}
          prov={PROV.PREMISSA} />
        <Kpi label="Déficit de contatos" value={fmtInt(d.deficitContatos)}
          sub="necessários − realizados"
          tone={d.deficitContatos > 0 ? "danger" : "ok"} prov={PROV.ESTIMATIVA} />
        <Kpi label="Dias restantes" value={fmtInt(d.diasRestantes)}
          sub={`de ${fmtInt(cfg.campaignDays)} dias de campanha`} prov={PROV.ESTIMATIVA} />
        <Kpi label="Meta diária" value={fmtInt(d.dailyContacts)} prov={PROV.ESTIMATIVA} />
        <Kpi label="Capacidade diária" value={fmtInt(d.dailyCapacity)}
          sub={d.capacityStatus === "insuficiente" ? "abaixo da meta diária" : "dentro ou acima da meta diária"}
          tone={d.capacityStatus === "insuficiente" ? "danger" : "ok"} prov={PROV.ESTIMATIVA} />
        <Kpi label="Cobertura territorial" value={`${d.territoriosPrioritarios.length} território(s)`}
          sub={`${fmtPct(d.territories.filter((t) => !t.resto).reduce((a, t) => a + t.eleitoradoShare, 0))} do eleitorado`}
          prov={PROV.ESTIMATIVA} />
        <Kpi label="Custo estimado" value={fmtMoney(d.totalCost)} sub={`${fmtMoney(d.costPerSupport)} por apoio`}
          tone={d.budgetGap < 0 ? "danger" : undefined} prov={PROV.ESTIMATIVA} />
      </div>

      <div className="fr-grid fr-grid-half">
        <div className="fr-card">
          <h2 className="fr-h2">Capacidade × demanda diária</h2>
          <p className="fr-desc">Comparação entre o que a estrutura atual consegue entregar por dia e o que o funil exige.</p>
          <div style={{ marginTop: 12 }}>
            <div className="fr-line">
              <span>Capacidade: <b className="fr-num">{fmtInt(d.dailyCapacity)}</b></span>
              <span>Demanda: <b className="fr-num">{fmtInt(d.dailyContacts)}</b></span>
            </div>
            <div className="fr-progress-track" role="img"
              aria-label={`Capacidade cobre ${fmtPct(coberturaCapacidade)} da demanda diária`}>
              <div className="fr-progress-fill" style={{
                width: `${Math.min(100, coberturaCapacidade * 100)}%`,
                background: d.capacityStatus === "insuficiente" ? "var(--danger)" : "var(--oficial)",
              }} />
            </div>
            <div className="fr-hint" style={{ marginTop: 6 }}>
              A estrutura cobre <b>{fmtPct(coberturaCapacidade)}</b> da demanda diária.
            </div>
          </div>
          <button className="fr-btn sm" style={{ marginTop: 12 }} onClick={() => setActiveView("equipes")}>
            Ajustar equipe <ArrowRight size={13} />
          </button>
        </div>

        <div className="fr-card">
          <h2 className="fr-h2">Progresso do plano</h2>
          <p className="fr-desc">Contatos registrados em Relatórios contra o total que o funil exige.</p>
          <div style={{ marginTop: 12 }}>
            <div className="fr-line">
              <span>Realizado: <b className="fr-num">{fmtInt(d.realizado)}</b></span>
              <span>Necessário: <b className="fr-num">{fmtInt(d.totalContactsNeeded)}</b></span>
            </div>
            <div className="fr-progress-track" role="img" aria-label={`${fmtPct(d.progressoFunil)} do funil percorrido`}>
              <div className="fr-progress-fill" style={{ width: `${d.progressoFunil * 100}%` }} />
            </div>
            <div className="fr-hint" style={{ marginTop: 6 }}>
              {temRegistro
                ? <>Esperado até aqui: <b className="fr-num">{fmtInt(d.esperadoAteAgora)}</b>{d.ritmoVsEsperado !== null && <> · ritmo <b>{fmtPct(d.ritmoVsEsperado)}</b> do previsto</>}</>
                : <>Nenhum dia registrado ainda.</>}
            </div>
          </div>
          <button className="fr-btn sm" style={{ marginTop: 12 }} onClick={() => setActiveView("relatorios")}>
            Registrar execução <ArrowRight size={13} />
          </button>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Alertas ativos</h2>
        <p className="fr-desc">Verificações automáticas de consistência e viabilidade do plano atual.</p>
        <div style={{ marginTop: 12 }}><AlertList alerts={d.alerts} /></div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Funil — visão rápida</h2>
        <p className="fr-desc">Abra "Funil Reverso" para navegar todas as etapas em detalhe, com fórmulas e gargalos.</p>
        <div style={{ marginTop: 12 }}>
          <FunnelDiagram
            stages={[
              { key: "meta", label: "Meta de votos", value: cfg.voteGoal, prov: PROV.PREMISSA, unit: "votos" },
              { key: "ajustada", label: "Meta ajustada", value: d.adjustedGoal, prov: PROV.ESTIMATIVA, unit: "votos" },
              { key: "contatos", label: "Contatos necessários", value: d.totalContactsNeeded, prov: PROV.ESTIMATIVA, unit: "contatos" },
              { key: "diaria", label: "Meta diária", value: d.dailyContacts, prov: PROV.ESTIMATIVA, unit: "por dia" },
            ]}
            onSelect={() => setActiveView("funil")}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: META ELEITORAL
   As entradas agora são ao vivo, como em todas as outras telas. A versão
   anterior mantinha um estado "pending" separado que desincronizava da barra
   de contexto — mudar a UF no topo e clicar "Calcular Funil" revertia a
   mudança.
   ========================================================================== */

function ViewMetaEleitoral({ cfg, update, derived }) {
  const d = derived;
  const office = d.office;
  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Ponto de partida" title="Meta Eleitoral"
        desc="Transforme uma meta de votos em território, público, contatos, atividades, tempo e recursos. Todo campo recalcula o plano imediatamente." />

      <div className="fr-card">
        <div className="fr-grid fr-grid-4">
          <NumberField label="Qual é a sua meta de votos?" value={cfg.voteGoal}
            onChange={(v) => update({ voteGoal: v })} min={0} step={1000} prov={PROV.PREMISSA} />
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="office-select">
              <span>Para qual cargo?</span><ProvBadge type={PROV.PREMISSA} />
            </label>
            <select id="office-select" value={cfg.office} onChange={(e) => update({ office: e.target.value })}>
              {OFFICES.filter((o) => o.tipo !== "chapa").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="uf-select">
              <span>Qual é a circunscrição (UF)?</span><ProvBadge type={PROV.PREMISSA} />
            </label>
            <select id="uf-select" value={cfg.uf} onChange={(e) => update({ uf: e.target.value })}>
              {UF_DATA.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
          <NumberField label="Dias de campanha operacional" value={cfg.campaignDays}
            onChange={(v) => update({ campaignDays: v })} min={1} max={365} prov={PROV.PREMISSA} />
        </div>

        {office.nivel === "municipal" && (
          <div className="fr-grid fr-grid-4" style={{ marginTop: 12 }}>
            <div className="fr-field">
              <label className="fr-field-label" htmlFor="mun-select">
                <span>Município</span><ProvBadge type={PROV.PREMISSA} />
              </label>
              <select id="mun-select" value={cfg.municipioId} onChange={(e) => update({ municipioId: e.target.value })}>
                {SP_MUNICIPIOS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="fr-grid fr-grid-half" style={{ marginTop: 14 }}>
          <SliderField label="Taxa de abstenção esperada" value={cfg.abstentionRate}
            onChange={(v) => update({ abstentionRate: v })} min={0} max={0.6} prov={PROV.PREMISSA}
            hint={`Comparecimento resultante: ${fmtPct(d.turnoutRate)}`} />
          <SliderField label="Taxa de fidelidade do apoio" value={cfg.fidelityRate}
            onChange={(v) => update({ fidelityRate: v })} min={0.2} max={1} prov={PROV.PREMISSA}
            hint="Quanto do apoio declarado vira voto na urna." />
        </div>

        {office.nivel === "nacional" && (
          <div className="fr-alert info" style={{ marginTop: 12 }}>
            <Info size={15} />
            <span>Cargo de circunscrição nacional: o cálculo territorial passa a usar as 27 unidades da federação, não a UF selecionada acima.</span>
          </div>
        )}
      </div>

      <OfficeRulesCard cfg={cfg} update={update} derived={d} />

      <div className="fr-card">
        <h2 className="fr-h2">Resultado</h2>
        <p className="fr-desc">Da meta declarada até o que a estrutura atual entrega por dia.</p>
        <div style={{ marginTop: 14, maxWidth: 620, marginLeft: "auto", marginRight: "auto" }}>
          <FunnelDiagram
            stages={[
              { key: "meta", label: "Meta", value: cfg.voteGoal, prov: PROV.PREMISSA, unit: "votos" },
              { key: "ajustada", label: "Meta ajustada", value: d.adjustedGoal, prov: PROV.ESTIMATIVA, unit: "votos" },
              { key: "contatos", label: "Contatos necessários", value: d.totalContactsNeeded, prov: PROV.ESTIMATIVA, unit: "contatos" },
              { key: "diaria", label: "Contatos / dia", value: d.dailyContacts, prov: PROV.ESTIMATIVA, unit: "por dia" },
              { key: "capacidade", label: "Capacidade atual / dia", value: d.dailyCapacity, prov: PROV.ESTIMATIVA, unit: "por dia" },
              {
                key: "gap", label: d.capacityGap >= 0 ? "Superávit diário" : "Déficit diário",
                value: Math.abs(d.capacityGap), prov: PROV.ESTIMATIVA, unit: "contatos",
              },
            ]}
          />
        </div>

        <div className="fr-grid fr-grid-3" style={{ marginTop: 18 }}>
          <Kpi label="Eleitorado da circunscrição" value={fmtInt(d.eleitoradoElegivel)} prov={PROV.HISTORICO} />
          <Kpi label="Votos esperados (comparecimento)" value={fmtInt(d.eleitoradoEfetivo)} prov={PROV.ESTIMATIVA} />
          <Kpi label="Meta como fatia dos votos" value={fmtPct(d.goalShareOfElectorate)}
            tone={d.goalShareOfElectorate > 0.15 && d.office.tipo === "proporcional" ? "danger" : undefined}
            prov={PROV.ESTIMATIVA} />
        </div>

        <div style={{ marginTop: 16 }}>
          <Formula
            title="Veja como chegamos a este número"
            formula={"META_AJUSTADA = META_VOTOS / (TAXA_FIDELIDADE × TAXA_COMPARECIMENTO)\nTAXA_COMPARECIMENTO = 1 − TAXA_ABSTENÇÃO\n\nCONTATOS_NECESSÁRIOS = Σ canal [ (META_AJUSTADA × PARTICIPAÇÃO_CANAL) / CONVERSÃO_CANAL ]\n\nCONTATOS/DIA = CONTATOS_NECESSÁRIOS / DIAS_DE_CAMPANHA\n\nVOTOS_ESPERADOS = ELEITORADO × TAXA_COMPARECIMENTO   (teto físico da meta)"}
            variables={[
              { name: "META_VOTOS", value: fmtInt(cfg.voteGoal), prov: PROV.PREMISSA },
              { name: "TAXA_ABSTENÇÃO", value: fmtPct(d.scenario.abstentionRate), prov: PROV.PREMISSA },
              { name: "TAXA_FIDELIDADE", value: fmtPct(d.scenario.fidelityRate), prov: PROV.PREMISSA },
              { name: "DIAS_DE_CAMPANHA", value: fmtInt(cfg.campaignDays), prov: PROV.PREMISSA },
              { name: "ELEITORADO", value: fmtInt(d.eleitoradoElegivel), prov: PROV.HISTORICO },
              { name: "CENÁRIO ATIVO", value: d.preset.label, prov: PROV.PREMISSA },
            ]}
          >
            <p style={{ marginTop: 8 }}>
              Cada canal (corpo a corpo, porta a porta, digital etc.) tem sua própria taxa de conversão — ajuste em <b>Canais</b>.
              Nenhum arredondamento ocorre nos cálculos internos, apenas na exibição.
            </p>
          </Formula>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: FUNIL REVERSO
   ========================================================================== */

function ViewFunilReverso({ cfg, derived, setActiveView }) {
  const d = derived;
  const [direction, setDirection] = useState("down");
  const [activeKey, setActiveKey] = useState(null);
  const totalTeam = (cfg.team.coordenadores || 0) + (cfg.team.mobilizadores || 0);

  const stageValues = {
    meta: cfg.voteGoal,
    ajustada: d.adjustedGoal,
    apoios: d.adjustedGoal,
    eleitoresAlvo: d.eleitoresAlvo,
    contatos: d.totalContactsNeeded,
    atividades: d.totalActions,
    metaDiaria: d.dailyContacts,
    metaAgente: d.metaPorMobilizador,
    segmentos: d.segmentsCount,
    territorios: d.territoriosPrioritarios.length,
    canais: d.enabledChannels.length,
    equipe: totalTeam,
    dias: cfg.campaignDays,
  };
  const bottleneckKeys = d.capacityStatus === "insuficiente" ? ["equipe", "metaDiaria", "metaAgente"] : [];
  const stages = FUNNEL_STAGES_META.map((s) => ({ ...s, value: stageValues[s.key] }));
  const volume = stages.filter((s) => s.kind !== "estrutura");
  const estrutura = stages.filter((s) => s.kind === "estrutura");
  const ordered = direction === "down" ? [...volume, ...estrutura] : [...[...volume].reverse(), ...estrutura];
  const activeStage = stages.find((s) => s.key === activeKey);

  const stageDetail = {
    meta: { formula: "Entrada direta (Meta Eleitoral).", vars: [] },
    ajustada: {
      formula: "META_VOTOS / (TAXA_FIDELIDADE × TAXA_COMPARECIMENTO)",
      vars: [["TAXA_COMPARECIMENTO", fmtPct(d.turnoutRate)], ["TAXA_FIDELIDADE", fmtPct(d.scenario.fidelityRate)]],
    },
    apoios: {
      formula: "APOIOS = META_AJUSTADA\n(1:1 por definição: a meta ajustada JÁ é o número de apoios declarados\nnecessários para produzir os votos desejados.)",
      vars: [],
    },
    eleitoresAlvo: {
      formula: "ELEITORES_ALVO = Σ território priorizado [ ELEITORADO × TAXA_COMPARECIMENTO ]\n\nUniverso de eleitores que efetivamente comparecem nos territórios\npriorizados — o denominador real do esforço.",
      vars: [
        ["Territórios priorizados", fmtInt(d.territoriosPrioritarios.length)],
        ["Eleitorado priorizado", fmtInt(d.territoriosPrioritarios.reduce((a, t) => a + t.eleitoradoM, 0) * 1e6)],
        ["Penetração exigida", fmtPct(safeDiv(d.adjustedGoal, d.eleitoresAlvo))],
      ],
    },
    contatos: {
      formula: "Σ canal [ (META_AJUSTADA × PARTICIPAÇÃO_CANAL) / CONVERSÃO_CANAL ]",
      vars: d.enabledChannels.map((c) => [c.label, fmtInt(c.contactsNeeded)]),
    },
    atividades: {
      formula: "Σ canal [ CONTATOS_NECESSÁRIOS_CANAL / MULTIPLICADOR_DA_CADEIA_CANAL ]",
      vars: d.enabledChannels.map((c) => [`${c.label} (${c.unit})`, fmtInt(c.actionsNeeded)]),
    },
    metaDiaria: { formula: "CONTATOS_NECESSÁRIOS / DIAS_DE_CAMPANHA", vars: [["Dias", fmtInt(cfg.campaignDays)]] },
    metaAgente: { formula: "META_DIÁRIA / Nº_MOBILIZADORES", vars: [["Mobilizadores", fmtInt(cfg.team.mobilizadores)]] },
    segmentos: {
      formula: "FAIXAS_ETÁRIAS + SEGMENTOS_TEMÁTICOS configurados em Públicos.",
      vars: [
        ["Faixas etárias", fmtInt(cfg.publicos?.faixas?.length || 0)],
        ["Temáticos", fmtInt(cfg.publicos?.tematicos?.length || 0)],
      ],
    },
    territorios: {
      formula: "Territórios priorizados em Territórios (exclui o bucket 'Restante do estado').",
      vars: d.territoriosPrioritarios.slice(0, 8).map((t) => [t.name, fmtInt(t.metaTerritorial)]),
    },
    canais: { formula: "Canais habilitados em Canais.", vars: d.enabledChannels.map((c) => [c.label, fmtPct(c.share)]) },
    equipe: {
      formula: "COORDENADORES + MOBILIZADORES configurados em Equipes.",
      vars: [["Coordenadores", fmtInt(cfg.team.coordenadores)], ["Mobilizadores", fmtInt(cfg.team.mobilizadores)]],
    },
    dias: { formula: "Entrada direta (Meta Eleitoral / Agenda).", vars: [["Dias ativos na Agenda", fmtInt(d.diasAtivosAgenda)]] },
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Princípio central" title="Funil Reverso"
        desc="Da meta de votos até a meta por agente — e o caminho inverso, para localizar onde a operação trava." />

      <div className="fr-card">
        <div className="fr-row fr-between fr-row-wrap" style={{ marginBottom: 10 }}>
          <SegmentedControl ariaLabel="Direção do funil"
            options={[{ value: "down", label: "Meta → Ação" }, { value: "up", label: "Ação → Meta" }]}
            value={direction} onChange={setDirection} />
          {bottleneckKeys.length > 0 && (
            <span className="fr-badge perigo"><AlertTriangle size={11} /> Gargalo na capacidade da equipe</span>
          )}
        </div>
        <FunnelDiagram stages={ordered} onSelect={(k) => setActiveKey(k === activeKey ? null : k)} activeKey={activeKey} />
        {activeStage ? (
          <div style={{ marginTop: 14 }}>
            <div className="fr-card" style={{ background: "var(--paper)" }}>
              <div className="fr-row fr-between">
                <h2 className="fr-h2">{activeStage.label}</h2>
                <ProvBadge type={activeStage.prov} />
              </div>
              <div className="fr-formula-box" style={{ marginTop: 8 }}>{stageDetail[activeStage.key]?.formula}</div>
              {(stageDetail[activeStage.key]?.vars || []).length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--text-soft)" }}>
                  {stageDetail[activeStage.key].vars.map(([name, value], i) => (
                    <li key={i} style={{ marginBottom: 3 }}>
                      <span className="fr-mono" style={{ fontWeight: 600 }}>{name}</span>: {value}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="fr-hint" style={{ marginTop: 10 }}>Clique em qualquer etapa para ver a fórmula e as variáveis que a compõem.</p>
        )}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Grafo Eleitoral Operacional</h2>
        <p className="fr-desc">Estrutura da candidatura em quatro ramos. O ramo com gargalo aparece destacado.</p>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 14 }}>
          {[
            { title: "Território", icon: <Map size={14} />, view: "territorios", items: d.territories.map((t) => `${t.name} — ${fmtInt(t.metaTerritorial)} votos`), gargalo: false },
            { title: "Públicos", icon: <Users size={14} />, view: "publicos", items: [`${d.segmentsCount} segmento(s) configurado(s)`], gargalo: d.segmentsCount === 0 },
            { title: "Canais", icon: <Radio size={14} />, view: "canais", items: d.enabledChannels.map((c) => `${c.label} — ${fmtInt(c.contactsNeeded)} contatos`), gargalo: Math.abs(d.enabledShareSum - 1) > 0.01 },
            { title: "Equipes", icon: <UsersRound size={14} />, view: "equipes", items: [`${fmtInt(cfg.team.coordenadores)} coordenação`, `${fmtInt(cfg.team.mobilizadores)} mobilização`], gargalo: bottleneckKeys.length > 0 },
          ].map((branch) => (
            <button key={branch.title} type="button" onClick={() => setActiveView(branch.view)}
              className="fr-card" style={{
                padding: 12, textAlign: "left", cursor: "pointer", font: "inherit",
                borderColor: branch.gargalo ? "var(--danger)" : "var(--line)",
                background: branch.gargalo ? "var(--danger-soft)" : "var(--paper)",
              }}>
              <div className="fr-row" style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>
                {branch.icon} {branch.title}
                {branch.gargalo && <AlertTriangle size={13} color="var(--danger)" />}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--text-soft)" }}>
                {branch.items.slice(0, 5).map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
                {branch.items.length > 5 && <li className="fr-hint">+{branch.items.length - 5} outros</li>}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: TERRITÓRIOS
   ========================================================================== */

const WEIGHT_LABELS = {
  eleitorado: "Eleitorado",
  historico: "Desempenho histórico da candidatura",
  comparecimento: "Comparecimento local",
  presenca: "Presença territorial",
  capacidade: "Capacidade operacional",
  logistica: "Logística (penalidade de custo)",
};

function ViewTerritorios({ cfg, update, derived }) {
  const d = derived;
  const office = d.office;
  const detalhado = office.nivel === "estadual" && cfg.uf === "SP";

  const toggleTerritorio = (id) => {
    const sel = cfg.territoriosSelecionados.includes(id)
      ? cfg.territoriosSelecionados.filter((x) => x !== id)
      : [...cfg.territoriosSelecionados, id];
    update({ territoriosSelecionados: sel.length ? sel : cfg.territoriosSelecionados });
  };
  const setWeight = (key, v) => update({ territorialWeights: { ...cfg.territorialWeights, [key]: v } });
  const normalizarPesos = () => {
    const total = Object.values(cfg.territorialWeights).reduce((a, b) => a + b, 0);
    if (!total) return;
    const next = {};
    Object.entries(cfg.territorialWeights).forEach(([k, v]) => { next[k] = Math.round((v / total) * 100) / 100; });
    update({ territorialWeights: next });
  };

  const matrixData = d.territories.map((t) => ({
    name: t.name, potencial: Math.round(t.score * 1000) / 10, esforco: Math.round(t.logisticaNorm * 100),
  }));

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Capilaridade" title="Territórios"
        desc="Selecione territórios, ajuste os pesos e veja como a meta ajustada se distribui no mapa operacional." />

      {office.nivel === "nacional" && (
        <div className="fr-alert info"><Info size={15} /><span>Cargo nacional: a meta é distribuída entre as 27 unidades da federação.</span></div>
      )}
      {office.nivel === "municipal" && (
        <div className="fr-alert info"><Info size={15} /><span>Cargo municipal: a meta fica concentrada em {getMunicipio(cfg)?.name || getUf(cfg).name}. Troque o município em Meta Eleitoral.</span></div>
      )}
      {office.nivel === "estadual" && !detalhado && (
        <div className="fr-alert info"><Info size={15} /><span>
          O recorte município a município existe apenas para São Paulo nesta versão. Para {getUf(cfg).name}, o cálculo usa o estado como território único até a importação real do TSE.
        </span></div>
      )}

      <div className="fr-grid fr-grid-split">
        <div className="fr-card">
          <h2 className="fr-h2">Distribuição da meta por território</h2>
          <p className="fr-desc">
            META_TERRITORIAL = META_AJUSTADA × (SCORE_DO_TERRITÓRIO / Σ SCORES). A coluna
            <b> penetração</b> mostra quanto dos votos daquele território a meta exige — é ela que
            revela um peso mal calibrado.
          </p>
          <div className="fr-scroll-x" style={{ marginTop: 12 }}>
            <table className="fr-table">
              <thead>
                <tr>
                  <th>Território</th>
                  <th className="num">Eleitorado</th>
                  <th className="num">% do eleitorado</th>
                  <th className="num">Score</th>
                  <th className="num">% da meta</th>
                  <th className="num">Meta territorial</th>
                  <th className="num">Penetração exigida</th>
                </tr>
              </thead>
              <tbody>
                {d.territories.map((t) => {
                  const alto = t.penetracaoNecessaria > 0.35;
                  return (
                    <tr key={t.id} className={cx(t.resto && "resto")}>
                      <td>{t.name}{t.resto && <span className="fr-hint"> (não priorizado)</span>}</td>
                      <td className="num">{fmtDec(t.eleitoradoM, 2)} M</td>
                      <td className="num">{fmtPct(t.eleitoradoShare)}</td>
                      <td className="num">{fmtDec(t.score, 2)}</td>
                      <td className="num">{fmtPct(t.share)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtInt(t.metaTerritorial)}</td>
                      <td className="num" style={{ color: alto ? "var(--danger-ink)" : undefined, fontWeight: alto ? 700 : 400 }}>
                        {fmtPct(t.penetracaoNecessaria, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{fmtDec(d.territories.reduce((a, t) => a + t.eleitoradoM, 0), 2)} M</td>
                  <td className="num">100,0%</td>
                  <td />
                  <td className="num">{fmtPct(d.territories.reduce((a, t) => a + t.share, 0))}</td>
                  <td className="num">{fmtInt(d.territories.reduce((a, t) => a + t.metaTerritorial, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {detalhado && (
            <>
              <div className="fr-hint" style={{ marginTop: 14, marginBottom: 6 }}>Municípios priorizados na distribuição:</div>
              <div className="fr-chip-list">
                {SP_MUNICIPIOS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={cfg.territoriosSelecionados.includes(m.id)}
                    className={cx("fr-chip", cfg.territoriosSelecionados.includes(m.id) && "on")}
                    onClick={() => toggleTerritorio(m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
              <label className="fr-row" style={{ marginTop: 12, fontSize: 12.5 }}>
                <input type="checkbox" checked={cfg.incluirRestoDoEstado}
                  onChange={(e) => update({ incluirRestoDoEstado: e.target.checked })} />
                Incluir o "Restante do estado" na distribuição
              </label>
              <p className="fr-hint" style={{ marginTop: 4 }}>
                Desligado, 100% da meta é atribuída apenas aos municípios priorizados — o que assume,
                implicitamente, zero voto no restante de {getUf(cfg).name}.
              </p>
            </>
          )}
        </div>

        <div className="fr-card">
          <h2 className="fr-h2">Pesos territoriais</h2>
          <ProvBadge type={PROV.PREMISSA} />
          <p className="fr-desc" style={{ marginTop: 6 }}>
            Os seis critérios são normalizados de 0 a 1 antes da ponderação, então os pesos são
            diretamente comparáveis entre si.
          </p>
          <div className="fr-stack" style={{ marginTop: 10, gap: 12 }}>
            {Object.entries(cfg.territorialWeights).map(([key, val]) => (
              <SliderField key={key} label={WEIGHT_LABELS[key] || key} value={val}
                onChange={(v) => setWeight(key, v)} min={0} max={0.6} step={0.01} />
            ))}
          </div>
          <div className="fr-divider" />
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="hist-ref">
              <span>Eleição de referência para o comparecimento</span><ProvBadge type={PROV.HISTORICO} />
            </label>
            <select id="hist-ref" value={cfg.histRefYear} onChange={(e) => update({ histRefYear: Number(e.target.value) })}>
              <option value={2022}>2022</option>
              <option value={2018}>2018</option>
            </select>
            <span className="fr-hint">Alimenta o critério "Comparecimento local" e o teto de votos esperados.</span>
          </div>
          <div className="fr-row fr-between" style={{ marginTop: 12 }}>
            <span className="fr-hint">Soma atual: <b className="fr-num">{fmtPct(d.weightSum)}</b> (ideal: 100%)</span>
            <button className="fr-btn sm" onClick={normalizarPesos} disabled={Math.abs(d.weightSum - 1) < 0.005}>
              <RefreshCw size={12} /> Normalizar
            </button>
          </div>
        </div>
      </div>

      <ResearcherOnly>
        <div className="fr-card">
          <h2 className="fr-h2">Matriz de prioridade — potencial × esforço</h2>
          <p className="fr-desc">Classificação operacional derivada dos parâmetros inseridos — não é um veredito sobre "melhores territórios".</p>
          <div style={{ height: 320, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="#D7DBE3" />
                <XAxis type="number" dataKey="potencial" name="Potencial"
                  label={{ value: "Potencial (score)", position: "insideBottom", offset: -12, style: { fontSize: 11, fill: "#4C5468" } }}
                  tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4C5468" }} />
                <YAxis type="number" dataKey="esforco" name="Esforço"
                  label={{ value: "Esforço logístico", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#4C5468" } }}
                  tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4C5468" }} />
                <ZAxis range={[90, 90]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans" }}
                  formatter={(v, n) => [v, n]}
                  labelFormatter={() => ""}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div style={{ background: "#fff", border: "1px solid #D7DBE3", padding: "8px 10px", fontSize: 12, borderRadius: 3 }}>
                        <b>{p.name}</b><br />Potencial: {p.potencial}<br />Esforço: {p.esforco}
                      </div>
                    );
                  }} />
                <ReferenceLine x={matrixData.length ? matrixData.reduce((a, m) => a + m.potencial, 0) / matrixData.length : 0} stroke="#9AA2B4" />
                <ReferenceLine y={matrixData.length ? matrixData.reduce((a, m) => a + m.esforco, 0) / matrixData.length : 0} stroke="#9AA2B4" />
                <Scatter data={matrixData} fill="#21418F" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </ResearcherOnly>
    </div>
  );
}

/* ============================================================================
   VIEW: PÚBLICOS
   Os selos "Dado oficial" desta tela foram trocados: nada aqui vem de conector
   oficial. Rotular dado sintético como oficial violava a regra central do app.
   ========================================================================== */

function ViewPublicos({ cfg, update, derived }) {
  const publicos = cfg.publicos || { tematicos: [], faixas: FAIXAS_ETARIAS_PADRAO };
  const [novoTema, setNovoTema] = useState("");
  const d = derived;

  const toggleTema = (tema) => {
    const atual = publicos.tematicos.includes(tema)
      ? publicos.tematicos.filter((t) => t !== tema)
      : [...publicos.tematicos, tema];
    update({ publicos: { ...publicos, tematicos: atual } });
  };
  const toggleFaixa = (faixa) => {
    const atual = publicos.faixas.includes(faixa)
      ? publicos.faixas.filter((f) => f !== faixa)
      : [...publicos.faixas, faixa];
    update({ publicos: { ...publicos, faixas: atual } });
  };
  const addTemaCustom = () => {
    const t = novoTema.trim();
    if (t && !publicos.tematicos.includes(t)) {
      update({ publicos: { ...publicos, tematicos: [...publicos.tematicos, t] } });
      setNovoTema("");
    }
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Microsegmentação" title="Públicos"
        desc="Segmentos geográficos, demográficos agregados e temáticos — nunca perfis individuais." />

      <div className="fr-alert info">
        <ShieldCheck size={15} />
        <span>Este módulo trabalha exclusivamente com agregados estatísticos e classificações voluntárias da equipe. O sistema não infere atributos sensíveis de indivíduos nem produz listas de pessoas por características pessoais.</span>
      </div>

      <div className="fr-grid fr-grid-3">
        <Kpi label="Segmentos configurados" value={fmtInt(d.segmentsCount)}
          sub="entra no Funil Reverso como 'Segmentos eleitorais'" prov={PROV.PREMISSA} />
        <Kpi label="Faixas etárias ativas" value={fmtInt(publicos.faixas.length)} prov={PROV.PREMISSA} />
        <Kpi label="Segmentos temáticos" value={fmtInt(publicos.tematicos.length)} prov={PROV.PREMISSA} />
      </div>

      <div className="fr-grid fr-grid-half">
        <div className="fr-card">
          <div className="fr-row fr-between">
            <h2 className="fr-h2">Geográficas</h2>
            <ProvBadge type={PROV.HISTORICO} />
          </div>
          <p className="fr-desc" style={{ marginTop: 6 }}>
            Herdadas do módulo Territórios. O detalhamento até zona, local e seção depende do
            conector do TSE, ainda não ligado — ver módulo Dados.
          </p>
          <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12.5 }}>
            {d.territoriosPrioritarios.slice(0, 10).map((t) => (
              <li key={t.id}>{t.name} — {fmtPct(t.eleitoradoShare)} do eleitorado</li>
            ))}
          </ul>
        </div>

        <div className="fr-card">
          <div className="fr-row fr-between">
            <h2 className="fr-h2">Demográficas agregadas</h2>
            <ProvBadge type={PROV.PREMISSA} />
          </div>
          <p className="fr-desc" style={{ marginTop: 6 }}>
            Faixas que a campanha decide trabalhar. Quando o conector do TSE estiver ligado, cada
            faixa passa a carregar o eleitorado real da circunscrição — hoje é uma escolha da equipe.
          </p>
          <div className="fr-chip-list" style={{ marginTop: 10 }}>
            {FAIXAS_ETARIAS_PADRAO.map((f) => (
              <button key={f} type="button" aria-pressed={publicos.faixas.includes(f)}
                className={cx("fr-chip", publicos.faixas.includes(f) && "on")} onClick={() => toggleFaixa(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fr-card">
        <div className="fr-row fr-between">
          <h2 className="fr-h2">Temáticas</h2>
          <ProvBadge type={PROV.PREMISSA} />
        </div>
        <p className="fr-desc" style={{ marginTop: 6 }}>Segmentos voluntários ou contextuais criados pela equipe (pautas, agendas, territórios de interesse).</p>
        <div className="fr-chip-list" style={{ marginTop: 10 }}>
          {[...new Set([...TEMATICAS_SUGERIDAS, ...publicos.tematicos])].map((t) => (
            <button key={t} type="button" aria-pressed={publicos.tematicos.includes(t)}
              className={cx("fr-chip", publicos.tematicos.includes(t) && "on")} onClick={() => toggleTema(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="fr-row" style={{ marginTop: 12, maxWidth: 380 }}>
          <input type="text" className="fr-input text" placeholder="Novo segmento temático"
            aria-label="Novo segmento temático" value={novoTema}
            onChange={(e) => setNovoTema(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTemaCustom(); }} />
          <button className="fr-btn sm" onClick={addTemaCustom}><Plus size={13} /> Adicionar</button>
        </div>
      </div>

      <div className="fr-card">
        <div className="fr-row fr-between">
          <h2 className="fr-h2">Socioeconômicas</h2>
          <span className="fr-badge perigo"><span className="dot" />Não conectado</span>
        </div>
        <p className="fr-desc">Renda agregada, infraestrutura, mobilidade e indicadores sociais/ambientais — via IBGE/Censo. Não conectado nesta versão; ver módulo Dados.</p>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: CANAIS
   ========================================================================== */

const ICONS = { Handshake, UsersRound, Footprints, DoorOpen, PartyPopper, Smartphone, MessageSquare };

function ViewCanais({ cfg, update, derived }) {
  const d = derived;
  const setChannel = (id, patch) => update({ channels: { ...cfg.channels, [id]: { ...cfg.channels[id], ...patch } } });
  const setChannelParam = (id, key, v) => setChannel(id, { params: { ...cfg.channels[id].params, [key]: v } });
  const setNetwork = (patch) => update({ network: { ...cfg.network, ...patch } });

  const normalizarShares = () => {
    const ativos = CHANNEL_DEFS.filter((def) => cfg.channels[def.id].enabled);
    const total = ativos.reduce((a, def) => a + cfg.channels[def.id].share, 0);
    if (!total) return;
    const next = { ...cfg.channels };
    ativos.forEach((def) => {
      next[def.id] = { ...next[def.id], share: Math.round((next[def.id].share / total) * 100) / 100 };
    });
    update({ channels: next });
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Funil de conversão" title="Canais"
        desc="Cada canal tem cadeia, conversão e unidade operacional próprias — nunca uma taxa média única para todos." />

      <div className="fr-alert info">
        <Info size={15} />
        <span>Por padrão, 100% da meta ajustada está alocada ao corpo a corpo (15% de conversão), reproduzindo o exemplo de referência. Redistribua a participação entre os canais para diversificar o funil e reduzir a dependência de um único canal.</span>
      </div>

      <div className="fr-card">
        <div className="fr-row fr-between fr-row-wrap">
          <h2 className="fr-h2">Matriz canal × conversão</h2>
          <button className="fr-btn sm" onClick={normalizarShares} disabled={Math.abs(d.enabledShareSum - 1) < 0.005}>
            <RefreshCw size={12} /> Normalizar participações
          </button>
        </div>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th className="num">Participação na meta</th>
                <th className="num">Conversão (contato→apoio)</th>
                <th className="num">Multiplicador da cadeia</th>
                <th className="num">Contatos necessários</th>
                <th className="num">Unidade operacional</th>
              </tr>
            </thead>
            <tbody>
              {d.channelResults.map((c) => (
                <tr key={c.id} style={{ opacity: c.enabled ? 1 : 0.45 }}>
                  <td>{c.label}{!c.enabled && <span className="fr-hint"> (inativo)</span>}</td>
                  <td className="num">{fmtPct(c.share)}</td>
                  <td className="num">{fmtPct(c.conversion)}</td>
                  <td className="num">{fmtDec(c.chainMultiplier, 2)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtInt(c.contactsNeeded)}</td>
                  <td className="num">{fmtInt(c.actionsNeeded)} {c.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total (canais ativos)</td>
                <td className="num" style={{ color: Math.abs(d.enabledShareSum - 1) > 0.01 ? "var(--danger-ink)" : undefined }}>
                  {fmtPct(d.enabledShareSum)}
                </td>
                <td /><td />
                <td className="num">{fmtInt(d.totalContactsNeeded)}</td>
                <td className="num">{fmtInt(d.totalActions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {Math.abs(d.enabledShareSum - 1) > 0.01 && (
          <p className="fr-field-error" style={{ marginTop: 8 }}>
            A soma das participações dos canais ativos deveria fechar em 100%.
          </p>
        )}
      </div>

      <div className="fr-grid fr-grid-half">
        {CHANNEL_DEFS.map((def) => {
          const st = cfg.channels[def.id];
          const res = d.channelResults.find((c) => c.id === def.id);
          const Icon = ICONS[def.icon] || Radio;
          return (
            <div key={def.id} className="fr-card">
              <div className="fr-row fr-between">
                <div className="fr-row" style={{ fontWeight: 700, fontSize: 13 }}><Icon size={15} /> {def.label}</div>
                <label className="fr-row" style={{ fontSize: 12, gap: 5 }}>
                  <input type="checkbox" checked={st.enabled}
                    onChange={(e) => setChannel(def.id, { enabled: e.target.checked })} /> ativo
                </label>
              </div>
              <div className="fr-stack" style={{ marginTop: 10, gap: 10 }}>
                <SliderField label="Participação na meta ajustada" value={st.share}
                  onChange={(v) => setChannel(def.id, { share: v })} min={0} max={1} step={0.01} />
                <SliderField label="Conversão (contato → apoio declarado)" value={st.conversion}
                  onChange={(v) => setChannel(def.id, { conversion: v })} min={0} max={1} step={0.01} />
                <ResearcherOnly>
                  {def.fields.map((f) => (
                    f.pct
                      ? <SliderField key={f.key} label={f.label} value={st.params[f.key]}
                          onChange={(v) => setChannelParam(def.id, f.key, v)} min={f.min} max={f.max} step={f.step} />
                      : <NumberField key={f.key} label={f.label} value={st.params[f.key]}
                          onChange={(v) => setChannelParam(def.id, f.key, v)} min={f.min} max={f.max} step={f.step} />
                  ))}
                </ResearcherOnly>
              </div>
              <div className="fr-divider" />
              <div className="fr-line"><span>Contatos necessários</span><b className="fr-num">{fmtInt(res?.contactsNeeded)}</b></div>
              <div className="fr-line"><span>{def.unit}</span><b className="fr-num">{fmtInt(res?.actionsNeeded)}</b></div>
            </div>
          );
        })}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Multiplicador de rede — dobras do funil</h2>
        <p className="fr-desc">NOVOS_CONTATOS = REDE_BRUTA × TAXA_ATIVAÇÃO × (1 − TAXA_SOBREPOSIÇÃO), aplicado em camadas.</p>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 12 }}>
          <NumberField label="Lideranças na base" value={cfg.network.numLiderancas}
            onChange={(v) => setNetwork({ numLiderancas: v })} min={0} step={10} prov={PROV.PREMISSA} />
          <NumberField label="Contatos por camada (fanout)" value={cfg.network.fanout}
            onChange={(v) => setNetwork({ fanout: v })} min={1} max={100} step={1} prov={PROV.PREMISSA} />
          <SliderField label="Taxa de ativação" value={cfg.network.taxaAtivacao} onChange={(v) => setNetwork({ taxaAtivacao: v })} />
          <SliderField label="Taxa de sobreposição" value={cfg.network.taxaSobreposicao} onChange={(v) => setNetwork({ taxaSobreposicao: v })} />
        </div>
        <div style={{ marginTop: 16 }}><NetworkTree trail={d.networkTrail} /></div>
        <p className="fr-hint" style={{ marginTop: 8 }}>
          Alcance final estimado após {cfg.network.camadas} camada(s): <b className="fr-num">{fmtInt(d.networkFinalReach)}</b> pessoas —
          compare com os contatos necessários do canal "Lideranças / rede organizada" acima.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: EQUIPES
   ========================================================================== */

function ViewEquipes({ cfg, update, derived }) {
  const d = derived;
  const setTeam = (patch) => update({ team: { ...cfg.team, ...patch } });
  const statusLabel = { insuficiente: "Capacidade insuficiente", suficiente: "Capacidade suficiente", excedente: "Excesso de capacidade", sem_demanda: "Sem demanda calculada" };
  const statusColor = { insuficiente: "var(--danger-ink)", suficiente: "var(--oficial-ink)", excedente: "var(--estimativa-ink)", sem_demanda: "var(--text-faint)" };

  const mobilizadoresNecessarios = Math.ceil(safeDiv(
    d.dailyContacts - ((cfg.team.reunioesDia || 0) * (cfg.team.contatosPorReuniao || 0) + (cfg.team.eventosDia || 0) * (cfg.team.contatosPorEvento || 0)),
    (cfg.team.horasDia || 0) * (cfg.team.contatosHora || 0),
  ));

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Estrutura" title="Equipes"
        desc="Capacidade operacional diária e acumulada, comparada à demanda gerada pelo funil." />

      <div className="fr-grid fr-grid-half">
        <div className="fr-card">
          <h2 className="fr-h2">Entradas de capacidade</h2>
          <ProvBadge type={PROV.PREMISSA} />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <NumberField label="Coordenadores" value={cfg.team.coordenadores} onChange={(v) => setTeam({ coordenadores: v })} min={0} step={1} />
            <NumberField label="Mobilizadores" value={cfg.team.mobilizadores} onChange={(v) => setTeam({ mobilizadores: v })} min={0} step={1} />
            <NumberField label="Horas disponíveis / dia" value={cfg.team.horasDia} onChange={(v) => setTeam({ horasDia: v })} min={0} max={16} step={0.5} />
            <NumberField label="Contatos / hora / mobilizador" value={cfg.team.contatosHora} onChange={(v) => setTeam({ contatosHora: v })} min={0} step={0.5} />
            <NumberField label="Reuniões / dia" value={cfg.team.reunioesDia} onChange={(v) => setTeam({ reunioesDia: v })} min={0} step={1} />
            <NumberField label="Contatos / reunião" value={cfg.team.contatosPorReuniao} onChange={(v) => setTeam({ contatosPorReuniao: v })} min={0} step={1} />
            <NumberField label="Eventos / dia" value={cfg.team.eventosDia} onChange={(v) => setTeam({ eventosDia: v })} min={0} step={0.1} />
            <NumberField label="Contatos / evento" value={cfg.team.contatosPorEvento} onChange={(v) => setTeam({ contatosPorEvento: v })} min={0} step={10} />
          </div>
          {isFiniteNum(mobilizadoresNecessarios) && mobilizadoresNecessarios > 0 && (
            <p className="fr-hint" style={{ marginTop: 12 }}>
              Para fechar a meta diária apenas com corpo a corpo seriam necessários{" "}
              <b className="fr-num">{fmtInt(mobilizadoresNecessarios)}</b> mobilizadores nas condições acima.
            </p>
          )}
        </div>

        <div className="fr-stack">
          <div className="fr-card">
            <h2 className="fr-h2">Capacidade diária</h2>
            <div className="fr-kpi-value" style={{ fontSize: 30, marginTop: 6 }}>{fmtInt(d.dailyCapacity)}</div>
            <p className="fr-desc">vs. demanda diária de <b className="fr-num">{fmtInt(d.dailyContacts)}</b> contatos</p>
            <div className="fr-row" style={{ marginTop: 10 }}>
              <span className="fr-badge" style={{ background: "transparent", border: `1px solid ${statusColor[d.capacityStatus]}`, color: statusColor[d.capacityStatus] }}>
                {d.capacityStatus === "insuficiente" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} {statusLabel[d.capacityStatus]}
              </span>
            </div>
            <div className="fr-divider" />
            <div className="fr-line"><span>Gap diário</span>
              <b className="fr-num" style={{ color: d.capacityGap < 0 ? "var(--danger-ink)" : "var(--oficial-ink)" }}>{fmtSigned(d.capacityGap)}</b>
            </div>
            <div className="fr-line"><span>Meta por equipe (coordenação)</span><b className="fr-num">{fmtInt(d.metaPorEquipe)}</b></div>
            <div className="fr-line"><span>Meta por mobilizador / dia</span><b className="fr-num">{fmtInt(d.metaPorMobilizador)}</b></div>
          </div>

          <div className="fr-card">
            <h2 className="fr-h2">Capacidade acumulada no período</h2>
            <p className="fr-desc">
              Usa os dias por frente declarados na Agenda ({fmtInt(cfg.agenda.diasRua)} dias de rua,
              {" "}{fmtInt(cfg.agenda.diasEventos)} dias de eventos).
            </p>
            <div className="fr-line" style={{ marginTop: 10 }}><span>Capacidade total</span><b className="fr-num">{fmtInt(d.campaignCapacity)}</b></div>
            <div className="fr-line"><span>Contatos exigidos</span><b className="fr-num">{fmtInt(d.totalContactsNeeded)}</b></div>
            <div className="fr-line"><span>Gap do período</span>
              <b className="fr-num" style={{ color: d.campaignCapacityGap < 0 ? "var(--danger-ink)" : "var(--oficial-ink)" }}>{fmtSigned(d.campaignCapacityGap)}</b>
            </div>
          </div>

          <Formula title="Como a capacidade é calculada"
            formula={"CAPACIDADE_DIÁRIA =\n  MOBILIZADORES × HORAS_DIA × CONTATOS_HORA\n+ REUNIÕES_DIA × CONTATOS_POR_REUNIÃO\n+ EVENTOS_DIA × CONTATOS_POR_EVENTO\n\nCAPACIDADE_DO_PERÍODO =\n  (MOBILIZADORES × HORAS_DIA × CONTATOS_HORA + REUNIÕES_DIA × CONTATOS_POR_REUNIÃO) × DIAS_DE_RUA\n+ EVENTOS_DIA × CONTATOS_POR_EVENTO × DIAS_DE_EVENTOS"} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: AGENDA — os campos "dias de rua / digitais / eventos" agora alimentam
   a capacidade acumulada e o orçamento. Antes eram controles mortos.
   ========================================================================== */

function ViewAgenda({ cfg, update, derived }) {
  const d = derived;
  const setAgenda = (patch) => update({ agenda: { ...cfg.agenda, ...patch } });
  const datasInvalidas = daysBetween(cfg.agenda.dataInicio, cfg.agenda.dataFim) === 0;

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Tempo" title="Agenda"
        desc="Datas, dias ativos por frente e metas diária, semanal, por equipe e por mobilizador." />

      <div className="fr-grid fr-grid-half">
        <div className="fr-card">
          <h2 className="fr-h2">Janela de campanha</h2>
          <ProvBadge type={PROV.PREMISSA} />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <div className="fr-field">
              <label className="fr-field-label" htmlFor="dt-ini"><span>Data inicial</span></label>
              <input id="dt-ini" type="date" value={cfg.agenda.dataInicio} onChange={(e) => setAgenda({ dataInicio: e.target.value })} />
            </div>
            <div className="fr-field">
              <label className="fr-field-label" htmlFor="dt-fim"><span>Data final</span></label>
              <input id="dt-fim" type="date" value={cfg.agenda.dataFim} onChange={(e) => setAgenda({ dataFim: e.target.value })} />
            </div>
            <NumberField label="Dias de rua" value={cfg.agenda.diasRua} onChange={(v) => setAgenda({ diasRua: v })} min={0} max={365}
              hint="Dias em que corpo a corpo e reuniões operam" />
            <NumberField label="Dias de eventos" value={cfg.agenda.diasEventos} onChange={(v) => setAgenda({ diasEventos: v })} min={0} max={365}
              hint="Multiplica eventos/dia no orçamento e na capacidade" />
            <NumberField label="Dias digitais" value={cfg.agenda.diasDigitais} onChange={(v) => setAgenda({ diasDigitais: v })} min={0} max={365}
              hint="Referência de planejamento do canal digital" />
            <NumberField label="Dias de descanso" value={cfg.agenda.diasDescanso} onChange={(v) => setAgenda({ diasDescanso: v })} min={0} max={365} />
          </div>
          {datasInvalidas && <p className="fr-field-error" style={{ marginTop: 8 }}>A data final precisa ser posterior à inicial.</p>}
          <div className="fr-divider" />
          <div className="fr-line"><span>Dias corridos no período</span><b className="fr-num">{fmtInt(d.diasCorridos)}</b></div>
          <div className="fr-line"><span>Dias ativos calculados</span><b className="fr-num">{fmtInt(d.diasAtivosAgenda)}</b></div>
          <div className="fr-line"><span>Dias restantes até o fim</span><b className="fr-num">{fmtInt(d.diasRestantes)}</b></div>
          <button className="fr-btn sm" style={{ marginTop: 10 }}
            disabled={d.diasAtivosAgenda === cfg.campaignDays || d.diasAtivosAgenda <= 0}
            onClick={() => update({ campaignDays: d.diasAtivosAgenda })}>
            <RefreshCw size={12} /> Usar {fmtInt(d.diasAtivosAgenda)} como dias de campanha
          </button>
          <p className="fr-hint" style={{ marginTop: 8 }}>
            "Dias de campanha operacional" (usado no Funil Reverso) é hoje <b className="fr-num">{fmtInt(cfg.campaignDays)}</b>.
          </p>
        </div>

        <div className="fr-stack">
          <div className="fr-card">
            <h2 className="fr-h2">Metas derivadas</h2>
            <div className="fr-line" style={{ marginTop: 8 }}><span>Meta diária</span><b className="fr-num">{fmtInt(d.dailyContacts)}</b></div>
            <div className="fr-line"><span>Meta semanal</span><b className="fr-num">{fmtInt(d.weeklyContacts)}</b></div>
            <div className="fr-line"><span>Meta por equipe (coordenação)</span><b className="fr-num">{fmtInt(d.metaPorEquipe)}</b></div>
            <div className="fr-line"><span>Meta por mobilizador / dia</span><b className="fr-num">{fmtInt(d.metaPorMobilizador)}</b></div>
            <div className="fr-divider" />
            <div className="fr-line"><span>Eventos no período</span><b className="fr-num">{fmtDec(d.eventosTotal, 1)}</b></div>
            <div className="fr-line"><span>Capacidade acumulada</span><b className="fr-num">{fmtInt(d.campaignCapacity)}</b></div>
          </div>
          <CalendarioEleitoral cfg={cfg} update={update} derived={d} />
        </div>
      </div>
    </div>
  );
}

/** Datas derivadas do ano do pleito, não mais um texto fixo de 2026. */
function CalendarioEleitoral({ cfg, update, derived }) {
  const datas = electionDates(cfg.eleicaoAno);
  const fmtData = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
  const desalinhado = datas && cfg.agenda.dataFim !== datas.primeiroTurno;
  return (
    <div className="fr-card">
      <div className="fr-row fr-between">
        <h2 className="fr-h2">Calendário eleitoral {cfg.eleicaoAno}</h2>
        <ProvBadge type={PROV.OFICIAL} />
      </div>
      <p className="fr-desc" style={{ marginTop: 6 }}>
        A Lei 9.504/1997, art. 1º, fixa o 1º turno no primeiro domingo de outubro e o 2º turno no
        último domingo de outubro. As datas abaixo são calculadas a partir do ano selecionado na
        barra de contexto — confirme sempre as resoluções específicas do pleito no site do TSE.
      </p>
      <div className="fr-line" style={{ marginTop: 10 }}><span>1º turno</span><b className="fr-num">{fmtData(datas?.primeiroTurno)}</b></div>
      <div className="fr-line"><span>2º turno (se houver)</span><b className="fr-num">{fmtData(datas?.segundoTurno)}</b></div>
      {desalinhado && (
        <>
          <div className="fr-divider" />
          <p className="fr-hint">
            A data final da campanha ({cfg.agenda.dataFim}) não coincide com o 1º turno de {cfg.eleicaoAno}.
          </p>
          <button className="fr-btn sm" style={{ marginTop: 8 }}
            onClick={() => update({ agenda: { ...cfg.agenda, dataFim: datas.primeiroTurno } })}>
            <RefreshCw size={12} /> Usar {fmtData(datas.primeiroTurno)} como data final
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   VIEW: ORÇAMENTO
   ========================================================================== */

function ViewOrcamento({ cfg, update, derived }) {
  const d = derived;
  const setBudget = (patch) => update({ budget: { ...cfg.budget, ...patch } });
  const custoContatos = isFiniteNum(d.totalContactsNeeded) ? d.totalContactsNeeded * cfg.budget.custoPorContato : Infinity;
  const custoEventos = d.eventosTotal * cfg.budget.custoPorEvento;
  const custoLogistico = cfg.campaignDays * cfg.budget.custoLogisticoDia;
  const composicao = [
    { nome: "Contatos", valor: custoContatos },
    { nome: "Eventos", valor: custoEventos },
    { nome: "Logística", valor: custoLogistico },
  ];

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Recursos" title="Orçamento"
        desc="Custo estimado do plano — nunca apresentado como garantia de resultado." />

      <div className="fr-grid fr-grid-half">
        <div className="fr-card">
          <h2 className="fr-h2">Premissas de custo</h2>
          <ProvBadge type={PROV.PREMISSA} />
          <div className="fr-grid fr-grid-2" style={{ marginTop: 12 }}>
            <NumberField label="Custo por contato (R$)" value={cfg.budget.custoPorContato} onChange={(v) => setBudget({ custoPorContato: v })} min={0} step={0.05} />
            <NumberField label="Custo por evento (R$)" value={cfg.budget.custoPorEvento} onChange={(v) => setBudget({ custoPorEvento: v })} min={0} step={100} />
            <NumberField label="Custo logístico / dia (R$)" value={cfg.budget.custoLogisticoDia} onChange={(v) => setBudget({ custoLogisticoDia: v })} min={0} step={50} />
            <NumberField label="Orçamento total disponível (R$)" value={cfg.budget.orcamentoTotal} onChange={(v) => setBudget({ orcamentoTotal: v })} min={0} step={1000} />
          </div>
          <div className="fr-divider" />
          <h2 className="fr-h2" style={{ fontSize: 13 }}>Composição do custo</h2>
          <div style={{ marginTop: 8 }}>
            {composicao.map((c) => (
              <div key={c.nome} className="fr-line"><span>{c.nome}</span><b className="fr-num">{fmtMoney(c.valor)}</b></div>
            ))}
          </div>
          <p className="fr-hint" style={{ marginTop: 8 }}>
            Eventos = eventos/dia ({fmtDec(cfg.team.eventosDia, 1)}) × dias de eventos ({fmtInt(cfg.agenda.diasEventos)}), vindos de Equipes e Agenda.
          </p>
        </div>

        <div className="fr-stack">
          <div className="fr-grid fr-grid-2">
            <Kpi label="Custo total estimado" value={fmtMoney(d.totalCost)} tone={d.budgetGap < 0 ? "danger" : undefined} prov={PROV.ESTIMATIVA} />
            <Kpi label="Custo por apoio" value={fmtMoney(d.costPerSupport)} prov={PROV.ESTIMATIVA} />
          </div>
          <div className="fr-card">
            <div className="fr-line" style={{ fontSize: 13 }}>
              <span>Saldo vs. orçamento disponível</span>
              <b className="fr-num" style={{ color: d.budgetGap >= 0 ? "var(--oficial-ink)" : "var(--danger-ink)" }}>
                {fmtSigned(d.budgetGap, fmtMoney)}
              </b>
            </div>
            <div className="fr-progress-track" style={{ marginTop: 10 }}>
              <div className="fr-progress-fill" style={{
                width: `${Math.min(100, clamp01(safeDiv(d.totalCost, cfg.budget.orcamentoTotal)) * 100)}%`,
                background: d.budgetGap < 0 ? "var(--danger)" : "var(--oficial)",
              }} />
            </div>
            <p className="fr-hint" style={{ marginTop: 6 }}>
              O plano consome {fmtPct(safeDiv(d.totalCost, cfg.budget.orcamentoTotal))} do orçamento declarado.
            </p>
          </div>
          <Formula title="Como o custo total é calculado"
            formula={"CUSTO_TOTAL =\n  CONTATOS_NECESSÁRIOS × CUSTO_POR_CONTATO\n+ EVENTOS_DO_PERÍODO × CUSTO_POR_EVENTO\n+ DIAS_ATIVOS × CUSTO_LOGÍSTICO_DIA\n\nEVENTOS_DO_PERÍODO = EVENTOS_POR_DIA × DIAS_DE_EVENTOS (Agenda)\n\nCUSTO_POR_APOIO = CUSTO_TOTAL / META_AJUSTADA"} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: CENÁRIOS
   ========================================================================== */

function ViewCenarios({ cfg, update, derived }) {
  const allPresets = [
    SCENARIO_PRESETS.central, SCENARIO_PRESETS.conservador, SCENARIO_PRESETS.otimista,
    SCENARIO_PRESETS.maior_mobilizacao, SCENARIO_PRESETS.menor_conversao, SCENARIO_PRESETS.restricao_territorial,
    ...(cfg.customScenarios || []),
  ];
  const [novo, setNovo] = useState({ label: "", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1 });

  const criarCenario = () => {
    if (!novo.label.trim()) return;
    const s = {
      id: uid("cenario"), label: novo.label.trim(), abstentionDelta: novo.abstentionDelta,
      fidelityDelta: novo.fidelityDelta, conversionMultiplier: novo.conversionMultiplier, custom: true,
    };
    update({ customScenarios: [...(cfg.customScenarios || []), s] });
    setNovo({ label: "", abstentionDelta: 0, fidelityDelta: 0, conversionMultiplier: 1 });
  };
  const removerCenario = (id) => {
    update({
      customScenarios: (cfg.customScenarios || []).filter((s) => s.id !== id),
      scenarioId: cfg.scenarioId === id ? "central" : cfg.scenarioId,
    });
  };

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Incerteza controlada" title="Cenários"
        desc="Compare hipóteses diferentes sobre comparecimento, fidelidade, conversão e capacidade." />

      <div className="fr-card">
        <h2 className="fr-h2">Cenário ativo</h2>
        <div className="fr-chip-list" style={{ marginTop: 10 }}>
          {allPresets.map((p) => (
            <button key={p.id} type="button" aria-pressed={cfg.scenarioId === p.id}
              className={cx("fr-chip", cfg.scenarioId === p.id && "on")} onClick={() => update({ scenarioId: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Comparação entre cenários</h2>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead>
              <tr>
                <th>Cenário</th><th className="num">Meta ajustada</th><th className="num">Contatos necessários</th>
                <th className="num">Contatos / dia</th><th className="num">Capacidade / dia</th><th className="num">Gap</th><th />
              </tr>
            </thead>
            <tbody>
              {allPresets.map((p) => {
                const s = computeScenarioSummary(cfg, p);
                const active = cfg.scenarioId === p.id;
                return (
                  <tr key={p.id} style={active ? { background: "var(--brand-soft)" } : undefined}>
                    <td style={{ fontWeight: active ? 700 : 400 }}>
                      {p.label}{p.custom && <span className="fr-hint"> (personalizado)</span>}
                    </td>
                    <td className="num">{fmtInt(s.adjustedGoal)}</td>
                    <td className="num">{fmtInt(s.totalContacts)}</td>
                    <td className="num">{fmtInt(s.dailyContacts)}</td>
                    <td className="num">{fmtInt(s.capacity)}</td>
                    <td className="num" style={{ color: s.gap < 0 ? "var(--danger-ink)" : "var(--oficial-ink)", fontWeight: 700 }}>
                      {fmtSigned(s.gap)}
                    </td>
                    <td>
                      {p.custom && (
                        <button className="fr-icon-btn" aria-label={`Remover cenário ${p.label}`} onClick={() => removerCenario(p.id)}>
                          <X size={12} />
                        </button>
                      )}
                    </td>
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
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="cen-nome"><span>Nome</span></label>
            <input id="cen-nome" type="text" className="fr-input text" value={novo.label}
              onChange={(e) => setNovo((n) => ({ ...n, label: e.target.value }))} placeholder="Ex.: Chuvas em outubro" />
          </div>
          <NumberField label="Delta de abstenção" value={novo.abstentionDelta}
            onChange={(v) => setNovo((n) => ({ ...n, abstentionDelta: v }))} min={-0.5} max={0.5} step={0.01} suffix="0,05 = +5pp" />
          <NumberField label="Delta de fidelidade" value={novo.fidelityDelta}
            onChange={(v) => setNovo((n) => ({ ...n, fidelityDelta: v }))} min={-0.5} max={0.5} step={0.01} suffix="−0,05 = −5pp" />
          <NumberField label="Multiplicador de conversão" value={novo.conversionMultiplier}
            onChange={(v) => setNovo((n) => ({ ...n, conversionMultiplier: v }))} min={0.1} max={3} step={0.05} suffix="1 = sem alteração" />
        </div>
        <button className="fr-btn primary sm" style={{ marginTop: 10 }} onClick={criarCenario} disabled={!novo.label.trim()}>
          <Plus size={13} /> Salvar cenário
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: SIMULAÇÕES — Monte Carlo sobre o funil completo.
   Correções: (1) roda o mix de canais configurado em vez de uma taxa média
   única; (2) valida min < max e mostra a moda usada; (3) exibe um histograma
   de verdade, não sete barras de percentil disfarçadas de distribuição;
   (4) os limites acompanham a configuração atual.
   ========================================================================== */

function defaultBounds(cfg) {
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

function ViewSimulacoes({ cfg, derived }) {
  const [bounds, setBounds] = useState(() => defaultBounds(cfg));
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [staleSince, setStaleSince] = useState(false);

  // Os limites eram congelados na montagem: mudar a abstenção na barra de
  // contexto depois não os atualizava. Agora o app avisa e oferece resincronizar.
  useEffect(() => { setStaleSince(true); }, [cfg.abstentionRate, cfg.fidelityRate]);

  const erros = [];
  if (bounds.abstentionMin >= bounds.abstentionMax) erros.push("Abstenção: o mínimo precisa ser menor que o máximo.");
  if (bounds.fidelityMin >= bounds.fidelityMax) erros.push("Fidelidade: o mínimo precisa ser menor que o máximo.");
  if (bounds.conversionMultMin >= bounds.conversionMultMax) erros.push("Multiplicador de conversão: o mínimo precisa ser menor que o máximo.");
  const modaForaAbst = cfg.abstentionRate < bounds.abstentionMin || cfg.abstentionRate > bounds.abstentionMax;
  const modaForaFid = cfg.fidelityRate < bounds.fidelityMin || cfg.fidelityRate > bounds.fidelityMax;

  const run = () => {
    if (erros.length) return;
    setRunning(true);
    setTimeout(() => {
      setResult(runMonteCarlo({ cfg, bounds, iterations: bounds.iterations, seed: 42 }));
      setRunning(false);
      setStaleSince(false);
    }, 30);
  };

  const histData = result?.contactsHistogram.map((b) => ({
    faixa: `${Math.round(b.x0 / 1000)}k`, mid: b.mid, contagem: b.count,
  })) || [];

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Modo pesquisador" title="Simulações"
        desc="Milhares de simulações combinando comparecimento, fidelidade e conversão sobre o mix de canais configurado — o objetivo é mostrar a faixa de incerteza, não prever o resultado eleitoral." />

      <div className="fr-alert info">
        <Info size={15} />
        <span>
          Cada iteração roda o funil inteiro com os {derived.enabledChannels.length} canal(is) ativo(s) e suas
          cadeias próprias. A incerteza de conversão entra como multiplicador aplicado a cada canal,
          preservando as diferenças entre eles.
        </span>
      </div>

      <div className="fr-card">
        <div className="fr-row fr-between fr-row-wrap" style={{ marginBottom: 10 }}>
          <h2 className="fr-h2">Limites das premissas</h2>
          <button className="fr-btn sm" onClick={() => setBounds(defaultBounds(cfg))}>
            <RefreshCw size={12} /> Resincronizar com o plano
          </button>
        </div>
        <div className="fr-grid fr-grid-4">
          <NumberField label="Abstenção — mínimo" value={bounds.abstentionMin} min={0} max={1} step={0.01}
            onChange={(v) => setBounds((b) => ({ ...b, abstentionMin: v }))} />
          <NumberField label="Abstenção — máximo" value={bounds.abstentionMax} min={0} max={1} step={0.01}
            onChange={(v) => setBounds((b) => ({ ...b, abstentionMax: v }))} />
          <NumberField label="Fidelidade — mínimo" value={bounds.fidelityMin} min={0} max={1} step={0.01}
            onChange={(v) => setBounds((b) => ({ ...b, fidelityMin: v }))} />
          <NumberField label="Fidelidade — máximo" value={bounds.fidelityMax} min={0} max={1} step={0.01}
            onChange={(v) => setBounds((b) => ({ ...b, fidelityMax: v }))} />
          <NumberField label="Multiplicador de conversão — mínimo" value={bounds.conversionMultMin} min={0.05} max={3} step={0.05}
            onChange={(v) => setBounds((b) => ({ ...b, conversionMultMin: v }))} suffix="0,7 = −30%" />
          <NumberField label="Multiplicador de conversão — máximo" value={bounds.conversionMultMax} min={0.05} max={3} step={0.05}
            onChange={(v) => setBounds((b) => ({ ...b, conversionMultMax: v }))} suffix="1,3 = +30%" />
          <NumberField label="Iterações" value={bounds.iterations} min={500} max={20000} step={500}
            onChange={(v) => setBounds((b) => ({ ...b, iterations: v }))} />
        </div>

        <div className="fr-stack" style={{ gap: 8, marginTop: 12 }}>
          <p className="fr-hint">
            Moda (valor mais provável) fixada no plano atual: abstenção <b>{fmtPct(cfg.abstentionRate)}</b>,
            fidelidade <b>{fmtPct(cfg.fidelityRate)}</b>, multiplicador de conversão <b>1,00</b>.
          </p>
          {(modaForaAbst || modaForaFid) && (
            <div className="fr-alert atencao">
              <AlertTriangle size={15} />
              <span>A moda do plano está fora dos limites informados; ela será fixada no limite mais próximo para manter as amostras dentro do intervalo declarado.</span>
            </div>
          )}
          {erros.map((e, i) => <p key={i} className="fr-field-error">{e}</p>)}
          {staleSince && result && !erros.length && (
            <p className="fr-hint">As premissas do plano mudaram desde a última simulação — rode de novo para atualizar.</p>
          )}
        </div>

        <button className="fr-btn primary" style={{ marginTop: 12 }} onClick={run} disabled={running || erros.length > 0}>
          <Dice5 size={14} /> {running ? "Simulando…" : "Rodar simulação"}
        </button>
      </div>

      {result && (
        <>
          <div className="fr-card">
            <h2 className="fr-h2">Distribuição dos contatos necessários</h2>
            <p className="fr-desc">
              {fmtInt(result.iterations)} simulações. Cada barra é a quantidade de simulações que caiu naquela
              faixa — as linhas marcam a mediana e o intervalo P10–P90.
            </p>
            <div style={{ height: 320, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={{ top: 10, right: 20, left: 0, bottom: 22 }}>
                  <CartesianGrid stroke="#D7DBE3" vertical={false} />
                  <XAxis dataKey="faixa" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#4C5468" }}
                    interval="preserveStartEnd"
                    label={{ value: "Contatos necessários", position: "insideBottom", offset: -12, style: { fontSize: 11, fill: "#4C5468" } }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#4C5468" }}
                    label={{ value: "Simulações", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#4C5468" } }} />
                  <Tooltip contentStyle={{ fontSize: 12 }}
                    formatter={(v) => [fmtInt(v), "simulações"]}
                    labelFormatter={(l) => `Faixa ~${l} contatos`} />
                  <Bar dataKey="contagem" fill="#3D6BA8" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="fr-grid fr-grid-5" style={{ marginTop: 14 }}>
              <Kpi label="P10 (otimista)" value={fmtInt(result.contacts.p10)} prov={PROV.ESTIMATIVA} />
              <Kpi label="P25" value={fmtInt(result.contacts.p25)} prov={PROV.ESTIMATIVA} />
              <Kpi label="Mediana (P50)" value={fmtInt(result.contacts.p50)} prov={PROV.ESTIMATIVA} />
              <Kpi label="P75" value={fmtInt(result.contacts.p75)} prov={PROV.ESTIMATIVA} />
              <Kpi label="P90 (pessimista)" value={fmtInt(result.contacts.p90)} prov={PROV.ESTIMATIVA} />
            </div>
            <p className="fr-hint" style={{ marginTop: 10 }}>
              Leitura: em 80% das simulações os contatos necessários ficaram entre{" "}
              <b className="fr-num">{fmtInt(result.contacts.p10)}</b> e <b className="fr-num">{fmtInt(result.contacts.p90)}</b>.
              Isto é uma faixa de incerteza sobre premissas, <b>não</b> uma previsão de resultado eleitoral.
            </p>
          </div>

          <div className="fr-card">
            <h2 className="fr-h2">Meta diária correspondente</h2>
            <div className="fr-scroll-x" style={{ marginTop: 10 }}>
              <table className="fr-table">
                <thead>
                  <tr><th>Percentil</th><th className="num">Meta ajustada</th><th className="num">Contatos</th><th className="num">Contatos / dia</th><th className="num">Capacidade / dia</th></tr>
                </thead>
                <tbody>
                  {["p10", "p25", "p50", "p75", "p90"].map((k) => (
                    <tr key={k}>
                      <td>{k.toUpperCase()}</td>
                      <td className="num">{fmtInt(result.adjustedGoal[k])}</td>
                      <td className="num">{fmtInt(result.contacts[k])}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtInt(result.daily[k])}</td>
                      <td className="num" style={{ color: result.daily[k] > derived.dailyCapacity ? "var(--danger-ink)" : "var(--oficial-ink)" }}>
                        {fmtInt(derived.dailyCapacity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   VIEW: DADOS — o registro agora declara o STATUS real de cada conector.
   A versão anterior marcava "Eleitorado por UF" como oficial enquanto usava
   uma tabela congelada no código.
   ========================================================================== */

const DATA_SOURCE_REGISTRY = [
  {
    indicador: "Eleitorado por UF", usadoHoje: "Tabela congelada em src/engine.js (ordem de grandeza real)",
    fonteAlvo: "TSE — dataset \"Eleitorado Atual\"", nivel: "UF", status: "nao-conectado", tipo: PROV.HISTORICO,
  },
  {
    indicador: "Vagas por circunscrição", usadoHoje: "Composição vigente da Câmara e das Assembleias, congelada no código",
    fonteAlvo: "TSE — resolução de distribuição de vagas do pleito", nivel: "UF", status: "nao-conectado", tipo: PROV.HISTORICO,
  },
  {
    indicador: "Comparecimento e abstenção", usadoHoje: "Referência 2022/2018 por UF, congelada no código",
    fonteAlvo: "TSE — resultados por seção", nivel: "UF", status: "nao-conectado", tipo: PROV.HISTORICO,
  },
  {
    indicador: "Recorte municipal", usadoHoje: "8 municípios de SP + bucket \"Restante do estado\"",
    fonteAlvo: "TSE (eleitorado por município) + IBGE (malhas)", nivel: "Município", status: "nao-conectado", tipo: PROV.HISTORICO,
  },
  {
    indicador: "Datas do calendário eleitoral", usadoHoje: "Lei 9.504/1997, art. 1º",
    fonteAlvo: "Resoluções do TSE para o pleito", nivel: "Nacional", status: "lei", tipo: PROV.OFICIAL,
  },
  {
    indicador: "Regra de distribuição de vagas", usadoHoje: "Lei 9.504/1997, arts. 106–109 (redação da Lei 14.211/2021)",
    fonteAlvo: "Resoluções do TSE para o pleito", nivel: "Nacional", status: "lei", tipo: PROV.OFICIAL,
  },
  {
    indicador: "Taxas de conversão por canal", usadoHoje: "Inseridas pela equipe de campanha",
    fonteAlvo: "Histórico próprio da campanha", nivel: "Canal", status: "usuario", tipo: PROV.PREMISSA,
  },
  {
    indicador: "Indicadores socioeconômicos", usadoHoje: "Não utilizado em nenhum cálculo",
    fonteAlvo: "IBGE — Censo e estimativas", nivel: "Município", status: "nao-conectado", tipo: PROV.ESTIMATIVA,
  },
];

const STATUS_BADGE = {
  "nao-conectado": { cls: "perigo", label: "Não conectado" },
  lei: { cls: "oficial", label: "Definido em lei" },
  usuario: { cls: "premissa", label: "Informado pela equipe" },
};

function ViewDados() {
  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Rastreabilidade" title="Dados"
        desc="Toda métrica calculada declara sua fonte. Uma estimativa nunca é exibida como se fosse dado oficial." />

      <div className="fr-alert atencao">
        <AlertTriangle size={15} />
        <span>
          <b>Nenhum conector de dados está ligado nesta versão.</b> Os números de eleitorado,
          comparecimento e vagas são uma fotografia congelada no código-fonte, com ordem de grandeza
          real, mas sem data de atualização e sem consulta ao TSE. Antes de qualquer uso operacional,
          conecte as fontes abaixo.
        </span>
      </div>

      <div className="fr-grid fr-grid-3">
        {[
          { nome: "TSE — Portal de Dados Abertos", desc: "dadosabertos.tse.jus.br — eleitorado, candidatos, resultados, prestação de contas, locais de votação. Distribuído em lote (CSV/ZIP por ano), sem autenticação; pede um passo de ETL agendado, não uma chamada em tempo real.", status: "nao-conectado" },
          { nome: "IBGE", desc: "Malhas territoriais, população estimada, indicadores do Censo — usados para cruzar com o eleitorado (o TSE não faz esse cruzamento nativamente).", status: "nao-conectado" },
          { nome: "Fontes estaduais / TREs", desc: "Alguns TREs publicam webservices próprios (ex.: locais de votação em JSON). Conectores modulares, adicionados UF a UF.", status: "nao-conectado" },
        ].map((c) => (
          <div key={c.nome} className="fr-card">
            <div className="fr-row fr-between">
              <h2 className="fr-h2">{c.nome}</h2>
              <span className="fr-badge perigo"><span className="dot" />Não conectado</span>
            </div>
            <p className="fr-desc" style={{ marginTop: 6 }}>{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Registro de fontes por indicador</h2>
        <p className="fr-desc">O que o app <b>realmente usa hoje</b> em cada indicador, e qual seria a fonte definitiva.</p>
        <div className="fr-scroll-x" style={{ marginTop: 10 }}>
          <table className="fr-table">
            <thead>
              <tr><th>Indicador</th><th>O que é usado hoje</th><th>Fonte definitiva</th><th>Nível</th><th>Status</th><th>Classificação</th></tr>
            </thead>
            <tbody>
              {DATA_SOURCE_REGISTRY.map((r, i) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <tr key={i}>
                    <td><b>{r.indicador}</b></td>
                    <td>{r.usadoHoje}</td>
                    <td>{r.fonteAlvo}</td>
                    <td>{r.nivel}</td>
                    <td><span className={cx("fr-badge", badge.cls)}><span className="dot" />{badge.label}</span></td>
                    <td><ProvBadge type={r.tipo} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">O que cada classificação significa</h2>
        <div className="fr-grid fr-grid-4" style={{ marginTop: 10 }}>
          {Object.keys(PROV_LABEL).map((k) => (
            <div key={k}>
              <ProvBadge type={k} />
              <p className="fr-hint" style={{ marginTop: 6 }}>{PROV_HELP[k]}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   VIEW: RELATÓRIOS — exportação, modelos salvos e rastreamento operacional.
   O log agora vive no App (não mais só nesta tela), porque a Visão Geral
   depende dele.
   ========================================================================== */

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

function ViewRelatorios({ cfg, derived, onLoadModel, onResetConfig, models, setModels, log, setLog }) {
  const d = derived;
  const [modelName, setModelName] = useState("Modelo de Planejamento v1.0");
  const [entry, setEntry] = useState({
    data: new Date().toISOString().slice(0, 10), territorio: "", atividade: "", planejado: 0, realizado: 0,
  });

  const saveModel = () => {
    setModels([...models, {
      id: uid("modelo"), name: modelName.trim() || `Modelo ${models.length + 1}`,
      timestamp: new Date().toISOString(), schemaVersion: cfg.schemaVersion, cfg,
    }]);
  };
  const deleteModel = (id) => setModels(models.filter((m) => m.id !== id));
  const addEntry = () => {
    setLog([...log, { ...entry, id: uid("log") }]);
    setEntry((e) => ({ ...e, planejado: 0, realizado: 0 }));
  };
  const removeEntry = (id) => setLog(log.filter((l) => l.id !== id));
  const clearAllData = () => {
    if (!window.confirm("Isso apaga modelos salvos, o registro operacional e a configuração atual deste navegador. Continuar?")) return;
    setModels([]); setLog([]); onResetConfig();
  };

  const exportJSON = () => {
    downloadBlob("plano-operacional.json", JSON.stringify({
      geradoEm: new Date().toISOString(),
      aviso: "Dados de eleitorado e comparecimento são referência congelada no código, não consulta ao TSE.",
      cargo: d.office.label, uf: d.uf.name, cenario: d.preset.label,
      metaVotos: cfg.voteGoal, metaAjustada: d.adjustedGoal,
      eleitoradoCircunscricao: d.eleitoradoElegivel, votosEsperados: d.eleitoradoEfetivo,
      metaComoFatiaDosVotos: d.goalShareOfElectorate,
      contatosNecessarios: d.totalContactsNeeded, contatosDia: d.dailyContacts,
      capacidadeDia: d.dailyCapacity, capacidadePeriodo: d.campaignCapacity,
      custoEstimado: d.totalCost, custoPorApoio: d.costPerSupport,
      contatosRealizados: d.realizado, deficitContatos: d.deficitContatos,
      territorios: d.territories.map((t) => ({
        nome: t.name, priorizado: !t.resto, metaTerritorial: Math.round(t.metaTerritorial),
        participacaoNaMeta: t.share, penetracaoNecessaria: t.penetracaoNecessaria,
      })),
      canais: d.channelResults.map((c) => ({
        canal: c.label, ativo: c.enabled, participacao: c.share, conversao: c.conversion,
        contatosNecessarios: Math.round(c.contactsNeeded),
        unidadeOperacional: Math.round(c.actionsNeeded), unidade: c.unit,
      })),
      proporcional: d.proportionalResult ? {
        vagas: d.proportionalResult.vagas, quocienteEleitoral: d.proportionalResult.qe,
        quocientePartidario: d.proportionalResult.qp, vagasDaLegenda: d.proportionalResult.ownSeats,
        eleito: d.proportionalResult.minhaLinha?.elected ?? null,
      } : null,
      alertas: d.alerts,
    }, null, 2), "application/json");
  };
  const exportTerritoriosCSV = () => downloadBlob("plano-territorial.csv", toCSV([
    ["Território", "Priorizado", "Eleitorado (M)", "% do eleitorado", "% da meta", "Meta territorial", "Penetração exigida"],
    ...d.territories.map((t) => [
      t.name, t.resto ? "não" : "sim", fmtDec(t.eleitoradoM, 2), fmtPct(t.eleitoradoShare),
      fmtPct(t.share), Math.round(t.metaTerritorial), fmtPct(t.penetracaoNecessaria, 2),
    ]),
  ]), "text/csv");
  const exportCanaisCSV = () => downloadBlob("plano-canais.csv", toCSV([
    ["Canal", "Ativo", "Participação", "Conversão", "Contatos necessários", "Unidade operacional", "Quantidade"],
    ...d.channelResults.map((c) => [
      c.label, c.enabled ? "sim" : "não", fmtPct(c.share), fmtPct(c.conversion),
      Math.round(c.contactsNeeded), c.unit, Math.round(c.actionsNeeded),
    ]),
  ]), "text/csv");
  const exportLogCSV = () => downloadBlob("registro-operacional.csv", toCSV([
    ["Data", "Território", "Atividade", "Planejado", "Realizado"],
    ...log.map((l) => [l.data, l.territorio, l.atividade, l.planejado, l.realizado]),
  ]), "text/csv");

  const trackChart = log
    .slice()
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .reduce((acc, l) => {
      const prev = acc[acc.length - 1];
      acc.push({
        name: l.data,
        planejado: (prev?.planejado || 0) + Number(l.planejado || 0),
        realizado: (prev?.realizado || 0) + Number(l.realizado || 0),
      });
      return acc;
    }, []);

  return (
    <div className="fr-stack">
      <SectionHead eyebrow="Saída" title="Relatórios"
        desc="Exportação do plano, modelos salvos e rastreamento planejado × realizado." />

      <div className="fr-card">
        <h2 className="fr-h2">Exportar plano operacional</h2>
        <div className="fr-row fr-row-wrap" style={{ marginTop: 10 }}>
          <button className="fr-btn primary" onClick={exportJSON}><Download size={14} /> JSON completo</button>
          <button className="fr-btn" onClick={exportTerritoriosCSV}><Download size={14} /> CSV — territórios</button>
          <button className="fr-btn" onClick={exportCanaisCSV}><Download size={14} /> CSV — canais</button>
          <button className="fr-btn" onClick={exportLogCSV} disabled={!log.length}><Download size={14} /> CSV — registro</button>
          <button className="fr-btn" onClick={() => window.print()}><FileText size={14} /> Imprimir / PDF</button>
        </div>
        <p className="fr-hint" style={{ marginTop: 8 }}>
          O JSON inclui os alertas ativos e o aviso de proveniência dos dados. A impressão usa uma
          folha de estilo própria, sem a navegação.
        </p>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Modelos de planejamento salvos</h2>
        <div className="fr-row" style={{ marginTop: 10, maxWidth: 460 }}>
          <input type="text" className="fr-input text" aria-label="Nome do modelo"
            value={modelName} onChange={(e) => setModelName(e.target.value)} />
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
                        <button className="fr-icon-btn" aria-label={`Excluir ${m.name}`} onClick={() => deleteModel(m.id)}><X size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fr-hint" style={{ marginTop: 10 }}>Nenhum modelo salvo neste navegador ainda.</p>}
        <p className="fr-hint" style={{ marginTop: 10 }}>
          Modelos ficam no <code>localStorage</code> deste navegador: não sincronizam entre pessoas nem entre dispositivos.
        </p>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Rastreamento operacional — planejado × realizado</h2>
        <p className="fr-desc">O total realizado alimenta os indicadores de progresso e déficit na Visão Geral.</p>
        <div className="fr-grid fr-grid-5" style={{ marginTop: 10 }}>
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="log-data"><span>Data</span></label>
            <input id="log-data" type="date" value={entry.data} onChange={(e) => setEntry((x) => ({ ...x, data: e.target.value }))} />
          </div>
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="log-terr"><span>Território</span></label>
            <input id="log-terr" type="text" className="fr-input text" value={entry.territorio}
              onChange={(e) => setEntry((x) => ({ ...x, territorio: e.target.value }))} />
          </div>
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="log-ativ"><span>Equipe / atividade</span></label>
            <input id="log-ativ" type="text" className="fr-input text" value={entry.atividade}
              onChange={(e) => setEntry((x) => ({ ...x, atividade: e.target.value }))} />
          </div>
          <NumberField label="Contatos planejados" value={entry.planejado} min={0}
            onChange={(v) => setEntry((x) => ({ ...x, planejado: v }))} />
          <NumberField label="Contatos realizados" value={entry.realizado} min={0}
            onChange={(v) => setEntry((x) => ({ ...x, realizado: v }))} />
        </div>
        <button className="fr-btn sm primary" style={{ marginTop: 10 }} onClick={addEntry}><Plus size={13} /> Registrar dia</button>

        {log.length > 0 && (
          <>
            <div className="fr-grid fr-grid-4" style={{ marginTop: 16 }}>
              <Kpi label="Total planejado" value={fmtInt(d.planejado)} prov={PROV.PREMISSA} />
              <Kpi label="Total realizado" value={fmtInt(d.realizado)}
                sub={`${fmtPct(safeDiv(d.realizado, d.planejado))} do planejado`} prov={PROV.PREMISSA} />
              <Kpi label="Progresso do funil" value={fmtPct(d.progressoFunil)}
                sub={`de ${fmtInt(d.totalContactsNeeded)} contatos`} prov={PROV.ESTIMATIVA} />
              <Kpi label="Déficit restante" value={fmtInt(d.deficitContatos)}
                tone={d.deficitContatos > 0 ? "danger" : "ok"} prov={PROV.ESTIMATIVA} />
            </div>
            <div style={{ height: 240, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trackChart} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#D7DBE3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4C5468" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#4C5468" }} tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => fmtInt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="planejado" name="Planejado (acumulado)" stroke="#5E6679" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="realizado" name="Realizado (acumulado)" stroke="#21418F" strokeWidth={2} dot={false} />
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
                      <td className="num">{fmtInt(Number(l.planejado))}</td>
                      <td className="num">{fmtInt(Number(l.realizado))}</td>
                      <td><button className="fr-icon-btn" aria-label="Remover registro" onClick={() => removeEntry(l.id)}><X size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Dados guardados neste navegador</h2>
        <p className="fr-desc">
          O app não tem conta de usuário nem servidor. Tudo vive no <code>localStorage</code> deste navegador.
        </p>
        <div className="fr-row fr-row-wrap" style={{ marginTop: 12 }}>
          <button className="fr-btn" onClick={onResetConfig}><RotateCcw size={13} /> Restaurar configuração padrão</button>
          <button className="fr-btn danger" onClick={clearAllData}><Trash2 size={13} /> Apagar tudo deste navegador</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   CARD: regras jurídico-eleitorais.
   Proporcional reescrito: quociente eleitoral -> quociente partidário ->
   sobras por maiores médias com o filtro de 80% do QE (Lei 14.211/2021), mais
   o ranking interno da legenda. A versão anterior aplicava D'Hondt puro sobre
   todas as vagas e exibia, lado a lado e sem reconciliação, um QP de 2 e uma
   alocação de 7 cadeiras para a mesma legenda.
   ========================================================================== */

function OfficeRulesCard({ cfg, update, derived }) {
  const office = derived.office;

  if (office.tipo === "majoritario") {
    const setMaj = (patch) => update({ majoritario: { ...cfg.majoritario, ...patch } });
    return (
      <div className="fr-card">
        <div className="fr-row fr-between">
          <h2 className="fr-h2">Regras — eleição majoritária</h2>
          <ProvBadge type={PROV.OFICIAL} />
        </div>
        <p className="fr-desc">
          Vitória por maioria dos votos válidos; segundo turno quando nenhum candidato atinge maioria
          absoluta (cargos executivos; em municípios, apenas os com mais de 200 mil eleitores).
        </p>
        <div className="fr-grid fr-grid-half" style={{ marginTop: 12 }}>
          <label className="fr-row" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={cfg.majoritario.segundoTurno}
              onChange={(e) => setMaj({ segundoTurno: e.target.checked })} />
            Considerar possibilidade de segundo turno
          </label>
          <SliderField label="Margem de segurança sobre a meta ajustada"
            value={cfg.majoritario.margemSeguranca} onChange={(v) => setMaj({ margemSeguranca: v })} min={0} max={0.3} />
        </div>
        <div className="fr-divider" />
        <div className="fr-line">
          <span>Meta com margem de segurança</span>
          <b className="fr-num">{fmtInt(derived.majoritarioResult?.minVotosSeguranca)}</b>
        </div>
        <div className="fr-line">
          <span>Votos esperados na circunscrição</span>
          <b className="fr-num">{fmtInt(derived.eleitoradoEfetivo)}</b>
        </div>
        <div className="fr-line">
          <span>Maioria absoluta dos votos esperados</span>
          <b className="fr-num">{fmtInt(derived.eleitoradoEfetivo / 2)}</b>
        </div>
      </div>
    );
  }

  if (office.tipo !== "proporcional") return null;

  const p = cfg.proportional;
  const r = derived.proportionalResult;
  if (!r) return null;
  const setProp = (patch) => update({ proportional: { ...p, ...patch } });
  const setOutro = (id, campo, valor) => setProp({ outrosPartidos: p.outrosPartidos.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)) });
  const addOutro = () => setProp({ outrosPartidos: [...p.outrosPartidos, { id: uid("part"), nome: "Nova legenda", votos: 0 }] });
  const removeOutro = (id) => setProp({ outrosPartidos: p.outrosPartidos.filter((o) => o.id !== id) });
  const setConc = (id, campo, valor) => setProp({ concorrentes: p.concorrentes.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)) });
  const addConc = () => setProp({ concorrentes: [...p.concorrentes, { id: uid("conc"), nome: "Novo concorrente", votos: 0 }] });
  const removeConc = (id) => setProp({ concorrentes: p.concorrentes.filter((c) => c.id !== id) });

  const vagasAuto = getVagas({ ...cfg, proportional: { ...p, vagasOverride: null } });

  return (
    <div className="fr-stack">
      <div className="fr-card">
        <div className="fr-row fr-between">
          <h2 className="fr-h2">Regras — eleição proporcional</h2>
          <ProvBadge type={PROV.OFICIAL} />
        </div>
        <p className="fr-desc">
          Quociente eleitoral → quociente partidário → sobras por maiores médias, conforme os arts.
          106 a 109 da Lei 9.504/1997, com a redação da Lei 14.211/2021. Confirme sempre a resolução
          do TSE vigente para o pleito antes de decisões reais.
        </p>

        <div className="fr-grid fr-grid-3" style={{ marginTop: 12 }}>
          <div className="fr-field">
            <label className="fr-field-label" htmlFor="vagas-input">
              <span>Vagas em disputa</span><ProvBadge type={PROV.HISTORICO} />
            </label>
            <div className="fr-row">
              <input id="vagas-input" type="number" min={1} value={r.vagas}
                onChange={(e) => setProp({ vagasOverride: parseFloat(e.target.value) || null })} />
              {isFiniteNum(p.vagasOverride) && p.vagasOverride > 0 && (
                <button className="fr-icon-btn" title={`Voltar ao valor da circunscrição (${vagasAuto})`}
                  aria-label="Voltar ao valor automático" onClick={() => setProp({ vagasOverride: null })}>
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
            <span className="fr-hint">
              {isFiniteNum(p.vagasOverride) && p.vagasOverride > 0
                ? `Sobrescrito manualmente. ${getUf(cfg).name} tem ${vagasAuto}.`
                : `Vem de ${getUf(cfg).name} / ${office.label}.`}
            </span>
          </div>
          <NumberField label="Votos válidos da circunscrição" value={p.votosValidosCircunscricao}
            onChange={(v) => setProp({ votosValidosCircunscricao: v })} min={0} step={10000} prov={PROV.PREMISSA} />
          <NumberField label="Votação estimada da minha legenda" value={p.votosPartido}
            onChange={(v) => setProp({ votosPartido: v })} min={0} step={10000} prov={PROV.PREMISSA} />
        </div>

        <div className="fr-grid fr-grid-4" style={{ marginTop: 14 }}>
          <Kpi label="Quociente eleitoral (QE)" value={fmtInt(r.qe)} sub="votos válidos ÷ vagas" prov={PROV.ESTIMATIVA} />
          <Kpi label="Quociente partidário (QP)" value={fmtInt(r.qp)} sub="vagas antes das sobras" prov={PROV.ESTIMATIVA} />
          <Kpi label="Vagas da legenda" value={fmtInt(r.ownSeats)}
            sub={`${r.qp} por quociente + ${r.sobrasDaLegenda} por sobras`} prov={PROV.ESTIMATIVA} />
          <Kpi label="Mínimo individual (10% do QE)" value={fmtInt(r.limiarIndividual)}
            sub={cfg.voteGoal >= r.limiarIndividual ? "sua meta supera o mínimo" : "sua meta está abaixo"}
            tone={cfg.voteGoal >= r.limiarIndividual ? "ok" : "danger"} prov={PROV.ESTIMATIVA} />
        </div>

        <Formula title="Como as vagas foram distribuídas"
          formula={"QE = VOTOS_VÁLIDOS / VAGAS\nQP = parte inteira de (VOTOS_DO_PARTIDO / QE)\n\nSOBRAS = VAGAS − Σ QP,  distribuídas uma a uma para a maior média:\n  MÉDIA = VOTOS_DO_PARTIDO / (VAGAS_JÁ_OBTIDAS + 1)\n\nFiltro (art. 109, §2º): concorre às sobras só o partido com ≥ 80% do QE\ne o candidato com ≥ 20% do QE. Se nenhum partido alcançar, todos concorrem (§3º)."}
          variables={[
            { name: "VAGAS", value: fmtInt(r.vagas), prov: PROV.HISTORICO },
            { name: "QE", value: fmtInt(r.qe), prov: PROV.ESTIMATIVA },
            { name: "VAGAS_POR_QUOCIENTE", value: fmtInt(r.seatsFromQuotient), prov: PROV.ESTIMATIVA },
            { name: "SOBRAS_DISTRIBUÍDAS", value: fmtInt(r.sobras), prov: PROV.ESTIMATIVA },
            { name: "80% DO QE", value: fmtInt(r.qe * SOBRAS_PARTY_THRESHOLD), prov: PROV.ESTIMATIVA },
            { name: "20% DO QE (candidato)", value: fmtInt(r.limiarSobras), prov: PROV.ESTIMATIVA },
          ]}
        >
          <p style={{ marginTop: 8 }}>
            {r.restrictedPool
              ? "Ao menos um partido alcançou 80% do quociente, então só os que alcançaram disputaram as sobras."
              : "Nenhum partido alcançou 80% do quociente eleitoral — pelo §3º, todos concorreram às sobras."}
          </p>
          <p style={{ marginTop: 6 }}>
            <b>Simplificações:</b> não modelamos o esgotamento da lista de candidatos do partido nem
            coligações majoritárias. Ambos podem alterar a alocação real.
          </p>
        </Formula>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Legendas concorrentes</h2>
        <p className="fr-desc">
          Votos válidos declarados: <b className="fr-num">{fmtInt(p.votosValidosCircunscricao)}</b>.
          Legendas listadas somam <b className="fr-num">{fmtInt(r.somaDeclarada)}</b>.
        </p>
        {r.restanteDeclarado > 0 && (
          <div className="fr-alert info" style={{ marginTop: 10 }}>
            <Info size={15} />
            <span>
              Sobram <b>{fmtInt(r.restanteDeclarado)}</b> votos não atribuídos a nenhuma legenda listada.
              {p.incluirDemaisLegendas
                ? " Eles entram na distribuição como \"Demais legendas\" — sem isso, todas as vagas seriam repartidas apenas entre as legendas acima."
                : " Eles estão fora da distribuição, o que infla artificialmente as vagas das legendas listadas."}
            </span>
          </div>
        )}
        <label className="fr-row" style={{ marginTop: 10, fontSize: 12.5 }}>
          <input type="checkbox" checked={p.incluirDemaisLegendas}
            onChange={(e) => setProp({ incluirDemaisLegendas: e.target.checked })} />
          Incluir os votos restantes como "Demais legendas" na distribuição
        </label>

        <div className="fr-stack" style={{ marginTop: 12, gap: 6 }}>
          {p.outrosPartidos.map((o) => (
            <div key={o.id} className="fr-row">
              <input type="text" className="fr-input text" aria-label="Nome da legenda" value={o.nome}
                onChange={(e) => setOutro(o.id, "nome", e.target.value)} style={{ flex: 1 }} />
              <input type="number" className="fr-input" aria-label={`Votos de ${o.nome}`} min={0} value={o.votos}
                onChange={(e) => setOutro(o.id, "votos", Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 140 }} />
              <button className="fr-icon-btn" aria-label={`Remover ${o.nome}`} onClick={() => removeOutro(o.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
        <button className="fr-btn sm" style={{ marginTop: 10 }} onClick={addOutro}><Plus size={13} /> Adicionar legenda</button>

        <div className="fr-scroll-x" style={{ marginTop: 14 }}>
          <table className="fr-table">
            <thead>
              <tr>
                <th>Legenda</th><th className="num">Votos</th><th className="num">QP</th>
                <th className="num">Sobras</th><th className="num">Total de vagas</th><th>Sobras</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((a) => (
                <tr key={a.id} style={a.id === "own" ? { background: "var(--brand-soft)" } : undefined}>
                  <td style={{ fontWeight: a.id === "own" ? 700 : 400 }}>
                    {a.name}{a.residual && <span className="fr-hint"> (resto declarado)</span>}
                  </td>
                  <td className="num">{fmtInt(a.votes)}</td>
                  <td className="num">{a.qp}</td>
                  <td className="num">{a.sobrasSeats}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{a.seats}</td>
                  <td>
                    {a.eligibleForSobras
                      ? <span className="fr-badge oficial"><span className="dot" />Apta</span>
                      : <span className="fr-badge perigo"><Lock size={10} />Abaixo de 80% do QE</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{fmtInt(r.rows.reduce((a, x) => a + x.votes, 0))}</td>
                <td className="num">{r.seatsFromQuotient}</td>
                <td className="num">{r.sobras}</td>
                <td className="num">{r.rows.reduce((a, x) => a + x.seats, 0)} / {r.vagas}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="fr-card">
        <h2 className="fr-h2">Competição interna da legenda</h2>
        <p className="fr-desc">
          A legenda conquista <b>{r.ownSeats}</b> vaga(s). Quem as ocupa é definido pela votação
          nominal, entre os candidatos que atingem 20% do QE ({fmtInt(r.limiarSobras)} votos).
        </p>
        <div className="fr-stack" style={{ marginTop: 12, gap: 6 }}>
          {p.concorrentes.map((c) => (
            <div key={c.id} className="fr-row">
              <input type="text" className="fr-input text" aria-label="Nome do concorrente" value={c.nome}
                onChange={(e) => setConc(c.id, "nome", e.target.value)} style={{ flex: 1 }} />
              <input type="number" className="fr-input" aria-label={`Votos de ${c.nome}`} min={0} value={c.votos}
                onChange={(e) => setConc(c.id, "votos", Math.max(0, parseFloat(e.target.value) || 0))} style={{ width: 140 }} />
              <button className="fr-icon-btn" aria-label={`Remover ${c.nome}`} onClick={() => removeConc(c.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
        <button className="fr-btn sm" style={{ marginTop: 10 }} onClick={addConc}><Plus size={13} /> Adicionar concorrente</button>

        <div className="fr-scroll-x" style={{ marginTop: 14 }}>
          <table className="fr-table">
            <thead><tr><th className="num">#</th><th>Candidatura</th><th className="num">Votos</th><th>Atinge 20% do QE</th><th>Resultado</th></tr></thead>
            <tbody>
              {r.ranking.map((c, i) => (
                <tr key={c.id} style={c.self ? { background: "var(--brand-soft)" } : undefined}>
                  <td className="num">{i + 1}</td>
                  <td style={{ fontWeight: c.self ? 700 : 400 }}>{c.nome}</td>
                  <td className="num">{fmtInt(c.votos)}</td>
                  <td>{c.apto ? "sim" : <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}>não</span>}</td>
                  <td>
                    {c.elected
                      ? <span className="fr-badge oficial"><CheckCircle2 size={10} />Eleito</span>
                      : <span className="fr-badge perigo"><span className="dot" />Não eleito</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fr-hint" style={{ marginTop: 10 }}>
          Participação da candidatura no total de votos da legenda: <b className="fr-num">{fmtPct(r.faixaInternaShare)}</b>.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   NAVEGAÇÃO — o modo de exibição agora filtra de verdade a navegação.
   ========================================================================== */

const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão Geral", icon: LayoutDashboard, modes: ["assessor", "pesquisador"] },
  { id: "meta", label: "Meta Eleitoral", icon: Target, modes: ["assessor", "pesquisador"] },
  { id: "funil", label: "Funil Reverso", icon: Filter, modes: ["assessor", "pesquisador"] },
  { id: "territorios", label: "Territórios", icon: Map, modes: ["assessor", "pesquisador"] },
  { id: "publicos", label: "Públicos", icon: Users, modes: ["pesquisador"] },
  { id: "canais", label: "Canais", icon: Radio, modes: ["assessor", "pesquisador"] },
  { id: "equipes", label: "Equipes", icon: UsersRound, modes: ["assessor", "pesquisador"] },
  { id: "agenda", label: "Agenda", icon: Calendar, modes: ["assessor", "pesquisador"] },
  { id: "orcamento", label: "Orçamento", icon: Banknote, modes: ["assessor", "pesquisador"] },
  { id: "cenarios", label: "Cenários", icon: GitBranch, modes: ["pesquisador"] },
  { id: "simulacoes", label: "Simulações", icon: Dice5, modes: ["pesquisador"] },
  { id: "dados", label: "Dados", icon: Database, modes: ["pesquisador"] },
  { id: "relatorios", label: "Relatórios", icon: FileText, modes: ["assessor", "pesquisador"] },
];

const navForMode = (mode) => NAV_ITEMS.filter((i) => i.modes.includes(mode));

function Sidebar({ active, onSelect, mode, onModeChange, mobileOpen, onCloseMobile }) {
  const items = navForMode(mode);
  return (
    <>
      {mobileOpen && <div className="fr-sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={cx("fr-sidebar", mobileOpen && "open")} aria-label="Navegação principal">
        <div className="fr-brand-block">
          <div className="fr-brand-name">Funil Reverso de Eleição</div>
          <div className="fr-brand-sub">Transforme uma meta de votos em território, público, contatos, atividades, tempo e recursos.</div>
        </div>
        <nav className="fr-nav">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" aria-current={active === item.id ? "page" : undefined}
                className={cx("fr-nav-item", active === item.id && "active")}
                onClick={() => { onSelect(item.id); onCloseMobile && onCloseMobile(); }}>
                <Icon size={15} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="fr-sidebar-foot">
          <div className="fr-hint" style={{ color: "var(--invert-soft)", marginBottom: 6 }}>Modo de exibição</div>
          <div className="fr-mode-toggle" role="group" aria-label="Modo de exibição">
            <button type="button" aria-pressed={mode === "assessor"}
              className={cx("fr-mode-btn", mode === "assessor" && "active")} onClick={() => onModeChange("assessor")}>Assessor</button>
            <button type="button" aria-pressed={mode === "pesquisador"}
              className={cx("fr-mode-btn", mode === "pesquisador" && "active")} onClick={() => onModeChange("pesquisador")}>Pesquisador</button>
          </div>
          <p className="fr-mode-note">
            {mode === "assessor"
              ? "Operação: metas, território, canais, equipe, prazo e custo."
              : "Tudo do modo Assessor + fórmulas abertas, parâmetros de cadeia, cenários, simulações e proveniência dos dados."}
          </p>
        </div>
      </aside>
    </>
  );
}

function TopContextBar({ cfg, update, derived, onOpenMobile, history }) {
  const office = derived.office;
  return (
    <>
      <div className="fr-mobile-topbar">
        <button className="fr-icon-btn" aria-label="Abrir navegação" onClick={onOpenMobile}
          style={{ background: "transparent", borderColor: "var(--ink-line)", color: "#fff" }}>
          <Menu size={16} />
        </button>
        <span className="fr-brand-name">Funil Reverso</span>
        <span style={{ width: 28 }} />
      </div>
      <div className="fr-topbar">
        <div className="fr-ctx-pill">
          <label htmlFor="ano-select">Eleição</label>
          <select id="ano-select" value={cfg.eleicaoAno} onChange={(e) => update({ eleicaoAno: Number(e.target.value) })}>
            {[2026, 2028, 2030].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="fr-ctx-pill">
          <label htmlFor="ctx-office">Cargo</label>
          <select id="ctx-office" value={cfg.office} onChange={(e) => update({ office: e.target.value })}>
            {OFFICES.filter((o) => o.tipo !== "chapa").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {office.nivel !== "nacional" && (
          <div className="fr-ctx-pill">
            <label htmlFor="ctx-uf">UF</label>
            <select id="ctx-uf" value={cfg.uf} onChange={(e) => update({ uf: e.target.value })}>
              {UF_DATA.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
            </select>
          </div>
        )}
        {office.nivel === "municipal" && (
          <div className="fr-ctx-pill">
            <label htmlFor="ctx-mun">Município</label>
            <select id="ctx-mun" value={cfg.municipioId} onChange={(e) => update({ municipioId: e.target.value })}>
              {SP_MUNICIPIOS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div className="fr-ctx-pill">
          <label htmlFor="ctx-cen">Cenário</label>
          <select id="ctx-cen" value={cfg.scenarioId} onChange={(e) => update({ scenarioId: e.target.value })}>
            {[SCENARIO_PRESETS.central, SCENARIO_PRESETS.conservador, SCENARIO_PRESETS.otimista,
              SCENARIO_PRESETS.maior_mobilizacao, SCENARIO_PRESETS.menor_conversao, SCENARIO_PRESETS.restricao_territorial,
              ...(cfg.customScenarios || [])].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="fr-topbar-spacer" />
        {/* Desfazer/refazer: antes, todo slider escrevia direto no estado global
            sem nenhuma forma de voltar atrás. */}
        <div className="fr-row" style={{ gap: 6 }}>
          <button className="fr-icon-btn" onClick={history.undo} disabled={!history.canUndo}
            title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Undo2 size={14} /></button>
          <button className="fr-icon-btn" onClick={history.redo} disabled={!history.canRedo}
            title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer"><Redo2 size={14} /></button>
          <button className="fr-icon-btn" onClick={history.reset}
            title="Restaurar configuração padrão" aria-label="Restaurar configuração padrão"><RotateCcw size={14} /></button>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   APP
   ========================================================================== */

/** Lê a view atual do hash da URL (#/territorios), se for uma view válida. */
function viewFromHash() {
  if (typeof window === "undefined" || !window.location) return null;
  const id = String(window.location.hash || "").replace(/^#\/?/, "");
  return NAV_ITEMS.some((i) => i.id === id) ? id : null;
}

function readLocal(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeLocal(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** Estado com histórico de desfazer/refazer. */
function useHistoryState(initial, limit = 60) {
  const [state, setState] = useState(() => ({
    past: [], present: typeof initial === "function" ? initial() : initial, future: [],
  }));

  const set = useCallback((updater) => {
    setState((s) => {
      const next = typeof updater === "function" ? updater(s.present) : updater;
      if (next === s.present) return s;
      return { past: [...s.past, s.present].slice(-limit), present: next, future: [] };
    });
  }, [limit]);

  const replace = useCallback((value) => {
    setState({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => setState((s) => (
    s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s
  )), []);

  const redo = useCallback(() => setState((s) => (
    s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s
  )), []);

  return {
    value: state.present, set, replace, undo, redo,
    canUndo: state.past.length > 0, canRedo: state.future.length > 0,
  };
}

export default function App() {
  const hist = useHistoryState(() => migrateConfig(readLocal(STORAGE_KEYS.lastConfig, null)));
  const cfg = hist.value;

  // Roteamento por hash: a versão anterior não tinha rota nenhuma — não dava
  // para compartilhar um link de uma tela nem usar o botão "voltar".
  const [mode, setMode] = useState(() => {
    const saved = readLocal(STORAGE_KEYS.mode, null);
    return saved === "assessor" || saved === "pesquisador" ? saved : "pesquisador";
  });
  const [activeView, setActiveView] = useState(() => viewFromHash() || "visao-geral");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [models, setModelsState] = useState(() => {
    const v = readLocal(STORAGE_KEYS.models, []);
    return Array.isArray(v) ? v : [];
  });
  const [log, setLogState] = useState(() => {
    const v = readLocal(STORAGE_KEYS.log, []);
    return Array.isArray(v) ? v : [];
  });

  const setModels = useCallback((next) => { setModelsState(next); writeLocal(STORAGE_KEYS.models, next); }, []);
  const setLog = useCallback((next) => { setLogState(next); writeLocal(STORAGE_KEYS.log, next); }, []);

  const update = useCallback((patch) => hist.set((prev) => ({ ...prev, ...patch })), [hist]);

  const resetConfig = useCallback(() => {
    hist.replace(defaultConfig());
    writeLocal(STORAGE_KEYS.lastConfig, defaultConfig());
  }, [hist]);

  useEffect(() => {
    const t = setTimeout(() => writeLocal(STORAGE_KEYS.lastConfig, cfg), 400);
    return () => clearTimeout(t);
  }, [cfg]);

  useEffect(() => { writeLocal(STORAGE_KEYS.mode, mode); }, [mode]);

  // Se o modo atual esconde a tela pedida (um link salvo para #/simulacoes
  // aberto no modo Assessor, por exemplo), a tela válida é resolvida DURANTE a
  // renderização. Resolver isso num useEffect fazia a tela errada aparecer por
  // um frame antes de ser trocada.
  const effectiveView = navForMode(mode).some((i) => i.id === activeView) ? activeView : "visao-geral";

  useEffect(() => {
    if (effectiveView !== activeView) setActiveView(effectiveView);
  }, [effectiveView, activeView]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location) return;
    if (viewFromHash() !== effectiveView) {
      try { window.history.replaceState(null, "", `#/${effectiveView}`); } catch { /* ignora */ }
    }
  }, [effectiveView]);

  useEffect(() => {
    const onHash = () => { const v = viewFromHash(); if (v) setActiveView(v); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) hist.redo(); else hist.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hist]);

  const tracking = useMemo(() => ({
    realizado: log.reduce((a, l) => a + (Number(l.realizado) || 0), 0),
    planejado: log.reduce((a, l) => a + (Number(l.planejado) || 0), 0),
    entradas: log.length,
  }), [log]);

  const derived = useMemo(() => computeAll(cfg, tracking), [cfg, tracking]);

  const viewProps = { cfg, update, derived, mode, setActiveView };

  let body;
  switch (effectiveView) {
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
    case "dados": body = <ViewDados />; break;
    case "relatorios":
      body = (
        <ViewRelatorios
          cfg={cfg} derived={derived} models={models} setModels={setModels} log={log} setLog={setLog}
          onLoadModel={(loaded) => hist.set(migrateConfig(loaded))}
          onResetConfig={resetConfig}
        />
      );
      break;
    default: body = <ViewVisaoGeral {...viewProps} />;
  }

  return (
    <ModeContext.Provider value={mode}>
      <div className="fr-app">
        <style>{STYLE}</style>
        <Sidebar active={effectiveView} onSelect={setActiveView} mode={mode} onModeChange={setMode}
          mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <div className="fr-main">
          <TopContextBar cfg={cfg} update={update} derived={derived}
            onOpenMobile={() => setMobileOpen(true)}
            history={{ undo: hist.undo, redo: hist.redo, canUndo: hist.canUndo, canRedo: hist.canRedo, reset: resetConfig }} />
          <main className="fr-content">{body}</main>
        </div>
      </div>
    </ModeContext.Provider>
  );
}

export { ErrorBoundary };
