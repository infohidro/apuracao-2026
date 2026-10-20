// Servidor ao vivo do 2º turno de 2026: lê o TSE, compara com o 1º turno nas mesmas seções,
// projeta o final e grava cada leitura. Uso: node servidor-2t.js -> http://localhost:3026
// Variáveis de ambiente: ELEICAO, PLEITO, ANTERIOR, CANDIDATOS (lista ou "todos"), METODO, PORTA, LEITURAS.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { lerArquivoTse, num } = require('./projecao');
const { carregarSecoes, arquivoSecoes } = require('./lib/secoes');
const { projetarPA, projetarMudanca, projetarMudancaAbstencao, desfecho } = require('./lib/modelos');
const { secoesRecebidas, estadoUfAoVivo, saldoUf, baseUf, curvaRestante } = require('./lib/ao-vivo');
const { abrirLeituras } = require('./lib/leituras');
const { indicePorMunicipio, infoPorMunicipio } = require('./lib/municipios');
const { ladoMunicipios, resumoAbstencao, origemVotos, abstencaoUf } = require('./lib/abstencao');

const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to', 'zz'];
const CORES = { 13: '#e07a1f', 22: '#3b6fd6' };
const EXTRAS = ['#2a9d8f', '#9b5de5', '#8d6e63', '#c0392b', '#607d8b', '#6d4c41'];
const METODOS = { pa: projetarPA, mudanca: projetarMudanca, mudancaAbstencao: projetarMudancaAbstencao };
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: undefined };

// Executa fn sobre os itens com no máximo `limite` em paralelo.
async function emParalelo(itens, limite, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) { const item = itens[i++]; await fn(item); }
  }));
}

