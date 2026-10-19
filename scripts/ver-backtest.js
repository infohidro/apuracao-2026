// Servidor mínimo para ver a página do teste histórico: node scripts/ver-backtest.js -> http://localhost:3027/backtest.html
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ROTAS = { '/backtest.html': ['public/backtest.html', 'text/html'], '/lib/grafico.js': ['lib/grafico.js', 'text/javascript'] };

http.createServer((req, res) => {
  const caso = /^\/api\/backtest\/([\w-]+)$/.exec(req.url);
  const [arquivo, tipo] = caso ? [`data/backtest/${caso[1]}.json`, 'application/json'] : (ROTAS[req.url] ?? []);
  const caminho = arquivo && path.join(RAIZ, arquivo);
  if (!caminho || !fs.existsSync(caminho)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': `${tipo}; charset=utf-8` });
  fs.createReadStream(caminho).pipe(res);
}).listen(3027, '127.0.0.1', () => console.log('http://localhost:3027/backtest.html'));
