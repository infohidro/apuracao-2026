# Apuração 2º turno 2026: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela ao vivo do 2º turno (curva de evolução com projeção até 100% e barras de saldo por UF contra o 1º turno nas mesmas seções), mais um teste histórico que mede com quantos % apurados cada método acerta o resultado.

**Architecture:**
- Boletins de urna (bweb) do TSE são baixados uma vez e reduzidos a um arquivo JSONL por eleição e turno: uma linha por seção, só presidente, com horário de recebimento.
- Um módulo puro de modelos (progressão aritmética e mudança sobre o turno anterior) é usado tanto pela reprise histórica quanto pelo servidor ao vivo.
- O servidor ao vivo lê os totais por UF e a lista de seções (`-cs.json`) do 2º turno, grava cada leitura em JSONL e serve uma página com gráfico SVG.

**Tech Stack:** Node.js 24, sem dependências npm. `node:test` para testes. `tar.exe` do Windows para ler zip em streaming. SVG à mão no front.

**Spec:** `docs/superpowers/specs/2026-10-19-segundo-turno-design.md`

## Global Constraints

- Pronto e testado antes de 25/10/2026 17h (Brasília).
- Node.js 24, zero dependências npm na parte ao vivo e nos scripts.
- Windows 11. Servidor ao vivo roda como processo próprio (`node servidor-2t.js`), nunca pelo preview do app.
- Eleição 2º turno 2026: código `6258`, pleito `3221`. 1º turno 2026: eleição `6257`, pleito `3220`.
- Candidatos do 2º turno: `13` (Lula, laranja `#e07a1f`) e `22` (Flávio Bolsonaro, azul `#3b6fd6`). 2º turno 2022: `13` Lula, `22` Bolsonaro.
- Comparação por estado em pontos percentuais dos votos válidos, nas mesmas seções. Saldo = (Lula 2T − Lula 1T) − (Flávio 2T − Flávio 1T).
- Critério de acerto (do usuário): o primeiro % de seções a partir do qual o desfecho projetado é igual ao final em todos os passos seguintes.
- Dados brutos e derivados (`data/`) fora do git.
- Interface e mensagens em português.

## Review Focus

