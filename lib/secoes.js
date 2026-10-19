// Seções por eleição e turno, uma por linha (JSONL), geradas por scripts/extrair-bweb.js.
// Ficam em data/secoes/{ano}-{turno}t.jsonl (extraídas localmente) ou, versionadas no
// repositório, em dados/secoes/{ano}-{turno}t.jsonl.gz.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { chaveSecao } = require('./bweb');

async function carregarSecoes(caminho) {
  const secoes = new Map();
  let entrada = fs.createReadStream(caminho);
  if (caminho.endsWith('.gz')) entrada = entrada.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: entrada, crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha.trim()) continue;
    const s = JSON.parse(linha);
    secoes.set(s.k, s);
  }
  return secoes;
}

// Caminho do arquivo de seções `nome` (ex.: "2026-1t"), ou null se não existir.
function arquivoSecoes(raiz, nome) {
  const candidatos = [
    path.join(raiz, 'data', 'secoes', `${nome}.jsonl`),
    path.join(raiz, 'dados', 'secoes', `${nome}.jsonl.gz`),
  ];
  return candidatos.find((c) => fs.existsSync(c)) ?? null;
}

const validosSecao = (s) => Object.values(s.v).reduce((a, b) => a + b, 0);

module.exports = { carregarSecoes, arquivoSecoes, chaveSecao, validosSecao };
