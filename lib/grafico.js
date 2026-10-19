// Desenho dos gráficos em SVG puro, carregado pelo navegador (<script src="/lib/grafico.js">).
// Cores e fontes vêm das variáveis CSS da página: --texto, --suave, --linha.
(function (global) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, texto) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texto != null) e.textContent = texto;
    return e;
  };
  const fmt = (x, casas = 1) => x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  // pontos/projecao: [{pctSecoes, pct: {nr: %}}]; candidatos: [{nr, nome, cor}]
  function desenharEvolucao(svg, { pontos, projecao = [], candidatos, rotuloFinal = true }) {
    const L = 640, A = 300, m = { e: 44, d: 110, t: 14, b: 34 };
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    svg.replaceChildren();
    const todos = [...pontos, ...projecao];
    const valores = todos.flatMap((p) => candidatos.map((c) => p.pct[c.nr] ?? 0));
    if (!valores.length) {
      svg.append(el('text', { x: L / 2, y: A / 2, 'text-anchor': 'middle', fill: 'var(--suave)' }, 'aguardando os primeiros votos'));
      return;
    }
    let yMin = Math.floor(Math.min(...valores) / 5) * 5 - 5;
    let yMax = Math.ceil(Math.max(...valores) / 5) * 5 + 5;
    yMin = Math.max(0, yMin); yMax = Math.min(100, yMax);
    const x = (v) => m.e + (v / 100) * (L - m.e - m.d);
    const y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (A - m.t - m.b);

    const passoY = yMax - yMin > 40 ? 10 : 5;
    for (let v = Math.ceil(yMin / passoY) * passoY; v <= yMax; v += passoY) {
      svg.append(el('line', { x1: x(0), x2: x(100), y1: y(v), y2: y(v), stroke: 'var(--linha)', 'stroke-width': v === 50 ? 1.5 : 0.6, 'stroke-dasharray': v === 50 ? '4 4' : '' }));
      svg.append(el('text', { x: m.e - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--suave)' }, `${v}%`));
    }
    for (let v = 0; v <= 100; v += 20) {
      svg.append(el('text', { x: x(v), y: A - m.b + 16, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--suave)' }, `${v}%`));
    }
    svg.append(el('text', { x: x(50), y: A - 4, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--suave)' }, '% das seções apuradas'));

    const linha = (serie, nr) => serie.map((p) => `${x(p.pctSecoes).toFixed(1)},${y(p.pct[nr] ?? 0).toFixed(1)}`).join(' ');
    const rotulos = [];
    for (const c of candidatos) {
      if (pontos.length) svg.append(el('polyline', { points: linha(pontos, c.nr), fill: 'none', stroke: c.cor, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      if (projecao.length) svg.append(el('polyline', { points: linha(projecao, c.nr), fill: 'none', stroke: c.cor, 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
      const fim = (projecao.length ? projecao : pontos).at(-1);
      if (fim && rotuloFinal) {
        svg.append(el('circle', { cx: x(fim.pctSecoes), cy: y(fim.pct[c.nr] ?? 0), r: 4, fill: c.cor }));
        rotulos.push({ y: y(fim.pct[c.nr] ?? 0), texto: `${c.nome} ${fmt(fim.pct[c.nr] ?? 0)}%`, cor: c.cor, x: x(fim.pctSecoes) + 8 });
      }
    }
    // afasta rótulos que se sobrepõem
    rotulos.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rotulos.length; i++) rotulos[i].y = Math.max(rotulos[i].y, rotulos[i - 1].y + 14);
    for (const r of rotulos) svg.append(el('text', { x: r.x, y: r.y + 4, 'font-size': 12, 'font-weight': 600, fill: r.cor }, r.texto));
  }

  // linhas: [{uf, saldo: number|null, detalhe}]; saldo > 0 = Lula cresceu mais
  function desenharSaldo(container, linhas, cores = { pos: '#e07a1f', neg: '#3b6fd6' }) {
    const max = Math.max(1, ...linhas.map((l) => Math.abs(l.saldo ?? 0)));
    container.replaceChildren(...linhas.map((l) => {
      const linha = document.createElement('div');
      linha.className = 'saldo-linha';
      linha.title = l.detalhe;
      const uf = document.createElement('span');
      uf.className = 'saldo-uf';
      uf.textContent = l.uf;
      const trilho = document.createElement('span');
      trilho.className = 'saldo-trilho';
      if (l.saldo === null) {
        trilho.textContent = 'aguardando';
        trilho.classList.add('saldo-vazio');
      } else {
        const barra = document.createElement('i');
        const w = (Math.abs(l.saldo) / max) * 50;
        barra.style.cssText = `position:absolute;top:2px;bottom:2px;width:${w}%;background:${l.saldo >= 0 ? cores.pos : cores.neg};` +
          (l.saldo >= 0 ? 'left:50%' : `left:${50 - w}%`);
        const valor = document.createElement('b');
        valor.textContent = (l.saldo > 0 ? '+' : '') + fmt(l.saldo);
        valor.style.cssText = `position:absolute;top:0;font-size:12px;color:${l.saldo >= 0 ? cores.pos : cores.neg};` +
          (l.saldo >= 0 ? `left:calc(${50 + w}% + 4px)` : `right:calc(${50 + w}% + 4px)`);
        trilho.append(barra, valor);
      }
      linha.append(uf, trilho);
      return linha;
    }));
  }

  global.Grafico = { desenharEvolucao, desenharSaldo, fmt };
})(window);
