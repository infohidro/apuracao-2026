const test = require('node:test');
const assert = require('node:assert');
const { lerArquivoTse, calcularPanorama } = require('../projecao');

const uf = (sigla, eleitorado, eleitoradoApurado, votosA, votosB) => ({
  uf: sigla, secoesPct: 0, eleitorado, eleitoradoApurado, validos: votosA + votosB,
  candidatos: [
    { numero: '1', nome: 'A', partido: 'PA', votos: votosA },
    { numero: '2', nome: 'B', partido: 'PB', votos: votosB },
  ],
});
const cand = (p, n) => p.candidatos.find((c) => c.numero === n);

test('lÃª o formato do TSE', () => {
  const lido = lerArquivoTse({
    cdabr: 'SP', dg: '04/10/2026', hg: '18:00:00',
    carg: [{ agr: [{ par: [{ sg: 'PX', cand: [{ n: '10', nmu: 'FULANO', vap: '1500' }] }, { sg: 'PY' }] }] }],
    s: { pst: '12,50' }, e: { te: '1000', est: '125' }, v: { vv: '90' },
  });
  assert.deepStrictEqual(lido.candidatos, [{ numero: '10', nome: 'FULANO', partido: 'PX', votos: 1500 }]);
  assert.strictEqual(lido.uf, 'sp');
  assert.strictEqual(lido.secoesPct, 12.5);
  assert.strictEqual(lido.eleitoradoApurado, 125);
});

test('sem votos: tudo zerado e sem divisÃ£o por zero', () => {
  const p = calcularPanorama([uf('sp', 1000, 0, 0, 0)], {});
  assert.strictEqual(p.validosProjetados, 0);
  assert.strictEqual(cand(p, '1').pctProjetado, 0);
  assert.match(p.desfecho, /Aguardando/);
});

test('apuraÃ§Ã£o completa: projeÃ§Ã£o igual ao resultado', () => {
  const p = calcularPanorama([uf('sp', 1000, 1000, 480, 320)], { sp: { taxaValidos: 0.5 } });
  assert.strictEqual(cand(p, '1').votosProjetados, 480);
  assert.strictEqual(cand(p, '1').pctProjetado, 60);
  assert.match(p.desfecho, /A vence no 1Âº turno/);
});

test('extrapola o restante da UF misturando taxa observada e histÃ³rica', () => {
  // metade apurada, taxa observada 0,8; histÃ³rica 0,6 -> taxa 0,7 -> restam 350 vÃ¡lidos
  const p = calcularPanorama([uf('sp', 1000, 500, 300, 100)], { sp: { taxaValidos: 0.6 } });
  assert.ok(Math.abs(p.validosProjetados - 750) < 1e-9);
  assert.ok(Math.abs(cand(p, '1').votosProjetados - (300 + 350 * 0.75)) < 1e-9);
});

test('corrige o ritmo desigual entre UFs', () => {
  // UF pequena quase toda apurada prÃ³-A; UF grande mal comeÃ§ou e Ã© prÃ³-B
  const p = calcularPanorama(
    [uf('ac', 1000, 1000, 600, 200), uf('sp', 100000, 1000, 200, 600)],
    { ac: { taxaValidos: 0.8 }, sp: { taxaValidos: 0.8 } },
  );
  assert.strictEqual(cand(p, '1').pct, 50);
  assert.ok(cand(p, '2').pctProjetado > 74, 'B deve liderar a projeÃ§Ã£o');
  assert.strictEqual(p.candidatos[0].numero, '2');
});

test('UF sem dados entra com a mÃ©dia nacional parcial e o tamanho histÃ³rico', () => {
  const p = calcularPanorama(
    [uf('ac', 1000, 1000, 600, 200), uf('sp', 10000, 0, 0, 0)],
    { sp: { taxaValidos: 0.5 } },
  );
  const sp = p.ufs.find((u) => u.uf === 'sp');
  assert.strictEqual(sp.semDados, true);
  assert.strictEqual(sp.validosProjetados, 5000);
  assert.ok(Math.abs(cand(p, '1').pctProjetado - 75) < 1e-9);
});
