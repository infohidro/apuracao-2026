// Reprise de uma apuração passada, seção por seção, na ordem real de chegada.
const { projetarPA, projetarMudanca, projetarMudancaAbstencao, desfecho, acertoEstavel } = require('./modelos');
const { validosSecao } = require('./secoes');
const { ladoMunicipios } = require('./abstencao');

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
// Por lado (município pró-Lula ou pró-Flávio no turno anterior), também guarda o restante do
// turno anterior e a razão de válidos por eleitor nas seções apuradas.
function criarAcumulador(atuais, anteriores) {
  const lados = anteriores ? ladoMunicipios(anteriores) : null;
  const ladoDe = (s) => lados?.get(`${s.uf}-${s.mun}`);
  const novoLado = () => ({ antTotal: bloco(), antApur: { ...bloco(), aptos1: 0 }, atual: { aptos: 0, validos: 0 } });
  const ufs = new Map();
  const uf = (sigla) => {
    if (!ufs.has(sigla)) {
      ufs.set(sigla, { uf: sigla, aptosTotal: 0, atual: bloco(), antTotal: bloco(), antApur: bloco(), lados: { lula: novoLado(), flavio: novoLado() } });
    }
    return ufs.get(sigla);
  };
  let semPar = 0;
  for (const s of atuais.values()) {
    const u = uf(s.uf);
    u.aptosTotal += s.aptos;
    const a = anteriores?.get(s.k);
    if (anteriores && !a) semPar++;
    if (a) {
      const l = ladoDe(s) && u.lados[ladoDe(s)];
      for (const b of l ? [u.antTotal, l.antTotal] : [u.antTotal]) {
        b.aptos += s.aptos;
        b.validos += validosSecao(a);
        somarVotos(b.votos, a.v);
      }
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
      const l = ladoDe(s) && u.lados[ladoDe(s)];
      if (l) {
        l.antApur.aptos += s.aptos;
        l.antApur.aptos1 += a.aptos;
        l.antApur.validos += validosSecao(a);
        somarVotos(l.antApur.votos, a.v);
        l.atual.aptos += s.aptos;
        l.atual.validos += validosSecao(s);
      }
    }
  }

  function porLado(u, fator) {
    const blocos = {};
    const razoes = {};
    for (const [nome, l] of Object.entries(u.lados)) {
      const rest = { validos: l.antTotal.validos - l.antApur.validos, votos: {} };
      somarVotos(rest.votos, l.antTotal.votos);
      somarVotos(rest.votos, l.antApur.votos, -1);
      blocos[nome] = escalar(rest, fator);
      const ok = l.atual.aptos > 0 && l.antApur.aptos1 > 0 && l.antApur.validos > 0;
      razoes[nome] = ok ? (l.atual.validos / l.atual.aptos) / (l.antApur.validos / l.antApur.aptos1) : null;
    }
    return { blocos, razoes };
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
        anterior = { apuradas, restantes: { validos: 0, votos: {} } };
        if (restPar.aptos > 0) {
          const fator = aptosRest / restPar.aptos;
          anterior.restantes = escalar(restPar, fator);
          const l = porLado(u, fator);
          anterior.porLado = l.blocos;
          anterior.razaoPorLado = l.razoes;
        } else if (aptosRest > 0 && u.antApur.aptos > 0) {
          anterior.restantes = escalar(u.antApur, aptosRest / u.antApur.aptos);
        }
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
  if (anteriores) {
    metodos.mudanca = projetarMudanca;
    metodos.mudancaAbstencao = projetarMudancaAbstencao;
  }
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
  // erro médio (p.p.) do candidato mais votado até 50% apurado: desempate entre métodos
  const lider = Object.entries(final.pct).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const m in series) {
    series[m].acertoEm = acertoEstavel(series[m].pontos, final.desfecho);
    const ate50 = series[m].pontos.filter((p) => p.pctSecoes <= 50);
    series[m].erroMedio = ate50.length
      ? ate50.reduce((a, p) => a + Math.abs((p.pctProjetado[lider] ?? 0) - (final.pct[lider] ?? 0)), 0) / ate50.length
      : 0;
  }
  return { candidatos, final, semPar: acc.semPar, totalSecoes: ordem.length, metodos: series };
}

module.exports = { criarAcumulador, montarEstados, reprisar };
