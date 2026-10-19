// Cálculo de layout compartilhado entre 2D e 3D: gerações, ordenação com poucos cruzamentos e coordenadas.
import { sobrenome, normalizar } from './nomes.js';

// Índices de parentesco a partir das relações.
export function indices(g) {
  const pais = new Map(), filhos = new Map(), conjuges = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of g.relacoes) {
    if (r.type === 'parent' || r.type === 'guardian') { add(pais, r.person_b, { id: r.person_a, r }); add(filhos, r.person_a, { id: r.person_b, r }); }
    else if (r.type === 'spouse' || r.type === 'partner') { add(conjuges, r.person_a, { id: r.person_b, r }); add(conjuges, r.person_b, { id: r.person_a, r }); }
  }
  return { pais, filhos, conjuges };
}

export function percorrer(mapa, inicio, limite = Infinity) {
  const vistos = new Set();
  let fronteira = [inicio], n = 0;
  while (fronteira.length && n < limite) {
    const prox = [];
    for (const x of fronteira) for (const v of mapa.get(x) || []) if (!vistos.has(v.id) && v.id !== inicio) { vistos.add(v.id); prox.push(v.id); }
    fronteira = prox; n++;
  }
  return vistos;
}

// Pessoa passa nos filtros? (geração, sobrenome, tipo de vínculo)
export function passaFiltro(p, gen, filtros, idx) {
  if (filtros.geracaoMin !== '' && gen < Number(filtros.geracaoMin) - 1) return false;
  if (filtros.geracaoMax !== '' && gen > Number(filtros.geracaoMax) - 1) return false;
  if (filtros.sobrenome) {
    const alvo = normalizar(filtros.sobrenome);
    if (p.restrito || !normalizar(p.full_name).split(' ').some((t) => t.startsWith(alvo))) return false;
  }
  const tipos = filtros.tipos;
  const rels = (idx.pais.get(p.id) || []).map((x) => x.r);
  if (rels.length && rels.every((r) => !tipos[r.subtype] || (r.status === 'hypothesis' && !tipos.hypothesis))) return false;
  return true;
}

// Seleciona quem aparece conforme o modo (ascendentes, descendentes, linhagem) e ramos recolhidos.
export function visiveis(g, idx, { layout, foco, recolhidos }) {
  let ids;
  if (foco && (layout === 'ancestors' || layout === 'descendants' || layout === 'lineage')) {
    ids = new Set([foco]);
    if (layout !== 'descendants') for (const a of percorrer(idx.pais, foco)) ids.add(a);
    if (layout !== 'ancestors') {
      const desc = percorrer(idx.filhos, foco);
      for (const d of desc) ids.add(d);
      for (const id of [foco, ...desc]) for (const c of idx.conjuges.get(id) || []) ids.add(c.id);
    }
  } else ids = new Set(g.pessoas.map((p) => p.id));
  // Ramos recolhidos: esconde descendentes (e cônjuges deles).
  for (const r of recolhidos || []) {
    if (!ids.has(r)) continue;
    for (const d of percorrer(idx.filhos, r)) { ids.delete(d); for (const c of idx.conjuges.get(d) || []) if (!(idx.pais.get(c.id) || []).some((x) => ids.has(x.id))) ids.delete(c.id); }
  }
  return ids;
}

// Geração = maior distância de uma raiz; cônjuges alinhados na mesma geração.
export function geracoes(ids, idx) {
  const gen = new Map();
  const prof = (id, pilha) => {
    if (gen.has(id)) return gen.get(id);
    if (pilha.has(id)) return 0;
    pilha.add(id);
    const ps = (idx.pais.get(id) || []).filter((p) => ids.has(p.id) && p.r.type === 'parent');
    const v = ps.length ? 1 + Math.max(...ps.map((p) => prof(p.id, pilha))) : 0;
    pilha.delete(id);
    gen.set(id, v);
    return v;
  };
  for (const id of ids) prof(id, new Set());
  for (let it = 0; it < 6; it++) {
    let mudou = false;
    for (const id of ids) for (const c of idx.conjuges.get(id) || []) {
      if (!ids.has(c.id)) continue;
      const m = Math.max(gen.get(id), gen.get(c.id));
      if (gen.get(id) !== m) { gen.set(id, m); mudou = true; }
    }
    for (const id of ids) for (const p of idx.pais.get(id) || []) if (ids.has(p.id) && gen.get(id) <= gen.get(p.id)) { gen.set(id, gen.get(p.id) + 1); mudou = true; }
    if (!mudou) break;
  }
  return gen;
}

