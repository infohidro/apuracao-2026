# Apuração 2º turno 2026: comparação com o 1º turno, curva de projeção e teste histórico

Data: 19/10/2026. Eleição: 25/10/2026, presidente, Lula × Flávio Bolsonaro.

## Intenção

Na noite do 2º turno, abrir uma tela e ver rapidamente duas coisas:

1. **Quem está crescendo em cada estado em relação ao 1º turno.**
2. **A curva da apuração e onde ela deve terminar.**

Antes da noite, um teste com eleições passadas diz **com quantos % de seções apuradas o modelo já teria acertado o resultado**, para saber em quanto confiar na projeção.

## Objetivos

- **Comparação por estado:** feita nas mesmas seções já apuradas no 2º turno, comparadas com o resultado delas no 1º turno de 2026. Usa município se o dado por seção não estiver disponível a tempo.
- **Gráfico de linha:** a evolução a cada leitura do TSE, com um tracejado estendendo a curva até 100%.
- **Teste histórico:** dois casos (2º turno de 2022 e 1º turno de 2026) e dois métodos, comparados entre si.

## Não objetivos

- Outros cargos (governador etc.).
- Margem de erro estatística ou intervalo de confiança.
- Publicar o sistema na internet: roda só na máquina do usuário.

## Antiobjetivos (seria um fracasso mesmo funcionando)

- A tela cair ou travar durante a noite, como aconteceu no 1º turno: o servidor de preview do app é encerrado após 30 minutos.
- Comparar bases diferentes, por exemplo o 2º turno parcial contra o 1º turno completo do estado. Isso faz um estado "virar" só por causa da ordem de chegada das urnas.
- Projeção que usa dados errados ou incompletos em silêncio. Quando faltar algo, a tela diz.
- Bombardear o TSE com requisições a ponto de ser bloqueado.

## Fontes de dados (verificadas em 19/10/2026, exceto onde indicado)

| Dado | Onde | Observação |
|---|---|---|
| Totais 2º turno 2026 por UF e BR | `resultados.tse.jus.br/oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json` | Mesmo formato do 1º turno (eleição 6257) já usado em `projecao.js` |
| Lista de seções 2º turno 2026 | `.../ele2026/arquivo-urna/3221/config/{uf}/{uf}-p003221-cs.json` | Existe. No 1º turno (pleito 3220), cada seção ganhou `da`/`ha` (data/hora de chegada). **Não verificado:** se isso é preenchido durante a apuração ou só depois. É a base da comparação por seção ao vivo. |
| Resultado por município 2026 | `.../ele2026/{eleicao}/dados/{uf}/{uf}{cdmun}-c0001-e00{eleicao}-u.json` | Plano B se a lista de seções não for preenchida ao vivo. Lista de municípios em `.../ele2026/{eleicao}/config/mun-e00{eleicao}-cm.json` |
| Votos por seção 1º turno 2026 | `cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip` (162 MB) | Presumivelmente só presidente (abrangência BR). Conteúdo não aberto ainda. |
| Horário de chegada das seções 1º turno 2026 | arquivos `-cs.json` do pleito 3220 (um por UF) | Verificado: tem `da`/`ha` por seção |
| Boletim de urna 2022, 1º e 2º turno | `cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_{1t,2t}_{UF}_{timestamp}.zip` | Verificado (AC): tem `DT_BU_RECEBIDO` e votos por seção. Grande: SP 1º turno = 404 MB compactado. O timestamp no nome varia por UF e precisa ser descoberto (listagem dos dados abertos do TSE). |
| Boletim de urna 2026, 1º turno | `.../eleicoes2026/buweb/bweb_1t_{UF}_051020261403.zip` | Listado nos dados abertos em 19/10. Substitui a combinação `-cs.json` + `votacao_secao` como fonte do 1º turno de 2026 (votos e horário de recebimento no mesmo arquivo). Sufixos de 2022: 1º turno `051020221321`, 2º turno `311020221535`. |
| Evolução gravada de 2022 | Web Archive | Só 4 capturas da noite: insuficiente. Por isso a apuração é reconstruída pelos boletins de urna. |

O usuário autorizou baixar esses arquivos (vários GB, uma vez). Os arquivos brutos ficam fora do controle de versão.

## Métodos de projeção

Os dois métodos rodam no teste, e a tela ao vivo usa o que se sair melhor nele (decisão minha).

- **Progressão aritmética (método atual, `projecao.js`):** em cada UF, o eleitorado que falta apurar rende votos na mesma proporção do já apurado. O tamanho final vem da taxa de válidos por eleitor.
- **Mudança sobre o turno anterior:**
  - Em cada UF, compara-se o percentual de cada candidato nas seções já apuradas no 2º turno com o percentual dele nessas mesmas seções no turno anterior. A diferença em p.p. é a mudança daquela UF.
  - As seções que faltam recebem o resultado do turno anterior mais essa mudança.
  - O número de válidos que falta vem dos válidos dessas seções no turno anterior, ajustados pela razão de comparecimento observada na UF.
  - Antes de existir mudança medida numa UF, usa-se a mudança nacional.
  - A forma exata do ajuste (aditivo em p.p., proporcional) fica a critério do construtor, desde que documentada e testada.

