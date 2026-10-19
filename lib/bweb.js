// Leitura do boletim de urna (bweb) dos dados abertos do TSE: CSV separado por ";",
// com aspas, latin1. Só o cargo Presidente interessa.

const COLUNAS = ['SG_UF', 'CD_MUNICIPIO', 'NR_ZONA', 'NR_SECAO', 'DS_CARGO_PERGUNTA', 'DT_BU_RECEBIDO',
  'QT_APTOS', 'DS_TIPO_VOTAVEL', 'NR_VOTAVEL', 'QT_VOTOS'];

const pad = (x, n) => String(Number(x)).padStart(n, '0');

function chaveSecao(uf, mun, zona, secao) {
  return `${String(uf).toLowerCase()}-${pad(mun, 5)}-${pad(zona, 4)}-${pad(secao, 4)}`;
}

// Os campos do bweb não contêm ";" nem aspas internas, então basta cortar e tirar as aspas.
function dividirCsv(linha) {
  return linha.split(';').map((c) => (c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1) : c));
}

function indiceColunas(cabecalho) {
  const idx = {};
  cabecalho.forEach((nome, i) => { idx[nome] = i; });
  const faltando = COLUNAS.filter((c) => idx[c] === undefined);
  if (faltando.length) throw new Error('bweb sem as colunas: ' + faltando.join(', '));
  return idx;
}

// Horário de Brasília (UTC-3, sem horário de verão desde 2019) -> epoch ms.
// 2022: "02/10/2022 18:45:30". 2026: "2026-10-04 18:25:49".
function horarioBrasilia(texto) {
  let m = /^(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d):(\d\d)$/.exec(texto || '');
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] + 3, +m[5], +m[6]);
  m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(texto || '');
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5], +m[6]);
  return null;
}

function lerLinhaBweb(c, idx) {
  return {
    chave: chaveSecao(c[idx.SG_UF], c[idx.CD_MUNICIPIO], c[idx.NR_ZONA], c[idx.NR_SECAO]),
    uf: c[idx.SG_UF].toLowerCase(),
    mun: pad(c[idx.CD_MUNICIPIO], 5),
    cargo: c[idx.DS_CARGO_PERGUNTA],
    recebidoEm: horarioBrasilia(c[idx.DT_BU_RECEBIDO]),
    aptos: Number(c[idx.QT_APTOS]) || 0,
    tipo: c[idx.DS_TIPO_VOTAVEL],
    nr: c[idx.NR_VOTAVEL],
    votos: Number(c[idx.QT_VOTOS]) || 0,
  };
}

// Acumula em `secoes` (Map) uma linha já lida. Exportada para uso em streaming.
function acumular(secoes, l) {
  if (l.cargo !== 'Presidente') return;
  let s = secoes.get(l.chave);
  if (!s) {
    s = { k: l.chave, uf: l.uf, mun: l.mun, r: l.recebidoEm, aptos: l.aptos, v: {}, br: 0, nu: 0 };
    secoes.set(l.chave, s);
  }
  if (l.tipo === 'Nominal') s.v[l.nr] = (s.v[l.nr] ?? 0) + l.votos;
  else if (l.tipo === 'Branco') s.br += l.votos;
  else if (l.tipo === 'Nulo') s.nu += l.votos;
}

function agregarSecoes(linhas) {
  const secoes = new Map();
  for (const l of linhas) acumular(secoes, l);
  return secoes;
}

module.exports = { COLUNAS, chaveSecao, dividirCsv, indiceColunas, horarioBrasilia, lerLinhaBweb, acumular, agregarSecoes };
