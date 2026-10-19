// Importação (com prévia e confirmação) e exportação (respeitando permissões e privacidade).
import { all, get, run, tx, uuid } from '../db.js';
import { erro } from '../http.js';
import { papelNaArvore, pode, auditar, texto, opcao, exigirUuid } from '../acesso.js';
import { salvarLocal, local, restrita, indexarBusca } from '../servicos.js';
import { interpretarGedcom, escreverGedcom } from '../lib/gedcom.js';
import { lerCsv, escreverCsv } from '../lib/csv.js';
import { ano } from '../lib/nomes.js';
import { buscarDuplicidades } from './pessoas.js';
import { decifrarTexto } from '../lib/seguranca.js';
import { montarGrafo } from '../lib/parentesco.js';

const MAX_IMPORT = 8 * 1024 * 1024;
export const CAMPOS_CSV = ['ref', 'full_name', 'birth_name', 'sex', 'birth_date', 'birth_place', 'death_date', 'death_place', 'living_status', 'father_ref', 'mother_ref', 'spouse_ref', 'nicknames', 'notes'];
const SUGESTAO = { ref: ['id', 'ref', 'codigo', 'código'], full_name: ['nome', 'nome completo', 'name', 'full_name'], birth_name: ['nome de nascimento', 'birth_name'], sex: ['sexo', 'sex', 'genero', 'gênero'],
  birth_date: ['nascimento', 'data de nascimento', 'birth_date', 'birth'], birth_place: ['local de nascimento', 'naturalidade', 'birth_place'], death_date: ['falecimento', 'data de falecimento', 'obito', 'óbito', 'death_date'],
  death_place: ['local de falecimento', 'death_place'], living_status: ['situacao', 'situação', 'vivo', 'living_status'], father_ref: ['pai', 'pai_id', 'father', 'father_ref'], mother_ref: ['mae', 'mãe', 'mae_id', 'mother', 'mother_ref'],
  spouse_ref: ['conjuge', 'cônjuge', 'conjuge_id', 'spouse', 'spouse_ref'], nicknames: ['apelidos', 'apelido', 'nicknames'], notes: ['observacoes', 'observações', 'notas', 'notes'] };

// Datas em CSV: AAAA, AAAA-MM-DD, DD/MM/AAAA, "c. 1920" / "aprox. 1920".
function dataLivre(v) {
  const s = String(v || '').trim();
  if (!s) return { date: '', qual: 'exact' };
  let qual = 'exact', r = s;
  if (/^(c\.|ca\.|aprox\.?|cerca de|~)\s*/i.test(r)) { qual = 'about'; r = r.replace(/^(c\.|ca\.|aprox\.?|cerca de|~)\s*/i, ''); }
  let m = r.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, qual };
  m = r.match(/^\d{4}(-\d{2}(-\d{2})?)?$/);
  if (m) return { date: r, qual };
  return { date: '', qual, invalida: s };
}
const lugarTexto = (s) => { const p = String(s || '').split(',').map((x) => x.trim()).filter(Boolean); return p.length ? { name: p.join(', '), municipality: p[0], state: p.length > 2 ? p[1] : '', country: p.length > 1 ? p[p.length - 1] : '' } : null; };

