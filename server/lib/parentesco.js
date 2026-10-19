// Cálculo de parentesco: encontra ancestrais comuns e explica o caminho em português.
export function montarGrafo(rels) {
  const pais = new Map(), filhos = new Map(), conjuges = new Map(), irmaos = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of rels) {
    if (r.deleted_at) continue;
    const info = { rel: r.id, subtype: r.subtype, status: r.status, type: r.type };
    if (r.type === 'parent' || r.type === 'guardian') {
      add(pais, r.person_b, { id: r.person_a, ...info });
      add(filhos, r.person_a, { id: r.person_b, ...info });
    } else if (r.type === 'spouse' || r.type === 'partner') {
      add(conjuges, r.person_a, { id: r.person_b, ...info });
      add(conjuges, r.person_b, { id: r.person_a, ...info });
    } else if (r.type === 'sibling') {
      add(irmaos, r.person_a, { id: r.person_b, ...info });
      add(irmaos, r.person_b, { id: r.person_a, ...info });
    }
  }
  return { pais, filhos, conjuges, irmaos };
}

// Todos os ancestrais com distância e caminho (BFS; guarda até 3 caminhos por ancestral).
function ancestrais(g, inicio, limite = 30) {
  const res = new Map([[inicio, [{ dist: 0, caminho: [{ id: inicio }] }]]]);
  let fronteira = [{ id: inicio, dist: 0, caminho: [{ id: inicio }] }];
  while (fronteira.length) {
    const prox = [];
    for (const n of fronteira) {
      if (n.dist >= limite) continue;
      for (const p of g.pais.get(n.id) || []) {
        if (p.type !== 'parent') continue; // tutela não gera parentesco consanguíneo/legal
        if (n.caminho.some((c) => c.id === p.id)) continue; // evita ciclos
        const item = { dist: n.dist + 1, caminho: [...n.caminho, { id: p.id, via: p }] };
        const lista = res.get(p.id) || [];
        if (lista.length >= 3) continue;
        lista.push(item);
        res.set(p.id, lista);
        prox.push({ id: p.id, ...item });
      }
    }
    fronteira = prox;
  }
  return res;
}

const ROT_SUB = { legal: 'legal', adoptive: 'adotivo', step: 'de criação', foster: 'acolhimento' };
const F = (sexo, m, f, x) => (sexo === 'F' ? f : sexo === 'M' ? m : x);
const ORD = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo'];

function nomeAscendente(n, s) {
  if (n === 1) return F(s, 'pai', 'mãe', 'genitor(a)');
  const base = ['', '', 'avô', 'bisavô', 'trisavô', 'tetravô'];
  const basef = ['', '', 'avó', 'bisavó', 'trisavó', 'tetravó'];
  if (n <= 5) return F(s, base[n], basef[n], `${base[n]}/${basef[n]}`);
  return `ancestral direto (${n} gerações acima)`;
}
function nomeDescendente(n, s) {
  if (n === 1) return F(s, 'filho', 'filha', 'filho(a)');
  const base = ['', '', 'neto', 'bisneto', 'trineto', 'tetraneto'];
  if (n <= 5) return F(s, base[n], base[n].replace(/o$/, 'a'), `${base[n]}(a)`);
  return `descendente direto (${n} gerações abaixo)`;
}

// da = gerações de A até o ancestral comum; db = de B até ele. Descreve o que A é de B.
export function descrever(da, db, sexoA, meio = false) {
  if (da === 0) return nomeAscendente(db, sexoA);
  if (db === 0) return nomeDescendente(da, sexoA);
  if (da === 1 && db === 1) return (meio ? F(sexoA, 'meio-irmão', 'meia-irmã', 'meio-irmão(ã)') : F(sexoA, 'irmão', 'irmã', 'irmão(ã)'));
  if (da === 1) {
    const sufixo = ['', '', '', '-avô', '-bisavô', '-trisavô'][db] || ` (${db - 1} gerações acima)`;
    return F(sexoA, 'tio', 'tia', 'tio(a)') + (db > 2 ? sufixo.replace('avô', F(sexoA, 'avô', 'avó', 'avô')) : '');
  }
  if (db === 1) {
    const sufixo = ['', '', '', '-neto', '-bisneto', '-trineto'][da] || ` (${da - 1} gerações abaixo)`;
    return F(sexoA, 'sobrinho', 'sobrinha', 'sobrinho(a)') + (da > 2 ? (sexoA === 'F' ? sufixo.replace(/o$/, 'a') : sufixo) : '');
  }
  const grau = Math.min(da, db) - 1;
  const afast = Math.abs(da - db);
  let t = `${F(sexoA, 'primo', 'prima', 'primo(a)')} de ${ORD[grau] || grau + 'º'} grau`;
  if (afast) t += `, afastado${sexoA === 'F' ? 'a' : ''} ${afast} ${afast === 1 ? 'geração' : 'gerações'}`;
  return t;
}

