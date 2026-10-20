const test = require('node:test');
const assert = require('node:assert');
const { secoesRecebidas, estadoUfAoVivo, saldoUf, baseUf, curvaRestante } = require('../lib/ao-vivo');
const { projetarMudanca } = require('../lib/modelos');

// trecho real do -cs.json do pleito 3220 (AC, Porto Walter), com uma seção sem horário
const CS = { abr: [{ cd: 'ac', mu: [{ cd: '01066', zon: [{ cd: '0004', sec: [
  { ns: '0077', da: '04/10/2026', ha: '21:08:17' },
  { ns: '0078', da: '04/10/2026', ha: '21:08:17' },
  { ns: '0079' },
] }] }] }] };

const sec = (k, r, v) => [k, { k, uf: 'ac', mun: '01066', r, aptos: 100, v, br: 0, nu: 0 }];
// 1º turno: nas recebidas (77, 78) Lula 40%, Flávio 50%; na restante (79) Lula 60%, Flávio 30%
const ANTERIORES = new Map([
  sec('ac-01066-0004-0077', 1, { 13: 20, 22: 25, 30: 5 }),
  sec('ac-01066-0004-0078', 2, { 13: 20, 22: 25, 30: 5 }),
  sec('ac-01066-0004-0079', 3, { 13: 60, 22: 30, 30: 10 }),
]);
const ufTse = (v13, v22, eleitorado = 300, apurado = 200) => ({
  uf: 'ac', secoesPct: 66.67, eleitorado, eleitoradoApurado: apurado, validos: v13 + v22,
  candidatos: [{ numero: '13', nome: 'LULA', votos: v13 }, { numero: '22', nome: 'FLAVIO', votos: v22 }],
});

test('secoesRecebidas conta só seções com data e hora', () => {
  const r = secoesRecebidas(CS);
  assert.strictEqual(r.get('ac').total, 3);
  assert.strictEqual(r.get('ac').recebidas.size, 2);
  assert.ok(r.get('ac').recebidas.has('ac-01066-0004-0077'));
  assert.strictEqual(r.get('ac').todas.size, 3);
});

test('saldo em p.p. nas mesmas seções', () => {
  const r = secoesRecebidas(CS).get('ac');
  const e = estadoUfAoVivo(ufTse(48, 52), r, ANTERIORES, ['13', '22']);
  assert.strictEqual(e.anterior.apuradas.validos, 100);
  // TSE: 2/3 do eleitorado apurado -> restante = 1/3 dos 200 válidos do 1º turno na UF
  assert.ok(Math.abs(e.anterior.restantes.validos - 200 / 3) < 1e-9);
  const s = saldoUf(e);
  assert.ok(Math.abs(s.saldo - 6) < 1e-9, String(s.saldo)); // (48-40) - (52-50)
  assert.ok(Math.abs(s.lula1 - 40) < 1e-9);
  assert.ok(Math.abs(s.flavio2 - 52) < 1e-9);
});

test('saldo nulo sem seções recebidas', () => {
  const r = { total: 3, recebidas: new Set(), todas: secoesRecebidas(CS).get('ac').todas };
  assert.strictEqual(saldoUf(estadoUfAoVivo(ufTse(0, 0, 300, 0), r, ANTERIORES, ['13', '22'])).saldo, null);
});

test('tamanho do restante segue a fração apurada do TSE, mesmo sem seções marcadas', () => {
  const todas = secoesRecebidas(CS).get('ac').todas;
  // TSE diz 1/3 do eleitorado apurado, mas o -cs.json ainda não marcou nenhuma seção
  const e = estadoUfAoVivo(ufTse(30, 20, 300, 100), { total: 3, recebidas: new Set(), todas }, ANTERIORES, ['13', '22']);
  assert.ok(Math.abs(e.anterior.restantes.validos - 200 * (2 / 3)) < 1e-9, String(e.anterior.restantes.validos));
  assert.ok(Math.abs(e.anterior.apuradas.validos - 200 * (1 / 3)) < 1e-9);
  // -cs.json atrasado: marcou 2 de 3 seções, TSE diz metade apurada -> restante = metade do 1º turno
  const r = secoesRecebidas(CS).get('ac');
  const e2 = estadoUfAoVivo(ufTse(48, 52, 300, 150), r, ANTERIORES, ['13', '22']);
  assert.ok(Math.abs(e2.anterior.restantes.validos - 100) < 1e-9, String(e2.anterior.restantes.validos));
});

test('restante separado por lado do município, somando o restante total', () => {
  const r = secoesRecebidas(CS).get('ac');
  // a seção 0079 (restante) é do município 01066; marcado como pró-Lula
  const lados = new Map([['ac-01066', 'lula']]);
  const e = estadoUfAoVivo(ufTse(48, 52, 300, 150), r, ANTERIORES, ['13', '22'], lados);
  assert.ok(Math.abs(e.anterior.porLado.lula.validos - e.anterior.restantes.validos) < 1e-9);
  assert.strictEqual(e.anterior.porLado.flavio.validos, 0);
  assert.ok(Math.abs(e.anterior.porLado.lula.votos['13'] - e.anterior.restantes.votos['13']) < 1e-9);
});

test('base da UF', () => {
  assert.strictEqual(baseUf(ufTse(10, 10), new Set()), 'municipio');
  assert.strictEqual(baseUf(ufTse(0, 0), new Set()), 'aguardando');
  assert.strictEqual(baseUf(ufTse(10, 10), new Set(['x'])), 'secao');
});

test('curva termina em 100% exatamente na projeção', () => {
  const r = secoesRecebidas(CS);
  const estados = [estadoUfAoVivo(ufTse(48, 52), r.get('ac'), ANTERIORES, ['13', '22'])];
  const proj = projetarMudanca(estados, ['13', '22']);
  const curva = curvaRestante(estados, r, ANTERIORES, 66.67, proj, ['13', '22']);
  const fim = curva.at(-1);
  assert.strictEqual(fim.pctSecoes, 100);
  assert.ok(Math.abs(fim.pct['13'] - proj.pct['13']) < 1e-6);
  assert.strictEqual(curva[0].pctSecoes, 66.67);
  assert.ok(curva.every((p, i) => i === 0 || p.pctSecoes > curva[i - 1].pctSecoes));
});
