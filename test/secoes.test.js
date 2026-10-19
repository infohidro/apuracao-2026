const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { carregarSecoes, arquivoSecoes } = require('../lib/secoes');

const linhas = [
  { k: 'ac-00001-0001-0001', uf: 'ac', mun: '00001', r: 1, aptos: 10, v: { 13: 5 }, br: 0, nu: 0 },
  { k: 'ac-00001-0001-0002', uf: 'ac', mun: '00001', r: 2, aptos: 10, v: { 22: 4 }, br: 0, nu: 0 },
].map((s) => JSON.stringify(s) + '\n').join('');

test('carrega seções de arquivo .jsonl.gz', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sec-')), 'x.jsonl.gz');
  fs.writeFileSync(f, zlib.gzipSync(linhas));
  const s = await carregarSecoes(f);
  assert.strictEqual(s.size, 2);
  assert.deepStrictEqual(s.get('ac-00001-0001-0002').v, { 22: 4 });
});

test('arquivoSecoes prefere o .jsonl extraído e cai para o .jsonl.gz do repositório', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'raiz-'));
  fs.mkdirSync(path.join(raiz, 'dados', 'secoes'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'dados', 'secoes', '2026-1t.jsonl.gz'), '');
  assert.strictEqual(arquivoSecoes(raiz, '2026-1t'), path.join(raiz, 'dados', 'secoes', '2026-1t.jsonl.gz'));
  fs.mkdirSync(path.join(raiz, 'data', 'secoes'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'data', 'secoes', '2026-1t.jsonl'), '');
  assert.strictEqual(arquivoSecoes(raiz, '2026-1t'), path.join(raiz, 'data', 'secoes', '2026-1t.jsonl'));
  assert.strictEqual(arquivoSecoes(raiz, '1999-1t'), null);
});
