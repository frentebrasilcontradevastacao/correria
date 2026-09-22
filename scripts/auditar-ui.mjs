/**
 * Auditoria de interface: percorre as 13 views, aciona cada botão, select e
 * slider e verifica se o clique produz ALGUMA consequência observável.
 *
 * A primeira versão comparava só o texto da tela e por isso acusava como
 * "morto" todo controle cujo efeito não é textual — um chip que só muda de
 * classe, uma aba já ativa, um botão que dispara download. A assinatura agora
 * inclui classes, estados ARIA, valores de formulário, o hash da rota e os
 * downloads interceptados.
 *
 * Uso:  node scripts/auditar-ui.mjs [url]
 * Requer o app servido (npm run dev) e o Chrome com --remote-debugging-port=9222.
 */

const BASE = process.argv[2] || "http://localhost:5180/correria/";
const PORTA_CDP = process.env.CDP_PORT || 9222;
const VIEWS = ["visao-geral", "meta", "funil", "territorios", "publicos", "canais",
  "equipes", "agenda", "orcamento", "cenarios", "simulacoes", "dados", "relatorios"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function conectar() {
  const alvos = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json`)).json();
  const page = alvos.find((t) => t.type === "page");
  if (!page) throw new Error("nenhuma aba aberta no Chrome de depuração");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); }
  };
  const enviar = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pendentes.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await enviar("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    const err = r.result?.exceptionDetails;
    if (err) throw new Error(err.exception?.description || JSON.stringify(err));
    return r.result?.result?.value;
  };
  await enviar("Page.enable");
  await enviar("Runtime.enable");
  return { evaluate, enviar, fechar: () => ws.close() };
}

/* Tudo que conta como "algo aconteceu". */
const ASSINATURA = `(() => {
  const c = document.querySelector(".fr-content");
  if (!c) return "SEM-CONTENT";
  const nos = [...c.querySelectorAll("*")];
  return JSON.stringify({
    rota: location.hash,
    texto: c.innerText.length,
    nos: nos.length,
    classes: nos.map(e => e.className || "").join("|").length,
    aria: nos.map(e => e.getAttribute("aria-pressed") ?? e.getAttribute("aria-expanded") ?? "").join(""),
    valores: [...c.querySelectorAll("input,select,textarea")].map(e => e.type === "checkbox" ? e.checked : e.value).join("\\u0001"),
    desabilitados: [...c.querySelectorAll("button")].map(b => b.disabled ? 1 : 0).join(""),
    downloads: (window.__dl || []).length,
    impressoes: window.__print || 0,
    amostra: c.innerText.slice(0, 3000),
  });
})()`;

/* Downloads e impressão não mudam o DOM: são interceptados para virarem sinal. */
const INSTRUMENTAR = `(() => {
  if (!window.__instr) {
    window.__instr = 1; window.__dl = []; window.__print = 0; window.__erros = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.__dl.push(this.download); else clickOriginal.call(this);
    };
    window.print = () => { window.__print++; };
    window.confirm = () => false;   // nunca confirma ação destrutiva
    const erroOriginal = console.error;
    console.error = (...a) => { window.__erros.push(a.map(String).join(" ").slice(0, 200)); erroOriginal(...a); };
    window.addEventListener("error", (e) => window.__erros.push("onerror: " + e.message));
    window.addEventListener("unhandledrejection", (e) => window.__erros.push("rejection: " + String(e.reason).slice(0, 200)));
  }
  return 1;
})()`;

const DESTRUTIVO = /limpar|excluir|remover|apagar|zerar|restaurar|resetar/i;

const c = await conectar();
await c.enviar("Page.navigate", { url: BASE });
await sleep(2500);

const relatorio = [];
let mortos = 0, erros = 0;

for (const view of VIEWS) {
  await c.evaluate(`localStorage.clear(); location.reload();`);
  await sleep(2300);
  await c.evaluate(INSTRUMENTAR);
  await c.evaluate(`location.hash = "#/${view}"`);
  await sleep(600);

  const contar = () => c.evaluate(`(() => {
    window.__alvos = [...document.querySelectorAll(".fr-content button")].filter(b => !b.disabled
      && !b.className.includes("danger")
      && !${DESTRUTIVO}.test(b.innerText + " " + (b.getAttribute("aria-label") || "")));
    return window.__alvos.length; })()`);

  let n = await contar();
  const semEfeito = [];
  let comEfeito = 0;

  for (let i = 0; i < n; i++) {
    const rotulo = await c.evaluate(`(() => { const b = window.__alvos[${i}];
      return b && b.isConnected ? (b.innerText || b.getAttribute("aria-label") || b.className).trim().slice(0, 60) : null; })()`);
    if (!rotulo) continue;
    const antes = await c.evaluate(ASSINATURA);
    await c.evaluate(`window.__alvos[${i}].click()`);
    await sleep(240);
    const depois = await c.evaluate(ASSINATURA);
    if (antes === depois) {
      // Um controle já ativo não fazer nada é correto, não é defeito.
      const jaAtivo = await c.evaluate(`(() => { const b = window.__alvos[${i}];
        return !!b && (b.getAttribute("aria-pressed") === "true" || /\\b(active|on)\\b/.test(b.className)); })()`);
      if (jaAtivo) comEfeito++; else semEfeito.push(rotulo);
    } else {
      comEfeito++;
    }
    const rotaAtual = await c.evaluate(`location.hash`);
    if (rotaAtual !== `#/${view}`) {
      await c.evaluate(`location.hash = "#/${view}"`);
      await sleep(420);
      n = await contar();
    }
  }

  /* Selects: troca para uma opção diferente e confere reação. */
  const nSel = await c.evaluate(`(() => { window.__sels = [...document.querySelectorAll(".fr-content select")]; return window.__sels.length; })()`);
  for (let i = 0; i < nSel; i++) {
    const meta = await c.evaluate(`(() => { const e = window.__sels[${i}];
      if (!e || !e.isConnected || e.options.length < 2) return null;
      const rot = e.closest(".fr-field")?.querySelector(".fr-field-label")?.innerText
        || e.getAttribute("aria-label") || e.id || "select";
      return { rot: rot.trim().split("\\n")[0].slice(0, 44), alvo: [...e.options].map(o => o.value).find(v => v !== e.value) }; })()`);
    if (!meta || meta.alvo == null) continue;
    const antes = await c.evaluate(ASSINATURA);
    await c.evaluate(`(() => { const e = window.__sels[${i}];
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(e, ${JSON.stringify(meta.alvo)});
      e.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await sleep(320);
    const depois = await c.evaluate(ASSINATURA);
    if (antes === depois) semEfeito.push(`select: ${meta.rot}`); else comEfeito++;
    await c.evaluate(`localStorage.clear(); location.reload();`);
    await sleep(2200);
    await c.evaluate(INSTRUMENTAR);
    await c.evaluate(`location.hash = "#/${view}"; window.__sels = [...document.querySelectorAll(".fr-content select")];`);
    await sleep(500);
  }

  /* Sliders: empurra para o máximo e confere reação. */
  const nRng = await c.evaluate(`(() => { window.__rngs = [...document.querySelectorAll(".fr-content input[type=range]")]; return window.__rngs.length; })()`);
  for (let i = 0; i < nRng; i++) {
    const rot = await c.evaluate(`(() => { const e = window.__rngs[${i}];
      if (!e || !e.isConnected || e.value === e.max) return null;
      return (e.closest(".fr-field")?.querySelector(".fr-field-label")?.innerText || e.id || "range").trim().split("\\n")[0].slice(0, 44); })()`);
    if (!rot) continue;
    const antes = await c.evaluate(ASSINATURA);
    await c.evaluate(`(() => { const e = window.__rngs[${i}];
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(e, e.max);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await sleep(300);
    const depois = await c.evaluate(ASSINATURA);
    if (antes === depois) semEfeito.push(`slider: ${rot}`); else comEfeito++;
  }

  const erroList = await c.evaluate(`window.__erros.slice(0, 5)`);
  mortos += semEfeito.length;
  erros += erroList.length;
  relatorio.push({ view, comEfeito, semEfeito, erros: erroList });
}

for (const r of relatorio) {
  const status = r.semEfeito.length || r.erros.length ? "FALHA" : "ok   ";
  console.log(`${status} ${r.view.padEnd(13)} ${String(r.comEfeito).padStart(3)} controle(s) com efeito` +
    (r.semEfeito.length ? `  | sem efeito: ${JSON.stringify(r.semEfeito)}` : "") +
    (r.erros.length ? `  | ERROS: ${JSON.stringify(r.erros)}` : ""));
}
console.log(`\n${mortos} controle(s) sem efeito, ${erros} erro(s) de console.`);
c.fechar();
process.exit(mortos || erros ? 1 : 0);