1. **Arquivo do TSE falha ou volta 404 para uma UF no meio da noite:** mantém a última leitura boa daquela UF e mostra aviso, sem zerar a UF nem derrubar o servidor. Teste em Task 7.
2. **Servidor reinicia no meio da apuração:** o gráfico é reconstruído a partir do JSONL, sem pontos duplicados quando o TSE não mudou desde a última leitura. Teste em Task 7.
3. **UF com votos no 2º turno mas `-cs.json` sem nenhum `da`/`ha`:** a UF cai para a base por município, e a tela diz qual base cada UF usa. Teste em Task 6 (detecção) e Task 9 (cálculo).
4. **Seções que não casam entre turnos (agregadas, renumeradas, exterior):** não quebra. O número de seções sem par é contado e exposto. Teste em Task 3.
5. **Divisões por zero e cotas negativas:** UF sem seção apurada, candidato com 0 votos no turno anterior, mudança que levaria a cota abaixo de zero. Projeção finita, cotas ≥ 0, soma 100%. Teste em Task 3.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/bweb.js` | Parse de linhas do CSV bweb e agregação por seção (puro) |
| `scripts/baixar-bweb.js` | Baixa os zips bweb para `data/brutos/` |
| `scripts/extrair-bweb.js` | Lê os zips em streaming e grava `data/secoes/{ano}-{turno}t.jsonl` |
| `lib/secoes.js` | Carrega JSONL de seções e chave de seção comum |
| `lib/modelos.js` | Os dois métodos de projeção, `desfecho` e `acertoEstavel` (puro) |
| `lib/reprise.js` | Monta o estado por UF para um conjunto de seções apuradas (puro) |
| `scripts/backtest.js` | Roda a reprise de um caso e grava `data/backtest/{caso}.json` |
| `public/backtest.html` | Página do resultado do teste |
| `lib/ao-vivo.js` | Lê o `-cs.json`, compara com o 1º turno, calcula saldo e curva (puro) |
| `lib/leituras.js` | Grava e relê o JSONL de leituras ao vivo |
| `servidor-2t.js` | Polling do TSE, API, páginas estáticas |
| `public/segundo-turno.html` | Tela ao vivo |
| `lib/municipios.js` | Plano B por município (Task 9) |

Os arquivos do 1º turno (`server.js`, `projecao.js`, `index.html`) continuam como estão.

---

### Task 1: Base do repositório e extração dos boletins de urna

**Files:**
- Create: `.gitignore`, `lib/bweb.js`, `lib/secoes.js`, `scripts/baixar-bweb.js`, `scripts/extrair-bweb.js`
- Test: `test/bweb.test.js`

**Interfaces:**
- Produces:
  - `chaveSecao(uf: string, mun: string|number, zona: string|number, secao: string|number) -> string`: formato `"ac-01392-0001-0003"`, com UF minúscula, município com 5 dígitos, zona e seção com 4.
  - `lerLinhaBweb(colunas: string[], idx: Record<string,number>) -> {chave, uf, cargo, recebidoEm: number|null, aptos: number, tipo: string, nr: string, votos: number}`.
  - `agregarSecoes(linhas: Iterable) -> Map<chave, Secao>`, onde `Secao = {k, uf, mun, r: number|null, aptos, v: Record<nr, number>, br, nu}`. Inclui só `cargo === 'Presidente'`. Votos nominais vão em `v`, brancos em `br`, nulos em `nu`, e `aptos` é contado uma vez por seção.
  - `carregarSecoes(caminho) -> Promise<Map<chave, Secao>>` (em `lib/secoes.js`).
  - Arquivos: `data/secoes/2022-1t.jsonl`, `data/secoes/2022-2t.jsonl`, `data/secoes/2026-1t.jsonl`, uma `Secao` por linha.

- [ ] **Step 1: Criar o repositório.** Rodar `git init`. Criar `.gitignore` com `data/`, `.superpowers/` e `node_modules/`. Mover `projecao.test.js` para `test/projecao.test.js`, ajustando o `require` para `../projecao`. Commitar o código do 1º turno como base: `git add -A && git commit -m "chore: base do sistema do 1º turno"`.

- [ ] **Step 2: Escrever os testes que falham** em `test/bweb.test.js`, usando duas linhas reais de cabeçalho e dados do bweb 2022 (AC, Rio Branco, zona 1, seção 3):
  - `chaveSecao('AC', 1392, 1, 3) === 'ac-01392-0001-0003'`.
  - `lerLinhaBweb` converte `DT_BU_RECEBIDO "02/10/2022 18:45:30"` em `Date.UTC`-equivalente do horário de Brasília (UTC−3), ou seja `new Date('2022-10-02T21:45:30Z').getTime()`.
  - `agregarSecoes` com linhas Presidente (nominal 13 = 100, nominal 22 = 80, branco 95 = 3, nulo 96 = 5, aptos 300) mais uma linha de Governador produz `v = {13:100, 22:80}`, `br = 3`, `nu = 5`, `aptos = 300` e ignora a de governador.
  - Duas linhas da mesma seção não duplicam `aptos`.

- [ ] **Step 3: Rodar e ver falhar:** `node --test test/` mostra FAIL com "Cannot find module '../lib/bweb'".

- [ ] **Step 4: Implementar `lib/bweb.js` e `lib/secoes.js`.**
  - Colunas usadas: `SG_UF`, `CD_MUNICIPIO`, `NR_ZONA`, `NR_SECAO`, `DS_CARGO_PERGUNTA`, `DT_BU_RECEBIDO`, `QT_APTOS`, `DS_TIPO_VOTAVEL` (`Nominal`/`Branco`/`Nulo`), `NR_VOTAVEL`, `QT_VOTOS`.
  - CSV separado por `;` com aspas, encoding latin1.

- [ ] **Step 5: Rodar e ver passar:** `node --test test/` mostra PASS em todos, inclusive os 6 de projeção.

- [ ] **Step 6: Escrever `scripts/baixar-bweb.js <ano> <turno>`.**
  - URL: `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes{ano}/buweb/bweb_{turno}t_{UF}_{sufixo}.zip`.
  - Sufixos: 2022 1T `051020221321`, 2022 2T `311020221535`, 2026 1T `051020261403`.
  - UFs: as 27 mais `ZZ`.
  - Pula o que já existe com o mesmo tamanho (HEAD `content-length`), baixa em sequência e tenta de novo até 3 vezes.

- [ ] **Step 7: Escrever `scripts/extrair-bweb.js <ano> <turno>`.**
  - Para cada zip, `spawn('tar', ['-xOf', zip])` e lê o stdout com `TextDecoder('latin1')` linha a linha. Só mantém em memória as seções de presidente.
  - Confere o cabeçalho e aborta com mensagem clara se faltar alguma coluna usada. O 2026 deve ter o mesmo layout, mas isso não foi verificado.
  - Grava `data/secoes/{ano}-{turno}t.jsonl` e imprime, por UF: seções, seções sem `DT_BU_RECEBIDO` e soma de votos de 13 e 22.

- [ ] **Step 8: Rodar os downloads e extrações**, os três casos, em segundo plano: `node scripts/baixar-bweb.js 2022 1 && node scripts/extrair-bweb.js 2022 1`, e o mesmo para `2022 2` e `2026 1`.
  - Esperado, conferência de sanidade: 2022 2T nacional com Lula ≈ 60,3 milhões e Bolsonaro ≈ 58,2 milhões. 2026 1T com totais de 13 e 22 batendo com o arquivo `br` do TSE da eleição 6257 (diferença < 0,1%).
  - Apagar `data/brutos/votacao_secao_2026_BR.zip`, que foi baixado no reconhecimento e não é mais usado.

- [ ] **Step 9: Commit:** `git add .gitignore lib scripts test && git commit -m "feat: extração de boletins de urna por seção"`.

---

### Task 2: Modelos de projeção

**Files:**
- Create: `lib/modelos.js`
- Test: `test/modelos.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `EstadoUf = {uf, aptosTotal, aptosApurados, validos, votos: Record<nr,number>, anterior: null | {apuradas: {validos, votos}, restantes: {validos, votos}}}`. `validos` = soma de `votos` (nominais).
  - `Projecao = {votos: Record<nr,number>, validos: number, pct: Record<nr,number>}`, com `pct` em 0–100.
  - `projetarPA(ufs: EstadoUf[], candidatos: string[]) -> Projecao`.
  - `projetarMudanca(ufs: EstadoUf[], candidatos: string[]) -> Projecao`.
  - `desfecho(pct: Record<nr,number>) -> string`: `"1T:13"` se o primeiro tem mais de 50%, senão `"2T:13x22"` com os dois primeiros em ordem numérica crescente.
  - `acertoEstavel(serie: {pctSecoes:number, desfecho:string}[], final: string) -> number|null`: o menor `pctSecoes` a partir do qual todos os pontos seguintes têm `desfecho === final`, ou `null`.

