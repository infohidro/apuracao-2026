const test = require('node:test');
const assert = require('node:assert');
const { ladoMunicipios, resumoAbstencao, origemVotos } = require('../lib/abstencao');
const { indicePorMunicipio } = require('../lib/municipios');

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// 1º turno: município 00001 pró-Lula (2 seções), 00002 pró-Flávio (1 seção). 100 aptos por seção.
// comparecimento = válidos + brancos + nulos
const sec = (k, mun, v, br = 0, nu = 0) => [k, { k, uf: 'ba', mun, r: 1, aptos: 100, v, br, nu }];
const ANTERIORES = new Map([
  sec('ba-00001-0001-0001', '00001', { 13: 50, 22: 20, 30: 5 }, 3, 2), // compareceram 80
  sec('ba-00001-0001-0002', '00001', { 13: 50, 22: 20, 30: 5 }, 3, 2), // 80
  sec('ba-00002-0001-0001', '00002', { 13: 20, 22: 55, 30: 5 }, 0, 0), // 80
]);
const LADOS = ladoMunicipios(ANTERIORES);
const INDICE = indicePorMunicipio(ANTERIORES);

// arquivo de município no formato de lerArquivoTse (o campo `uf` traz o código do município)
const mun = (cod, est, comp, v13, v22, pct = 100) => ({
  uf: cod, secoesPct: pct, eleitorado: est, eleitoradoApurado: est, comparecimento: comp, validos: v13 + v22,
  candidatos: [{ numero: '13', votos: v13 }, { numero: '22', votos: v22 }],
});

test('lado de cada município pelo 1º turno', () => {
  assert.strictEqual(LADOS.get('ba-00001'), 'lula');
  assert.strictEqual(LADOS.get('ba-00002'), 'flavio');
});

test('abstenção sobe mais nos municípios pró-Lula -> barra favorável ao Flávio', () => {
  // 2º turno: pró-Lula com 70% de comparecimento (abstenção 20% -> 30%); pró-Flávio igual ao 1º turno (20%)
  const r = resumoAbstencao({
    muns: new Map([['ba', [mun('00001', 200, 140, 90, 40), mun('00002', 100, 80, 20, 58)]]]),
    infos: new Map(), anteriores: ANTERIORES, lados: LADOS, indice: INDICE, candidatos: ['13', '22'],
  });
  perto(r.nacional.lula.abst1, 20);
  perto(r.nacional.lula.abst2, 30);
  perto(r.nacional.lula.delta, 10);
  perto(r.nacional.flavio.delta, 0);
  perto(r.barra, 10); // positivo = favorável ao Flávio
  // razão de válidos por eleitor: (130/200) / (150/200) no lado Lula
  perto(r.porUf.ba.lula.razao, (130 / 200) / (150 / 200));
  perto(r.porUf.ba.flavio.razao, (78 / 100) / (80 / 100));
});

test('com a lista de seções, compara só as seções já recebidas do município', () => {
  const infos = new Map([['ba', { recebidas: new Set(['ba-00001-0001-0001']), todas: new Set(ANTERIORES.keys()) }]]);
  // só 1 seção apurada no município 00001: 2º turno com 100 aptos e 60 comparecimentos
  const m = { ...mun('00001', 100, 60, 40, 15, 50) };
  const r = resumoAbstencao({ muns: new Map([['ba', [m]]]), infos, anteriores: ANTERIORES, lados: LADOS, indice: INDICE, candidatos: ['13', '22'] });
  perto(r.porUf.ba.lula.abst1, 20);
  perto(r.porUf.ba.lula.abst2, 40);
  assert.strictEqual(r.porUf.ba.flavio, null);
  assert.strictEqual(r.barra, null); // sem dado dos dois lados não há comparação
});

test('município sem seção apurada não entra', () => {
  const r = resumoAbstencao({
    muns: new Map([['ba', [mun('00001', 0, 0, 0, 0, 0)]]]),
    infos: new Map(), anteriores: ANTERIORES, lados: LADOS, indice: INDICE, candidatos: ['13', '22'],
  });
  assert.strictEqual(r.nacional.lula, null);
  assert.strictEqual(r.barra, null);
});

test('origem dos votos apurados por lado, pesada pelos válidos do 1º turno', () => {
  const infos = new Map([['ba', { recebidas: new Set(['ba-00002-0001-0001']), todas: new Set(ANTERIORES.keys()) }]]);
  const o = origemVotos({ infos, anteriores: ANTERIORES, lados: LADOS });
  perto(o.apuradas.flavio, 100);
  perto(o.todas.lula, (150 / 230) * 100);
  perto(o.todas.lula + o.todas.flavio, 100);
});