// Converte qualquer formato para { pessoas, relacoes, avisos, erros }.
function interpretar(formato, conteudo, mapeamento) {
  if (typeof conteudo !== 'string' || !conteudo.trim()) throw erro(400, 'Arquivo vazio.');
  if (Buffer.byteLength(conteudo) > MAX_IMPORT) throw erro(413, 'Arquivo maior que 8 MB.');
  const avisos = [], erros = [];
  let pessoas = [], relacoes = [], eventos = [];
  if (formato === 'gedcom') {
    if (!/^﻿?\s*0\s+HEAD/.test(conteudo)) throw erro(400, 'Não parece um arquivo GEDCOM (falta o cabeçalho "0 HEAD").');
    const g = interpretarGedcom(conteudo);
    avisos.push(...g.avisos);
    pessoas = g.pessoas.map((p) => ({ ref: p.ref, full_name: p.full_name, sex: p.sex, birth_date: p.birth?.date || '', birth_qual: p.birth?.qual || 'exact', birth_place: p.birth?.place || null,
      death_date: p.death?.date || '', death_qual: p.death?.qual || 'exact', death_place: p.death?.place || null, living_status: p.living_status, nicknames: p.nicknames, notes: p.notes, famc: p.famc }));
    const porRef = new Map(pessoas.map((p) => [p.ref, p]));
    for (const f of g.familias) {
      if (f.husb && f.wife) relacoes.push({ a: f.husb, b: f.wife, type: 'spouse', subtype: 'unknown', start_date: f.marr?.date || '', end_reason: f.div ? 'divórcio' : '' });
      for (const c of f.chil) {
        const pedi = porRef.get(c)?.famc.find((x) => x.fam === f.ref)?.pedi || '';
        const subtype = pedi === 'adopted' ? 'adoptive' : pedi === 'foster' ? 'foster' : pedi === 'birth' ? 'biological' : 'biological';
        for (const genitor of [f.husb, f.wife]) if (genitor) relacoes.push({ a: genitor, b: c, type: 'parent', subtype });
      }
    }
  } else if (formato === 'csv') {
    const { cabecalho, linhas } = lerCsv(conteudo);
    if (!cabecalho.length) throw erro(400, 'CSV sem cabeçalho.');
    const mapa = {};
    for (const campo of CAMPOS_CSV) {
      const escolhido = mapeamento?.[campo];
      const idx = escolhido !== undefined && escolhido !== '' ? cabecalho.indexOf(escolhido) : cabecalho.findIndex((h) => SUGESTAO[campo].includes(h.toLowerCase()));
      if (idx >= 0) mapa[campo] = idx;
    }
    if (mapa.full_name === undefined) return { pessoas: [], relacoes: [], eventos: [], avisos, erros: ['Escolha qual coluna contém o nome completo.'], cabecalho, mapa: sugerir(cabecalho, mapa), campos: CAMPOS_CSV };
    linhas.forEach((l, i) => {
      const v = (c) => (mapa[c] !== undefined ? String(l[mapa[c]] ?? '').trim() : '');
      const nome = v('full_name');
      if (!nome) { erros.push(`Linha ${i + 2}: sem nome, ignorada.`); return; }
      const n = dataLivre(v('birth_date')), f = dataLivre(v('death_date'));
      if (n.invalida) avisos.push(`Linha ${i + 2}: data de nascimento "${n.invalida}" não reconhecida.`);
      if (f.invalida) avisos.push(`Linha ${i + 2}: data de falecimento "${f.invalida}" não reconhecida.`);
      const sexo = v('sex').toUpperCase().charAt(0);
      const vivo = v('living_status').toLowerCase();
      const ref = v('ref') || `linha${i + 2}`;
      pessoas.push({ ref, full_name: nome, birth_name: v('birth_name'), sex: { M: 'M', F: 'F', H: 'M' }[sexo] || '', birth_date: n.date, birth_qual: n.qual, birth_place: lugarTexto(v('birth_place')),
        death_date: f.date, death_qual: f.qual, death_place: lugarTexto(v('death_place')),
        living_status: f.date ? 'deceased' : ['vivo', 'viva', 'sim', 'living', 's'].includes(vivo) ? 'living' : ['falecido', 'falecida', 'nao', 'não', 'deceased'].includes(vivo) ? 'deceased' : 'unknown',
        nicknames: v('nicknames') ? v('nicknames').split(/[|;]/).map((x) => x.trim()).filter(Boolean) : [], notes: v('notes') });
      if (v('father_ref')) relacoes.push({ a: v('father_ref'), b: ref, type: 'parent', subtype: 'biological' });
      if (v('mother_ref')) relacoes.push({ a: v('mother_ref'), b: ref, type: 'parent', subtype: 'biological' });
      if (v('spouse_ref')) relacoes.push({ a: ref, b: v('spouse_ref'), type: 'spouse', subtype: 'unknown' });
    });
    // Cônjuge citado nas duas linhas vira um só vínculo.
    const vistos = new Set();
    relacoes = relacoes.filter((r) => { if (r.type !== 'spouse') return true; const k = [r.a, r.b].sort().join('|'); if (vistos.has(k)) return false; vistos.add(k); return true; });
    return { pessoas, relacoes, eventos, avisos, erros, cabecalho, mapa: sugerir(cabecalho, mapa), campos: CAMPOS_CSV };
  } else if (formato === 'json') {
    let d;
    try { d = JSON.parse(conteudo); } catch { throw erro(400, 'JSON inválido.'); }
    if (d?.formato !== 'arvore-viva' || !Array.isArray(d.pessoas)) throw erro(400, 'JSON não reconhecido. Use um arquivo exportado pela Árvore Viva.');
    pessoas = d.pessoas.filter((p) => p && typeof p === 'object' && !p.privado).map((p) => ({ ...p, ref: String(p.id) }));
    relacoes = (d.relacoes || []).map((r) => ({ a: String(r.person_a), b: String(r.person_b), type: r.type, subtype: r.subtype, status: r.status, start_date: r.start_date || '', end_date: r.end_date || '' }));
    eventos = (d.eventos || []).map((e) => ({ ...e, person_ref: String(e.person_id) }));
    const omitidos = d.pessoas.length - pessoas.length;
    if (omitidos) avisos.push(`${omitidos} pessoa(s) privada(s) no arquivo não serão importadas.`);
  } else throw erro(400, 'Formato não suportado. Use GEDCOM, CSV ou JSON.');
  return { pessoas, relacoes, eventos, avisos, erros };
}
const sugerir = (cab, mapa) => Object.fromEntries(Object.entries(mapa).map(([k, i]) => [k, cab[i]]));

