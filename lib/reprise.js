// Reprise de uma apuração passada, seção por seção, na ordem real de chegada.
const { projetarPA, projetarMudanca, desfecho, acertoEstavel } = require('./modelos');
const { validosSecao } = require('./secoes');

const somarVotos = (alvo, v, fator = 1) => {
  for (const [c, n] of Object.entries(v)) alvo[c] = (alvo[c] ?? 0) + n * fator;
};
const bloco = () => ({ aptos: 0, validos: 0, votos: {} });
const escalar = (b, f) => {
  const votos = {};
  somarVotos(votos, b.votos, f);
  return { validos: b.validos * f, votos };
};

// Acumulador incremental por UF. "aptos" é sempre o do turno atual, para que as escalas
// das seções sem par no turno anterior fiquem na mesma unidade.
function criarAcumulador(atuais, anteriores) {
  const ufs = new Map();
  const uf = (sigla) => {
    if (!ufs.has(sigla)) ufs.set(sigla, { uf: sigla, aptosTotal: 0, atual: bloco(), antTotal: bloco(), antApur: bloco() });
    return ufs.get(sigla);
  };
  let semPar = 0;
  for (const s of atuais.values()) {
    const u = uf(s.uf);
    u.aptosTotal += s.aptos;
    const a = anteriores?.get(s.k);
    if (anteriores && !a) semPar++;
    if (a) {
      u.antTotal.aptos += s.aptos;
      u.antTotal.validos += validosSecao(a);
      somarVotos(u.antTotal.votos, a.v);
    }
  }

  function adicionar(s) {
    const u = uf(s.uf);
    u.atual.aptos += s.aptos;
    u.atual.validos += validosSecao(s);
    somarVotos(u.atual.votos, s.v);
    const a = anteriores?.get(s.k);
    if (a) {
      u.antApur.aptos += s.aptos;
      u.antApur.validos += validosSecao(a);
      somarVotos(u.antApur.votos, a.v);
    }
  }

  function estados() {
    return [...ufs.values()].map((u) => {
      let anterior = null;
      if (anteriores) {
        const apuradas = u.antApur.aptos > 0 ? escalar(u.antApur, u.atual.aptos / u.antApur.aptos) : escalar(u.antApur, 0);
        const aptosRest = u.aptosTotal - u.atual.aptos;
        const restPar = { aptos: u.antTotal.aptos - u.antApur.aptos, validos: u.antTotal.validos - u.antApur.validos, votos: {} };
        somarVotos(restPar.votos, u.antTotal.votos);
        somarVotos(restPar.votos, u.antApur.votos, -1);
        let restantes = { validos: 0, votos: {} };
        if (restPar.aptos > 0) restantes = escalar(restPar, aptosRest / restPar.aptos);
        else if (aptosRest > 0 && u.antApur.aptos > 0) restantes = escalar(u.antApur, aptosRest / u.antApur.aptos);
        anterior = { apuradas, restantes };
      }
      return {
        uf: u.uf, aptosTotal: u.aptosTotal, aptosApurados: u.atual.aptos,
        validos: u.atual.validos, votos: { ...u.atual.votos }, anterior,
      };
    });
  }

  return { adicionar, estados, semPar };
}

function montarEstados(atuais, apuradas, anteriores) {
  const acc = criarAcumulador(atuais, anteriores);
  for (const k of apuradas) acc.adicionar(atuais.get(k));
  return { ufs: acc.estados(), semPar: acc.semPar };
}

const pctDe = (votos, candidatos) => {
  const total = candidatos.reduce((a, c) => a + (votos[c] ?? 0), 0);
  const pct = {};
  for (const c of candidatos) pct[c] = total > 0 ? ((votos[c] ?? 0) / total) * 100 : 0;
  return pct;
};

function reprisar(atuais, anteriores, candidatos, passoPct = 1) {
  const ordem = [...atuais.values()].sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity));
  const acc = criarAcumulador(atuais, anteriores);
  const metodos = { pa: projetarPA };
  if (anteriores) metodos.mudanca = projetarMudanca;
  const series = {};
  for (const m in metodos) series[m] = { pontos: [], acertoEm: null };

  const votosAtuais = {};
  const marcos = [];
  for (let p = passoPct; p < 100; p += passoPct) marcos.push(p);
  marcos.push(100);

  let i = 0;
  for (const p of marcos) {
    const ate = p === 100 ? ordem.length : Math.ceil((ordem.length * p) / 100);
    for (; i < ate; i++) {
      acc.adicionar(ordem[i]);
      somarVotos(votosAtuais, ordem[i].v);
    }
    const ufs = acc.estados();
    const pctAtual = pctDe(votosAtuais, candidatos);
    for (const m in metodos) {
      const proj = metodos[m](ufs, candidatos);
      series[m].pontos.push({ pctSecoes: p, pctAtual, pctProjetado: proj.pct, desfecho: desfecho(proj.pct) });
    }
  }

  const final = { pct: pctDe(votosAtuais, candidatos) };
  final.desfecho = desfecho(final.pct);
  for (const m in series) series[m].acertoEm = acertoEstavel(series[m].pontos, final.desfecho);
  return { candidatos, final, semPar: acc.semPar, totalSecoes: ordem.length, metodos: series };
}

module.exports = { criarAcumulador, montarEstados, reprisar };
