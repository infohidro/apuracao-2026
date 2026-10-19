// Servidor ao vivo do 2º turno de 2026: lê o TSE, compara com o 1º turno nas mesmas seções,
// projeta o final e grava cada leitura. Uso: node servidor-2t.js -> http://localhost:3026
// Variáveis de ambiente: ELEICAO, PLEITO, ANTERIOR, CANDIDATOS (lista ou "todos"), METODO, PORTA, LEITURAS.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { lerArquivoTse, num } = require('./projecao');
const { carregarSecoes, arquivoSecoes } = require('./lib/secoes');
const { projetarPA, projetarMudanca, desfecho } = require('./lib/modelos');
const { secoesRecebidas, estadoUfAoVivo, saldoUf, baseUf, curvaRestante } = require('./lib/ao-vivo');
const { abrirLeituras } = require('./lib/leituras');
const { indicePorMunicipio, infoPorMunicipio } = require('./lib/municipios');

const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to', 'zz'];
const CORES = { 13: '#e07a1f', 22: '#3b6fd6' };
const EXTRAS = ['#2a9d8f', '#9b5de5', '#8d6e63', '#c0392b', '#607d8b', '#6d4c41'];
const METODOS = { pa: projetarPA, mudanca: projetarMudanca };
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
  let indiceMun = null;
  let listaMun = null; // uf -> [códigos de município]
  let avisos = [];
  let ciclo = 0;

  const precisaMunicipio = (uf) => {
    if (forcarMunicipio.has(uf)) return true;
    const u = ultimoU[uf] && lerArquivoTse(ultimoU[uf]);
    return Boolean(u && u.validos > 0 && !(recebidas.get(uf)?.recebidas.size > 0));
  };
  const infoUf = (uf) => (precisaMunicipio(uf) && porMunicipio.has(uf) ? porMunicipio.get(uf) : recebidas.get(uf) ?? null);

  async function atualizarMunicipios(falhas) {
    const alvo = ufs.filter((uf) => uf !== 'zz' && precisaMunicipio(uf));
    if (!alvo.length || !config.anteriores) return;
    try {
      if (!listaMun) {
        const cm = await obter(urlMunLista);
        listaMun = new Map(cm.abr.map((a) => [String(a.cd).toLowerCase(), a.mu.map((m) => m.cd)]));
      }
    } catch (e) { falhas.push(`lista de municípios: ${e.message}`); return; }
    indiceMun ??= indicePorMunicipio(config.anteriores);
    for (const uf of alvo) {
      const arquivos = [];
      await emParalelo(listaMun.get(uf) ?? [], 8, async (mun) => {
        try { arquivos.push(lerArquivoTse(await obter(urlMun(uf, mun)))); } catch { /* município pulado nesta rodada */ }
      });
      if (arquivos.length) porMunicipio.set(uf, infoPorMunicipio(arquivos, indiceMun, uf));
    }
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
    if (ciclo % 5 === 1) await atualizarMunicipios(falhas); // a cada ~5 min, só UFs que precisam
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
    const estados = ufsTse.map((u) => estadoUfAoVivo(u, infos.get(u.uf), config.anteriores, candidatos));
    const validos = estados.reduce((a, e) => a + e.validos, 0);
    const temAnterior = estados.some((e) => e.anterior && e.anterior.restantes.validos + e.anterior.apuradas.validos > 0);
    const metodo = config.metodo === 'mudanca' && !temAnterior ? 'pa' : config.metodo;
    const projecao = METODOS[metodo](estados, candidatos);

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
      const detalhe = s.saldo === null
        ? `${u.uf.toUpperCase()}: aguardando seções apuradas`
        : `${u.uf.toUpperCase()} (${f(u.secoesPct)}% apurado, base: ${base === 'secao' ? 'seções' : 'municípios'})\n` +
          `Lula: ${f(s.lula1)}% → ${f(s.lula2)}% (${s.lula2 >= s.lula1 ? '+' : ''}${f(s.lula2 - s.lula1)} p.p.)\n` +
          `Flávio: ${f(s.flavio1)}% → ${f(s.flavio2)}% (${s.flavio2 >= s.flavio1 ? '+' : ''}${f(s.flavio2 - s.flavio1)} p.p.)`;
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
      avisos,
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

  return { servidor, atualizar, panorama: () => estado };
}

// Método padrão: o que acertou antes no teste de 2022; sem teste, "mudanca".
function escolherMetodo(raiz) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'backtest', '2022-2t.json'), 'utf8'));
    const ordem = Object.entries(b.metodos).sort((x, y) => (x[1].acertoEm ?? Infinity) - (y[1].acertoEm ?? Infinity));
    return { metodo: ordem[0][0], resumo: Object.fromEntries(Object.entries(b.metodos).map(([m, s]) => [m, s.acertoEm])) };
  } catch {
    return { metodo: 'mudanca', resumo: null };
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
}

if (require.main === module) main();

module.exports = { criarServidor, escolherMetodo, num };
