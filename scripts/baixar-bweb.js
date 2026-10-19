// Uso: node scripts/baixar-bweb.js <ano> <turno>
// Baixa os boletins de urna (bweb) de todas as UFs para data/brutos/.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const SUFIXOS = { '2022-1': '051020221321', '2022-2': '311020221535', '2026-1': '051020261403' };
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'ZZ'];
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };

const nomeZip = (ano, turno, uf) => `bweb_${turno}t_${uf}_${SUFIXOS[`${ano}-${turno}`]}.zip`;
const pastaBrutos = path.join(__dirname, '..', 'data', 'brutos');

async function baixar(url, destino) {
  const cab = await fetch(url, { ...H, method: 'HEAD' });
  if (!cab.ok) throw new Error(`HTTP ${cab.status}`);
  const tamanho = Number(cab.headers.get('content-length'));
  if (fs.existsSync(destino) && fs.statSync(destino).size === tamanho) return 'já existe';
  const r = await fetch(url, H);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const temp = destino + '.parcial';
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(temp));
  if (fs.statSync(temp).size !== tamanho) throw new Error('tamanho diferente do esperado');
  fs.renameSync(temp, destino);
  return `${(tamanho / 1e6).toFixed(0)} MB`;
}

async function main() {
  const [ano, turno] = process.argv.slice(2);
  if (!SUFIXOS[`${ano}-${turno}`]) throw new Error('casos: ' + Object.keys(SUFIXOS).join(', '));
  fs.mkdirSync(pastaBrutos, { recursive: true });
  for (const uf of UFS) {
    const nome = nomeZip(ano, turno, uf);
    const url = `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes${ano}/buweb/${nome}`;
    for (let tentativa = 1; ; tentativa++) {
      try {
        console.log(uf, await baixar(url, path.join(pastaBrutos, nome)));
        break;
      } catch (e) {
        if (tentativa >= 3) throw new Error(`${nome}: ${e.message}`);
        console.log(uf, 'tentativa', tentativa, 'falhou:', e.message);
      }
    }
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { SUFIXOS, UFS, nomeZip, pastaBrutos };