function criarServidor(config, buscar = fetch) {
  const ufs = config.ufs ?? UFS;
  const pad = String(config.eleicao).padStart(6, '0');
  const padP = String(config.pleito).padStart(6, '0');
  const urlU = (abr) => `${BASE}/${config.eleicao}/dados/${abr}/${abr}-c0001-e${pad}-u.json`;
  const urlCs = (uf) => `${BASE}/arquivo-urna/${config.pleito}/config/${uf}/${uf}-p${padP}-cs.json`;
  const leituras = abrirLeituras(config.leituras);

  const urlMunLista = `${BASE}/${config.eleicao}/config/mun-e${pad}-cm.json`;
  const urlMun = (uf, mun) => `${BASE}/${config.eleicao}/dados/${uf}/${uf}${mun}-c0001-e${pad}-u.json`;
  const forcarMunicipio = new Set(config.forcarMunicipio ?? []);

  const ultimoU = {}; // última leitura boa de cada abrangência
  const recebidas = new Map(); // uf -> {total, recebidas, todas} vindo do -cs.json
  const porMunicipio = new Map(); // uf -> mesmo formato, vindo dos arquivos por município (plano B)
  const munsPorUf = new Map(); // uf -> arquivos de município (lerArquivoTse), para a abstenção por lado
  const indiceMun = config.anteriores ? indicePorMunicipio(config.anteriores) : null;
  const lados = config.anteriores ? ladoMunicipios(config.anteriores) : null;
  let listaMun = null; // uf -> [códigos de município]
  let avisos = [];
  let avisosMun = [];
  let ciclo = 0;

  const precisaMunicipio = (uf) => {
    if (forcarMunicipio.has(uf)) return true;
    const u = ultimoU[uf] && lerArquivoTse(ultimoU[uf]);
    return Boolean(u && u.validos > 0 && !(recebidas.get(uf)?.recebidas.size > 0));
  };
  const infoUf = (uf) => (precisaMunicipio(uf) && porMunicipio.has(uf) ? porMunicipio.get(uf) : recebidas.get(uf) ?? null);

  // Lê os arquivos de todos os municípios (fora o exterior). Serve à abstenção por lado e ao
  // plano B. Roda no seu próprio intervalo (cerca de 5 min), sem atrasar a leitura dos totais.
  let lendoMunicipios = false;
  async function atualizarMunicipios() {
    if (!config.anteriores || lendoMunicipios) return;
    lendoMunicipios = true;
    const falhas = [];
    try {
      if (!listaMun) {
        const cm = await obter(urlMunLista);
        listaMun = new Map(cm.abr.map((a) => [String(a.cd).toLowerCase(), a.mu.map((m) => m.cd)]));
      }
      for (const uf of ufs.filter((x) => x !== 'zz')) {
        const arquivos = [];
        let perdidos = 0;
        await emParalelo(listaMun.get(uf) ?? [], 8, async (mun) => {
          try { arquivos.push(lerArquivoTse(await obter(urlMun(uf, mun)))); } catch { perdidos++; }
        });
        if (arquivos.length) {
          // município que falhou nesta rodada mantém a leitura anterior
          const antigos = new Map((munsPorUf.get(uf) ?? []).map((m) => [m.uf, m]));
          for (const m of arquivos) antigos.set(m.uf, m);
          munsPorUf.set(uf, [...antigos.values()]);
          porMunicipio.set(uf, infoPorMunicipio(munsPorUf.get(uf), indiceMun, uf));
        }
        if (perdidos) falhas.push(`${uf}: ${perdidos} município(s) sem resposta`);
      }
    } catch (e) {
      falhas.push(`lista de municípios: ${e.message}`);
    } finally {
      lendoMunicipios = false;
    }
    avisosMun = falhas;
    calcular();
  }
  let estado = { erro: 'Primeira leitura em andamento', historico: leituras.todas() };

  async function obter(url) {
    const r = await buscar(url, { ...H, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function atualizar() {
    const falhas = [];
    await emParalelo(['br', ...ufs], 8, async (abr) => {
      try { ultimoU[abr] = await obter(urlU(abr)); } catch (e) { falhas.push(`${abr}: ${e.message}`); }
    });
    if (ciclo++ % 2 === 0) { // lista de seções a cada 2 ciclos (arquivos maiores)
      await emParalelo(ufs, 8, async (uf) => {
        try {
          const info = secoesRecebidas(await obter(urlCs(uf)), new Map()).get(uf);
          if (info) recebidas.set(uf, info);
        } catch (e) { falhas.push(`${uf} (seções): ${e.message}`); }
      });
    }
    avisos = falhas;
    calcular();
  }

  function calcular() {
    const ufsTse = ufs.filter((uf) => ultimoU[uf]).map((uf) => lerArquivoTse(ultimoU[uf]));
    if (!ufsTse.length) { estado = { erro: 'Não foi possível ler o TSE', avisos, historico: leituras.todas() }; return; }
    const br = ultimoU.br ? lerArquivoTse(ultimoU.br) : null;
    const todosCandidatos = (br ?? ufsTse[0]).candidatos;
    const candidatos = config.candidatos === 'todos' ? todosCandidatos.map((c) => c.numero) : config.candidatos;

    const infos = new Map(ufsTse.map((u) => [u.uf, infoUf(u.uf)]));
    const estados = ufsTse.map((u) => estadoUfAoVivo(u, infos.get(u.uf), config.anteriores, candidatos, lados));
    const validos = estados.reduce((a, e) => a + e.validos, 0);

    // abstenção por lado (municípios pró-Lula e pró-Flávio), comparando as mesmas seções
    const abst = config.anteriores
      ? resumoAbstencao({ muns: munsPorUf, infos, anteriores: config.anteriores, lados, indice: indiceMun, candidatos })
      : null;
    for (const e of estados) {
      if (e.anterior) e.anterior.razaoPorLado = { lula: abst?.porUf[e.uf]?.lula?.razao ?? null, flavio: abst?.porUf[e.uf]?.flavio?.razao ?? null };
    }

    const temAnterior = estados.some((e) => e.anterior && e.anterior.restantes.validos + e.anterior.apuradas.validos > 0);
    const metodo = config.metodo.startsWith('mudanca') && !temAnterior ? 'pa' : config.metodo;
    const projecao = METODOS[metodo](estados, candidatos);
    // quanto o ajuste de abstenção por lado mexe no Lula, em p.p.
    const efeitoLula = metodo === 'mudancaAbstencao' && validos > 0
      ? projecao.pct['13'] - projetarMudanca(estados, candidatos).pct['13']
      : null;

    const votosAtuais = {};
    for (const c of candidatos) votosAtuais[c] = estados.reduce((a, e) => a + (e.votos[c] ?? 0), 0);
    const pctAtual = {};
    for (const c of candidatos) pctAtual[c] = validos > 0 ? (votosAtuais[c] / validos) * 100 : 0;
    const pctSecoes = br ? br.secoesPct : 0;
    const geradoTse = br?.geradoEm ?? ufsTse[0].geradoEm;

    if (validos > 0) {
      leituras.anotar({ lidoEm: new Date().toISOString(), geradoTse, pctSecoes, pctAtual, pctProjetado: projecao.pct, metodo });
    }

    const nomes = Object.fromEntries(todosCandidatos.map((c) => [c.numero, c]));
    const linhasUf = ufsTse.filter((u) => u.uf !== 'zz').map((u, i) => {
      const e = estados[ufsTse.indexOf(u)];
      const s = saldoUf(e);
      const base = infos.get(u.uf)?.base === 'municipio' ? 'municipio' : baseUf(u, infos.get(u.uf)?.recebidas ?? new Set());
      const f = (x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const sinal = (x) => (x >= 0 ? '+' : '') + f(x);
      const a = abstencaoUf(u, infos.get(u.uf), config.anteriores);
      const detalhe = s.saldo === null
        ? `${u.uf.toUpperCase()}: aguardando seções apuradas`
        : `${u.uf.toUpperCase()} (${f(u.secoesPct)}% apurado, base: ${base === 'secao' ? 'seções' : 'municípios'})\n` +
          `Lula: ${f(s.lula1)}% → ${f(s.lula2)}% (${sinal(s.lula2 - s.lula1)} p.p.)\n` +
          `Flávio: ${f(s.flavio1)}% → ${f(s.flavio2)}% (${sinal(s.flavio2 - s.flavio1)} p.p.)` +
          (a ? `\nAbstenção: ${f(a.abst1)}% → ${f(a.abst2)}% (${sinal(a.abst2 - a.abst1)} p.p.)` : '');
      return { uf: u.uf, base, saldo: s.saldo, detalhe, pctSecoesUf: u.secoesPct, aptosTotal: u.eleitorado, i };
    }).sort((a, b) => b.aptosTotal - a.aptosTotal);

    const lider = Object.entries(projecao.pct).sort((a, b) => b[1] - a[1])[0];
    const fmt2 = (x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const textoDesfecho = validos <= 0 ? 'Aguardando os primeiros votos'
      : desfecho(projecao.pct).startsWith('1T:')
        ? `Projeção: ${nomes[lider[0]]?.nome ?? lider[0]} vence com ${fmt2(lider[1])}%`
        : `Projeção: 2º turno entre ${desfecho(projecao.pct).slice(3).split('x').map((n) => nomes[n]?.nome ?? n).join(' e ')}`;

    estado = {
      geradoTse, lidoEm: new Date().toISOString(), pctSecoes, metodo, desfecho: textoDesfecho,
      candidatos: candidatos.map((c, i) => ({
        nr: c, nome: nomes[c]?.nome ?? c, partido: nomes[c]?.partido ?? '', cor: CORES[c] ?? EXTRAS[i % EXTRAS.length],
        // sem votos não há projeção: só o 1º turno redistribuído, que não deve aparecer como previsão
        votos: votosAtuais[c], pct: pctAtual[c],
        votosProjetados: validos > 0 ? projecao.votos[c] : null, pctProjetado: validos > 0 ? projecao.pct[c] : null,
      })).sort((a, b) => (b.pctProjetado ?? 0) - (a.pctProjetado ?? 0) || a.nr.localeCompare(b.nr)),
      historico: leituras.todas(),
      curva: validos > 0 ? curvaRestante(estados, infos, config.anteriores, pctSecoes, projecao, candidatos) : [],
      ufs: linhasUf,
      abstencao: abst && {
        barra: abst.barra, lula: abst.nacional.lula, flavio: abst.nacional.flavio, efeitoLula,
        origem: origemVotos({ infos, anteriores: config.anteriores, lados }),
        municipiosLidos: [...munsPorUf.values()].reduce((t, l) => t + l.length, 0),
      },
      avisos: [...avisos, ...avisosMun],
      backtest: config.resumoBacktest ?? null,
    };
  }

  const ESTATICOS = {
    '/': ['public/segundo-turno.html', 'text/html'],
    '/backtest.html': ['public/backtest.html', 'text/html'],
    '/lib/grafico.js': ['lib/grafico.js', 'text/javascript'],
  };
  const servidor = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/panorama') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(estado));
    }
    const caso = /^\/api\/backtest\/([\w-]+)$/.exec(url);
    const [arquivo, tipo] = caso ? [`data/backtest/${caso[1]}.json`, 'application/json'] : (ESTATICOS[url] ?? []);
    const caminho = arquivo && path.join(config.raiz, arquivo);
    if (!caminho || !fs.existsSync(caminho)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': `${tipo}; charset=utf-8`, 'Cache-Control': 'no-store' });
    fs.createReadStream(caminho).pipe(res);
  });

  return { servidor, atualizar, atualizarMunicipios, panorama: () => estado };
}

// Método padrão: o que acertou antes no teste de 2022, com desempate pelo erro médio até 50%
// apurado. Sem o teste rodado, "mudancaAbstencao" (o que venceu o teste em 20/10/2026).
function escolherMetodo(raiz) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'backtest', '2022-2t.json'), 'utf8'));
    const ordem = Object.entries(b.metodos).sort((x, y) =>
      (x[1].acertoEm ?? Infinity) - (y[1].acertoEm ?? Infinity) || (x[1].erroMedio ?? Infinity) - (y[1].erroMedio ?? Infinity));
    return { metodo: ordem[0][0], resumo: Object.fromEntries(Object.entries(b.metodos).map(([m, s]) => [m, s.acertoEm])) };
  } catch {
    return { metodo: 'mudancaAbstencao', resumo: null };
  }
}

