# Apuração 2026: projeção do resultado para presidente

Sistema que lê os resultados parciais publicados pelo TSE durante a apuração e projeta o resultado final da eleição para presidente. Para o 2º turno de 2026, também mostra, estado por estado, quem cresceu mais em relação ao 1º turno.

> Projeção própria a partir dos dados públicos do TSE. Não é pesquisa eleitoral e não tem vínculo com o TSE. O resultado oficial é o divulgado pelo TSE.

O sistema tem duas telas:

- **2º turno ao vivo** (`/`):
  - percentual de seções apuradas e projeção do resultado final;
  - gráfico da evolução a cada leitura do TSE, com a curva estendida até 100%;
  - barras de saldo por estado, comparando com o 1º turno nas mesmas seções.
- **Teste histórico** (`/backtest.html`): a apuração de 2022 e do 1º turno de 2026 refeita seção por seção, na ordem real de chegada das urnas, mostrando com quantos % apurados cada método já acertava o resultado.

## Rodando localmente

**Requisitos:** [Node.js](https://nodejs.org) 24 ou mais recente. Não há dependências para instalar: nada de `npm install`.

```bash
git clone <url-deste-repositório>
cd apuracao-2026
node servidor-2t.js
```

Abra http://localhost:3026. O servidor lê o TSE a cada minuto e grava cada leitura em `data/leituras/`. Se ele reiniciar, o gráfico é reconstruído a partir desse arquivo.

No Windows, também dá para usar os atalhos:

- `iniciar-2t.cmd`: sobe o servidor e abre a tela no navegador.
- `iniciar-publico.cmd`: sobe o servidor e cria um link público temporário (`https://….trycloudflare.com`) para mandar a outras pessoas. Exige o [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`winget install Cloudflare.cloudflared`). O link muda a cada vez que é aberto e só funciona enquanto a janela estiver aberta. O computador não pode dormir durante a apuração.

**Teste histórico** (leva cerca de um minuto por caso):

```bash
node scripts/backtest.js 2022-2t
node scripts/backtest.js 2026-1t
node servidor-2t.js
```

Depois abra http://localhost:3026/backtest.html.

**Testes automatizados:**

```bash
node --test
```

### Configuração

Por variáveis de ambiente, todas opcionais:

| Variável | Padrão | Para quê |
|---|---|---|
| `ELEICAO` | `6258` | Código da eleição no TSE (6258 = 2º turno 2026; 6257 = 1º turno) |
| `PLEITO` | `3221` | Código do pleito, usado na lista de seções (3221 = 2º turno; 3220 = 1º turno) |
| `CANDIDATOS` | `13,22` | Números dos candidatos considerados, ou `todos` |
| `METODO` | o melhor no teste de 2022 | `mudanca` ou `pa` |
| `PORTA` | `3026` | Porta HTTP |
| `ANTERIOR` | `dados/secoes/2026-1t.jsonl.gz` | Resultado por seção do turno anterior |
| `LEITURAS` | `data/leituras/{ELEICAO}.jsonl` | Onde gravar as leituras |
| `FORCAR_MUNICIPIO` | vazio | UFs (ex.: `ac,rr`) que devem usar a comparação por município |

Para ensaiar com o 1º turno já apurado, rode `ELEICAO=6257 PLEITO=3220 CANDIDATOS=todos node servidor-2t.js`. O saldo de todos os estados deve dar zero, pois é o 1º turno comparado com ele mesmo.

## Como o sistema funciona

```
TSE (resultados.tse.jus.br)                     dados/secoes/2026-1t.jsonl.gz
 ├─ totais por UF e Brasil, a cada 60 s          (1º turno por seção, do boletim de urna)
 └─ lista de seções recebidas, a cada 120 s                     │
                 │                                              │
                 └──────────────► servidor-2t.js ◄──────────────┘
                                   ├─ compara 2º × 1º turno nas mesmas seções
                                   ├─ projeta o resultado final
                                   ├─ grava cada leitura (data/leituras/)
                                   └─ serve a tela e /api/panorama
```

**Fontes de dados, todas públicas do TSE:**

- **Ao vivo:** os arquivos de resultado que alimentam o site de resultados do TSE.
  - `…/ele2026/{eleição}/dados/{uf}/{uf}-c0001-e00{eleição}-u.json`: votos por candidato, seções e eleitorado apurados em cada UF.
  - `…/ele2026/arquivo-urna/{pleito}/config/{uf}/{uf}-p00{pleito}-cs.json`: a lista de seções da UF, com a data e hora em que cada uma foi recebida. É o que diz quais seções já entraram.
- **Histórico:** os boletins de urna por seção dos dados abertos do TSE (`cdn.tse.jus.br/…/buweb/bweb_{turno}t_{UF}_….zip`). Eles trazem os votos de cada seção e o horário em que o boletim foi recebido.
  - Os scripts `scripts/baixar-bweb.js` e `scripts/extrair-bweb.js` reduzem esses arquivos (cerca de 6 GB) a uma linha por seção, só com presidente.
  - O resultado já vem versionado em `dados/secoes/` (cerca de 25 MB compactado). Só é preciso baixar de novo se quiser refazer a extração.
  - A extração usa o `tar` do Windows (bsdtar), que lê zip. No Linux, instale `libarchive-tools`.

**Plano B por município:** se, durante a apuração, a lista de seções de uma UF não indicar nenhuma seção recebida embora a UF já tenha votos, o sistema passa aquela UF para os arquivos por município. A troca é automática e marcada com `*` nas barras. Todo município com alguma seção apurada conta como apurado.

## Como projetamos o resultado

Dois métodos estão implementados em `lib/modelos.js`. A tela usa o que se saiu melhor no teste histórico, hoje o de mudança.

### 1. Mudança sobre o 1º turno (método principal)

Para cada estado:

1. Nas seções já apuradas no 2º turno, mede-se quanto cada candidato variou em relação ao 1º turno **nessas mesmas seções**, em pontos percentuais dos votos válidos. Exemplo: Lula tinha 40% dessas seções no 1º turno e tem 48% agora, ou seja, +8 p.p.
2. As seções que faltam recebem o resultado que tiveram no 1º turno mais essa variação. O resultado é limitado a no mínimo zero e redistribuído para somar 100% entre os dois candidatos.
3. O número de votos válidos que falta é o do 1º turno nessas seções, ajustado pela variação de comparecimento já observada no estado. O tamanho do que falta segue a fração do eleitorado já apurada nos totais do TSE.
4. Estado ainda sem nenhuma seção apurada usa a variação nacional.

Somando os estados, sai o resultado final projetado. Comparar as mesmas seções elimina o principal viés da apuração: a ordem em que as urnas chegam. Capitais costumam entrar antes do interior, e isso mexe muito no placar parcial, mas não na variação de cada seção.

### 2. Progressão aritmética (referência)

Em cada estado, o eleitorado que falta apurar rende votos válidos na mesma taxa e na mesma proporção entre candidatos do que já foi apurado ali. Corrige o ritmo diferente entre estados, mas não o viés de ordem dentro de cada estado.

### A curva até 100%

O tracejado do gráfico reparte o que falta em cada estado pelas seções restantes, em proporção aos votos válidos delas no 1º turno, e as faz "chegar" na ordem em que chegaram no 1º turno. O ponto final é sempre o resultado projetado. A forma da curva é ilustrativa.

### Barras por estado

**Saldo** = (Lula no 2º turno − Lula no 1º turno) − (Flávio no 2º turno − Flávio no 1º turno), em pontos percentuais dos válidos, nas mesmas seções. No 1º turno havia 12 candidatos, então os dois tendem a crescer; a barra mostra quem cresceu mais.

## Teste histórico

A apuração é refeita seção por seção, na ordem real de recebimento dos boletins, recalculando a projeção a cada 1% das seções. "Acertou a partir de X%" é o primeiro ponto a partir do qual o método apontou o desfecho certo e não mudou mais.

| Caso | Mudança sobre o 1º turno | Progressão aritmética |
|---|---|---|
| 2º turno 2022 (Lula 50,90% × Bolsonaro 49,10%) | **acertou a partir de 1%** | acertou a partir de 45% |
| 1º turno 2026 (haveria 2º turno entre Lula e Flávio) | não se aplica (não há turno anterior) | acertou a partir de 1% |

Distância até o resultado final no 2º turno de 2022 (Lula):

| Apurado | Placar real naquele momento | Mudança | Progressão aritmética |
|---|---|---|---|
| 1% | Bolsonaro +12,9 p.p. | 0,44 p.p. | 0,57 p.p. |
| 5% | Bolsonaro +6,7 p.p. | 0,01 p.p. | 1,66 p.p. (apontava Bolsonaro) |
| 10% | Bolsonaro +4,0 p.p. | 0,05 p.p. | 0,82 p.p. |
| 25% | Bolsonaro +2,5 p.p. | 0,03 p.p. | 0,72 p.p. |
| 50% | Bolsonaro +0,6 p.p. | 0,01 p.p. | 0,82 p.p. |

### Limitações

- **Uma eleição de referência.** A medida vem de uma única eleição comparável (2022). Não é uma margem de erro estatística.
- **A premissa do método.** O método supõe que a variação do 1º para o 2º turno observada nas seções apuradas de um estado vale para as que faltam no mesmo estado. Se os eleitores de outros candidatos do 1º turno migrarem de forma diferente nas regiões que apuram por último, o erro cresce.
- **Lista de seções ao vivo.** Ao vivo, o sistema depende da lista de seções recebidas publicada pelo TSE. Na reprise histórica, esse dado era exato. A comparação por município, usada como plano B, é menos precisa e não foi medida no teste.

## Estrutura

| Caminho | O que é |
|---|---|
| `servidor-2t.js` | Servidor do 2º turno: lê o TSE, calcula e serve a tela |
| `public/segundo-turno.html`, `public/backtest.html` | As duas telas |
| `lib/modelos.js` | Os dois métodos de projeção |
| `lib/ao-vivo.js` | Comparação com o 1º turno por seção, saldo por estado e curva |
| `lib/municipios.js` | Plano B por município |
| `lib/reprise.js` | Reprise histórica da apuração |
| `lib/bweb.js`, `lib/secoes.js` | Leitura dos boletins de urna e dos arquivos de seções |
| `lib/leituras.js` | Gravação das leituras ao vivo |
| `lib/grafico.js` | Gráficos em SVG, usados pelas duas telas |
| `scripts/` | Download e extração dos boletins, teste histórico |
| `dados/secoes/` | Seções do 1º turno de 2026 e dos dois turnos de 2022 (`.jsonl.gz`) |
| `test/` | Testes (`node --test`) |
| `server.js`, `index.html`, `projecao.js` | Versão usada no 1º turno de 2026 (projeção por UF com progressão aritmética) |
| `docs/superpowers/` | Documento de desenho e plano de implementação |