- [ ] **Step 1: Escrever os testes que falham:**
  - PA: UF com `aptosTotal 1000`, `aptosApurados 500`, `validos 400` (13 = 300, 22 = 100) projeta `validos 800` e `pct['13'] = 75`.
  - PA: UF sem nada apurado entra com a cota nacional e a taxa válidos/aptos nacional. Dois estados, um apurado pró-13 e outro grande sem votos, dão o mesmo `pct` do apurado.
  - Mudança:
    - O turno anterior nas apuradas tem 13 = 40%, 22 = 50% dos válidos (os outros 10% são de terceiros). O 2T nas apuradas tem 13 = 48%, 22 = 52%, ou seja, mudança +8 e +2.
    - Restantes no anterior: 13 = 60%, 22 = 30%. Restante projetado = 68% e 32% (renormalizado entre os candidatos atuais).
    - Válidos restantes = `restantes.validos × (validos / apuradas.validos)`.
  - Mudança com cota que ficaria negativa: corta em 0 e renormaliza, a soma dá 100 e nada é `NaN`.
  - Mudança com UF sem nada apurado: usa a mudança e a razão de comparecimento nacionais.
  - Mudança sem `anterior` em nenhuma UF: lança `Error('mudança exige turno anterior')`.
  - `desfecho({13: 50.9, 22: 49.1}) === '1T:13'`. `desfecho({22: 46, 13: 44, 30: 4}) === '2T:13x22'`.
  - `acertoEstavel([{pctSecoes:1,desfecho:'1T:22'},{pctSecoes:2,desfecho:'1T:13'},{pctSecoes:3,desfecho:'1T:22'},{pctSecoes:4,desfecho:'1T:13'},{pctSecoes:5,desfecho:'1T:13'}], '1T:13') === 4`. Se o último ponto difere do final, retorna `null`.

