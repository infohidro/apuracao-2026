const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarServidor } = require('../servidor-2t');

// Arquivo "-u.json" mínimo no formato do TSE
const tse = (abr, v13, v22, hg = '17:30:00', pst = '10,00') => ({
  cdabr: abr, dg: '25/10/2026', hg, s: { pst }, e: { te: '1000', est: '100' }, v: { vv: String(v13 + v22) },
  carg: [{ agr: [{ par: [{ sg: 'PT', cand: [{ n: '13', nmu: 'LULA', vap: String(v13) }] }, { sg: 'PL', cand: [{ n: '22', nmu: 'FLAVIO BOLSONARO', vap: String(v22) }] }] }] }],
});
const cs = (uf) => ({ abr: [{ cd: uf, mu: [{ cd: '00001', zon: [{ cd: '0001', sec: [{ ns: '0001', da: '25/10/2026', ha: '17:05:00' }, { ns: '0002' }] }] }] }] });

function tseFalso(respostas) {
  return async (url) => {
    const corpo = respostas(url);
    if (corpo === 404) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => corpo };
  };
}

const anteriores = new Map(['ac', 'pr'].flatMap((uf) => [1, 2].map((s) => {
  const k = `${uf}-00001-0001-000${s}`;
  return [k, { k, uf, mun: '00001', r: s, aptos: 100, v: { 13: 40, 22: 50, 30: 10 }, br: 0, nu: 0 }];
})));

const config = (leituras) => ({
  eleicao: '6258', pleito: '3221', candidatos: ['13', '22'], metodo: 'mudanca', ufs: ['ac', 'pr'],
  leituras, anteriores, raiz: path.join(__dirname, '..'),
});

test('mantém a última leitura boa de uma UF que passou a falhar', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'srv-')), 'l.jsonl');
  let rodada = 1;
  const buscar = tseFalso((url) => {
    if (url.includes('-cs.json')) return cs(url.match(/config\/(\w\w)\//)[1]);
    const abr = url.match(/dados\/(\w\w)\//)[1];
    if (abr === 'pr' && rodada === 2) return 404;
    return tse(abr, abr === 'pr' ? 30 : 20, 70, rodada === 1 ? '17:30:00' : '17:32:00');
  });
  const s = criarServidor(config(f), buscar);
  await s.atualizar();
  rodada = 2;
  await s.atualizar();
  const p = s.panorama();
  const pr = p.ufs.find((u) => u.uf === 'pr');
  assert.ok(pr.saldo !== null);
  assert.ok(p.avisos.some((a) => a.includes('pr: HTTP 404')), JSON.stringify(p.avisos));
  const lula = p.candidatos.find((c) => c.nr === '13');
  assert.strictEqual(lula.votos, 20 + 30); // soma das UFs, com PR da primeira leitura
});

test('sem votos não mostra projeção', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'srv-')), 'l.jsonl');
  const buscar = tseFalso((url) => (url.includes('-cs.json') ? cs(url.match(/config\/(\w\w)\//)[1]) : tse(url.match(/dados\/(\w\w)\//)[1], 0, 0)));
  const s = criarServidor(config(f), buscar);
  await s.atualizar();
  for (const c of s.panorama().candidatos) {
    assert.strictEqual(c.pctProjetado, null);
    assert.strictEqual(c.votosProjetados, null);
  }
});

test('reinício recupera o histórico sem duplicar pontos', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'srv-')), 'l.jsonl');
  const buscar = tseFalso((url) => (url.includes('-cs.json') ? cs(url.match(/config\/(\w\w)\//)[1]) : tse(url.match(/dados\/(\w\w)\//)[1], 40, 60)));
  const a = criarServidor(config(f), buscar);
  await a.atualizar();
  await a.atualizar();
  assert.strictEqual(a.panorama().historico.length, 1);
  const b = criarServidor(config(f), buscar);
  assert.strictEqual(b.panorama().historico.length, 1);
  await b.atualizar();
  assert.strictEqual(b.panorama().historico.length, 1);
});
