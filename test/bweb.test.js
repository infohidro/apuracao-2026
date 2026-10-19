const test = require('node:test');
const assert = require('node:assert');
const { chaveSecao, indiceColunas, dividirCsv, lerLinhaBweb, agregarSecoes } = require('../lib/bweb');

const CABECALHO = '"DT_GERACAO";"HH_GERACAO";"ANO_ELEICAO";"CD_TIPO_ELEICAO";"NM_TIPO_ELEICAO";"CD_PLEITO";"DT_PLEITO";"NR_TURNO";"CD_ELEICAO";"DS_ELEICAO";"SG_UF";"CD_MUNICIPIO";"NM_MUNICIPIO";"NR_ZONA";"NR_SECAO";"NR_LOCAL_VOTACAO";"CD_CARGO_PERGUNTA";"DS_CARGO_PERGUNTA";"NR_PARTIDO";"SG_PARTIDO";"NM_PARTIDO";"DT_BU_RECEBIDO";"QT_APTOS";"QT_COMPARECIMENTO";"QT_ABSTENCOES";"CD_TIPO_URNA";"DS_TIPO_URNA";"CD_TIPO_VOTAVEL";"DS_TIPO_VOTAVEL";"NR_VOTAVEL";"NM_VOTAVEL";"QT_VOTOS"';
const idx = indiceColunas(dividirCsv(CABECALHO));

const linha = (cargo, tipo, nr, votos, aptos = 300) => dividirCsv(
  `"05/10/2022";"13:21:57";"2022";"0";"Eleição Ordinária";"406";"02/10/2022";"1";"544";"Eleição Geral Federal 2022";"AC";"1392";"RIO BRANCO";"1";"3";"1279";"1";"${cargo}";"-1";"#NULO#";"#NULO#";"02/10/2022 18:45:30";"${aptos}";"155";"30";"1";"APURADA";"1";"${tipo}";"${nr}";"X";"${votos}"`,
);

test('chave de seção normalizada', () => {
  assert.strictEqual(chaveSecao('AC', 1392, 1, 3), 'ac-01392-0001-0003');
  assert.strictEqual(chaveSecao('ac', '01392', '0001', '0003'), 'ac-01392-0001-0003');
});

test('lê uma linha do bweb com horário de Brasília', () => {
  const l = lerLinhaBweb(linha('Presidente', 'Nominal', '13', '100'), idx);
  assert.strictEqual(l.chave, 'ac-01392-0001-0003');
  assert.strictEqual(l.recebidoEm, new Date('2022-10-02T21:45:30Z').getTime());
  assert.strictEqual(l.cargo, 'Presidente');
  assert.strictEqual(l.nr, '13');
  assert.strictEqual(l.votos, 100);
  assert.strictEqual(l.aptos, 300);
});

test('agrega só presidente, sem duplicar aptos', () => {
  const linhas = [
    linha('Presidente', 'Nominal', '13', '100'),
    linha('Presidente', 'Nominal', '22', '80'),
    linha('Presidente', 'Branco', '95', '3'),
    linha('Presidente', 'Nulo', '96', '5'),
    linha('Governador', 'Nominal', '15', '999'),
  ].map((c) => lerLinhaBweb(c, idx));
  const secoes = agregarSecoes(linhas);
  assert.strictEqual(secoes.size, 1);
  const s = secoes.get('ac-01392-0001-0003');
  assert.deepStrictEqual(s.v, { 13: 100, 22: 80 });
  assert.strictEqual(s.br, 3);
  assert.strictEqual(s.nu, 5);
  assert.strictEqual(s.aptos, 300);
  assert.strictEqual(s.uf, 'ac');
  assert.strictEqual(s.mun, '01392');
  assert.strictEqual(s.r, new Date('2022-10-02T21:45:30Z').getTime());
});

test('horário vazio vira null', () => {
  const c = linha('Presidente', 'Nominal', '13', '1');
  c[idx.DT_BU_RECEBIDO] = '#NULO#';
  assert.strictEqual(lerLinhaBweb(c, idx).recebidoEm, null);
});