- [ ] **Step 2: Rodar e ver falhar:** `node --test test/modelos.test.js` mostra FAIL com "Cannot find module".

- [ ] **Step 3: Implementar `lib/modelos.js`.** A mudança por candidato é aditiva em p.p. dos válidos. Cotas restantes são cortadas em ≥ 0 e renormalizadas para somar 1 entre `candidatos`. Documentar isso no topo do arquivo.

- [ ] **Step 4: Rodar e ver passar:** `node --test test/` mostra PASS.

- [ ] **Step 5: Commit:** `git add lib/modelos.js test/modelos.test.js && git commit -m "feat: modelos de projeção PA e mudança"`.

---

### Task 3: Reprise histórica

**Files:**
- Create: `lib/reprise.js`, `scripts/backtest.js`
- Test: `test/reprise.test.js`

**Interfaces:**
- Consumes: `carregarSecoes`, `projetarPA`, `projetarMudanca`, `desfecho`, `acertoEstavel`.
- Produces:
  - `montarEstados(atuais: Map<chave,Secao>, apuradas: Set<chave>, anteriores: Map<chave,Secao>|null) -> {ufs: EstadoUf[], semPar: number}`.
    - `anterior.apuradas` soma o turno anterior das seções apuradas que têm par. `anterior.restantes` soma o das não apuradas que têm par.
    - Seções sem par: o válido anterior é estimado proporcionalmente aos aptos da UF.
  - `reprisar(atuais, anteriores|null, candidatos, passoPct = 1) -> Resultado`.
  - `Resultado = {caso, candidatos, final: {pct, desfecho}, semPar, metodos: {pa: Serie, mudanca?: Serie}}`, onde `Serie = {pontos: {pctSecoes, pctAtual: Record, pctProjetado: Record, desfecho}[], acertoEm: number|null}`.
  - Arquivo: `data/backtest/{caso}.json`, com `caso` ∈ `2022-2t`, `2026-1t`.

- [ ] **Step 1: Escrever os testes que falham** com uma mini eleição de 6 seções em 2 UFs:
  - Ordem por `r` crescente. Seções com `r === null` vão para o fim.
  - Em 100% apurado, `pctProjetado` é igual a `final.pct` nos dois métodos, com diferença < 1e-9.
  - `semPar` conta corretamente uma seção do 2º turno inexistente no 1º, e nada fica `NaN`.
  - `acertoEm` bate com uma sequência construída à mão.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `lib/reprise.js`.**
  - Um ponto a cada `passoPct`% das seções e sempre um ponto em 100%.
  - Manter somas incrementais por UF (não recalcular do zero a cada passo), pois são cerca de 470 mil seções.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Implementar `scripts/backtest.js <caso>`.**
  - `2022-2t`: atuais = `2022-2t.jsonl`, anteriores = `2022-1t.jsonl`, candidatos `['13','22']`.
  - `2026-1t`: atuais = `2026-1t.jsonl`, sem anteriores (só PA), candidatos = todos os números presentes.
  - Grava o JSON e imprime uma linha por método: `PA: acertou a partir de X% e não mudou mais` (ou `nunca estabilizou`).

- [ ] **Step 6: Rodar os dois casos:** `node scripts/backtest.js 2022-2t` e `node scripts/backtest.js 2026-1t`. Esperado: `final.desfecho` igual a `1T:13` em 2022-2t e `2T:13x22` em 2026-1t. Anotar as frases para o relatório ao usuário.

- [ ] **Step 7: Commit:** `git add lib/reprise.js scripts/backtest.js test/reprise.test.js && git commit -m "feat: reprise histórica e backtest"`.

---

### Task 4: Página do teste histórico

**Files:**
- Create: `public/backtest.html`, `lib/grafico.js` (funções de desenho SVG compartilhadas, carregadas pelo navegador como `<script src="/lib/grafico.js">`)

