// Comparação ao vivo do 2º turno com o 1º turno nas mesmas seções, e a curva projetada até 100%.
const { chaveSecao } = require('./bweb');
const { validosSecao } = require('./secoes');

// Lê o -cs.json de uma UF (ou de várias) -> Map uf -> {total, recebidas: Set, todas: Set}.
// Uma seção conta como recebida quando tem data e hora de recebimento.
function secoesRecebidas(cs, mapa = new Map()) {
  for (const abr of cs.abr ?? []) {
    const uf = String(abr.cd).toLowerCase();
    const info = mapa.get(uf) ?? { total: 0, recebidas: new Set(), todas: new Set() };
    for (const mu of abr.mu ?? []) {
      for (const z of mu.zon ?? []) {
        for (const s of z.sec ?? []) {
          const k = chaveSecao(uf, mu.cd, z.cd, s.ns);
          if (!info.todas.has(k)) info.total++;
          info.todas.add(k);
          if (s.da && s.ha) info.recebidas.add(k);
        }
      }
    }
    mapa.set(uf, info);
  }
  return mapa;
}

// Soma o 1º turno de um conjunto de seções; as sem par são estimadas pela média das com par.
function somarAnterior(chaves, anteriores) {
  const b = { validos: 0, votos: {} };
  let comPar = 0, total = 0;
  for (const k of chaves) {
    total++;
    const a = anteriores.get(k);
    if (!a) continue;
    comPar++;
    b.validos += validosSecao(a);
    for (const [c, n] of Object.entries(a.v)) b.votos[c] = (b.votos[c] ?? 0) + n;
  }
  const f = comPar > 0 ? total / comPar : 0;
  b.validos *= f;
  for (const c in b.votos) b.votos[c] *= f;
  return b;
}

const escalar = (b, fator) => ({
  validos: b.validos * fator,
  votos: Object.fromEntries(Object.entries(b.votos).map(([c, n]) => [c, n * fator])),
});

// ufTse: saída de lerArquivoTse; infoUf: item de secoesRecebidas (ou null se não houver).
// lados (opcional): Map "uf-mun" -> 'lula' | 'flavio'; com ele, o restante também sai separado
// por lado do município (anterior.porLado), para a projeção com abstenção por lado.
function estadoUfAoVivo(ufTse, infoUf, anteriores, candidatos, lados = null) {
  const votos = {};
  for (const c of ufTse.candidatos) if (candidatos.includes(c.numero)) votos[c.numero] = c.votos;
  const validos = candidatos.reduce((a, c) => a + (votos[c] ?? 0), 0);
  let anterior = null;
  if (infoUf && anteriores) {
    let chavesRest = [...infoUf.todas].filter((k) => !infoUf.recebidas.has(k));
    let apuradas = somarAnterior(infoUf.recebidas, anteriores);
    let restantes = somarAnterior(chavesRest, anteriores);
    // A lista de seções define a composição; o tamanho do que falta segue a fração apurada
    // dos totais do TSE, que são lidos com mais frequência. Sem seção marcada mas com votos,
    // usa a UF inteira como composição dos dois lados.
    const total = apuradas.validos + restantes.validos;
    const f = ufTse.eleitorado > 0 ? Math.min(1, ufTse.eleitoradoApurado / ufTse.eleitorado) : 0;
    let fator = 1;
    if (total > 0 && infoUf.recebidas.size === 0 && f > 0) {
      const tudo = somarAnterior(infoUf.todas, anteriores);
      apuradas = escalar(tudo, f);
      chavesRest = [...infoUf.todas];
      fator = 1 - f;
      restantes = escalar(tudo, fator);
    } else if (restantes.validos > 0) {
      fator = (total * (1 - f)) / restantes.validos;
      restantes = escalar(restantes, fator);
    }
    anterior = { apuradas, restantes };
    if (lados) {
      const porLado = { lula: [], flavio: [] };
      for (const k of chavesRest) {
        const lado = lados.get(k.slice(0, 8)); // "uf-mmmmm"
        if (lado) porLado[lado].push(k);
      }
      anterior.porLado = {
        lula: escalar(somarAnterior(porLado.lula, anteriores), fator),
        flavio: escalar(somarAnterior(porLado.flavio, anteriores), fator),
      };
    }
  }
  return { uf: ufTse.uf, aptosTotal: ufTse.eleitorado, aptosApurados: ufTse.eleitoradoApurado, validos, votos, anterior };
}

