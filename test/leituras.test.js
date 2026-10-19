const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { abrirLeituras } = require('../lib/leituras');

const leitura = (geradoTse, pct = 10) => ({
  lidoEm: new Date().toISOString(), geradoTse, pctSecoes: pct, pctAtual: { 13: 50, 22: 50 }, pctProjetado: { 13: 51, 22: 49 }, metodo: 'mudanca',
});
const arquivo = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'leituras-')), 'sub', 'l.jsonl');

test('grava e relê as leituras', () => {
  const f = arquivo();
  const l = abrirLeituras(f);
  assert.strictEqual(l.anotar(leitura('25/10/2026 17:10:00', 1)), true);
  assert.strictEqual(l.anotar(leitura('25/10/2026 17:12:00', 2)), true);
  const de_novo = abrirLeituras(f);
  assert.strictEqual(de_novo.todas().length, 2);
  assert.strictEqual(de_novo.todas()[1].pctSecoes, 2);
});

test('não duplica leitura com o mesmo horário do TSE, nem depois de reabrir', () => {
  const f = arquivo();
  const l = abrirLeituras(f);
  l.anotar(leitura('25/10/2026 17:10:00'));
  assert.strictEqual(l.anotar(leitura('25/10/2026 17:10:00')), false);
  assert.strictEqual(abrirLeituras(f).anotar(leitura('25/10/2026 17:10:00')), false);
  assert.strictEqual(abrirLeituras(f).todas().length, 1);
});

test('ignora a última linha truncada', () => {
  const f = arquivo();
  abrirLeituras(f).anotar(leitura('25/10/2026 17:10:00'));
  fs.appendFileSync(f, '{"lidoEm":');
  const l = abrirLeituras(f);
  assert.strictEqual(l.todas().length, 1);
  assert.strictEqual(l.anotar(leitura('25/10/2026 17:20:00')), true);
  assert.strictEqual(abrirLeituras(f).todas().length, 2);
});