// Afinidade (cônjuges e parentes do cônjuge) quando não há ancestral comum.
function afinidade(g, a, b, sexoA) {
  const ids = (m, k) => (m.get(k) || []).map((x) => x.id);
  if (ids(g.conjuges, a).includes(b)) return F(sexoA, 'cônjuge/parceiro', 'cônjuge/parceira', 'cônjuge/parceiro(a)');
  const conjB = ids(g.conjuges, b), conjA = ids(g.conjuges, a);
  if (conjB.some((c) => ids(g.pais, c).includes(a))) return F(sexoA, 'sogro', 'sogra', 'sogro(a)');
  if (conjA.some((c) => ids(g.pais, c).includes(b))) return F(sexoA, 'genro', 'nora', 'genro/nora');
  if (ids(g.pais, b).some((p) => conjA.includes(p)) && !ids(g.pais, b).includes(a)) return F(sexoA, 'padrasto', 'madrasta', 'padrasto/madrasta');
  if (ids(g.pais, a).some((p) => conjB.includes(p)) && !ids(g.pais, a).includes(b)) return F(sexoA, 'enteado', 'enteada', 'enteado(a)');
  const irmaosDe = (x) => {
    const s = new Set(ids(g.irmaos, x));
    for (const p of ids(g.pais, x)) for (const f of ids(g.filhos, p)) if (f !== x) s.add(f);
    return s;
  };
  if (conjB.some((c) => irmaosDe(c).has(a)) || [...irmaosDe(b)].some((i) => ids(g.conjuges, i).includes(a))) return F(sexoA, 'cunhado', 'cunhada', 'cunhado(a)');
  if (ids(g.irmaos, a).includes(b)) return F(sexoA, 'irmão (declarado, sem pais registrados)', 'irmã (declarada, sem pais registrados)', 'irmão(ã) declarado(a)');
  return null;
}

// Caminho mais curto por qualquer vínculo (para mostrar como estão conectados).
function caminhoQualquer(g, a, b, limite = 40) {
  const viz = (x) => [
    ...(g.pais.get(x) || []).map((v) => ({ ...v, rot: 'filho(a) de' })),
    ...(g.filhos.get(x) || []).map((v) => ({ ...v, rot: 'genitor(a) de' })),
    ...(g.conjuges.get(x) || []).map((v) => ({ ...v, rot: 'cônjuge de' })),
    ...(g.irmaos.get(x) || []).map((v) => ({ ...v, rot: 'irmão(ã) de' })),
  ];
  const ant = new Map([[a, null]]);
  let fila = [a], passos = 0;
  while (fila.length && passos < limite) {
    const prox = [];
    for (const x of fila) {
      for (const v of viz(x)) {
        if (ant.has(v.id)) continue;
        ant.set(v.id, { de: x, via: v });
        if (v.id === b) {
          const c = [];
          let cur = b;
          while (cur !== a) { const e = ant.get(cur); c.unshift({ id: cur, rotulo: e.via.rot, rel: e.via.rel, status: e.via.status }); cur = e.de; }
          return [{ id: a }, ...c];
        }
        prox.push(v.id);
      }
    }
    fila = prox; passos++;
  }
  return null;
}