**Interfaces:**
- Consumes: `data/backtest/{caso}.json`, lido pela página em `/api/backtest/{caso}`. O servidor da Task 7 passa a servir essa rota. Nesta task, um `http.createServer` mínimo em `scripts/ver-backtest.js` (porta 3027) serve a página, `/lib/grafico.js` e essa rota.
- Produces:
  - `desenharEvolucao(svg: SVGElement, {pontos: {pctSecoes, pct: Record}[], projecao?: {pctSecoes, pct: Record}[], candidatos: {nr, nome, cor}[]})`: eixo X 0–100% seções, eixo Y em % válidos, linha de 50%, linha cheia por candidato e tracejado opcional terminando com rótulo do valor.
  - `desenharSaldo(container: HTMLElement, linhas: {uf, saldo: number|null, detalhe: string}[])`: barras divergentes (direita laranja para Lula, esquerda azul para Flávio), `title` com o detalhe e "aguardando" quando `saldo === null`.

- [ ] **Step 1: Implementar `lib/grafico.js`.** Usa as funções da opção A aprovada (eixo % apurado, linha 50%, rótulo na ponta). Cores das Global Constraints. Funciona em tema claro e escuro.

- [ ] **Step 2: Implementar `public/backtest.html`.**
  - Para cada caso: título e a frase "PA: acertou a partir de X%" / "Mudança: …".
  - Gráfico com `pctProjetado` de cada método ao longo da reprise (linha cheia = projeção do método, linha fina = `pctAtual`).
  - Pequeno gráfico com a distância até o final em p.p. por método.

- [ ] **Step 3: Verificar no navegador:** `node scripts/ver-backtest.js` e abrir `http://localhost:3027/backtest.html`. Esperado: os dois casos aparecem, as frases batem com a saída do Step 6 da Task 3 e não há erros no console.

- [ ] **Step 4: Commit:** `git add public/backtest.html lib/grafico.js scripts/ver-backtest.js && git commit -m "feat: página do teste histórico"`.

---

### Task 5: Leitura da lista de seções e comparação ao vivo

**Files:**
- Create: `lib/ao-vivo.js`
- Test: `test/ao-vivo.test.js`

**Interfaces:**
- Consumes: `lerArquivoTse` (de `projecao.js`), `chaveSecao`, `Secao`, `projetarPA`, `projetarMudanca`, `EstadoUf`.
- Produces:
  - `secoesRecebidas(cs: object) -> {total: number, recebidas: Set<chave>}`, com chave via `chaveSecao`. Uma seção conta como recebida quando tem `da` e `ha` não vazios. A UF vem de `abr[].cd`.
  - `estadoUfAoVivo(ufTse: ReturnType<lerArquivoTse>, recebidas: Set<chave>, anteriores: Map<chave,Secao>, totalSecoesUf: number) -> EstadoUf`.
    - `aptosTotal`/`aptosApurados` vêm de `e.te`/`e.est` do arquivo da UF.
    - `anterior` vem do 1º turno por seção: soma das recebidas versus soma das demais da UF.
  - `saldoUf(estado: EstadoUf) -> {saldo: number|null, lula1, lula2, flavio1, flavio2}`, em p.p. dos válidos, `null` sem seções recebidas.
  - `curvaRestante(estados: EstadoUf[], anteriores: Map<chave,Secao>, recebidas: Set<chave>, pctAtual: number, projecao: Projecao) -> {pctSecoes, pct: Record}[]`.
    - Simula as seções não recebidas chegando na ordem de `r` do 1º turno, aplicando a mudança da UF.
    - Um ponto a cada 5% e o último em 100%.
    - O último ponto é igual a `projecao.pct` (ajustar por escala se diferir por arredondamento).
  - `baseUf(ufTse, recebidas) -> 'secao' | 'municipio' | 'aguardando'`: `'municipio'` quando `ufTse.validos > 0 && recebidas.size === 0`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `secoesRecebidas` sobre um trecho real do `-cs.json` do pleito 3220 (AC, Porto Walter, zona 0004, seções 0077 e 0078 com `da`/`ha`, e uma sem) retorna `recebidas.size === 2` e `total === 3`.
  - `saldoUf` com 1T nas seções recebidas Lula 40% e Flávio 50%, e 2T Lula 48% e Flávio 52%, retorna `saldo === 6`.
  - `saldoUf` sem recebidas retorna `saldo === null`.
  - `baseUf` com votos e sem recebidas retorna `'municipio'`, e sem votos retorna `'aguardando'`.
  - O último ponto de `curvaRestante` tem `pctSecoes === 100` e `pct` igual a `projecao.pct` (diferença < 1e-6).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `lib/ao-vivo.js`.**

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit:** `git add lib/ao-vivo.js test/ao-vivo.test.js && git commit -m "feat: comparação ao vivo por seção"`.

