// Árvore 2D em SVG: desenha só o que está visível (virtualização), com zoom, arraste, teclado e destaques.
import { s, icone } from './ui.js';
import { calcularLayout, percorrer, passaFiltro, TAMANHOS, indices, geracoes, visiveis } from './layout.js';

const ROT_REL = (r, sexo) => {
  if (r === 'pai') return { M: 'Pai', F: 'Mãe' }[sexo] || 'Genitor(a)';
  if (r === 'filho') return { M: 'Filho', F: 'Filha' }[sexo] || 'Filho(a)';
  if (r === 'conjuge') return 'Cônjuge/parceria';
  if (r === 'irmao') return { M: 'Irmão', F: 'Irmã' }[sexo] || 'Irmão(ã)';
  return '';
};
const corta = (t, max) => (t.length > max ? t.slice(0, max - 1) + '…' : t);

export class Arvore2D {
  constructor(container, cb) {
    this.cb = cb;
    this.svg = s('svg', { class: 'arvore', role: 'application', tabindex: '0', 'aria-label': 'Árvore genealógica. Use as setas para navegar entre parentes, Enter para abrir o perfil, + e − para zoom, 0 para ajustar.' });
    this.defs = s('defs');
    this.camada = s('g');
    this.gArestas = s('g'); this.gNos = s('g'); this.gFaixas = s('g'); this.gAcoes = s('g');
    this.camada.append(this.gFaixas, this.gArestas, this.gNos, this.gAcoes);
    this.svg.append(this.defs, this.camada);
    container.append(this.svg);
    this.t = { x: 40, y: 80, k: 1 };
    this.ponteiros = new Map();
    this.eventos();
    this.ro = new ResizeObserver(() => this.desenhar());
    this.ro.observe(this.svg);
  }

  atualizar(g, opcoes) {
    this.g = g; this.op = opcoes;
    this.L = calcularLayout(g, opcoes);
    this.tam = this.L.tam;
    // Filtros: esmaecer ou ocultar quem não passa.
    this.filtrado = new Set();
    for (const id of this.L.ids) if (!passaFiltro(g.porId.get(id), this.L.gen.get(id) - this.L.minGen, opcoes.filtros, this.L.idx)) this.filtrado.add(id);
    if (opcoes.filtros.ocultarFiltrados) for (const id of this.filtrado) this.L.nos.delete(id);
    this.montarArestas();
    this.destacar(opcoes.selecionado, opcoes.caminho);
  }

  montarArestas() {
    const { nos, idx } = this.L;
    const ar = [];
    const porFilho = new Map();
    for (const r of this.g.relacoes) {
      if (!nos.has(r.person_a) || !nos.has(r.person_b)) continue;
      if (r.type === 'parent' || r.type === 'guardian') { if (!porFilho.has(r.person_b)) porFilho.set(r.person_b, []); porFilho.get(r.person_b).push(r); }
      else if (r.type === 'spouse' || r.type === 'partner') ar.push({ tipo: 'conjuge', a: r.person_a, b: r.person_b, r });
      else if (r.type === 'sibling') ar.push({ tipo: 'irmao', a: r.person_a, b: r.person_b, r });
    }
    for (const [filho, rs] of porFilho) {
      const parentais = rs.filter((r) => r.type === 'parent');
      // Casal de genitores que são cônjuges: a linha sai do meio do casal.
      if (parentais.length === 2 && (idx.conjuges.get(parentais[0].person_a) || []).some((c) => c.id === parentais[1].person_a)) {
        ar.push({ tipo: 'filiacao', pais: [parentais[0].person_a, parentais[1].person_a], b: filho, r: parentais[0], r2: parentais[1] });
        for (const r of rs.filter((x) => !parentais.includes(x))) ar.push({ tipo: 'filiacao', pais: [r.person_a], b: filho, r });
      } else for (const r of rs) ar.push({ tipo: 'filiacao', pais: [r.person_a], b: filho, r });
    }
    this.arestas = ar;
    // Limites do desenho para "ajustar".
    const xs = [...nos.values()];
    this.limites = xs.length ? { x0: Math.min(...xs.map((n) => n.x)), y0: Math.min(...xs.map((n) => n.y)), x1: Math.max(...xs.map((n) => n.x)) + this.tam.w, y1: Math.max(...xs.map((n) => n.y)) + this.tam.h } : { x0: 0, y0: 0, x1: 1, y1: 1 };
  }

