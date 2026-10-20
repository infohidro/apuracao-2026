const test = require('node:test');
const assert = require('node:assert');
const { montarEstados, reprisar } = require('../lib/reprise');

const sec = (k, uf, r, aptos, v13, v22, v30 = 0) => [k, { k, uf, mun: '00001', r, aptos, v: { 13: v13, 22: v22, ...(v30 ? { 30: v30 } : {}) }, br: 0, nu: 0 }];

// 2º turno: 6 seções em 2 UFs; a seção "sp-6" não existe no 1º turno
const atuais = new Map([
  sec('ac-1', 'ac', 1000, 100, 30, 60),
  sec('ac-2', 'ac', 3000, 100, 35, 55),
  sec('sp-3', 'sp', 2000, 200, 90, 90),
  sec('sp-4', 'sp', null, 200, 110, 70),
  sec('sp-5', 'sp', 4000, 200, 100, 80),
  sec('sp-6', 'sp', 5000, 200, 95, 85),
]);
const anteriores = new Map([
  sec('ac-1', 'ac', 1, 100, 25, 55, 10),
  sec('ac-2', 'ac', 1, 100, 30, 50, 10),
  sec('sp-3', 'sp', 1, 200, 80, 80, 20),
  sec('sp-4', 'sp', 1, 200, 100, 60, 20),
  sec('sp-5', 'sp', 1, 200, 90, 70, 20),
]);

test('montarEstados soma apuradas e restantes do turno anterior e conta seções sem par', () => {
  const { ufs, semPar } = montarEstados(atuais, new Set(['ac-1', 'sp-3']), anteriores);
  assert.strictEqual(semPar, 1);
  const ac = ufs.find((u) => u.uf === 'ac');
  assert.deepStrictEqual(ac.votos, { 13: 30, 22: 60 });
  assert.strictEqual(ac.validos, 90);
  assert.strictEqual(ac.aptosTotal, 200);
  assert.strictEqual(ac.aptosApurados, 100);
  assert.strictEqual(ac.anterior.apuradas.validos, 90);
  assert.strictEqual(ac.anterior.restantes.validos, 90);
  const sp = ufs.find((u) => u.uf === 'sp');
  // restantes com par: sp-4 e sp-5 (aptos 400); sem par sp-6 (aptos 200) -> escala 600/400
  assert.ok(Math.abs(sp.anterior.restantes.validos - (180 + 180) * 1.5) < 1e-9);
  assert.ok(Object.values(sp.anterior.restantes.votos).every(Number.isFinite));
});

test('reprisa em ordem de chegada e termina igual ao resultado final', () => {
  const res = reprisar(atuais, anteriores, ['13', '22'], 10);
  const ultimo = (s) => s.pontos[s.pontos.length - 1];
  assert.strictEqual(ultimo(res.metodos.pa).pctSecoes, 100);
  for (const m of ['pa', 'mudanca']) {
    for (const c of ['13', '22']) {
      assert.ok(Math.abs(ultimo(res.metodos[m]).pctProjetado[c] - res.final.pct[c]) < 1e-9, m + c);
    }
  }
  assert.strictEqual(res.semPar, 1);
  // a primeira seção a chegar é ac-1 (r = 1000); no ponto de 10% (1 de 6 seções) a apuração atual é 30/90
  const primeiro = res.metodos.pa.pontos.find((p) => p.pctSecoes === 10);
  assert.ok(Math.abs(primeiro.pctAtual['13'] - (30 / 90) * 100) < 1e-9);
  assert.strictEqual(res.final.desfecho, '1T:13');
  for (const s of Object.values(res.metodos)) {
    for (const p of s.pontos) assert.ok(Object.values(p.pctProjetado).every(Number.isFinite));
  }
});

test('método com abstenção por lado termina no resultado final e separa os lados', () => {
  const res = reprisar(atuais, anteriores, ['13', '22'], 10);
  const s = res.metodos.mudancaAbstencao;
  assert.ok(s, 'método mudancaAbstencao ausente');
  for (const serie of Object.values(res.metodos)) assert.ok(Number.isFinite(serie.erroMedio), 'erroMedio');
  const fim = s.pontos.at(-1);
  for (const c of ['13', '22']) assert.ok(Math.abs(fim.pctProjetado[c] - res.final.pct[c]) < 1e-9);
  const { ufs } = montarEstados(atuais, new Set(['ac-1', 'sp-3']), anteriores);
  const sp = ufs.find((u) => u.uf === 'sp');
  // todos os municípios do teste são '00001'; em SP o 1º turno deu 13 > 22 -> lado Lula
  assert.ok(sp.anterior.porLado.lula.validos > 0);
  assert.strictEqual(sp.anterior.porLado.flavio.validos, 0);
  // restantes por lado somam o restante agregado
  assert.ok(Math.abs(sp.anterior.porLado.lula.validos - sp.anterior.restantes.validos) < 1e-9);
  // razão por lado: (válidos 2T / aptos 2T) / (válidos 1T / aptos 1T) nas seções apuradas: (180/200)/(180/200)
  assert.ok(Math.abs(sp.anterior.razaoPorLado.lula - 1) < 1e-9);
  assert.strictEqual(sp.anterior.razaoPorLado.flavio, null);
});

test('sem turno anterior só roda PA', () => {
  const res = reprisar(atuais, null, ['13', '22'], 50);
  assert.ok(res.metodos.pa);
  assert.strictEqual(res.metodos.mudanca, undefined);
});