export function calcularParentesco(pessoas, rels, a, b) {
  if (a === b) return { indeterminado: false, resultados: [{ descricao: 'mesma pessoa', caminho: [{ id: a }] }] };
  const g = montarGrafo(rels);
  const sexoA = pessoas.get(a)?.sex || '';
  const ancA = ancestrais(g, a), ancB = ancestrais(g, b);
  const comuns = [...ancA.keys()].filter((k) => ancB.has(k));
  // Mantém só os ancestrais comuns mais próximos (não ancestrais de outro comum).
  const minimos = comuns.filter((c) => !comuns.some((o) => o !== c && ancA.get(o)[0].dist < ancA.get(c)[0].dist && ancestrais(g, o, 30).has(c)));
  const resultados = [];
  const vistos = new Set();
  for (const c of minimos) {
    const da = ancA.get(c)[0].dist, db = ancB.get(c)[0].dist;
    // Meio-irmãos: só um genitor em comum.
    let meio = false;
    if (da === 1 && db === 1) {
      const pa = new Set((g.pais.get(a) || []).filter((p) => p.type === 'parent').map((p) => p.id));
      const pb = (g.pais.get(b) || []).filter((p) => p.type === 'parent').map((p) => p.id);
      meio = pb.filter((p) => pa.has(p)).length === 1 && pa.size >= 2 && pb.length >= 2;
    }
    const descricao = descrever(da, db, sexoA, meio);
    const chave = `${descricao}:${da}:${db}`;
    // Casal de ancestrais gera o mesmo parentesco duas vezes: agrupa.
    const existente = resultados.find((r) => r.chave === chave);
    const caminhoA = ancA.get(c)[0].caminho;
    const caminhoB = ancB.get(c)[0].caminho;
    // Sobe de A até o ancestral e desce até B.
    const sub = (v) => (v && v.subtype && v.subtype !== 'unknown' && v.subtype !== 'biological' ? ` (${ROT_SUB[v.subtype]})` : '');
    const caminho = caminhoA.map((n, i) => (i === 0 ? { id: n.id } : { id: n.id, rotulo: 'filho(a) de' + sub(n.via), rel: n.via.rel, status: n.via.status }));
    for (let i = caminhoB.length - 2; i >= 0; i--) {
      const via = caminhoB[i + 1].via;
      caminho.push({ id: caminhoB[i].id, rotulo: 'genitor(a) de' + sub(via), rel: via.rel, status: via.status });
    }
    const vias = [...caminhoA, ...caminhoB].map((n) => n.via).filter(Boolean);
    const avisos = [];
    if (vias.some((v) => v.subtype === 'adoptive')) avisos.push('inclui vínculo adotivo');
    if (vias.some((v) => v.subtype === 'step' || v.subtype === 'foster')) avisos.push('inclui vínculo de criação/afinidade');
    if (vias.some((v) => v.status === 'hypothesis' || v.status === 'contested')) avisos.push('inclui vínculo não confirmado ou contestado');
    if (existente) { existente.ancestrais.push(c); continue; }
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultados.push({ chave, descricao, geracoes: { a: da, b: db }, ancestrais: [c], caminho, avisos });
  }
  if (resultados.length) return { indeterminado: false, resultados };
  const af = afinidade(g, a, b, sexoA);
  const cam = caminhoQualquer(g, a, b);
  if (af) return { indeterminado: false, resultados: [{ descricao: af, tipo: 'afinidade', caminho: cam || [], avisos: [] }] };
  return { indeterminado: true, caminho: cam, motivo: cam ? 'Há uma ligação entre os registros, mas ela não corresponde a um parentesco nomeável.' : 'Os dados disponíveis não ligam estas duas pessoas.' };
}

// Gerações relativas (0 = raiz mais antiga) para estatísticas e layout.
export function contarGeracoes(ids, rels) {
  const g = montarGrafo(rels);
  const memo = new Map();
  const prof = (id, pilha = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (pilha.has(id)) return 0;
    pilha.add(id);
    const ps = (g.pais.get(id) || []).filter((p) => p.type === 'parent');
    const v = ps.length ? 1 + Math.max(...ps.map((p) => prof(p.id, pilha))) : 0;
    pilha.delete(id);
    memo.set(id, v);
    return v;
  };
  let max = -1;
  for (const id of ids) max = Math.max(max, prof(id));
  return { geracoes: max + 1, profundidade: memo };
}
