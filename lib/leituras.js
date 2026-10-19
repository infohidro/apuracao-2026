// Leituras ao vivo gravadas em JSONL, para o gráfico sobreviver a reinícios do servidor.
const fs = require('fs');
const path = require('path');

function abrirLeituras(caminho) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const leituras = [];
  if (fs.existsSync(caminho)) {
    const texto = fs.readFileSync(caminho, 'utf8');
    for (const linha of texto.split('\n')) {
      if (!linha.trim()) continue;
      try { leituras.push(JSON.parse(linha)); } catch { /* linha truncada por queda: descarta */ }
    }
    // regrava sem a linha quebrada, para o próximo append começar numa linha nova
    if (texto && !texto.endsWith('\n')) {
      fs.writeFileSync(caminho, leituras.map((l) => JSON.stringify(l) + '\n').join(''));
    }
  }

  return {
    todas: () => leituras,
    anotar(l) {
      if (leituras.length && leituras.at(-1).geradoTse === l.geradoTse) return false;
      fs.appendFileSync(caminho, JSON.stringify(l) + '\n');
      leituras.push(l);
      return true;
    },
  };
}

module.exports = { abrirLeituras };