---

### Task 6: Gravação das leituras

**Files:**
- Create: `lib/leituras.js`
- Test: `test/leituras.test.js`

**Interfaces:**
- Produces:
  - `Leitura = {lidoEm: string, geradoTse: string, pctSecoes: number, pctAtual: Record, pctProjetado: Record, metodo: 'pa'|'mudanca'}`.
  - `abrirLeituras(caminho) -> {todas(): Leitura[], anotar(l: Leitura): boolean}`.
    - Lê o JSONL existente e ignora uma última linha corrompida.
    - `anotar` só grava (append) se `geradoTse` for diferente do último gravado, e retorna se gravou.

- [ ] **Step 1: Escrever os testes que falham** (em pasta temporária `fs.mkdtempSync`):
  - Gravar 2 leituras, reabrir e obter 2.
  - Anotar de novo com o mesmo `geradoTse` retorna `false` e não duplica.
  - Arquivo com última linha truncada (`{"lidoEm":`) reabre com as linhas válidas.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit:** `git add lib/leituras.js test/leituras.test.js && git commit -m "feat: gravação das leituras ao vivo"`.

---

### Task 7: Servidor ao vivo

**Files:**
- Create: `servidor-2t.js`
- Test: `test/servidor.test.js`

**Interfaces:**
- Consumes: `lerArquivoTse`, `secoesRecebidas`, `estadoUfAoVivo`, `saldoUf`, `curvaRestante`, `baseUf`, `projetarPA`, `projetarMudanca`, `desfecho`, `abrirLeituras`, `carregarSecoes`.
- Produces:
  - Configuração por variáveis de ambiente, com padrões do 2º turno 2026: `ELEICAO=6258`, `PLEITO=3221`, `ANTERIOR=data/secoes/2026-1t.jsonl`, `CANDIDATOS=13,22`, `METODO=` (padrão: o método com menor `acertoEm` no `data/backtest/2022-2t.json`, ou `mudanca` se o arquivo não existir), `PORTA=3026`, `LEITURAS=data/leituras/{ELEICAO}.jsonl`.
  - `GET /api/panorama` retorna:
    - `{geradoTse, lidoEm, pctSecoes, desfecho, metodo, candidatos: [{nr, nome, partido, cor, pct, pctProjetado, votos, votosProjetados}], historico: Leitura[], curva: {pctSecoes, pct}[], ufs: [{uf, base, saldo, detalhe, pctSecoesUf}], avisos: string[]}`.
  - `GET /api/backtest/:caso` devolve `data/backtest/{caso}.json`.
  - Estáticos: `/` → `public/segundo-turno.html`, `/backtest.html`, `/lib/grafico.js`.
  - `criarServidor(config, buscar = fetch) -> {servidor, atualizar(): Promise<void>}`, exportado para o teste injetar um `buscar` falso.

- [ ] **Step 1: Escrever os testes que falham**, com `buscar` falso servindo fixtures:
  - Uma UF responde 404 na segunda leitura. O panorama mantém os votos da primeira leitura daquela UF e `avisos` contém `"pr: HTTP 404"`.
  - Reiniciar `criarServidor` com o mesmo arquivo de leituras devolve o `historico` anterior, e uma leitura com o mesmo `geradoTse` não cria ponto novo.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `servidor-2t.js`.**
  - Totais (`br` e 28 UFs `-u.json`) a cada 60 s. `-cs.json` das 28 UFs a cada 120 s.
  - Requisições com `AbortSignal.timeout(20000)` e no máximo 8 simultâneas.
  - Carrega o JSONL do 1º turno uma vez na inicialização.
  - Quando executado direto (`require.main === module`), escuta em `127.0.0.1:PORTA` e loga uma linha por ciclo, como o `server.js` atual.

- [ ] **Step 4: Rodar e ver passar:** `node --test test/` mostra todos PASS.

- [ ] **Step 5: Ensaio com dados reais do 1º turno.**
  - Rodar `ELEICAO=6257 PLEITO=3220 CANDIDATOS=13,22 node servidor-2t.js` (em PowerShell: `$env:ELEICAO='6257'; ...`) e consultar `/api/panorama`.
  - Esperado: `pctSecoes` = 100, todas as UFs com `base: 'secao'`, `saldo` ≈ 0 em todas (o 1º turno comparado com ele mesmo) e nenhum aviso.

