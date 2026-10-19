// Métodos de projeção do resultado final, usados pela reprise histórica e pelo servidor ao vivo.
//
// EstadoUf = { uf, aptosTotal, aptosApurados, validos, votos: {nr: n},
//              anterior: null | { apuradas: {validos, votos}, restantes: {validos, votos} } }
// `validos` é a soma dos votos nominais de todos os candidatos do turno.
//
// Progressão aritmética (PA): em cada UF, o eleitorado que falta rende válidos na taxa
// válidos/aptos já observada e se divide na mesma proporção do já apurado.
//
// Mudança: em cada UF mede-se, em p.p. dos válidos, quanto cada candidato variou nas
// seções já apuradas em relação ao turno anterior nessas mesmas seções. As seções que
// faltam recebem a cota do turno anterior + essa variação (aditiva), cortada em >= 0 e
// renormalizada entre os candidatos do turno. Os válidos que faltam são os do turno
// anterior nas restantes vezes a razão de comparecimento (válidos atuais / anteriores)
// observada. UF sem nada apurado usa a variação e a razão nacionais.

const soma = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// restantesPorUf: {uf: {nr: votos projetados para o que falta apurar}}, usado para desenhar a curva.
function finalizar(votos, candidatos, restantesPorUf) {
  const validos = candidatos.reduce((a, c) => a + (votos[c] ?? 0), 0);
  const pct = {};
  for (const c of candidatos) pct[c] = validos > 0 ? ((votos[c] ?? 0) / validos) * 100 : 0;
  return { votos, validos, pct, restantesPorUf };
}

function projetarPA(ufs, candidatos) {
  const tot = { validos: 0, aptos: 0, votos: {} };
  for (const u of ufs) {
    if (u.validos <= 0 || u.aptosApurados <= 0) continue;
    tot.validos += u.validos;
    tot.aptos += u.aptosApurados;
    for (const c of candidatos) tot.votos[c] = (tot.votos[c] ?? 0) + (u.votos[c] ?? 0);
  }
  const taxaNac = tot.aptos > 0 ? tot.validos / tot.aptos : 0;

  const votos = {};
  const porUf = {};
  for (const c of candidatos) votos[c] = 0;
  for (const u of ufs) {
    const temDados = u.validos > 0 && u.aptosApurados > 0;
    const taxa = temDados ? u.validos / u.aptosApurados : taxaNac;
    const base = temDados ? u : tot;
    const restantes = Math.max(0, u.aptosTotal - u.aptosApurados) * taxa;
    porUf[u.uf] = {};
    for (const c of candidatos) {
      const cota = base.validos > 0 ? (base.votos[c] ?? 0) / base.validos : 0;
      porUf[u.uf][c] = restantes * cota;
      votos[c] += (u.votos[c] ?? 0) + porUf[u.uf][c];
    }
  }
  return finalizar(votos, candidatos, porUf);
}

function variacao(validos, votos, antValidos, antVotos, candidatos) {
  const d = {};
  for (const c of candidatos) d[c] = (votos[c] ?? 0) / validos - (antVotos[c] ?? 0) / antValidos;
  return d;
}

function projetarMudanca(ufs, candidatos) {
  if (!ufs.some((u) => u.anterior)) throw new Error('mudança exige turno anterior');

  const nac = { validos: 0, votos: {}, antValidos: 0, antVotos: {} };
  for (const u of ufs) {
    if (!u.anterior || u.validos <= 0 || u.anterior.apuradas.validos <= 0) continue;
    nac.validos += u.validos;
    nac.antValidos += u.anterior.apuradas.validos;
    for (const [c, v] of Object.entries(u.votos)) nac.votos[c] = (nac.votos[c] ?? 0) + v;
    for (const [c, v] of Object.entries(u.anterior.apuradas.votos)) nac.antVotos[c] = (nac.antVotos[c] ?? 0) + v;
  }
  const temNac = nac.validos > 0 && nac.antValidos > 0;
  const deltaNac = temNac ? variacao(nac.validos, nac.votos, nac.antValidos, nac.antVotos, candidatos) : null;
  const razaoNac = temNac ? nac.validos / nac.antValidos : 1;

  const votos = {};
  const porUf = {};
  for (const c of candidatos) votos[c] = 0;
  for (const u of ufs) {
    for (const c of candidatos) votos[c] += u.votos[c] ?? 0;
    porUf[u.uf] = {};
    const rest = u.anterior?.restantes;
    if (!rest || rest.validos <= 0) continue;
    const apur = u.anterior.apuradas;
    const temUf = u.validos > 0 && apur.validos > 0;
    const delta = temUf ? variacao(u.validos, u.votos, apur.validos, apur.votos, candidatos) : deltaNac;
    const razao = temUf ? u.validos / apur.validos : razaoNac;

    const cotas = {};
    for (const c of candidatos) {
      cotas[c] = Math.max(0, (rest.votos[c] ?? 0) / rest.validos + (delta ? delta[c] : 0));
    }
    let total = soma(cotas);
    if (total <= 0) { // nada aproveitável: divide igualmente
      for (const c of candidatos) cotas[c] = 1;
      total = candidatos.length;
    }
    const validosRestantes = rest.validos * razao;
    for (const c of candidatos) {
      porUf[u.uf][c] = validosRestantes * (cotas[c] / total);
      votos[c] += porUf[u.uf][c];
    }
  }
  return finalizar(votos, candidatos, porUf);
}

// "1T:13" se o primeiro passa de 50% dos válidos; senão "2T:a x b" com os dois primeiros em ordem numérica.
function desfecho(pct) {
  const ordem = Object.entries(pct).sort((a, b) => b[1] - a[1]);
  if (!ordem.length) return 'sem dados';
  if (ordem[0][1] > 50) return `1T:${ordem[0][0]}`;
  const dois = ordem.slice(0, 2).map(([c]) => c).sort((a, b) => Number(a) - Number(b));
  return `2T:${dois.join('x')}`;
}

// Menor pctSecoes a partir do qual todos os pontos seguintes têm o desfecho final.
function acertoEstavel(serie, final) {
  let desde = null;
  for (const p of serie) {
    if (p.desfecho === final) { if (desde === null) desde = p.pctSecoes; } else desde = null;
  }
  return desde;
}

module.exports = { projetarPA, projetarMudanca, desfecho, acertoEstavel };
