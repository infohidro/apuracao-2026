// Uso: node scripts/extrair-bweb.js <ano> <turno>
// Lê os zips de data/brutos/ em streaming (tar.exe do Windows) e grava
// data/secoes/{ano}-{turno}t.jsonl com uma seção de presidente por linha.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dividirCsv, indiceColunas, lerLinhaBweb, acumular } = require('../lib/bweb');
const { UFS, nomeZip, pastaBrutos } = require('./baixar-bweb');

// No Windows usa o bsdtar do sistema (lê zip); o tar do Git Bash, se vier antes no PATH, não lê.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

async function extrairZip(zip, secoes) {
  const tar = spawn(TAR, ['-xOf', zip, '*.csv']);
  const decoder = new TextDecoder('latin1');
  let resto = '';
  let idx = null;
  const processar = (linha) => {
    if (!linha) return;
    const c = dividirCsv(linha.replace(/\r$/, ''));
    if (!idx) { idx = indiceColunas(c); return; }
    acumular(secoes, lerLinhaBweb(c, idx));
  };
  for await (const pedaco of tar.stdout) {
    const linhas = (resto + decoder.decode(pedaco, { stream: true })).split('\n');
    resto = linhas.pop();
    linhas.forEach(processar);
  }
  processar(resto + decoder.decode());
  const codigo = await new Promise((ok) => tar.on('close', ok));
  if (codigo !== 0) throw new Error(`tar terminou com código ${codigo} em ${zip}`);
}

async function main() {
  const [ano, turno] = process.argv.slice(2);
  const destino = path.join(__dirname, '..', 'data', 'secoes', `${ano}-${turno}t.jsonl`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const saida = fs.createWriteStream(destino);
  const total = { secoes: 0, semHorario: 0, v13: 0, v22: 0 };
  for (const uf of UFS) {
    const secoes = new Map();
    await extrairZip(path.join(pastaBrutos, nomeZip(ano, turno, uf)), secoes);
    let semHorario = 0, v13 = 0, v22 = 0;
    for (const s of secoes.values()) {
      if (s.r === null) semHorario++;
      v13 += s.v['13'] ?? 0;
      v22 += s.v['22'] ?? 0;
      saida.write(JSON.stringify(s) + '\n');
    }
    console.log(uf, `seções ${secoes.size}`, `sem horário ${semHorario}`, `13=${v13}`, `22=${v22}`);
    total.secoes += secoes.size; total.semHorario += semHorario; total.v13 += v13; total.v22 += v22;
  }
  await new Promise((ok) => saida.end(ok));
  console.log('TOTAL', JSON.stringify(total), '->', destino);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
