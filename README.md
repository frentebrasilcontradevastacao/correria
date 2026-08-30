# correria — Funil Reverso de Eleição

Calculadora, simulador e painel operacional de planejamento eleitoral. Transforma uma **meta de votos** em **território, público, canais, contatos, atividades, equipe, tempo e orçamento** — com fórmulas abertas, cenários comparáveis e simulação de incerteza (Monte Carlo).

Aplicativo estático (React + Vite), sem backend. Todos os cálculos rodam no navegador e **nenhuma requisição sai da página** — as fontes são empacotadas junto com o app, não carregadas de um CDN.

![Visão Geral](docs/screenshot-visao-geral.png)

## O que este projeto é (e o que não é)

- **É** uma calculadora completa do funil reverso: meta ajustada, canais de conversão (cada um com cadeia própria, não uma taxa média única), rede/lideranças, distribuição territorial, capacidade de equipe, orçamento, cenários e simulação Monte Carlo.
- **Não é** conectado ao Portal de Dados Abertos do TSE nem ao IBGE. Os números de eleitorado, comparecimento e vagas são uma **fotografia congelada no código-fonte** — têm ordem de grandeza real, mas não têm data de atualização e não vêm de nenhuma consulta. São classificados na interface como *Referência histórica*, nunca como *Dado oficial*. O módulo **Dados** declara, indicador por indicador, o que é usado hoje e qual seria a fonte definitiva.
- **Não é** um preditor eleitoral. A simulação de incerteza mostra faixas de variação a partir de premissas, não uma previsão de resultado.

O exemplo padrão ao abrir o app (Deputado Federal, SP, meta de 110.000 votos, 20% de abstenção, 85% de fidelidade, 45 dias, 15% de conversão no corpo a corpo) produz meta ajustada **161.765**, contatos necessários **1.078.431** e meta diária **23.965**. Esses três números estão travados por teste automatizado (`npm test`).

## Stack

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Recharts](https://recharts.org/) (gráficos) e [lucide-react](https://lucide.dev/) (ícones)
- [@fontsource](https://fontsource.org/) — IBM Plex Sans/Mono auto-hospedadas
- Sem CSS framework — sistema visual próprio, definido em `src/App.jsx`
- Persistência local via `localStorage` — não há conta de usuário nem sincronização entre dispositivos

## Rodando localmente

Pré-requisitos: [Node.js](https://nodejs.org/) 18 ou superior.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # testes do motor de cálculo
npm run build   # build de produção
npm run preview # serve o build
```

## Estrutura do projeto

```
correria/
├── src/
│   ├── engine.js         # motor de cálculo + dados + configuração (puro, sem React)
│   ├── engine.test.mjs   # testes do motor (node --test)
│   ├── App.jsx           # interface: design system, componentes e as 13 views
│   ├── main.jsx          # ponto de entrada + error boundary + fontes
│   └── index.css         # reset mínimo
├── public/.nojekyll
├── .github/workflows/deploy.yml
├── index.html
├── vite.config.js
└── package.json
```

O motor foi separado da interface para que a afirmação "funções puras, testáveis isoladamente" fosse verdadeira: `src/engine.js` não importa React e roda direto no Node, o que permite testar as regras eleitorais e o funil sem montar a UI. Ele pode ser movido para um backend (Node/Express, Python/FastAPI) sem alteração.

### Organização do `engine.js`

1. **Utilidades** de formatação e merge (`fmtInt`, `fmtPct`, `deepMerge`…)
2. **Engines** — uma por domínio: `electorateEngine`, `funnelEngine`, `conversionEngine`, `networkEngine`, `territorialEngine`, `capacityEngine`, `budgetEngine`, `electoralRuleEngine`, `scenarioEngine`
3. **Monte Carlo** — `mulberry32` (semeado, reprodutível), `triangular`, `histogram`, `runMonteCarlo`
4. **Dados** — UFs, municípios de SP, cargos, canais, etapas do funil
5. **Configuração** — `defaultConfig()`, `SCHEMA_VERSION` e `migrateConfig()`
6. **`computeAll(cfg, tracking, hoje)`** — orquestra tudo; é a única função que a interface consulta

## Regra proporcional implementada

O módulo proporcional segue os arts. 106 a 109 da Lei 9.504/1997, com a redação da Lei 14.211/2021:

1. Quociente eleitoral: `QE = votos válidos / vagas`
2. Quociente partidário: `QP = parte inteira de (votos do partido / QE)`
3. Sobras distribuídas uma a uma por maiores médias: `média = votos / (vagas obtidas + 1)`
4. Só concorre às sobras o partido com **≥ 80% do QE**; se nenhum alcançar, todos concorrem (§3º)
5. Só ocupa vaga o candidato com **≥ 20% do QE**

**Simplificações declaradas na própria interface:** não modelamos o esgotamento da lista de candidatos do partido nem coligações majoritárias. Os parâmetros (vagas, votos válidos, votação da legenda) são editáveis — as vagas vêm da UF e do cargo, mas podem ser sobrescritas. Confirme sempre a resolução do TSE vigente para o pleito antes de qualquer decisão real.

## Verificações automáticas de viabilidade

O app não aceita silenciosamente uma meta impossível. A cada alteração ele checa, entre outras coisas:

- meta acima do eleitorado que deve comparecer na circunscrição (teto físico);
- meta desproporcional à circunscrição para uma disputa proporcional;
- meta abaixo do mínimo nominal de 10% do quociente eleitoral;
- penetração exigida por território acima do plausível (a coluna *penetração* em Territórios mostra quanto dos votos locais cada meta territorial exige);
- capacidade diária **e** acumulada no período abaixo da demanda;
- soma das participações dos canais e dos pesos territoriais fora de 100%;
- divergência entre "dias de campanha" e a janela declarada na Agenda;
- ritmo de execução abaixo do planejado, comparado ao registro operacional.

## Limitações conhecidas / próximos passos

- **Sem conexão real com TSE/IBGE.** O módulo Dados mapeia as fontes e o formato em que estão disponíveis; falta o conector de importação (o TSE distribui em lote via CSV/ZIP por ano, não como API REST — um ETL agendado é mais adequado que uma chamada em tempo real).
- **Sem backend.** Modelos salvos e rastreamento operacional ficam no `localStorage` do navegador — não sincronizam entre pessoas da campanha nem entre dispositivos.
- **Território detalhado só para São Paulo.** As outras 26 UFs entram em nível agregado. Para SP, os 8 municípios detalhados cobrem ~40% do eleitorado; o restante entra como um bucket explícito ("Restante do estado") para que a meta não seja distribuída como se os outros 60% não existissem.
- **O `recharts` responde por ~150 kB gzip** do bundle, já isolado em um chunk próprio. Carregá-lo sob demanda apenas nas três telas com gráfico reduziria mais o carregamento inicial.
- **Faixas etárias e segmentos temáticos são escolhas da equipe**, não recortes do eleitorado real — dependem do conector do TSE para carregar volume por faixa.

## Publicando no GitHub Pages

O workflow em `.github/workflows/deploy.yml` builda e publica a cada push na `main`. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.

O `vite.config.js` define `base: "/correria/"`, necessário para um site de projeto (`usuario.github.io/nome-do-repo/`). Se renomear o repositório, troque o `base`; se usar domínio próprio (CNAME) ou um repositório `usuario.github.io`, use `base: "/"`.

## Licença

Nenhuma licença foi definida neste pacote. Adicione um arquivo `LICENSE` antes de tornar o repositório público, caso pretenda permitir reuso por terceiros.
