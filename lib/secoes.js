// Arquivos data/secoes/{ano}-{turno}t.jsonl: uma seção por linha, gerados por scripts/extrair-bweb.js.
const fs = require('fs');
const readline = require('readline');
const { chaveSecao } = require('./bweb');

async function carregarSecoes(caminho) {
  const secoes = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(caminho), crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha.trim()) continue;
    const s = JSON.parse(linha);
    secoes.set(s.k, s);
  }
  return secoes;
}

const validosSecao = (s) => Object.values(s.v).reduce((a, b) => a + b, 0);

module.exports = { carregarSecoes, chaveSecao, validosSecao };
