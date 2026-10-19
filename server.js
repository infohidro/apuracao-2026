// Ponte local para a API de resultados do TSE (presidente, 1º turno de 2026) + projeção.
// Uso: node server.js   ->   http://localhost:3026
const http = require('http');
const fs = require('fs');
const path = require('path');
const { lerArquivoTse, calcularPanorama, num } = require('./projecao');

const PORTA = Number(process.env.PORTA) || 3026;
const INTERVALO_MS = 60_000;
const ELEICAO = process.env.ELEICAO || '6257'; // Eleição Ordinária Federal 2026 - 1º turno
const BASE = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}/dados`;
const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to', 'zz'];

// Relido a cada ciclo: o arquivo pode ser gerado/atualizado com o servidor no ar.
// Sem ele (ou para UFs ausentes), a projeção usa a taxa nacional de 2022.
let historico = {};
function carregarHistorico() {
  try {
    const bruto = JSON.parse(fs.readFileSync(path.join(__dirname, 'historico2022.json'), 'utf8'));
    const lido = {};
    for (const uf in bruto) if (bruto[uf]?.taxaValidos > 0) lido[uf] = bruto[uf];
    historico = lido;
  } catch { /* mantém o que já havia */ }
}

const brutos = {}; // último arquivo bom de cada abrangência
let estado = { erro: 'Primeira leitura em andamento' };

async function baixar(abr) {
  const arquivo = `${String(ELEICAO).padStart(6, '0')}`;
  const r = await fetch(`${BASE}/${abr}/${abr}-c0001-e${arquivo}-u.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${abr}: HTTP ${r.status}`);
  return r.json();
}

async function atualizar() {
  carregarHistorico();
  const falhas = [];
  await Promise.all(['br', ...UFS].map(async (abr) => {
    try { brutos[abr] = await baixar(abr); } catch (e) { falhas.push(e.message); }
  }));
  const ufs = UFS.filter((uf) => brutos[uf]).map((uf) => lerArquivoTse(brutos[uf]));
  if (!ufs.length) {
    estado = { erro: 'Não foi possível ler o TSE: ' + falhas.slice(0, 3).join('; ') };
    return;
  }
  const br = brutos.br;
  estado = {
    ...calcularPanorama(ufs, historico),
    secoesPct: br ? num(br.s?.pst) : null,
    totalizacaoFinal: br?.tf === 's',
    geradoTse: br ? `${br.dg} ${br.hg}` : null,
    lidoEm: new Date().toISOString(),
    ufsComHistorico: Object.keys(historico).length,
    falhas,
  };
  for (const u of estado.ufs) u.temHistorico = Boolean(historico[u.uf]);
  console.log(new Date().toLocaleTimeString('pt-BR'), `seções ${estado.secoesPct}%`,
    estado.desfecho, falhas.length ? `| falhas: ${falhas.length}` : '');
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/panorama')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(estado));
  } else if (req.url === '/' || req.url.startsWith('/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  } else {
    res.writeHead(404).end();
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`Apuração em http://localhost:${PORTA}`));

atualizar();
setInterval(atualizar, INTERVALO_MS);
