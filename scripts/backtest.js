// Uso: node scripts/backtest.js <2022-2t|2026-1t>
// Reprisa a apuração na ordem real de chegada das seções e grava data/backtest/{caso}.json.
const fs = require('fs');
const path = require('path');
const { carregarSecoes } = require('../lib/secoes');
const { reprisar } = require('../lib/reprise');

const DADOS = path.join(__dirname, '..', 'data');
const CASOS = {
  '2022-2t': { atuais: '2022-2t', anteriores: '2022-1t', candidatos: ['13', '22'], titulo: '2º turno de 2022' },
  '2026-1t': { atuais: '2026-1t', anteriores: null, candidatos: null, titulo: '1º turno de 2026' },
};
const NOMES = { pa: 'Progressão aritmética', mudanca: 'Mudança sobre o 1º turno' };

async function main() {
  const caso = process.argv[2];
  const cfg = CASOS[caso];
  if (!cfg) throw new Error('casos: ' + Object.keys(CASOS).join(', '));
  const atuais = await carregarSecoes(path.join(DADOS, 'secoes', cfg.atuais + '.jsonl'));
  const anteriores = cfg.anteriores ? await carregarSecoes(path.join(DADOS, 'secoes', cfg.anteriores + '.jsonl')) : null;
  const candidatos = cfg.candidatos ?? [...new Set([...atuais.values()].flatMap((s) => Object.keys(s.v)))];

  const res = { caso, titulo: cfg.titulo, ...reprisar(atuais, anteriores, candidatos, 1) };
  fs.mkdirSync(path.join(DADOS, 'backtest'), { recursive: true });
  fs.writeFileSync(path.join(DADOS, 'backtest', caso + '.json'), JSON.stringify(res));

  console.log(`${cfg.titulo}: final ${res.final.desfecho}`, JSON.stringify(res.final.pct),
    `| seções ${res.totalSecoes}, sem par ${res.semPar}`);
  for (const [m, s] of Object.entries(res.metodos)) {
    console.log(`${NOMES[m]}: ` + (s.acertoEm === null ? 'nunca estabilizou' : `acertou a partir de ${s.acertoEm}% e não mudou mais`));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