  destacar(sel, caminho) {
    this.sel = sel && this.L?.nos.has(sel) ? sel : null;
    this.caminho = caminho?.length ? caminho : null;
    const { idx } = this.L;
    this.anc = this.sel ? percorrer(idx.pais, this.sel) : new Set();
    this.desc = this.sel ? percorrer(idx.filhos, this.sel) : new Set();
    this.relSel = new Map();
    if (this.sel) {
      for (const p of idx.pais.get(this.sel) || []) this.relSel.set(p.id, 'pai');
      for (const f of idx.filhos.get(this.sel) || []) this.relSel.set(f.id, 'filho');
      for (const c of idx.conjuges.get(this.sel) || []) this.relSel.set(c.id, 'conjuge');
      const meusPais = new Set((idx.pais.get(this.sel) || []).map((p) => p.id));
      for (const p of meusPais) for (const f of idx.filhos.get(p) || []) if (f.id !== this.sel && !this.relSel.has(f.id)) this.relSel.set(f.id, 'irmao');
    }
    this.desenhar();
  }

  // Desenha apenas nós e arestas dentro da área visível (+ margem).
  desenhar() {
    if (!this.L) return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.desenharAgora());
  }
  desenharAgora() {
    const { nos } = this.L, tam = this.tam, t = this.t;
    this.camada.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
    const w = this.svg.clientWidth || 800, hh = this.svg.clientHeight || 600, m = 200;
    const vis = { x0: (-t.x - m) / t.k, y0: (-t.y - m) / t.k, x1: (w - t.x + m) / t.k, y1: (hh - t.y + m) / t.k };
    const dentro = (n) => n.x + tam.w >= vis.x0 && n.x <= vis.x1 && n.y + tam.h >= vis.y0 && n.y <= vis.y1;
    const detalhe = t.k >= 0.35; // abaixo disso só retângulos (desempenho)
    const caminhoSet = new Set(this.caminho || []);
    const paresCaminho = new Set();
    if (this.caminho) for (let i = 1; i < this.caminho.length; i++) paresCaminho.add([this.caminho[i - 1], this.caminho[i]].sort().join());
    // Faixas de geração no modo "gerações".
    this.gFaixas.replaceChildren();
    if (this.op.layout === 'generations') {
      const gens = new Map();
      for (const n of nos.values()) gens.set(n.y, n.gen - this.L.minGen + 1);
      for (const [y, gnum] of gens) {
        this.gFaixas.append(s('rect', { class: 'faixa-geracao', x: this.limites.x0 - 140, y: y - 12, width: this.limites.x1 - this.limites.x0 + 180, height: tam.h + 24, rx: 8 }));
        this.gFaixas.append(s('text', { class: 'rotulo-geracao', x: this.limites.x0 - 130, y: y + tam.h / 2 + 4, text: `${gnum}ª geração` }));
      }
    }
    // Arestas
    const fr = document.createDocumentFragment();
    const radial = this.op.layout === 'radial' || this.op.layout === 'network';
    const horiz = this.op.layout === 'horizontal';
    const centro = (id) => { const n = nos.get(id); return { x: n.x + tam.w / 2, y: n.y + tam.h / 2 }; };
    let nArestas = 0;
    for (const a of this.arestas) {
      const ids = a.tipo === 'filiacao' ? [...a.pais, a.b] : [a.a, a.b];
      const ns = ids.map((id) => nos.get(id));
      if (ns.some((n) => !n)) continue;
      const bx0 = Math.min(...ns.map((n) => n.x)), bx1 = Math.max(...ns.map((n) => n.x)) + tam.w, by0 = Math.min(...ns.map((n) => n.y)), by1 = Math.max(...ns.map((n) => n.y)) + tam.h;
      if (bx1 < vis.x0 || bx0 > vis.x1 || by1 < vis.y0 || by0 > vis.y1) continue;
      let d;
      let cls = 'aresta';
      if (a.tipo === 'filiacao') {
        const pa = a.pais.map(centro), c = centro(a.b);
        const origem = { x: pa.reduce((s2, p) => s2 + p.x, 0) / pa.length, y: pa.reduce((s2, p) => s2 + p.y, 0) / pa.length };
        if (radial) d = `M${origem.x},${origem.y} L${c.x},${c.y}`;
        else if (horiz) { const sx = origem.x + (pa.length === 1 ? tam.w / 2 : 0), ex = c.x - tam.w / 2, mx = (sx + ex) / 2; d = `M${sx},${origem.y} H${mx} V${c.y} H${ex}`; }
        else { const sy = origem.y + (pa.length === 1 ? tam.h / 2 : 0), ey = c.y - tam.h / 2, my = ey - Math.min(tam.gy / 2, (ey - sy) / 2); d = `M${origem.x},${sy} V${my} H${c.x} V${ey}`; }
        cls += ` ${a.r.type === 'guardian' ? 'guardian' : a.r.subtype}`;
        if (a.r.status === 'hypothesis' || a.r2?.status === 'hypothesis') cls += ' hypothesis';
        if (a.r.status === 'contested' || a.r2?.status === 'contested') cls += ' contested';
        if (this.caminho && a.pais.some((p) => paresCaminho.has([p, a.b].sort().join()))) cls += ' destaque';
      } else {
        const p1 = centro(a.a), p2 = centro(a.b);
        if (radial) d = `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
        else if (horiz) d = `M${p1.x},${p1.y + (p1.y < p2.y ? tam.h / 2 : -tam.h / 2)} L${p2.x},${p2.y + (p1.y < p2.y ? -tam.h / 2 : tam.h / 2)}`;
        else { const [e, dd] = p1.x < p2.x ? [p1, p2] : [p2, p1]; d = `M${e.x + tam.w / 2},${e.y} L${dd.x - tam.w / 2},${dd.y}`; }
        cls += a.tipo === 'conjuge' ? ` conjuge${a.r.end_date ? ' encerrado' : ''}` : ' irmao';
        if (a.r.status === 'hypothesis') cls += ' hypothesis';
        if (this.caminho && paresCaminho.has([a.a, a.b].sort().join())) cls += ' destaque';
      }
      if (this.sel && !ids.includes(this.sel) && !ids.every((id) => this.anc.has(id) || this.desc.has(id) || id === this.sel)) cls += ' esmaecida';
      fr.append(s('path', { d, class: cls }));
      nArestas++;
    }
    this.gArestas.replaceChildren(fr);
    // Nós
    const fn = document.createDocumentFragment();
    let nNos = 0;
    for (const n of nos.values()) {
      if (!dentro(n)) continue;
      fn.append(this.no(n, detalhe, caminhoSet));
      nNos++;
    }
    this.gNos.replaceChildren(fn);
    this.desenharAcoes();
    this.cb.aoDesenhar?.({ nos: nNos, total: nos.size, arestas: nArestas });
  }

  no(n, detalhe, caminhoSet) {
    const p = this.g.porId.get(n.id), tam = this.tam;
    let cls = 'no-pessoa';
    if (n.id === this.sel) cls += ' selecionado';
    else if (this.anc.has(n.id)) cls += ' ancestral';
    else if (this.desc.has(n.id)) cls += ' descendente';
    if (caminhoSet.has(n.id)) cls += ' caminho';
    if (p.restrito) cls += ' restrito';
    if (this.filtrado.has(n.id) || (this.sel && n.id !== this.sel && !this.anc.has(n.id) && !this.desc.has(n.id) && !this.relSel.has(n.id) && this.op.destaqueForte)) cls += ' esmaecido';
    const anosTxt = p.restrito ? '' : [p.birth_date ? (p.birth_qual !== 'exact' ? 'c. ' : '') + p.birth_date.slice(0, 4) : '', p.death_date ? p.death_date.slice(0, 4) : (p.living_status === 'deceased' ? '?' : '')].filter((x, i) => x || i === 0).join(' – ').replace(/^ – $/, '');
    const g = s('g', { class: cls, transform: `translate(${n.x},${n.y})`, 'data-id': n.id, role: 'button', 'aria-label': `${p.full_name}${anosTxt ? ', ' + anosTxt : ''}` });
    g.append(s('rect', { class: 'fundo-no', width: tam.w, height: tam.h, rx: 7 }));
    if (!detalhe) return g;
    g.append(s('rect', { class: `faixa-${p.sex || ''}`, width: 4, height: tam.h - 12, x: 6, y: 6, rx: 2 }));
    const maxc = Math.floor((tam.w - 40) / 7.1);
    g.append(s('text', { class: 'nome-no', x: 16, y: tam.h <= 40 ? 24 : 22, text: corta(p.full_name, maxc) }));
    if (this.op.densidade !== 'compacta' && tam.h > 40) {
      const local = p.birth_place?.municipality || '';
      g.append(s('text', { class: 'info-no-txt', x: 16, y: 40, text: corta([anosTxt, local].filter(Boolean).join(' · '), maxc + 4) }));
    }
    if (this.op.densidade === 'detalhada' && tam.h >= 80) {
      const rel = this.relSel.get(n.id);
      const linha3 = [rel ? ROT_REL(rel, p.sex) : '', p.apelidos?.length ? `“${p.apelidos[0]}”` : ''].filter(Boolean).join(' · ');
      if (linha3) g.append(s('text', { class: 'info-no-txt', x: 16, y: 58, text: corta(linha3, maxc + 4) }));
      const verif = { documented: 'Documentada', confirmed: 'Confirmada', contested: 'Contestada', hypothesis: 'Hipótese' }[p.verification];
      if (verif) g.append(s('text', { class: 'info-no-txt', x: 16, y: 73, text: verif }));
    }
    // Indicadores (com título para leitores de tela)
    let ix = tam.w - 18;
    const marcador = (nome, titulo, cor) => { const ic = icone(nome, 13, { x: ix, y: 6, stroke: cor }); ic.append(s('title', { text: titulo })); g.append(ic); ix -= 16; };
    if (p.verification === 'documented' || p.verification === 'confirmed') marcador('check', 'Informação verificada', 'var(--green)');
    if (p.verification === 'contested') marcador('alerta', 'Informação contestada', 'var(--red)');
    if (p.tem_documentos) marcador('clipe', `${p.tem_documentos} documento(s)`, 'var(--blue)');
    if (p.tem_correspondencia) marcador('correspondencia', 'Possível correspondência', 'var(--gold)');
    if (p.restrito) marcador('cadeado', 'Registro protegido', 'var(--muted)');
    if (this.op.recolhidos?.has(n.id)) { const t2 = s('text', { class: 'info-no-txt', x: tam.w - 14, y: tam.h - 6, text: '+' }); t2.append(s('title', { text: 'Ramo recolhido' })); g.append(t2); }
    return g;
  }

  // Botões ao redor do cartão selecionado: adicionar parentes e recolher ramo.
  desenharAcoes() {
    this.gAcoes.replaceChildren();
    const n = this.sel && this.L.nos.get(this.sel);
    if (!n || this.t.k < 0.5) return;
    const tam = this.tam, p = this.g.porId.get(n.id);
    const btn = (x, y, rot, acao, txt) => {
      const g = s('g', { class: 'botao-no', transform: `translate(${x},${y})`, role: 'button', tabindex: '-1', 'data-acao': acao });
      g.append(s('circle', { r: 11, fill: 'var(--surface)', stroke: 'var(--gold)', 'stroke-width': 1.5 }), s('text', { 'text-anchor': 'middle', y: 4, 'font-size': 13, fill: 'var(--gold)', 'font-weight': 700, text: txt }), s('title', { text: rot }));
      this.gAcoes.append(g);
    };
    const temFilhos = (this.L.idx.filhos.get(n.id) || []).length > 0;
    if (temFilhos) btn(n.x + tam.w - 12, n.y + tam.h + 2, this.op.recolhidos?.has(n.id) ? 'Expandir ramo' : 'Recolher ramo', 'recolher', this.op.recolhidos?.has(n.id) ? '+' : '−');
    if (!this.cb.podeEditar?.() || p.restrito) return;
    btn(n.x + tam.w / 2, n.y - 14, 'Adicionar pai ou mãe', 'parent', '+');
    btn(n.x + tam.w / 2, n.y + tam.h + 14, 'Adicionar filho(a)', 'child', '+');
    btn(n.x + tam.w + 14, n.y + tam.h / 2, 'Adicionar cônjuge', 'spouse', '♥');
    btn(n.x - 14, n.y + tam.h / 2, 'Adicionar irmão(ã)', 'sibling', '+');
  }

  // ---- Interação ----
  eventos() {
    const svg = this.svg;
    let arrasto = null, moveu = false;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ponteiros.size === 1) { arrasto = { x: e.clientX, y: e.clientY, tx: this.t.x, ty: this.t.y }; moveu = false; }
      if (this.ponteiros.size === 2) { const [a, b] = [...this.ponteiros.values()]; this.pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.t.k }; }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.ponteiros.has(e.pointerId)) return;
      this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ponteiros.size === 2 && this.pinca) {
        const [a, b] = [...this.ponteiros.values()];
        const r = svg.getBoundingClientRect();
        this.zoomEm(this.pinca.k * Math.hypot(a.x - b.x, a.y - b.y) / this.pinca.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, true);
        moveu = true;
        return;
      }
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moveu = true; svg.classList.add('arrastando'); }
      this.t.x = arrasto.tx + dx; this.t.y = arrasto.ty + dy;
      this.desenhar();
    });
    const fim = (e) => {
      this.ponteiros.delete(e.pointerId);
      if (this.ponteiros.size < 2) this.pinca = null;
      if (this.ponteiros.size === 0) { arrasto = null; svg.classList.remove('arrastando'); }
    };
    svg.addEventListener('pointerup', (e) => {
      const alvo = document.elementFromPoint(e.clientX, e.clientY);
      fim(e);
      if (moveu) return;
      const acao = alvo?.closest?.('.botao-no');
      if (acao) {
        if (acao.dataset.acao === 'recolher') this.cb.aoRecolher?.(this.sel);
        else this.cb.aoAdicionar?.(this.sel, acao.dataset.acao);
        return;
      }
      const no = alvo?.closest?.('.no-pessoa');
      if (no) {
        const agora = Date.now();
        if (this.ultimoClique?.id === no.dataset.id && agora - this.ultimoClique.t < 350) this.cb.aoAbrir?.(no.dataset.id);
        else this.cb.aoSelecionar?.(no.dataset.id);
        this.ultimoClique = { id: no.dataset.id, t: agora };
      }
    });
    svg.addEventListener('pointercancel', fim);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      this.zoomEm(this.t.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top, true);
    }, { passive: false });
    svg.addEventListener('keydown', (e) => this.tecla(e));
  }

  tecla(e) {
    const mover = (id) => { if (id) { e.preventDefault(); this.cb.aoSelecionar?.(id); this.centralizar(id, true); } };
    const { idx, nos } = this.L || {};
    if (!idx) return;
    const atual = this.sel;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(1.25); return; }
    if (e.key === '-') { e.preventDefault(); this.zoom(0.8); return; }
    if (e.key === '0') { e.preventDefault(); this.ajustar(); return; }
    if (!atual) { if (e.key.startsWith('Arrow')) mover([...nos.keys()][0]); return; }
    const vis = (lista) => (lista || []).map((x) => x.id).filter((id) => nos.has(id));
    const mesmaLinha = (dir) => {
      const n = nos.get(atual);
      const linha = [...nos.values()].filter((m) => Math.abs(m.y - n.y) < 1).sort((a, b) => a.x - b.x);
      const i = linha.findIndex((m) => m.id === atual);
      return linha[i + dir]?.id;
    };
    const horiz = this.op.layout === 'horizontal';
    if (e.key === (horiz ? 'ArrowLeft' : 'ArrowUp')) mover(vis(idx.pais.get(atual))[0]);
    else if (e.key === (horiz ? 'ArrowRight' : 'ArrowDown')) mover(vis(idx.filhos.get(atual))[0]);
    else if (e.key === (horiz ? 'ArrowUp' : 'ArrowLeft')) mover(mesmaLinha(-1));
    else if (e.key === (horiz ? 'ArrowDown' : 'ArrowRight')) mover(mesmaLinha(1));
    else if (e.key === 'Enter') { e.preventDefault(); this.cb.aoAbrir?.(atual); }
    else if (e.key.toLowerCase() === 'c') { e.preventDefault(); this.centralizar(atual, true); }
  }

  zoomEm(k, cx, cy, imediato) {
    k = Math.max(0.08, Math.min(3, k));
    const f = k / this.t.k;
    this.t.x = cx - (cx - this.t.x) * f; this.t.y = cy - (cy - this.t.y) * f; this.t.k = k;
    if (imediato) this.desenhar();
  }
  zoom(f) { this.animar(() => this.zoomEm(this.t.k * f, this.svg.clientWidth / 2, this.svg.clientHeight / 2)); }
  ajustar() {
    if (!this.limites) return;
    const w = this.svg.clientWidth || 800, hh = this.svg.clientHeight || 600, l = this.limites, m = 60;
    const k = Math.max(0.08, Math.min(1.2, Math.min((w - m * 2) / (l.x1 - l.x0 || 1), (hh - m * 2 - 60) / (l.y1 - l.y0 || 1))));
    this.animar(() => { this.t.k = k; this.t.x = (w - (l.x1 - l.x0) * k) / 2 - l.x0 * k; this.t.y = (hh - (l.y1 - l.y0) * k) / 2 - l.y0 * k + 20; });
  }
  centralizar(id, animar = true) {
    const n = this.L?.nos.get(id);
    if (!n) return;
    const w = this.svg.clientWidth || 800, hh = this.svg.clientHeight || 600;
    const k = Math.max(this.t.k, 0.7);
    const fazer = () => { this.t.k = k; this.t.x = w / 2 - (n.x + this.tam.w / 2) * k; this.t.y = hh / 2 - (n.y + this.tam.h / 2) * k; };
    animar ? this.animar(fazer) : (fazer(), this.desenhar());
  }
  // Transição suave (desligada com movimento reduzido).
  animar(fazer) {
    const de = { ...this.t };
    fazer();
    const para = { ...this.t };
    if (this.cb.semAnimacao?.()) { this.desenhar(); return; }
    const t0 = performance.now(), dur = 280;
    const passo = (agora) => {
      const p = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      this.t = { x: de.x + (para.x - de.x) * e, y: de.y + (para.y - de.y) * e, k: de.k + (para.k - de.k) * e };
      this.desenharAgora();
      if (p < 1) this.anim = requestAnimationFrame(passo);
    };
    cancelAnimationFrame(this.anim);
    this.anim = requestAnimationFrame(passo);
  }

  // SVG completo (sem virtualização) para baixar como imagem.
  exportarSVG() {
    const estilo = getComputedStyle(document.documentElement);
    const cor = (v) => estilo.getPropertyValue(v).trim();
    const salvo = { t: { ...this.t } };
    const l = this.limites, m = 40;
    this.t = { x: -l.x0 + m, y: -l.y0 + m, k: 1 };

    Object.defineProperty(this.svg, 'clientWidth', { value: l.x1 - l.x0 + m * 2, configurable: true });
    Object.defineProperty(this.svg, 'clientHeight', { value: l.y1 - l.y0 + m * 2, configurable: true });
    this.desenharAgora();
    const clone = this.svg.cloneNode(true);
    delete this.svg.clientWidth; delete this.svg.clientHeight;
    this.t = salvo.t; this.desenharAgora();

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', l.x1 - l.x0 + m * 2); clone.setAttribute('height', l.y1 - l.y0 + m * 2);
    clone.querySelectorAll('.botao-no').forEach((x) => x.remove());
    const css = `.fundo-no{fill:${cor('--surface')};stroke:${cor('--border-forte')}}.nome-no{fill:${cor('--text')};font:600 12.5px sans-serif}.info-no-txt{fill:${cor('--muted')};font:11px sans-serif}
      .faixa-M{fill:${cor('--blue')}}.faixa-F{fill:${cor('--gold')}}.faixa-,.faixa-X{fill:${cor('--muted')}}.aresta{fill:none;stroke:${cor('--muted')};stroke-width:1.5}
      .aresta.adoptive{stroke:${cor('--green')};stroke-dasharray:7 4}.aresta.legal,.aresta.guardian{stroke:${cor('--blue')};stroke-dasharray:2 4}.aresta.step,.aresta.foster{stroke:${cor('--purple')};stroke-dasharray:8 3 2 3}
      .aresta.hypothesis{stroke:${cor('--amber')};stroke-dasharray:3 3}.aresta.contested{stroke:${cor('--red')}}.aresta.conjuge{stroke:${cor('--gold')};stroke-width:2}.aresta.encerrado{stroke-dasharray:5 4}
      .faixa-geracao{fill:${cor('--surface-2')}}.rotulo-geracao{fill:${cor('--muted')};font:12px sans-serif}.esmaecido{opacity:.3}.esmaecida{opacity:.2}`;
    clone.insertBefore(s('style', { text: css }), clone.firstChild);
    clone.insertBefore(s('rect', { width: '100%', height: '100%', fill: cor('--bg') }), clone.firstChild.nextSibling);
    return new XMLSerializer().serializeToString(clone);
  }

  destruir() { this.ro.disconnect(); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.anim); this.svg.remove(); }
}

// Miniatura estática para o painel: pessoa em foco, 2 gerações acima e filhos.
export function miniArvore(g, foco, aoClicar) {
  const idx = indices(g);
  const ids = new Set([foco]);
  for (const a of percorrer(idx.pais, foco, 2)) ids.add(a);
  for (const f of percorrer(idx.filhos, foco, 1)) ids.add(f);
  for (const c of idx.conjuges.get(foco) || []) ids.add(c.id);
  const sub = { pessoas: g.pessoas.filter((p) => ids.has(p.id)), relacoes: g.relacoes, porId: g.porId };
  const L = calcularLayout(sub, { layout: 'vertical', densidade: 'compacta', foco: null, recolhidos: new Set() });
  const tam = TAMANHOS.compacta;
  const nos = [...L.nos.values()];
  const x0 = Math.min(...nos.map((n) => n.x)), y0 = Math.min(...nos.map((n) => n.y));
  const w = Math.max(...nos.map((n) => n.x)) - x0 + tam.w + 20, hh = Math.max(...nos.map((n) => n.y)) - y0 + tam.h + 20;
  const svg = s('svg', { viewBox: `${x0 - 10} ${y0 - 10} ${w} ${hh}`, width: '100%', class: 'mini-arvore', role: 'img', 'aria-label': `Resumo da árvore em torno de ${g.porId.get(foco)?.full_name}` });
  for (const r of g.relacoes) {
    const a = L.nos.get(r.person_a), b = L.nos.get(r.person_b);
    if (!a || !b) continue;
    if (r.type === 'parent') svg.append(s('path', { class: `aresta ${r.subtype}`, d: `M${a.x + tam.w / 2},${a.y + tam.h} V${b.y - tam.gy / 2} H${b.x + tam.w / 2} V${b.y}` }));
    else if (r.type === 'spouse' || r.type === 'partner') svg.append(s('line', { class: 'aresta conjuge', x1: a.x + tam.w, y1: a.y + tam.h / 2, x2: b.x, y2: b.y + tam.h / 2 }));
  }
  for (const n of nos) {
    const p = g.porId.get(n.id);
    const gg = s('g', { class: `no-pessoa ${n.id === foco ? 'selecionado' : ''} ${p.restrito ? 'restrito' : ''}`, transform: `translate(${n.x},${n.y})`, on: { click: () => aoClicar(n.id) } },
      s('rect', { class: 'fundo-no', width: tam.w, height: tam.h, rx: 6 }), s('rect', { class: `faixa-${p.sex || ''}`, width: 4, height: tam.h - 12, x: 6, y: 6, rx: 2 }),
      s('text', { class: 'nome-no', x: 16, y: 25, text: corta(p.full_name, 17) }), s('title', { text: p.full_name }));
    svg.append(gg);
  }
  return svg;
}
export { indices, geracoes, visiveis };