// Inconsistências: datas impossíveis, referências quebradas, mais de 2 genitores biológicos.
function inconsistencias(pessoas, relacoes) {
  const porRef = new Map(pessoas.map((p) => [p.ref, p]));
  const out = [];
  for (const p of pessoas) if (p.birth_date && p.death_date && p.death_date < p.birth_date) out.push(`${p.full_name}: falecimento antes do nascimento.`);
  const bio = new Map();
  for (const r of relacoes) {
    if (!porRef.has(r.a) || !porRef.has(r.b)) { out.push(`Vínculo cita referência inexistente (${!porRef.has(r.a) ? r.a : r.b}).`); continue; }
    if (r.type === 'parent') {
      const pa = porRef.get(r.a), fi = porRef.get(r.b);
      const d = ano(fi.birth_date) - ano(pa.birth_date);
      if (ano(fi.birth_date) && ano(pa.birth_date) && d < 12) out.push(`${pa.full_name} teria ${d} anos no nascimento de ${fi.full_name}.`);
      if (r.subtype === 'biological') bio.set(r.b, (bio.get(r.b) || 0) + 1);
    }
  }
  for (const [ref, n] of bio) if (n > 2) out.push(`${porRef.get(ref).full_name}: ${n} genitores biológicos.`);
  return out.slice(0, 200);
}

