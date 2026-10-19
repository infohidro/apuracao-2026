// Uso único: baixa do Web Archive os resultados de 2022 (1º turno, presidente) por UF
// e grava historico2022.json com a taxa de votos válidos por eleitor.
const fs = require('fs');
const path = require('path');

const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to', 'zz'];

const url = (uf) => 'https://web.archive.org/web/2023id_/https://resultados.tse.jus.br/oficial/' +
  `ele2022/544/dados-simplificados/${uf}/${uf}-c0001-e000544-r.json`;

async function baixar(uf) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const r = await fetch(url(uf), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const n = (x) => Number(x);
      // esi = eleitorado das seções já apuradas na captura; torna a taxa válida mesmo se a captura for parcial
      return {
        eleitorado: n(j.e), eleitoradoApurado: n(j.esi), comparecimento: n(j.c), validos: n(j.vv),
        secoesPct: j.pst, taxaValidos: n(j.vv) / n(j.esi),
      };
    } catch (e) {
      console.log(uf, 'tentativa', tentativa, e.message);
      await new Promise((ok) => setTimeout(ok, 3000 * tentativa));
    }
  }
  return null;
}

(async () => {
  const out = {};
  for (const uf of UFS) {
    out[uf] = await baixar(uf);
    console.log(uf, JSON.stringify(out[uf]));
  }
  fs.writeFileSync(path.join(__dirname, 'historico2022.json'), JSON.stringify(out, null, 1));
})();
