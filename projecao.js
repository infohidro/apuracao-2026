// Matemática da projeção. Sem I/O: recebe os dados já lidos do TSE e devolve o panorama.

// Votos válidos por eleitor quando não há histórico da UF: taxa nacional do 1º turno de 2022
// (≈118,2 mi de válidos para ≈156,5 mi de eleitores).
const TAXA_PADRAO = 0.756;

const num = (x) => Number(String(x ?? '0').replace(',', '.')) || 0;

// Converte um arquivo "-u.json" do TSE (abrangência BR ou UF) para o formato interno.
function lerArquivoTse(j) {
  const candidatos = [];
  for (const agr of j.carg?.[0]?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        candidatos.push({ numero: c.n, nome: c.nmu || c.nm, partido: par.sg, votos: num(c.vap) });
      }
    }
  }
  return {
    uf: String(j.cdabr).toLowerCase(),
    geradoEm: `${j.dg} ${j.hg}`,
    secoesPct: num(j.s?.pst),
    eleitorado: num(j.e?.te),
    eleitoradoApurado: num(j.e?.est),
    validos: num(j.v?.vv),
    candidatos,
  };
}

// Projeta o total final de uma UF.
// Progressão aritmética: o que falta apurar (eleitorado restante) rende votos na mesma
// proporção do que já foi apurado. A taxa de votos válidos por eleitor começa no
// histórico de 2022 e migra para a taxa observada conforme a apuração avança.
function projetarUf(uf, taxaHistorica, fatiasNacionais) {
  const taxaHist = taxaHistorica > 0 ? taxaHistorica : TAXA_PADRAO;
  const fracao = uf.eleitorado > 0 ? Math.min(1, uf.eleitoradoApurado / uf.eleitorado) : 0;
  const semDados = uf.validos <= 0 || uf.eleitoradoApurado <= 0;
  const taxaObservada = semDados ? taxaHist : uf.validos / uf.eleitoradoApurado;
  const taxa = fracao * taxaObservada + (1 - fracao) * taxaHist;
  const validosRestantes = Math.max(0, uf.eleitorado - uf.eleitoradoApurado) * taxa;

  const projetado = {};
  for (const c of uf.candidatos) {
    const fatia = semDados ? (fatiasNacionais[c.numero] ?? 0) : c.votos / uf.validos;
    projetado[c.numero] = c.votos + validosRestantes * fatia;
  }
  return { fracao, semDados, validosProjetados: uf.validos + validosRestantes, projetado };
}

// ufs: lista no formato de lerArquivoTse. historico: { uf: { taxaValidos } }.
function calcularPanorama(ufs, historico = {}) {
  const atual = {};
  const info = {};
  let validosAtual = 0;
  let eleitorado = 0;
  let eleitoradoApurado = 0;
  for (const uf of ufs) {
    validosAtual += uf.validos;
    eleitorado += uf.eleitorado;
    eleitoradoApurado += uf.eleitoradoApurado;
    for (const c of uf.candidatos) {
      atual[c.numero] = (atual[c.numero] ?? 0) + c.votos;
      info[c.numero] = { numero: c.numero, nome: c.nome, partido: c.partido };
    }
  }
  const fatiasNacionais = {};
  for (const n in atual) fatiasNacionais[n] = validosAtual > 0 ? atual[n] / validosAtual : 0;

  const projetado = {};
  let validosProjetados = 0;
  const linhasUf = ufs.map((uf) => {
    const p = projetarUf(uf, historico[uf.uf]?.taxaValidos, fatiasNacionais);
    validosProjetados += p.validosProjetados;
    for (const n in p.projetado) projetado[n] = (projetado[n] ?? 0) + p.projetado[n];
    const lider = [...uf.candidatos].sort((a, b) => b.votos - a.votos)[0];
    return {
      uf: uf.uf,
      secoesPct: uf.secoesPct,
      eleitoradoPct: p.fracao * 100,
      semDados: p.semDados,
      validos: uf.validos,
      validosProjetados: p.validosProjetados,
      lider: !p.semDados && lider ? { nome: lider.nome, pct: (lider.votos / uf.validos) * 100 } : null,
    };
  });

  const candidatos = Object.keys(info).map((n) => ({
    ...info[n],
    votos: atual[n],
    pct: validosAtual > 0 ? (atual[n] / validosAtual) * 100 : 0,
    votosProjetados: validosAtual > 0 ? projetado[n] : 0,
    pctProjetado: validosAtual > 0 && validosProjetados > 0 ? (projetado[n] / validosProjetados) * 100 : 0,
  })).sort((a, b) => b.pctProjetado - a.pctProjetado || b.votos - a.votos || a.nome.localeCompare(b.nome));

  for (const l of linhasUf) l.pesoPct = validosProjetados > 0 ? (l.validosProjetados / validosProjetados) * 100 : 0;

  let desfecho = 'Aguardando os primeiros votos';
  if (validosAtual > 0) {
    desfecho = candidatos[0].pctProjetado > 50
      ? `Projeção: ${candidatos[0].nome} vence no 1º turno`
      : `Projeção: 2º turno entre ${candidatos[0].nome} e ${candidatos[1]?.nome ?? '?'}`;
  }

  return {
    eleitoradoPct: eleitorado > 0 ? (eleitoradoApurado / eleitorado) * 100 : 0,
    validosAtual,
    validosProjetados: validosAtual > 0 ? validosProjetados : 0,
    desfecho,
    candidatos,
    ufs: linhasUf,
  };
}

module.exports = { lerArquivoTse, projetarUf, calcularPanorama, num };