export const TAMANHOS = { compacta: { w: 150, h: 40, gx: 14, gy: 60 }, normal: { w: 190, h: 58, gx: 22, gy: 80 }, detalhada: { w: 220, h: 80, gx: 26, gy: 90 } };

export function calcularLayout(g, opcoes) {
  const idx = indices(g);
  const ids = visiveis(g, idx, opcoes);
  const gen = geracoes(ids, idx);
  // Radial e rede usam cartões compactos para caber mais pessoas na visão geral.
  const tam = ['radial', 'network'].includes(opcoes.layout) ? TAMANHOS.compacta : (TAMANHOS[opcoes.densidade] || TAMANHOS.normal);
  const ano = (id) => Number(g.porId.get(id)?.birth_date?.slice(0, 4)) || 9999;
  // Agrupa por geração em blocos de casais.
  const porGen = new Map();
  for (const id of ids) { const k = gen.get(id); if (!porGen.has(k)) porGen.set(k, []); porGen.get(k).push(id); }
  const gens = [...porGen.keys()].sort((a, b) => a - b);
  const blocosDe = (lista) => {
    const visto = new Set(), blocos = [];
    for (const id of lista.sort((a, b) => ano(a) - ano(b))) {
      if (visto.has(id)) continue;
      const bloco = [id]; visto.add(id);
      for (let i = 0; i < bloco.length; i++) for (const c of idx.conjuges.get(bloco[i]) || []) if (lista.includes(c.id) && !visto.has(c.id)) { visto.add(c.id); bloco.push(c.id); }
      // Quem tem pais na árvore fica à esquerda; cônjuges que entraram na família à direita.
      bloco.sort((a, b) => ((idx.pais.get(b) || []).some((p) => ids.has(p.id)) - (idx.pais.get(a) || []).some((p) => ids.has(p.id))) || ano(a) - ano(b));
      blocos.push(bloco);
    }
    return blocos;
  };
  const blocos = new Map(gens.map((k) => [k, blocosDe(porGen.get(k))]));
  const x = new Map();
  const posicionar = (k) => { let cx = 0; for (const b of blocos.get(k)) for (const id of b) { x.set(id, cx); cx += tam.w + tam.gx; } };
  gens.forEach(posicionar);
  const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);
  const bary = (id, dir) => media((dir === 'pais' ? idx.pais : idx.filhos).get(id)?.filter((v) => ids.has(v.id) && x.has(v.id)).map((v) => x.get(v.id)) || []);
  // Varreduras de baricentro (desce e sobe) para reduzir cruzamentos.
  for (let it = 0; it < 4; it++) {
    const ordem = it % 2 === 0 ? gens.slice(1) : gens.slice(0, -1).reverse();
    const dir = it % 2 === 0 ? 'pais' : 'filhos';
    for (const k of ordem) {
      const bs = blocos.get(k).map((b, i) => { const v = media(b.map((id) => bary(id, dir)).filter((v) => v !== null)); return { b, v: v ?? (b.length ? x.get(b[0]) : i), i }; });
      bs.sort((a, c) => a.v - c.v || a.i - c.i);
      blocos.set(k, bs.map((o) => o.b));
      posicionar(k);
    }
  }
  // Ajuste fino: aproxima cada bloco da média dos parentes sem sobrepor (preserva a ordem).
  const largura = (b) => b.length * (tam.w + tam.gx) - tam.gx;
  for (let it = 0; it < 6; it++) {
    const ordem = it % 2 === 0 ? gens : [...gens].reverse();
    for (const k of ordem) {
      const lista = blocos.get(k);
      const desejado = lista.map((b) => {
        const viz = b.flatMap((id) => [...(idx.pais.get(id) || []), ...(idx.filhos.get(id) || [])].filter((v) => ids.has(v.id)).map((v) => x.get(v.id) + tam.w / 2));
        const centro = media(viz);
        return centro === null ? x.get(b[0]) : centro - largura(b) / 2;
      });
      let fim = -Infinity;
      const pos = desejado.map((d, i) => { const v = Math.max(d, fim); fim = v + largura(lista[i]) + tam.gx * 2; return v; });
      // Passa da direita para a esquerda para equilibrar.
      for (let i = pos.length - 2; i >= 0; i--) {
        const limite = pos[i + 1] - largura(lista[i]) - tam.gx * 2;
        if (pos[i] > limite) pos[i] = limite;
        else pos[i] = Math.min(Math.max(pos[i], desejado[i]), limite);
      }
      lista.forEach((b, i) => b.forEach((id, j) => x.set(id, pos[i] + j * (tam.w + tam.gx))));
    }
  }
  const minGen = gens[0] ?? 0;
  const nos = new Map();
  for (const id of ids) nos.set(id, { id, x: x.get(id), y: (gen.get(id) - minGen) * (tam.h + tam.gy), gen: gen.get(id) });
  // Modos alternativos de coordenadas.
  const L = opcoes.layout;
  if (L === 'horizontal') for (const n of nos.values()) [n.x, n.y] = [n.y * ((tam.w + tam.gy) / (tam.h + tam.gy)), n.x * ((tam.h + tam.gx * 1.5) / (tam.w + tam.gx))];
  if (L === 'radial') {
    // Anéis por geração; o raio cresce para caber todos os cartões sem sobrepor.
    const xs = [...nos.values()].map((n) => n.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 1;
    const porAnel = new Map();
    for (const n of nos.values()) porAnel.set(n.gen, (porAnel.get(n.gen) || 0) + 1);
    const passo = tam.w * 1.35;
    let rAnterior = 0;
    const raio = new Map();
    for (const gnum of [...porAnel.keys()].sort((a, b) => a - b)) {
      const precisa = (porAnel.get(gnum) * (tam.w + tam.gx * 2)) / (Math.PI * 1.8);
      const r = porAnel.get(gnum) === 1 && rAnterior === 0 ? 0 : Math.max(rAnterior + passo, precisa);
      raio.set(gnum, r); rAnterior = r;
    }
    for (const n of nos.values()) {
      const ang = ((n.x - minX) / (maxX - minX)) * Math.PI * 1.9 - Math.PI / 2;
      const r = raio.get(n.gen);
      n.x = Math.cos(ang) * r - tam.w / 2; n.y = Math.sin(ang) * r - tam.h / 2; n.ang = ang;
    }
    // Resolve sobreposições restantes no mesmo anel empurrando ao longo do círculo.
    for (const gnum of raio.keys()) {
      const anel = [...nos.values()].filter((n) => n.gen === gnum).sort((a, b) => a.ang - b.ang);
      const r = raio.get(gnum);
      if (r === 0) continue;
      const minAng = (tam.w + tam.gx) / r;
      for (let i = 1; i < anel.length; i++) if (anel[i].ang - anel[i - 1].ang < minAng) anel[i].ang = anel[i - 1].ang + minAng;
      for (const n of anel) { n.x = Math.cos(n.ang) * r - tam.w / 2; n.y = Math.sin(n.ang) * r - tam.h / 2; }
    }
  }
  if (L === 'network') forcas(nos, g, ids, tam);
  return { nos, idx, gen, ids, tam, minGen };
}

