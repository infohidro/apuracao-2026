const test = require('node:test');
const assert = require('node:assert');
const { projetarPA, projetarMudanca, desfecho, acertoEstavel } = require('../lib/modelos');

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const C = ['13', '22'];

test('PA extrapola o restante da UF pela taxa válidos/aptos observada', () => {
  const p = projetarPA([{ uf: 'sp', aptosTotal: 1000, aptosApurados: 500, validos: 400, votos: { 13: 300, 22: 100 }, anterior: null }], C);
  perto(p.validos, 800);
  perto(p.pct['13'], 75);
  perto(p.pct['13'] + p.pct['22'], 100);
});

test('PA: UF sem nada apurado usa cota e taxa nacionais', () => {
  const p = projetarPA([
    { uf: 'ac', aptosTotal: 100, aptosApurados: 100, validos: 80, votos: { 13: 60, 22: 20 }, anterior: null },
    { uf: 'sp', aptosTotal: 10000, aptosApurados: 0, validos: 0, votos: {}, anterior: null },
  ], C);
  perto(p.pct['13'], 75);
  perto(p.validos, 80 + 10000 * 0.8);
});

const ufMudanca = (extra = {}) => ({
  uf: 'ba', aptosTotal: 2000, aptosApurados: 1000, validos: 100, votos: { 13: 48, 22: 52 },
  anterior: { apuradas: { validos: 100, votos: { 13: 40, 22: 50, 30: 10 } }, restantes: { validos: 200, votos: { 13: 120, 22: 60, 30: 20 } } },
  ...extra,
});

test('mudança aplica a variação em p.p. sobre o turno anterior das restantes', () => {
  const p = projetarMudanca([ufMudanca()], C);
  // restante: 13 = 60+8 = 68%, 22 = 30+2 = 32%; válidos restantes = 200 * (100/100)
  perto(p.votos['13'], 48 + 200 * 0.68);
  perto(p.votos['22'], 52 + 200 * 0.32);
  perto(p.validos, 300);
});

test('mudança corta cota negativa e renormaliza', () => {
  const u = ufMudanca({ votos: { 13: 10, 22: 90 } }); // 13: 10-40 = -30 p.p.
  u.anterior.restantes.votos = { 13: 20, 22: 160, 30: 20 }; // 13 restante = 10% - 30 -> 0
  const p = projetarMudanca([u], C);
  assert.ok(Object.values(p.pct).every(Number.isFinite));
  perto(p.votos['13'], 10);
  perto(p.pct['13'] + p.pct['22'], 100);
});

test('mudança: UF sem apuração usa variação e comparecimento nacionais', () => {
  const vazia = {
    uf: 'sp', aptosTotal: 1000, aptosApurados: 0, validos: 0, votos: {},
    anterior: { apuradas: { validos: 0, votos: {} }, restantes: { validos: 400, votos: { 13: 160, 22: 200, 30: 40 } } },
  };
  const p = projetarMudanca([ufMudanca(), vazia], C);
  // nacional: +8 e +2 sobre 40%/50% do sp -> 48%/52%; razão 1
  perto(p.votos['13'], 48 + 200 * 0.68 + 400 * 0.48);
  perto(p.votos['22'], 52 + 200 * 0.32 + 400 * 0.52);
});

test('mudança: UF sem dados do turno anterior ainda projeta o restante (como PA)', () => {
  const semAnterior = { uf: 'sp', aptosTotal: 1000, aptosApurados: 500, validos: 400, votos: { 13: 300, 22: 100 }, anterior: null };
  const p = projetarMudanca([ufMudanca(), semAnterior], C);
  perto(p.votos['13'], 48 + 200 * 0.68 + 300 + 500 * 0.8 * 0.75);
  perto(p.votos['22'], 52 + 200 * 0.32 + 100 + 500 * 0.8 * 0.25);
});

test('mudança com abstenção por lado: cada lado usa a sua razão de comparecimento', () => {
  const u = ufMudanca();
  u.anterior.porLado = {
    lula: { validos: 100, votos: { 13: 60, 22: 30, 30: 10 } },
    flavio: { validos: 100, votos: { 13: 20, 22: 70, 30: 10 } },
  };
  u.anterior.razaoPorLado = { lula: 0.8, flavio: 1.0 };
  const com = projetarMudanca([u], C, { porLado: true });
  perto(com.votos['13'], 48 + 80 * 0.68 + 100 * 0.28);
  perto(com.votos['22'], 52 + 80 * 0.32 + 100 * 0.72);
  // sem a opção, ignora os lados e usa o restante agregado (comportamento anterior)
  const sem = projetarMudanca([u], C);
  perto(sem.votos['13'], 48 + 200 * 0.68);
});

test('abstenção por lado: lado sem razão medida usa a razão da UF', () => {
  const u = ufMudanca();
  u.anterior.porLado = { lula: { validos: 200, votos: { 13: 120, 22: 60, 30: 20 } }, flavio: { validos: 0, votos: {} } };
  u.anterior.razaoPorLado = { lula: null, flavio: 0.5 };
  const p = projetarMudanca([u], C, { porLado: true });
  perto(p.votos['13'], 48 + 200 * 0.68); // razão da UF = 100/100 = 1
});

test('mudança sem turno anterior lança erro', () => {
  assert.throws(() => projetarMudanca([{ uf: 'sp', aptosTotal: 1, aptosApurados: 0, validos: 0, votos: {}, anterior: null }], C),
    /mudança exige turno anterior/);
});

test('desfecho', () => {
  assert.strictEqual(desfecho({ 13: 50.9, 22: 49.1 }), '1T:13');
  assert.strictEqual(desfecho({ 22: 46, 13: 44, 30: 4 }), '2T:13x22');
});

test('acertoEstavel', () => {
  const s = (d) => d.map((x, i) => ({ pctSecoes: i + 1, desfecho: x }));
  assert.strictEqual(acertoEstavel(s(['1T:22', '1T:13', '1T:22', '1T:13', '1T:13']), '1T:13'), 4);
  assert.strictEqual(acertoEstavel(s(['1T:13', '1T:22']), '1T:13'), null);
  assert.strictEqual(acertoEstavel(s(['1T:13', '1T:13']), '1T:13'), 1);
});
