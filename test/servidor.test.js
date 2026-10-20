const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarServidor, escolherMetodo } = require('../servidor-2t');

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

test('abstenção por lado a partir dos arquivos de município', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'srv-')), 'l.jsonl');
  // 1º turno: AC pró-Flávio (40x50), PR pró-Lula (60x30); 100 aptos e 100 comparecimentos por seção
  const ant = new Map([...anteriores].map(([k, s]) => [k, s.uf === 'pr' ? { ...s, v: { 13: 60, 22: 30, 30: 10 } } : s]));
  const buscar = tseFalso((url) => {
    if (url.includes('-cs.json')) return cs(url.match(/config\/(\w\w)\//)[1]);
    if (url.includes('-cm.json')) return { abr: [{ cd: 'ac', mu: [{ cd: '00001' }] }, { cd: 'pr', mu: [{ cd: '00001' }] }] };
    const m = url.match(/dados\/(\w\w)\/\w\w(\d{5})-/);
    if (m) { // município: PR (pró-Lula) com 70% de comparecimento, AC com 90%
      const t = tse(m[2], 30, 30);
      t.e = { te: '200', est: '100', c: m[1] === 'pr' ? '70' : '90' };
      return t;
    }
    return tse(url.match(/dados\/(\w\w)\//)[1], 40, 60);
  });
  const s = criarServidor({ ...config(f), anteriores: ant, metodo: 'mudancaAbstencao' }, buscar);
  await s.atualizar();
  await s.atualizarMunicipios();
  const a = s.panorama().abstencao;
  // abstenção nas seções recebidas: 1º turno 0% nos dois lados; 2º turno 30% (Lula) e 10% (Flávio)
  assert.ok(Math.abs(a.lula.delta - 30) < 1e-9, JSON.stringify(a));
  assert.ok(Math.abs(a.flavio.delta - 10) < 1e-9);
  assert.ok(Math.abs(a.barra - 20) < 1e-9);
  assert.ok(Number.isFinite(a.efeitoLula));
  assert.ok(a.origem.todas.lula > 0);
  assert.strictEqual(s.panorama().metodo, 'mudancaAbstencao');
});

test('escolhe o método que acerta antes e desempata pelo erro médio até 50%', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'raiz-'));
  fs.mkdirSync(path.join(raiz, 'data', 'backtest'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'data', 'backtest', '2022-2t.json'), JSON.stringify({ metodos: {
    pa: { acertoEm: 45, erroMedio: 0.8 }, mudanca: { acertoEm: 1, erroMedio: 0.023 }, mudancaAbstencao: { acertoEm: 1, erroMedio: 0.020 },
  } }));
  assert.strictEqual(escolherMetodo(raiz).metodo, 'mudancaAbstencao');
  assert.strictEqual(escolherMetodo(path.join(raiz, 'nao-existe')).metodo, 'mudancaAbstencao');
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
