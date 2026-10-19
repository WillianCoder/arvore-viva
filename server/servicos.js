// Regras de domínio compartilhadas pelas rotas: locais, privacidade, carga da árvore.
import { all, get, run, uuid } from './db.js';
import { pode, texto, opcao } from './acesso.js';
import { normalizar, fonetico } from './lib/nomes.js';
import { erro } from './http.js';

// ---- Locais ----
export function salvarLocal(l) {
  if (!l || typeof l !== 'object') return null;
  const municipality = texto(l.municipality, { campo: 'Município', max: 120 });
  const state = texto(l.state, { campo: 'Estado', max: 120 });
  const country = texto(l.country, { campo: 'País', max: 120 });
  const name = texto(l.name, { campo: 'Local', max: 250 }) || [municipality, state, country].filter(Boolean).join(', ');
  if (!name) return null;
  const num = (v, min, max) => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : (() => { throw erro(400, 'Coordenada inválida.'); })()));
  const lat = num(l.lat, -90, 90), lng = num(l.lng, -180, 180);
  const precision = opcao(l.precision, ['exact', 'city', 'region', 'country', 'unknown'], lat !== null ? 'city' : 'unknown', 'Precisão');
  const norm = normalizar([name, municipality, state, country].join('|'));
  const ex = get('SELECT * FROM places WHERE norm = ?', norm);
  if (ex) {
    if (lat !== null && ex.lat === null) run('UPDATE places SET lat=?, lng=?, precision=? WHERE id=?', lat, lng, precision, ex.id);
    return ex.id;
  }
  const id = uuid();
  run('INSERT INTO places (id,name,municipality,state,country,lat,lng,precision,norm) VALUES (?,?,?,?,?,?,?,?,?)', id, name, municipality, state, country, lat, lng, precision, norm);
  return id;
}
export const local = (id) => (id ? get('SELECT id,name,municipality,state,country,lat,lng,precision FROM places WHERE id = ?', id) : null);

// ---- Privacidade ----
// Pessoas vivas ou privadas aparecem restritas para quem não é editor (exceto quem as cadastrou).
export function restrita(p, papel, userId) {
  return (p.living_status === 'living' || p.visibility === 'private') && !pode(papel, 'editor') && p.created_by !== userId;
}

export function indexarBusca(personId) {
  const p = get('SELECT full_name, birth_name FROM persons WHERE id = ?', personId);
  if (!p) return;
  const alt = all('SELECT name FROM person_names WHERE person_id = ?', personId).map((r) => r.name);
  const todos = [p.full_name, p.birth_name, ...alt].filter(Boolean);
  run('UPDATE persons SET search_norm = ?, phonetic = ? WHERE id = ?', todos.map(normalizar).join(' | '), todos.map(fonetico).join(' | '), personId);
}

// Resumo da pessoa para cartões e listas (sem identificadores).
export function serializarPessoa(p, papel, userId, extras = {}) {
  if (restrita(p, papel, userId)) {
    return { id: p.id, restrito: true, full_name: p.living_status === 'living' ? 'Pessoa viva (privado)' : 'Registro privado', living_status: p.living_status, sex: '', ...extras };
  }
  return {
    id: p.id, full_name: p.full_name, birth_name: p.birth_name, sex: p.sex, bio: p.bio,
    living_status: p.living_status, visibility: p.visibility, verification: p.verification,
    birth_date: p.birth_date, birth_qual: p.birth_qual, birth_place: local(p.birth_place_id),
    death_date: p.death_date, death_qual: p.death_qual, death_place: local(p.death_place_id),
    photo_document_id: p.photo_document_id, is_demo: !!p.is_demo, created_by: p.created_by,
    created_at: p.created_at, updated_at: p.updated_at, ...extras,
  };
}

// Carrega pessoas e relações de uma árvore com indicadores para os cartões.
export function carregarArvore(treeId, papel, userId) {
  const pessoas = all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id
    WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, treeId);
  const rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', treeId);
  const docs = new Map(all(`SELECT dl.person_id, COUNT(*) n FROM document_links dl JOIN documents d ON d.id = dl.document_id
    WHERE d.tree_id = ? AND d.deleted_at IS NULL AND dl.person_id IS NOT NULL GROUP BY dl.person_id`, treeId).map((r) => [r.person_id, r.n]));
  const matches = new Set(all(`SELECT person_a, person_b FROM match_candidates WHERE tree_id = ? AND status IN ('pending','later')`, treeId).flatMap((r) => [r.person_a, r.person_b]));
  const apelidos = new Map();
  for (const n of all(`SELECT pn.person_id, pn.name FROM person_names pn JOIN tree_persons tp ON tp.person_id = pn.person_id WHERE tp.tree_id = ? AND pn.kind = 'nickname'`, treeId)) {
    if (!apelidos.has(n.person_id)) apelidos.set(n.person_id, []);
    apelidos.get(n.person_id).push(n.name);
  }
  const lista = pessoas.map((p) => {
    const ext = { tem_documentos: docs.get(p.id) || 0, tem_correspondencia: matches.has(p.id) };
    if (!restrita(p, papel, userId)) ext.apelidos = apelidos.get(p.id) || [];
    return serializarPessoa(p, papel, userId, ext);
  });
  return { pessoas: lista, relacoes: rels.map(serializarRelacao), brutas: pessoas, rels };
}

export const serializarRelacao = (r) => ({
  id: r.id, person_a: r.person_a, person_b: r.person_b, type: r.type, subtype: r.subtype, status: r.status,
  start_date: r.start_date, end_date: r.end_date, end_reason: r.end_reason, notes: r.notes, created_by: r.created_by,
});
