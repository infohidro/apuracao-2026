// Plano B: quando o TSE não informa quais seções de uma UF já entraram, usa os arquivos por
// município. Todo município com alguma seção apurada conta como "recebido" por inteiro, e o
// resultado vira o mesmo formato de secoesRecebidas, reaproveitando a comparação por seção.

// anteriores (Map chave -> Secao) -> Map uf -> Map mun -> [chave]
function indicePorMunicipio(anteriores) {
  const idx = new Map();
  for (const s of anteriores.values()) {
    if (!idx.has(s.uf)) idx.set(s.uf, new Map());
    const m = idx.get(s.uf);
    if (!m.has(s.mun)) m.set(s.mun, []);
    m.get(s.mun).push(s.k);
  }
  return idx;
}

// arquivosMun: saídas de lerArquivoTse dos municípios da UF (o campo `uf` traz o código do município).
function infoPorMunicipio(arquivosMun, indice, uf) {
  const muns = indice.get(uf) ?? new Map();
  const todas = new Set([...muns.values()].flat());
  const recebidas = new Set();
  for (const m of arquivosMun) {
    if (m.secoesPct > 0) for (const k of muns.get(String(m.uf).padStart(5, '0')) ?? []) recebidas.add(k);
  }
  return { total: todas.size, recebidas, todas, base: 'municipio' };
}

module.exports = { indicePorMunicipio, infoPorMunicipio };