## Tela ao vivo (2º turno)

Página única que se atualiza sozinha.

**Cabeçalho:** % de seções apuradas, hora dos dados do TSE e o desfecho projetado ("Projeção: Lula vence com X%").

**Gráfico de evolução (aprovado: opção A do esboço)**
- Eixo X: % de seções apuradas no Brasil, de 0 a 100. Eixo Y: % dos votos válidos, com referência em 50%.
- Linhas cheias de Lula (laranja) e Flávio (azul), com um ponto por leitura do TSE.
- Tracejado saindo do ponto atual até 100%, terminando no resultado projetado, com o valor escrito na ponta.
- A forma do tracejado simula as seções restantes chegando na ordem em que chegaram no 1º turno (decisão minha). Só o ponto final importa para a precisão; a forma é ilustrativa.
- Antes da primeira leitura com votos, mostra "aguardando".

**Quem cresceu por estado (aprovado: opção B do esboço, barras de saldo)**
- Uma barra por UF com o saldo: variação de Lula menos variação de Flávio, em p.p. dos votos válidos, nas mesmas seções. Laranja para a direita quando Lula cresceu mais, azul para a esquerda quando foi Flávio.
- Ordenadas pelo tamanho do eleitorado (decisão minha).
- Ao passar o mouse: Lula e Flávio no 1º e no 2º turno, a variação de cada um e o % apurado da UF.
- UF sem seções apuradas: sem barra, com "aguardando" (decisão minha).
- Exterior fora das barras (decisão minha), mas incluído nos totais e na projeção.
- No 1º turno, o percentual de cada um é sobre todos os válidos (12 candidatos), então os dois tendem a crescer. A barra mostra quem cresceu mais.
- A tela informa se a base é seção ou município.
- **Escolha automática entre seção e município (decisão minha):** se os totais da UF já têm votos mas o `-cs.json` dela não tem nenhuma seção com `da`/`ha`, aquela UF passa para a base por município. A troca é por UF e acontece sozinha, sem intervenção na noite.

**Robustez**
- Cada leitura do TSE é gravada em disco (um arquivo por leitura, ou JSONL), e o servidor reconstrói o gráfico ao reiniciar (decisão minha).
- O servidor roda como processo próprio (`node server.js`), não pelo preview do app.
- Se uma leitura falhar, mantém a última boa e mostra o aviso.
- Intervalo de leitura: 60 s para os totais. Os arquivos de seções por UF podem ter intervalo maior se forem pesados.

## Teste histórico (antes de 25/10)

**Casos**
- **2º turno de 2022 (Lula × Bolsonaro):** o turno anterior é o 1º turno de 2022 por seção, e a ordem de chegada vem de `DT_BU_RECEBIDO`.
- **1º turno de 2026:** a ordem de chegada vem do `ha`/`da` dos `-cs.json` do pleito 3220, e os votos vêm de `votacao_secao_2026_BR`.
  - O método de mudança não tem turno anterior aqui. Testa-se só a progressão aritmética, a menos que o construtor encontre uma base razoável, como o 1º turno de 2022 por seção casado pela numeração.

**Procedimento:** reprisar a apuração seção por seção, na ordem real, recalculando a projeção a cada 1% de seções apuradas.

**Critério de acerto (escolhido pelo usuário)**
- O modelo "previu" a partir do % apurado em que aponta o vencedor certo e não muda mais até o fim.
- No 1º turno de 2026 (decisão minha), "vencedor certo" vira apontar corretamente que haveria 2º turno e entre quem.

**Saída**
- Uma página simples com o gráfico da projeção ao longo da reprise, no estilo da opção A, um por caso.
- Uma frase por método e caso: "acertou a partir de X% e não mudou mais".
- Como extra, a distância até o resultado final em p.p. ao longo da reprise.

## Restrições

- Precisa estar funcionando antes de 25/10/2026, 17h de Brasília (fechamento das urnas).
- Node.js 24, sem dependências externas na parte ao vivo (como o código atual). Para descompactar e ler os arquivos grandes do teste, o construtor pode escolher a ferramenta.
- Windows 11. O projeto fica em `C:\Users\Casa\Documents\apuracao-2026`. Disco C: com 231 GB livres em 19/10, suficiente para os downloads.
- Consumo do limite de uso do Claude: o usuário se importa. Preferir processamento local por script a ler dados volumosos na conversa.

## Deixado ao construtor

- Estrutura de arquivos, formato de gravação das leituras e biblioteca de gráfico (SVG à mão ou biblioteca via CDN).
- Como casar seções entre turnos quando houver seções agregadas ou renumeradas, desde que o número de seções descartadas seja informado.
- Detalhe matemático do ajuste do método de mudança, documentado e com testes.
- Como descobrir os nomes exatos dos arquivos `bweb` de 2022 por UF.
