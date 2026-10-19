// Árvores extensas: milhares de pessoas precisam continuar rápidas no servidor e no cálculo de layout.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciar, cliente } from './ajuda.js';

let srv, u, arvore;
const N = 3000;
before(async () => {
  srv = await iniciar();
  u = cliente(srv.base);
  await u.registrar('perf@exemplo.test');
  arvore = (await u.post('/api/trees', { name: 'Grande' })).dados.id;
  // Insere direto no banco: 3000 pessoas em ~11 gerações (cada casal com 2 filhos).
  const { db, uuid } = await import('../server/db.js');
  const ins = db.prepare(`INSERT INTO persons (id, full_name, sex, birth_date, living_status, search_norm, phonetic) VALUES (?,?,?,?, 'deceased', '', '')`);
  const tp = db.prepare('INSERT INTO tree_persons (tree_id, person_id) VALUES (?,?)');
  const rel = db.prepare(`INSERT INTO relationships (id, tree_id, person_a, person_b, type, subtype) VALUES (?,?,?,?,?, 'biological')`);
  const sobren = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo'];
  db.exec('BEGIN');
  const ids = [];
  for (let i = 0; i < N; i++) {
    const id = uuid(); ids.push(id);
    ins.run(id, `Pessoa ${i} ${sobren[i % 10]}`, i % 2 ? 'F' : 'M', String(1700 + Math.floor(Math.log2(i + 2)) * 25));
    tp.run(arvore, id);
  }
  // Casal i (2k, 2k+1) gera os filhos 2(2k)+2 e +3 (estrutura de heap).
  for (let k = 0; 2 * k + 1 < N; k++) {
    const a = ids[2 * k], b = ids[2 * k + 1];
    rel.run(uuid(), arvore, a, b, 'spouse');
    for (const f of [4 * k + 2, 4 * k + 3]) if (f < N) { rel.run(uuid(), arvore, a, ids[f], 'parent'); rel.run(uuid(), arvore, b, ids[f], 'parent'); }
  }
  db.exec('COMMIT');
});
after(() => srv.fechar());

const tempo = async (fn) => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };

test(`servidor responde rápido com ${N} pessoas`, async () => {
  const [g, tg] = await tempo(() => u.get(`/api/trees/${arvore}/graph`));
  assert.equal(g.dados.pessoas.length, N);
  const [d, td] = await tempo(() => u.get(`/api/trees/${arvore}/dashboard`));
  assert.equal(d.dados.indicadores.pessoas, N);
  assert.ok(d.dados.indicadores.geracoes >= 10);
  const [s, ts] = await tempo(() => u.get('/api/search?q=pessoa%2012%20sousa'));
  assert.ok(s.dados.total > 0);
  const ids = g.dados.pessoas.map((p) => p.id);
  const [k, tk] = await tempo(() => u.get(`/api/trees/${arvore}/kinship?a=${ids[N - 1]}&b=${ids[N - 2]}`));
  assert.equal(k.status, 200);
  console.log(`grafo ${tg.toFixed(0)} ms · painel ${td.toFixed(0)} ms · busca ${ts.toFixed(0)} ms · parentesco ${tk.toFixed(0)} ms`);
  for (const t of [tg, td, ts, tk]) assert.ok(t < 5000, `operação lenta: ${t} ms`);
});

test('layout 2D (mesmo código do navegador) calcula milhares de nós', async () => {
  const { calcularLayout } = await import('../public/js/layout.js');
  const g = (await u.get(`/api/trees/${arvore}/graph`)).dados;
  g.porId = new Map(g.pessoas.map((p) => [p.id, p]));
  const filtros = { geracaoMin: '', geracaoMax: '', sobrenome: '', tipos: {}, ocultarFiltrados: false };
  for (const layout of ['vertical', 'radial', 'network']) {
    const t = performance.now();
    const L = calcularLayout(g, { layout, densidade: 'normal', foco: null, recolhidos: new Set(), filtros });
    const ms = performance.now() - t;
    assert.equal(L.nos.size, N);
    assert.ok([...L.nos.values()].every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)), `${layout}: coordenadas inválidas`);
    console.log(`layout ${layout}: ${ms.toFixed(0)} ms`);
    assert.ok(ms < 8000, `${layout} lento: ${ms} ms`);
  }
});