async function main() {
  const raiz = __dirname;
  const eleicao = process.env.ELEICAO || '6258';
  const escolha = escolherMetodo(raiz);
  const anteriorArq = process.env.ANTERIOR || arquivoSecoes(raiz, '2026-1t');
  const anteriores = anteriorArq && fs.existsSync(anteriorArq) ? await carregarSecoes(anteriorArq) : null;
  if (!anteriores) console.log('Sem o 1º turno por seção: comparação por estado e método de mudança desativados');
  const config = {
    eleicao, pleito: process.env.PLEITO || '3221',
    candidatos: process.env.CANDIDATOS === 'todos' ? 'todos' : (process.env.CANDIDATOS || '13,22').split(','),
    metodo: process.env.METODO || escolha.metodo, resumoBacktest: escolha.resumo,
    leituras: process.env.LEITURAS || path.join(raiz, 'data', 'leituras', `${eleicao}.jsonl`),
    forcarMunicipio: (process.env.FORCAR_MUNICIPIO || '').split(',').filter(Boolean),
    anteriores, raiz,
  };
  const s = criarServidor(config);
  const porta = Number(process.env.PORTA) || 3026;
  s.servidor.listen(porta, '127.0.0.1', () => console.log(`2º turno em http://localhost:${porta} (método: ${config.metodo})`));
  const ciclo = async () => {
    try { await s.atualizar(); } catch (e) { console.log('erro no ciclo:', e.message); }
    const p = s.panorama();
    console.log(new Date().toLocaleTimeString('pt-BR'), `seções ${p.pctSecoes ?? '-'}%`, p.desfecho ?? p.erro,
      p.avisos?.length ? `| avisos: ${p.avisos.length}` : '');
  };
  await ciclo();
  setInterval(ciclo, 60_000);
  // municípios: logo após a primeira leitura e depois a cada 5 min (cerca de 5.570 arquivos)
  const municipios = async () => {
    const t = Date.now();
    try { await s.atualizarMunicipios(); } catch (e) { console.log('erro nos municípios:', e.message); }
    const a = s.panorama().abstencao;
    console.log(new Date().toLocaleTimeString('pt-BR'), `municípios lidos: ${a?.municipiosLidos ?? 0} em ${Math.round((Date.now() - t) / 1000)} s`);
  };
  municipios();
  setInterval(municipios, 300_000);
}

if (require.main === module) main();

module.exports = { criarServidor, escolherMetodo, num };