export function rotasPortabilidade(r) {
  r.post('/api/trees/:treeId/import/preview', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'editor');
    const formato = opcao(ctx.body.format, ['gedcom', 'csv', 'json'], null, 'Formato');
    const res = interpretar(formato, ctx.body.content, ctx.body.mapping);
    const duplicidades = [];
    for (const p of res.pessoas.slice(0, 300)) {
      const sem = buscarDuplicidades(t, { full_name: p.full_name, birth_date: p.birth_date, sex: p.sex, birth_place: p.birth_place }, papel, ctx.user.id).filter((s) => s.score >= 55);
      if (sem.length) duplicidades.push({ ref: p.ref, nome: p.full_name, semelhantes: sem.slice(0, 3).map((s) => ({ id: s.pessoa.id, nome: s.pessoa.full_name, score: s.score, rotulo: s.rotulo })) });
    }
    return {
      formato, total_pessoas: res.pessoas.length, total_relacoes: res.relacoes.length, total_eventos: res.eventos.length,
      amostra: res.pessoas.slice(0, 50).map((p) => ({ ref: p.ref, full_name: p.full_name, sex: p.sex, birth_date: p.birth_date, death_date: p.death_date, birth_place: p.birth_place?.name || '' })),
      duplicidades, inconsistencias: inconsistencias(res.pessoas, res.relacoes), avisos: res.avisos.slice(0, 200), erros: res.erros.slice(0, 200),
      cabecalho: res.cabecalho, mapa: res.mapa, campos: res.campos,
    };
  }, { maxBody: 12 * 1024 * 1024 });

  r.post('/api/trees/:treeId/import/commit', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    if (ctx.body.confirm !== true) throw erro(400, 'Confirme a importação.');
    const formato = opcao(ctx.body.format, ['gedcom', 'csv', 'json'], null, 'Formato');
    const res = interpretar(formato, ctx.body.content, ctx.body.mapping);
    if (res.erros.length && !res.pessoas.length) throw erro(400, res.erros[0]);
    const pular = new Set(Array.isArray(ctx.body.skip_refs) ? ctx.body.skip_refs.map(String) : []);
    const nome = texto(ctx.body.filename, { max: 200 });
    const jobId = uuid();
    const resumo = tx(() => {
      const ids = new Map();
      let nRel = 0, nEvt = 0;
      for (const p of res.pessoas) {
        if (pular.has(p.ref)) continue;
        const id = uuid();
        ids.set(p.ref, id);
        const v = (x, max) => texto(x, { max });
        const data = (x) => (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(x || '')) ? x : '');
        const qual = (x) => (['exact', 'about', 'before', 'after', 'estimated'].includes(x) ? x : 'exact');
        run(`INSERT INTO persons (id, full_name, birth_name, sex, bio, living_status, birth_date, birth_qual, birth_place_id, death_date, death_qual, death_place_id, verification, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, v(p.full_name, 200) || '(sem nome)', v(p.birth_name, 200), ['M', 'F', 'X'].includes(p.sex) ? p.sex : '', v(p.notes || p.bio, 10000),
        ['living', 'deceased', 'unknown'].includes(p.living_status) ? p.living_status : 'unknown', data(p.birth_date), qual(p.birth_qual), salvarLocal(p.birth_place),
        data(p.death_date), qual(p.death_qual), salvarLocal(p.death_place), 'declared', ctx.user.id);
        run('INSERT INTO tree_persons (tree_id, person_id) VALUES (?,?)', t, id);
        for (const n of (p.nicknames || []).slice(0, 20)) run(`INSERT INTO person_names (id, person_id, kind, name, norm) VALUES (?,?,'nickname',?,?)`, uuid(), id, v(n, 200), String(n).toLowerCase());
        indexarBusca(id);
      }
      const tipos = ['parent', 'spouse', 'partner', 'guardian', 'sibling', 'unknown'], subs = ['biological', 'legal', 'adoptive', 'step', 'foster', 'unknown'];
      for (const rel of res.relacoes) {
        const a = ids.get(rel.a), b = ids.get(rel.b);
        if (!a || !b || a === b || !tipos.includes(rel.type)) continue;
        run(`INSERT INTO relationships (id, tree_id, person_a, person_b, type, subtype, status, start_date, end_reason, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`, uuid(), t, a, b, rel.type,
          subs.includes(rel.subtype) ? rel.subtype : 'unknown', 'declared', /^\d{4}/.test(rel.start_date || '') ? rel.start_date.slice(0, 10) : '', texto(rel.end_reason, { max: 200 }), ctx.user.id);
        nRel++;
      }
      for (const e of res.eventos) {
        const pid = ids.get(e.person_ref);
        if (!pid) continue;
        run(`INSERT INTO life_events (id, tree_id, person_id, type, date, description, created_by) VALUES (?,?,?,?,?,?,?)`, uuid(), t, pid,
          ['birth', 'death', 'marriage', 'divorce', 'immigration', 'emigration', 'residence', 'name_change', 'baptism', 'burial', 'military', 'other'].includes(e.type) ? e.type : 'other',
          /^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.date || '') ? e.date : '', texto(e.description, { max: 2000 }), ctx.user.id);
        nEvt++;
      }
      const s = { pessoas: ids.size, relacoes: nRel, eventos: nEvt, ignoradas: pular.size, avisos: res.avisos.length, erros: res.erros.length };
      run('INSERT INTO import_jobs (id, tree_id, user_id, format, filename, status, summary) VALUES (?,?,?,?,?,?,?)', jobId, t, ctx.user.id, formato, nome, 'concluida', JSON.stringify({ ...s, lista_avisos: res.avisos.slice(0, 100), lista_erros: res.erros.slice(0, 100) }));
      auditar(ctx, t, 'importacao.concluida', 'import', jobId, `${formato}: ${s.pessoas} pessoa(s)`);
      return s;
    });
    return { id: jobId, ...resumo };
  }, { maxBody: 12 * 1024 * 1024 });

  r.get('/api/trees/:treeId/imports', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'editor');
    return { importacoes: all(`SELECT i.id, i.format, i.filename, i.status, i.summary, i.created_at, u.name autor FROM import_jobs i LEFT JOIN users u ON u.id = i.user_id WHERE i.tree_id = ? ORDER BY i.created_at DESC LIMIT 50`, ctx.params.treeId).map((i) => ({ ...i, summary: JSON.parse(i.summary) })) };
  });

  // Exportação: dados sensíveis e pessoas vivas excluídos por padrão.
  r.post('/api/trees/:treeId/export', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const b = ctx.body;
    const formato = opcao(b.format, ['gedcom', 'csv', 'json'], null, 'Formato');
    const incluirVivos = !!b.include_living;
    const incluirIds = !!b.include_identifiers;
    if (incluirVivos && !pode(papel, 'editor')) throw erro(403, 'Somente editores podem exportar dados de pessoas vivas.');
    if (incluirIds && !pode(papel, 'admin')) throw erro(403, 'Somente administradores podem exportar identificadores.');
    if (incluirIds && formato !== 'json') throw erro(400, 'Identificadores só podem ser exportados em JSON.');
    const arvore = get('SELECT name FROM family_trees WHERE id = ?', t);
    let pessoas = all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, t);
    let rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', t);
    // Ramo: pessoa raiz + ascendentes e/ou descendentes.
    if (b.root_id) {
      const raiz = exigirUuid(b.root_id, 'Pessoa raiz');
      const g = montarGrafo(rels);
      const sel = new Set([raiz]);
      const direcoes = b.branch === 'ancestors' ? [g.pais] : b.branch === 'descendants' ? [g.filhos] : [g.pais, g.filhos];
      for (const m of direcoes) { const fila = [raiz]; while (fila.length) for (const v of m.get(fila.shift()) || []) if (!sel.has(v.id)) { sel.add(v.id); fila.push(v.id); } }
      if (b.branch !== 'ancestors') for (const id of [...sel]) for (const c of g.conjuges.get(id) || []) sel.add(c.id);
      pessoas = pessoas.filter((p) => sel.has(p.id));
    } else if (Array.isArray(b.person_ids) && b.person_ids.length) {
      const sel = new Set(b.person_ids);
      pessoas = pessoas.filter((p) => sel.has(p.id));
    }
    const ids = new Set(pessoas.map((p) => p.id));
    rels = rels.filter((r) => ids.has(r.person_a) && ids.has(r.person_b));
    const privado = (p) => restrita(p, papel, ctx.user.id) || (!incluirVivos && (p.living_status === 'living' || p.visibility === 'private'));
    const L = (id) => local(id)?.name || '';
    const lista = pessoas.map((p) => (privado(p) ? { id: p.id, privado: true, full_name: 'Privado', living_status: p.living_status } : {
      id: p.id, full_name: p.full_name, birth_name: p.birth_name, sex: p.sex, living_status: p.living_status, birth_date: p.birth_date, birth_qual: p.birth_qual, birth_place: L(p.birth_place_id),
      death_date: p.death_date, death_qual: p.death_qual, death_place: L(p.death_place_id), verification: p.verification, bio: p.bio,
    }));
    run('INSERT INTO export_jobs (id, tree_id, user_id, format, options) VALUES (?,?,?,?,?)', uuid(), t, ctx.user.id, formato, JSON.stringify({ incluirVivos, incluirIds, ramo: b.branch || 'todos', pessoas: lista.length }));
    auditar(ctx, t, 'exportacao.gerada', 'tree', t, `${formato}${incluirVivos ? ', com vivos' : ''}${incluirIds ? ', com identificadores' : ''}`);
    const base = arvore.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'arvore';
    const aviso = 'Este arquivo pode conter dados pessoais de terceiros. Compartilhe apenas com quem tem direito de acessá-los.';
    if (formato === 'gedcom') {
      const dados = { pessoas: lista.map((p) => ({ ...p, birth_place: p.birth_place, death_place: p.death_place })), rels };
      return { filename: `${base}.ged`, mime: 'text/plain', content: escreverGedcom(dados, arvore.name), aviso };
    }
    if (formato === 'csv') {
      const cab = ['ref', 'full_name', 'birth_name', 'sex', 'birth_date', 'birth_place', 'death_date', 'death_place', 'living_status', 'father_ref', 'mother_ref', 'spouse_ref'];
      const sexo = new Map(lista.map((p) => [p.id, p.sex]));
      const linhas = lista.map((p) => {
        const pais = rels.filter((r) => r.type === 'parent' && r.person_b === p.id).map((r) => r.person_a);
        const pai = pais.find((x) => sexo.get(x) === 'M') || '', mae = pais.find((x) => sexo.get(x) === 'F') || '';
        const conj = rels.find((r) => r.type === 'spouse' && (r.person_a === p.id || r.person_b === p.id));
        return [p.id, p.full_name, p.birth_name || '', p.sex || '', p.birth_date || '', p.birth_place || '', p.death_date || '', p.death_place || '', p.living_status, pai, mae, conj ? (conj.person_a === p.id ? conj.person_b : conj.person_a) : ''];
      });
      return { filename: `${base}.csv`, mime: 'text/csv', content: escreverCsv(cab, linhas), aviso };
    }
    const json = { formato: 'arvore-viva', versao: 1, arvore: arvore.name, gerado_em: new Date().toISOString(), aviso, pessoas: lista,
      relacoes: rels.map((r) => ({ person_a: r.person_a, person_b: r.person_b, type: r.type, subtype: r.subtype, status: r.status, start_date: r.start_date, end_date: r.end_date })),
      eventos: all(`SELECT person_id, type, date, date_qual, description FROM life_events WHERE tree_id = ? AND deleted_at IS NULL`, t).filter((e) => ids.has(e.person_id) && !lista.find((p) => p.id === e.person_id)?.privado) };
    if (b.include_documents) json.documentos = all(`SELECT id, title, category, doc_date, reference, institution, url FROM documents WHERE tree_id = ? AND deleted_at IS NULL AND access_level = 'tree'`, t);
    if (incluirIds) json.identificadores = all('SELECT person_id, kind, value_enc FROM person_identifiers').filter((i) => ids.has(i.person_id)).map((i) => ({ person_id: i.person_id, kind: i.kind, valor: decifrarTexto(i.value_enc) }));
    return { filename: `${base}.json`, mime: 'application/json', content: JSON.stringify(json, null, 2), aviso };
  });
}