// Saldo em p.p. dos válidos: (Lula 2T − Lula 1T) − (Flávio 2T − Flávio 1T), nas mesmas seções.
function saldoUf(estado, lula = '13', flavio = '22') {
  const ap = estado.anterior?.apuradas;
  if (!ap || ap.validos <= 0 || estado.validos <= 0) return { saldo: null };
  const p = (v, t) => ((v ?? 0) / t) * 100;
  const r = {
    lula1: p(ap.votos[lula], ap.validos), flavio1: p(ap.votos[flavio], ap.validos),
    lula2: p(estado.votos[lula], estado.validos), flavio2: p(estado.votos[flavio], estado.validos),
  };
  r.saldo = (r.lula2 - r.lula1) - (r.flavio2 - r.flavio1);
  return r;
}

function baseUf(ufTse, recebidas) {
  if (ufTse.validos <= 0) return 'aguardando';
  return recebidas.size > 0 ? 'secao' : 'municipio';
}

// Curva do ponto atual até 100%: o que falta de cada UF (projecao.restantesPorUf) é repartido
// entre as seções restantes daquela UF na proporção dos válidos delas no 1º turno, e as seções
// entram na ordem em que chegaram no 1º turno. O último ponto é exatamente a projeção.
function curvaRestante(estados, recebidasPorUf, anteriores, pctAtual, projecao, candidatos) {
  const acumulado = {};
  for (const c of candidatos) acumulado[c] = estados.reduce((a, e) => a + (e.votos[c] ?? 0), 0);
  const pctDe = () => {
    const t = candidatos.reduce((a, c) => a + acumulado[c], 0);
    const pct = {};
    for (const c of candidatos) pct[c] = t > 0 ? (acumulado[c] / t) * 100 : 0;
    return pct;
  };

  const fila = [];
  for (const [uf, falta] of Object.entries(projecao.restantesPorUf ?? {})) {
    const info = recebidasPorUf.get(uf);
    const chaves = info ? [...info.todas].filter((k) => !info.recebidas.has(k)) : [];
    const comPar = chaves.map((k) => anteriores?.get(k)).filter(Boolean);
    const pesoMedio = comPar.length ? comPar.reduce((a, s) => a + validosSecao(s), 0) / comPar.length : 1;
    const itens = chaves.length
      ? chaves.map((k) => { const a = anteriores?.get(k); return { r: a?.r ?? Infinity, peso: a ? validosSecao(a) : pesoMedio }; })
      : [{ r: Infinity, peso: 1 }];
    const pesoTotal = itens.reduce((a, i) => a + i.peso, 0) || 1;
    for (const i of itens) fila.push({ r: i.r, votos: Object.fromEntries(candidatos.map((c) => [c, (falta[c] ?? 0) * i.peso / pesoTotal])) });
  }
  fila.sort((a, b) => a.r - b.r);

  const pontos = [{ pctSecoes: pctAtual, pct: pctDe() }];
  let proximo = Math.floor(pctAtual / 5) * 5 + 5;
  fila.forEach((item, i) => {
    for (const c of candidatos) acumulado[c] += item.votos[c];
    const x = pctAtual + (100 - pctAtual) * ((i + 1) / fila.length);
    if (x >= proximo && x < 100) {
      pontos.push({ pctSecoes: x, pct: pctDe() });
      proximo = Math.floor(x / 5) * 5 + 5;
    }
  });
  if (pctAtual < 100) pontos.push({ pctSecoes: 100, pct: { ...projecao.pct } });
  return pontos;
}

module.exports = { secoesRecebidas, estadoUfAoVivo, saldoUf, baseUf, curvaRestante };