- [ ] **Step 6: Commit:** `git add servidor-2t.js test/servidor.test.js && git commit -m "feat: servidor ao vivo do 2º turno"`.

---

### Task 8: Tela ao vivo

**Files:**
- Create: `public/segundo-turno.html`

**Interfaces:**
- Consumes: `/api/panorama`, `desenharEvolucao`, `desenharSaldo`.

- [ ] **Step 1: Implementar a página.**
  - **Cabeçalho:** % seções, hora do TSE, desfecho ("Projeção: Lula vence com X%") e o método em uso.
  - **Gráfico de evolução:** `historico` como linhas cheias e `curva` como tracejado com rótulo na ponta. Antes de votos, mostra "aguardando".
  - **Barras de saldo:** UFs ordenadas por eleitorado (`aptosTotal`), exterior fora das barras, `title` com Lula e Flávio 1T → 2T e o % apurado da UF. Um selo por UF quando `base === 'municipio'`.
  - **Avisos:** em destaque discreto no topo.
  - **Rodapé:** "extrapolação, sem margem de erro" e o resultado do teste histórico ("em 2022 o método acertou a partir de X%").
  - Atualiza a cada 20 s.

- [ ] **Step 2: Verificar no navegador** com o ensaio da Task 7 (1º turno) rodando: gráfico e barras aparecem, sem erros no console, e a largura de celular (375 px) funciona sem rolagem horizontal.

- [ ] **Step 3: Verificar com o 2º turno real** (`node servidor-2t.js`, sem variáveis): a tela mostra "aguardando", os 2 candidatos e nenhum aviso de erro.

- [ ] **Step 4: Commit:** `git add public/segundo-turno.html && git commit -m "feat: tela ao vivo do 2º turno"`.

---

### Task 9: Plano B por município

**Files:**
- Create: `lib/municipios.js`
- Modify: `servidor-2t.js` (no ciclo, só para UFs com `baseUf === 'municipio'`)
- Test: `test/municipios.test.js`

**Interfaces:**
- Consumes: `lerArquivoTse`, `Secao` do 1º turno, `EstadoUf`.
- Produces:
  - `estadoUfPorMunicipio(arquivosMun: ReturnType<lerArquivoTse>[], anteriores: Map<chave,Secao>, uf: string) -> EstadoUf`.
    - Municípios com `secoesPct > 0` contam como "apurados".
    - `anterior.apuradas` = 1º turno desses municípios inteiros. `anterior.restantes` = os demais.
  - Lista de municípios: `ele2026/{ELEICAO}/config/mun-e00{ELEICAO}-cm.json`. Arquivo: `.../dados/{uf}/{uf}{cdmun}-c0001-e00{ELEICAO}-u.json`.
  - Intervalo de 300 s, no máximo 8 requisições simultâneas.

- [ ] **Step 1: Escrever os testes que falham:**
  - Dois municípios, um com `secoesPct 100` e outro com 0. `anterior.apuradas` soma só o primeiro.
  - `saldoUf` sobre o estado resultante dá o valor esperado à mão.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar e ligar no servidor.** A UF muda de base sozinha e a tela já mostra o selo (Task 8).

- [ ] **Step 4: Rodar e ver passar:** `node --test test/`.

- [ ] **Step 5: Ensaio:** forçar a base por município numa UF pequena (variável `FORCAR_MUNICIPIO=ac`) com o ensaio da Task 7. Esperado: AC com selo de município e saldo ≈ 0.

- [ ] **Step 6: Commit:** `git add lib/municipios.js servidor-2t.js test/municipios.test.js && git commit -m "feat: plano B por município"`.

---

### Task 10: Preparação para a noite

**Files:**
- Create: `iniciar-2t.cmd`

- [ ] **Step 1: Criar `iniciar-2t.cmd`.** Faz `cd /d %~dp0`, depois `node servidor-2t.js`, e abre `http://localhost:3026` com `start`.

- [ ] **Step 2: Verificação final:** `node --test test/` mostra todos PASS. `iniciar-2t.cmd` sobe o servidor, e a tela abre mostrando "aguardando" para o 2º turno.

- [ ] **Step 3: Commit:** `git add iniciar-2t.cmd && git commit -m "chore: atalho para a noite do 2º turno"`.
