// Abstenção do 2º turno comparada com o 1º turno, separando municípios pró-Lula e pró-Flávio
// (pelo resultado do 1º turno), e a origem das seções já apuradas.
const { validosSecao } = require('./secoes');

const comparecimentoSecao = (s) => validosSecao(s) + (s.br ?? 0) + (s.nu ?? 0);

// Map "uf-mun" -> 'lula' | 'flavio', conforme quem teve mais votos no município no 1º turno.
function ladoMunicipios(anteriores, lula = '13', flavio = '22') {
  const soma = new Map();
  for (const s of anteriores.values()) {
    const k = `${s.uf}-${s.mun}`;
    const t = soma.get(k) ?? { l: 0, f: 0 };
    t.l += s.v[lula] ?? 0;
    t.f += s.v[flavio] ?? 0;
    soma.set(k, t);
  }
  const lados = new Map();
  for (const [k, t] of soma) lados.set(k, t.l > t.f ? 'lula' : 'flavio');
  return lados;
}

const vazio = () => ({ aptos1: 0, comp1: 0, val1: 0, est2: 0, comp2: 0, val2: 0, municipios: 0 });
function fechar(g) {
  if (!g.municipios || g.aptos1 <= 0 || g.est2 <= 0 || g.val1 <= 0) return null;
  const abst1 = (1 - g.comp1 / g.aptos1) * 100;
  const abst2 = (1 - g.comp2 / g.est2) * 100;
  // válidos por eleitor no 2º turno / no 1º turno: corrige comparecimento, brancos e nulos
  const razao = (g.val2 / g.est2) / (g.val1 / g.aptos1);
  return { abst1, abst2, delta: abst2 - abst1, razao, municipios: g.municipios };
}

// muns: Map uf -> arquivos de município (lerArquivoTse); infos: Map uf -> {recebidas} (lista de seções do TSE);
// indice: indicePorMunicipio(anteriores). Retorna abstenção por UF e lado, nacional e a barra
// (variação nos pró-Lula − variação nos pró-Flávio, em p.p.; positivo = favorável ao Flávio).
function resumoAbstencao({ muns, infos, anteriores, lados, indice, candidatos }) {
  const porUfBruto = {};
  const nac = { lula: vazio(), flavio: vazio() };
  for (const [uf, arquivos] of muns) {
    if (uf === 'zz') continue;
    const recebidas = infos.get(uf)?.recebidas;
    const usarLista = recebidas && recebidas.size > 0;
    for (const m of arquivos) {
      if (!(m.secoesPct > 0) || !(m.eleitoradoApurado > 0)) continue;
      const cod = String(m.uf).padStart(5, '0');
      const lado = lados.get(`${uf}-${cod}`);
      const chaves = indice.get(uf)?.get(cod);
      if (!lado || !chaves) continue;
      let base = usarLista ? chaves.filter((k) => recebidas.has(k)) : chaves;
      if (!base.length) base = chaves; // município apurado pelo TSE mas lista ainda não marcou
      porUfBruto[uf] ??= { lula: vazio(), flavio: vazio() };
      const val2 = candidatos.reduce((a, c) => a + (m.candidatos.find((x) => x.numero === c)?.votos ?? 0), 0);
      for (const g of [porUfBruto[uf][lado], nac[lado]]) {
        for (const k of base) {
          const s = anteriores.get(k);
          g.aptos1 += s.aptos;
          g.comp1 += comparecimentoSecao(s);
          g.val1 += validosSecao(s);
        }
        g.est2 += m.eleitoradoApurado;
        g.comp2 += m.comparecimento;
        g.val2 += val2;
        g.municipios++;
      }
    }
  }
  const porUf = {};
  for (const [uf, g] of Object.entries(porUfBruto)) porUf[uf] = { lula: fechar(g.lula), flavio: fechar(g.flavio) };
  const nacional = { lula: fechar(nac.lula), flavio: fechar(nac.flavio) };
  const barra = nacional.lula && nacional.flavio ? nacional.lula.delta - nacional.flavio.delta : null;
  return { porUf, nacional, barra };
}

// Quanto das seções apuradas (e do total) vem de municípios pró-Lula e pró-Flávio, pesado
// pelos válidos do 1º turno. infos: Map uf -> {recebidas}.
function origemVotos({ infos, anteriores, lados }) {
  const ap = { lula: 0, flavio: 0 };
  const tot = { lula: 0, flavio: 0 };
  const recebidas = new Set();
  for (const info of infos.values()) for (const k of info?.recebidas ?? []) recebidas.add(k);
  for (const s of anteriores.values()) {
    if (s.uf === 'zz') continue;
    const lado = lados.get(`${s.uf}-${s.mun}`);
    if (!lado) continue;
    const v = validosSecao(s);
    tot[lado] += v;
    if (recebidas.has(s.k)) ap[lado] += v;
  }
  const pct = (o) => {
    const t = o.lula + o.flavio;
    return t > 0 ? { lula: (o.lula / t) * 100, flavio: (o.flavio / t) * 100 } : null;
  };
  return { apuradas: pct(ap), todas: pct(tot) };
}

// Abstenção da UF: 2º turno (totais do TSE) e 1º turno nas seções já recebidas (ou na UF inteira).
function abstencaoUf(ufTse, infoUf, anteriores) {
  if (!(ufTse.eleitoradoApurado > 0) || !anteriores) return null;
  const chaves = infoUf?.recebidas?.size ? infoUf.recebidas : (infoUf?.todas ?? []);
  let aptos = 0, comp = 0;
  for (const k of chaves) {
    const s = anteriores.get(k);
    if (!s) continue;
    aptos += s.aptos;
    comp += comparecimentoSecao(s);
  }
  if (aptos <= 0) return null;
  return { abst1: (1 - comp / aptos) * 100, abst2: (1 - ufTse.comparecimento / ufTse.eleitoradoApurado) * 100 };
}

module.exports = { comparecimentoSecao, ladoMunicipios, resumoAbstencao, origemVotos, abstencaoUf };
