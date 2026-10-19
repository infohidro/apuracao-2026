const test = require('node:test');
const assert = require('node:assert');
const { infoPorMunicipio, indicePorMunicipio } = require('../lib/municipios');
const { estadoUfAoVivo, saldoUf } = require('../lib/ao-vivo');

const sec = (k, mun, v) => [k, { k, uf: k.slice(0, 2), mun, r: 1, aptos: 100, v, br: 0, nu: 0 }];
const ANTERIORES = new Map([
  sec('ac-00001-0001-0001', '00001', { 13: 40, 22: 50, 30: 10 }),
  sec('ac-00001-0001-0002', '00001', { 13: 40, 22: 50, 30: 10 }),
  sec('ac-00002-0001-0001', '00002', { 13: 70, 22: 20, 30: 10 }),
  sec('pr-00003-0001-0001', '00003', { 13: 1, 22: 1 }),
]);

test('municípios com seções apuradas viram o conjunto de seções recebidas', () => {
  const indice = indicePorMunicipio(ANTERIORES);
  const info = infoPorMunicipio([{ uf: '00001', secoesPct: 100 }, { uf: '00002', secoesPct: 0 }], indice, 'ac');
  assert.strictEqual(info.todas.size, 3);
  assert.deepStrictEqual([...info.recebidas].sort(), ['ac-00001-0001-0001', 'ac-00001-0001-0002']);
});

test('saldo pela base de município', () => {
  const info = infoPorMunicipio([{ uf: '00001', secoesPct: 50 }, { uf: '00002', secoesPct: 0 }], indicePorMunicipio(ANTERIORES), 'ac');
  const ufTse = { uf: 'ac', eleitorado: 300, eleitoradoApurado: 100, validos: 100,
    candidatos: [{ numero: '13', votos: 48 }, { numero: '22', votos: 52 }] };
  const s = saldoUf(estadoUfAoVivo(ufTse, info, ANTERIORES, ['13', '22']));
  assert.ok(Math.abs(s.saldo - 6) < 1e-9, String(s.saldo)); // (48-40) - (52-50)
});