// Rede de relações: simulação de forças simples (molas + repulsão por grade).
function forcas(nos, g, ids, tam, iter = 120) {
  const lista = [...nos.values()];
  if (lista.length > 1500) return; // grande demais: mantém o layout por gerações
  const arestas = g.relacoes.filter((r) => ids.has(r.person_a) && ids.has(r.person_b)).map((r) => [nos.get(r.person_a), nos.get(r.person_b), r.type === 'parent' ? 1 : 0.6]);
  for (const n of lista) { n.vx = 0; n.vy = 0; n.x *= 0.6; n.y *= 0.9; }
  const dist = tam.w * 1.4, cel = dist * 2;
  for (let it = 0; it < iter; it++) {
    const grade = new Map();
    for (const n of lista) { const k = `${Math.floor(n.x / cel)},${Math.floor(n.y / cel)}`; if (!grade.has(k)) grade.set(k, []); grade.get(k).push(n); }
    for (const n of lista) {
      const cx = Math.floor(n.x / cel), cy = Math.floor(n.y / cel);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const m of grade.get(`${cx + dx},${cy + dy}`) || []) {
        if (m === n) continue;
        let ddx = n.x - m.x, ddy = n.y - m.y;
        const d2 = ddx * ddx + ddy * ddy || 1;
        if (d2 > cel * cel) continue;
        const f = (dist * dist) / d2 * 0.08;
        n.vx += ddx * f; n.vy += ddy * f;
      }
    }
    for (const [a, b, k] of arestas) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const f = ((d - dist) / d) * 0.05 * k;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    const amort = 0.85 * (1 - it / iter);
    for (const n of lista) { n.x += Math.max(-50, Math.min(50, n.vx)) * amort; n.y += Math.max(-50, Math.min(50, n.vy)) * amort; n.vx *= 0.5; n.vy *= 0.5; }
  }
}

export const rotuloSobrenome = (p) => sobrenome(p.full_name);
