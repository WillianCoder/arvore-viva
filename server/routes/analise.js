// Pesquisa avançada, parentesco, correspondências, linha do tempo, mapa e catálogo de fontes.
import { all, get, run, tx, uuid } from '../db.js';
import { erro, limitar } from '../http.js';
import { papelNaArvore, pessoaNaArvore, pode, auditar, texto, opcao, exigirUuid, PAPEIS } from '../acesso.js';
import { serializarPessoa, restrita, local } from '../servicos.js';
import { casaConsulta, normalizar, ano, tokens, foneticoToken } from '../lib/nomes.js';
import { calcularParentesco, montarGrafo } from '../lib/parentesco.js';
import { compararPessoas, paresCandidatos, CATEGORIAS } from '../lib/correspondencia.js';
import { hmacIdentificador } from '../lib/seguranca.js';
import { soDigitos } from '../lib/cpf.js';
import { perfilComparacao } from './pessoas.js';
import { FONTES_EXTERNAS } from '../lib/fontes-externas.js';

const ROT_EVT = { birth: 'Nascimento', death: 'Falecimento', marriage: 'Casamento', divorce: 'Divórcio', immigration: 'Imigração', emigration: 'Emigração', residence: 'Residência', name_change: 'Mudança de nome', baptism: 'Batismo', burial: 'Sepultamento', military: 'Serviço militar', other: 'Outro evento' };

function arvoresDoUsuario(userId) {
  return all(`SELECT m.tree_id id, m.role, t.name FROM tree_memberships m JOIN family_trees t ON t.id = m.tree_id WHERE m.user_id = ? AND t.deleted_at IS NULL`, userId);
}

export function rotasAnalise(r) {
  // ---- Pesquisa avançada (só árvores do usuário; pessoas restritas não aparecem) ----
  r.get('/api/search', (ctx) => {
    const q = ctx.query;
    let arvores = arvoresDoUsuario(ctx.user.id);
    if (q.tree_id) arvores = arvores.filter((a) => a.id === q.tree_id);
    if (!arvores.length) return { total: 0, resultados: [] };
    const papelPor = new Map(arvores.map((a) => [a.id, a.role]));
    const nomeArv = new Map(arvores.map((a) => [a.id, a.name]));
    const ph = arvores.map(() => '?').join(',');
    const linhas = all(`SELECT p.*, tp.tree_id FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id IN (${ph}) AND p.deleted_at IS NULL`, ...arvores.map((a) => a.id));

    // Busca por identificador: só editores, dentro de UMA árvore, correspondência exata e auditada.
    let porIdentificador = null;
    if (q.identifier) {
      if (!q.tree_id) throw erro(400, 'Busca por documento exige escolher uma árvore.');
      if (!pode(papelPor.get(q.tree_id), 'editor')) throw erro(403, 'Apenas editores podem buscar por número de documento.');
      if (!limitar('busca-id:' + ctx.user.id, 10, 60000)) throw erro(429, 'Limite de buscas por documento atingido. Aguarde um minuto.');
      const kind = opcao(q.identifier_kind, ['cpf', 'rg', 'passport', 'birth_cert', 'marriage_cert', 'death_cert', 'foreign', 'other'], 'cpf', 'Tipo');
      const valor = kind === 'cpf' ? soDigitos(q.identifier) : String(q.identifier).toUpperCase().replace(/\s+/g, '');
      porIdentificador = new Set(all(`SELECT pi.person_id FROM person_identifiers pi JOIN tree_persons tp ON tp.person_id = pi.person_id WHERE tp.tree_id = ? AND pi.value_hmac = ?`, q.tree_id, hmacIdentificador(kind, valor)).map((x) => x.person_id));
      auditar(ctx, q.tree_id, 'busca.identificador', 'search', '', kind);
    }

    const nomesAlt = new Map();
    for (const n of all(`SELECT pn.person_id, pn.kind, pn.name FROM person_names pn JOIN tree_persons tp ON tp.person_id = pn.person_id WHERE tp.tree_id IN (${ph})`, ...arvores.map((a) => a.id))) {
      if (!nomesAlt.has(n.person_id)) nomesAlt.set(n.person_id, []);
      nomesAlt.get(n.person_id).push(n);
    }
    const relsPorArvore = new Map();
    const relsDe = (t) => { if (!relsPorArvore.has(t)) relsPorArvore.set(t, montarGrafo(all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', t))); return relsPorArvore.get(t); };
    const nomePessoa = new Map(linhas.map((l) => [l.id, l]));
    const lugarCasa = (id, campo, valor) => { const l = local(id); return l && normalizar(l[campo]).includes(normalizar(valor)); };
    const desde = q.birth_from ? Number(q.birth_from) : null, ate = q.birth_to ? Number(q.birth_to) : null;
    let fonteIds = null;
    if (q.source || q.doc_ref) {
      const termo = `%${q.source || q.doc_ref}%`;
      fonteIds = new Set(all(`SELECT dl.person_id FROM document_links dl JOIN documents d ON d.id = dl.document_id WHERE d.tree_id IN (${ph}) AND d.deleted_at IS NULL AND d.access_level = 'tree'
        AND (d.title LIKE ? OR d.reference LIKE ? OR d.institution LIKE ?) AND dl.person_id IS NOT NULL`, ...arvores.map((a) => a.id), termo, termo, termo).map((x) => x.person_id));
    }

    const porPessoa = new Map();
    for (const p of linhas) {
      const papel = papelPor.get(p.tree_id);
      if (restrita(p, papel, ctx.user.id)) continue;
      if (porIdentificador && !porIdentificador.has(p.id)) continue;
      if (fonteIds && !fonteIds.has(p.id)) continue;
      const motivos = [];
      let pont = 1;
      const alt = nomesAlt.get(p.id) || [];
      if (q.q) {
        const cand = [[p.full_name, 'nome'], [p.birth_name, 'nome de nascimento'], ...alt.map((n) => [n.name, n.kind === 'nickname' ? 'apelido' : n.kind === 'previous' ? 'nome anterior' : 'variação'])];
        let melhor = 0, onde = '';
        for (const [n, rot] of cand) { if (!n) continue; const s = casaConsulta(q.q, n); if (s > melhor) { melhor = s; onde = rot; } }
        if (!melhor) continue;
        pont *= melhor;
        motivos.push(`${onde} semelhante (${Math.round(melhor * 100)}%)`);
      }
      if (q.surname) {
        const alvo = foneticoToken(tokens(q.surname)[0] || '');
        const todos = [p.full_name, p.birth_name, ...alt.map((n) => n.name)].flatMap((n) => tokens(n)).map(foneticoToken);
        if (!alvo || !todos.includes(alvo)) continue;
        motivos.push('sobrenome compatível');
      }
      const an = ano(p.birth_date);
      if (desde || ate) {
        if (!an || (desde && an < desde) || (ate && an > ate)) continue;
        motivos.push(`nascimento em ${an}${p.birth_qual !== 'exact' ? ' (aprox.)' : ''}`);
      }
      if (q.death_year) { if (ano(p.death_date) !== Number(q.death_year)) continue; motivos.push('ano de falecimento'); }
      for (const [campo, rot] of [['municipality', 'município'], ['state', 'estado'], ['country', 'país']]) {
        if (!q[campo]) continue;
        if (!lugarCasa(p.birth_place_id, campo, q[campo]) && !lugarCasa(p.death_place_id, campo, q[campo])) { pont = 0; break; }
        motivos.push(rot);
      }
      if (!pont) continue;
      const g = relsDe(p.tree_id);
      const pais = (g.pais.get(p.id) || []).filter((x) => x.type === 'parent');
      if (q.has_parents === '1' && !pais.length) continue;
      if (q.parent) {
        const ok = pais.some((x) => nomePessoa.get(x.id) && casaConsulta(q.parent, nomePessoa.get(x.id).full_name));
        if (!ok) continue;
        motivos.push('filiação compatível');
      }
      if (q.spouse) {
        const ok = (g.conjuges.get(p.id) || []).some((x) => nomePessoa.get(x.id) && casaConsulta(q.spouse, nomePessoa.get(x.id).full_name));
        if (!ok) continue;
        motivos.push('cônjuge compatível');
      }
      if (porIdentificador) motivos.push('documento informado');
      if (fonteIds) motivos.push('documento/fonte citada');
      const ex = porPessoa.get(p.id);
      if (ex) { ex.arvores.push({ id: p.tree_id, nome: nomeArv.get(p.tree_id) }); continue; }
      const autor = get('SELECT name FROM users WHERE id = ?', p.created_by)?.name || 'Importação';
      porPessoa.set(p.id, { pessoa: serializarPessoa(p, papel, ctx.user.id, { apelidos: alt.filter((n) => n.kind === 'nickname').map((n) => n.name) }), pontuacao: pont, motivos,
        arvores: [{ id: p.tree_id, nome: nomeArv.get(p.tree_id) }], origem: p.is_demo ? 'Dados de demonstração' : `Cadastrado por ${autor}`, atualizado: p.updated_at,
        pais: pais.map((x) => nomePessoa.get(x.id)).filter((x) => x && !restrita(x, papel, ctx.user.id)).map((x) => x.full_name) });
    }
    const lista = [...porPessoa.values()].sort((a, b) => b.pontuacao - a.pontuacao || a.pessoa.full_name.localeCompare(b.pessoa.full_name));
    const pagina = Math.max(1, Number(q.page) || 1), tam = Math.min(100, Number(q.size) || 20);
    return { total: lista.length, pagina, resultados: lista.slice((pagina - 1) * tam, pagina * tam) };
  });

  // ---- Parentesco ----
  r.get('/api/trees/:treeId/kinship', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const a = pessoaNaArvore(t, exigirUuid(ctx.query.a, 'Pessoa A')), b = pessoaNaArvore(t, exigirUuid(ctx.query.b, 'Pessoa B'));
    const pessoas = new Map(all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, t).map((p) => [p.id, p]));
    const rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', t);
    const res = calcularParentesco(pessoas, rels, a.id, b.id);
    const nome = (id) => serializarPessoa(pessoas.get(id), papel, ctx.user.id).full_name;
    const enriquecer = (c) => (c || []).map((n) => ({ ...n, nome: nome(n.id) }));
    return {
      a: { id: a.id, nome: nome(a.id) }, b: { id: b.id, nome: nome(b.id) },
      indeterminado: res.indeterminado, motivo: res.motivo, caminho: enriquecer(res.caminho),
      resultados: (res.resultados || []).map((x) => ({ ...x, chave: undefined, caminho: enriquecer(x.caminho), ancestrais: (x.ancestrais || []).map((id) => ({ id, nome: nome(id) })) })),
    };
  });

  // ---- Correspondências ----
  r.post('/api/trees/:treeId/matches/analyze', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const outras = ctx.body.include_other_trees ? arvoresDoUsuario(ctx.user.id).filter((a) => a.id !== t && PAPEIS[a.role] >= PAPEIS.editor).map((a) => a.id) : [];
    const ids = [t, ...outras];
    const pessoas = all(`SELECT DISTINCT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id IN (${ids.map(() => '?').join(',')}) AND p.deleted_at IS NULL`, ...ids);
    const naArvore = new Set(all('SELECT person_id FROM tree_persons WHERE tree_id = ?', t).map((x) => x.person_id));
    const rels = all(`SELECT * FROM relationships WHERE tree_id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`, ...ids);
    const nomes = new Map(pessoas.map((p) => [p.id, p.full_name]));
    const perfis = pessoas.map((p) => perfilComparacao(t, p, rels, nomes));
    const diretos = new Set(rels.map((r) => [r.person_a, r.person_b].sort().join('|')));
    let criadas = 0, atualizadas = 0;
    tx(() => {
      for (const { a, b } of paresCandidatos(perfis)) {
        if (!naArvore.has(a.id) && !naArvore.has(b.id)) continue;
        if (diretos.has([a.id, b.id].sort().join('|'))) continue; // já são parentes diretos: pessoas diferentes
        const c = compararPessoas(a, b);
        if (c.score < 40 && c.categoria !== 'conflitante') continue;
        const ex = get('SELECT id, status FROM match_candidates WHERE tree_id = ? AND person_a = ? AND person_b = ?', t, a.id, b.id);
        if (!ex) { run('INSERT INTO match_candidates (id, tree_id, person_a, person_b, score, category, factors) VALUES (?,?,?,?,?,?,?)', uuid(), t, a.id, b.id, c.score, c.categoria, JSON.stringify(c.fatores)); criadas++; }
        else if (['pending', 'later'].includes(ex.status)) { run(`UPDATE match_candidates SET score = ?, category = ?, factors = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, c.score, c.categoria, JSON.stringify(c.fatores), ex.id); atualizadas++; }
      }
      auditar(ctx, t, 'correspondencia.analisada', 'tree', t, `${criadas} nova(s)`);
    });
    return { criadas, atualizadas, comparadas: pessoas.length };
  });

  const acessoPessoa = (ctx, id) => {
    // Pessoa precisa estar em alguma árvore do usuário (pode ser outra árvore).
    const m = get(`SELECT m.role FROM tree_persons tp JOIN tree_memberships m ON m.tree_id = tp.tree_id WHERE tp.person_id = ? AND m.user_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 5 WHEN 'admin' THEN 4 WHEN 'editor' THEN 3 WHEN 'contributor' THEN 2 ELSE 1 END DESC LIMIT 1`, id, ctx.user.id);
    return m?.role || null;
  };

  r.get('/api/trees/:treeId/matches', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const status = opcao(ctx.query.status, ['pending', 'accepted', 'rejected', 'later', 'merged', 'open'], 'open', 'Situação');
    const cond = status === 'open' ? "status IN ('pending','later')" : 'status = ?';
    const lista = all(`SELECT * FROM match_candidates WHERE tree_id = ? AND ${cond} ORDER BY score DESC LIMIT 200`, ...(status === 'open' ? [t] : [t, status]));
    const out = [];
    for (const m of lista) {
      const [ra, rb] = [acessoPessoa(ctx, m.person_a), acessoPessoa(ctx, m.person_b)];
      if (!ra || !rb) continue;
      const pa = get('SELECT * FROM persons WHERE id = ?', m.person_a), pb = get('SELECT * FROM persons WHERE id = ?', m.person_b);
      if (!pa || !pb || restrita(pa, ra, ctx.user.id) || restrita(pb, rb, ctx.user.id)) continue;
      out.push({ id: m.id, score: m.score, categoria: m.category, rotulo: CATEGORIAS[m.category], status: m.status, atualizado: m.updated_at,
        a: serializarPessoa(pa, ra, ctx.user.id), b: serializarPessoa(pb, rb, ctx.user.id), fatores: JSON.parse(m.factors) });
    }
    return { papel, correspondencias: out, aviso: 'A pontuação é uma estimativa interna de compatibilidade, não uma probabilidade estatística. Nenhuma correspondência é fato confirmado sem revisão humana.' };
  });

  r.get('/api/trees/:treeId/matches/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const m = get('SELECT * FROM match_candidates WHERE id = ? AND tree_id = ?', ctx.params.id, t);
    if (!m) throw erro(404, 'Correspondência não encontrada.');
    const lado = (id) => {
      const role = acessoPessoa(ctx, id);
      const p = get('SELECT * FROM persons WHERE id = ?', id);
      if (!role || !p || restrita(p, role, ctx.user.id)) throw erro(404, 'Correspondência não encontrada.');
      const arv = get('SELECT tp.tree_id FROM tree_persons tp JOIN tree_memberships m ON m.tree_id = tp.tree_id AND m.user_id = ? WHERE tp.person_id = ? ORDER BY tp.tree_id = ? DESC LIMIT 1', ctx.user.id, id, t).tree_id;
      const perfil = perfilComparacao(arv, p);
      return { ...serializarPessoa(p, role, ctx.user.id), na_arvore: arv === t || !!get('SELECT 1 FROM tree_persons WHERE tree_id = ? AND person_id = ?', t, id), arvore: arv,
        pais: perfil.pais, conjuges: perfil.conjuges, filhos: perfil.filhos, nomes_alt: perfil.nomes_alt,
        documentos: get('SELECT COUNT(*) n FROM document_links WHERE person_id = ?', id).n };
    };
    const revisoes = all(`SELECT r.decision, r.previous_status, r.justification, r.created_at, u.name autor FROM match_reviews r LEFT JOIN users u ON u.id = r.user_id WHERE r.match_id = ? ORDER BY r.created_at DESC`, m.id);
    return { id: m.id, score: m.score, categoria: m.category, rotulo: CATEGORIAS[m.category], status: m.status, fatores: JSON.parse(m.factors), a: lado(m.person_a), b: lado(m.person_b), revisoes, papel };
  });

  r.post('/api/trees/:treeId/matches/:id/review', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const m = get('SELECT * FROM match_candidates WHERE id = ? AND tree_id = ?', ctx.params.id, t);
    if (!m) throw erro(404, 'Correspondência não encontrada.');
    if (m.status === 'merged') throw erro(400, 'Os registros já foram unidos.');
    const decisao = opcao(ctx.body.decision, ['accepted', 'rejected', 'later'], null, 'Decisão');
    if (!decisao) throw erro(400, 'Escolha aceitar, rejeitar ou analisar depois.');
    const just = texto(ctx.body.justification, { campo: 'Justificativa', max: 2000 });
    tx(() => {
      run('INSERT INTO match_reviews (id, match_id, user_id, decision, previous_status, justification) VALUES (?,?,?,?,?,?)', uuid(), m.id, ctx.user.id, decisao, m.status, just);
      run(`UPDATE match_candidates SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, decisao, m.id);
      auditar(ctx, t, 'correspondencia.revisada', 'match', m.id, decisao);
    });
    return { ok: true };
  });

  r.post('/api/trees/:treeId/matches/:id/undo', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const m = get('SELECT * FROM match_candidates WHERE id = ? AND tree_id = ?', ctx.params.id, t);
    if (!m) throw erro(404, 'Correspondência não encontrada.');
    if (m.status === 'merged') throw erro(400, 'Uma união de registros não pode ser desfeita automaticamente. Peça ajuda à administração técnica.');
    const ult = get('SELECT * FROM match_reviews WHERE match_id = ? ORDER BY created_at DESC LIMIT 1', m.id);
    if (!ult) throw erro(400, 'Não há decisão para desfazer.');
    tx(() => {
      run('INSERT INTO match_reviews (id, match_id, user_id, decision, previous_status, justification) VALUES (?,?,?,?,?,?)', uuid(), m.id, ctx.user.id, 'undo', m.status, texto(ctx.body.justification, { max: 2000 }));
      run(`UPDATE match_candidates SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ult.previous_status, m.id);
      auditar(ctx, t, 'correspondencia.revisada', 'match', m.id, 'desfeita');
    });
    return { ok: true, status: ult.previous_status };
  });

  // ---- Linha do tempo ----
  r.get('/api/trees/:treeId/timeline', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const pessoas = new Map(all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, t).map((p) => [p.id, p]));
    const rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', t);
    let filtro = null;
    if (ctx.query.person) filtro = new Set([ctx.query.person]);
    if (ctx.query.branch) {
      // Ramo: a pessoa, seus ascendentes e descendentes.
      const g = montarGrafo(rels);
      filtro = new Set([ctx.query.branch]);
      for (const mapa of [g.pais, g.filhos]) {
        const fila = [ctx.query.branch];
        while (fila.length) for (const v of mapa.get(fila.shift()) || []) if (!filtro.has(v.id)) { filtro.add(v.id); fila.push(v.id); }
      }
    }
    const visivel = (id) => pessoas.has(id) && !restrita(pessoas.get(id), papel, ctx.user.id) && (!filtro || filtro.has(id));
    const eventos = [];
    for (const p of pessoas.values()) {
      if (!visivel(p.id)) continue;
      if (p.birth_date) eventos.push({ tipo: 'birth', data: p.birth_date, qual: p.birth_qual, pessoa_id: p.id, pessoa: p.full_name, local: local(p.birth_place_id)?.name || '', verificacao: p.verification });
      if (p.death_date) eventos.push({ tipo: 'death', data: p.death_date, qual: p.death_qual, pessoa_id: p.id, pessoa: p.full_name, local: local(p.death_place_id)?.name || '', verificacao: p.verification });
    }
    for (const r2 of rels) {
      if ((r2.type === 'spouse' || r2.type === 'partner') && r2.start_date && visivel(r2.person_a) && visivel(r2.person_b)) {
        eventos.push({ tipo: 'marriage', data: r2.start_date, qual: 'exact', pessoa_id: r2.person_a, pessoa: `${pessoas.get(r2.person_a).full_name} e ${pessoas.get(r2.person_b).full_name}`, local: '', verificacao: r2.status });
      }
    }
    for (const e of all(`SELECT * FROM life_events WHERE tree_id = ? AND deleted_at IS NULL AND date <> ''`, t)) {
      if (!visivel(e.person_id) || ['birth', 'death'].includes(e.type) && pessoas.get(e.person_id)?.[e.type + '_date']) continue;
      eventos.push({ id: e.id, tipo: e.type, data: e.date, qual: e.date_qual, pessoa_id: e.person_id, pessoa: pessoas.get(e.person_id).full_name, local: local(e.place_id)?.name || '', descricao: e.description, verificacao: e.verification });
    }
    let lista = eventos.map((e) => ({ ...e, rotulo: ROT_EVT[e.tipo] || e.tipo, ano: ano(e.data) }));
    if (ctx.query.type) { const tipos = ctx.query.type.split(','); lista = lista.filter((e) => tipos.includes(e.tipo)); }
    if (ctx.query.from) lista = lista.filter((e) => e.ano >= Number(ctx.query.from));
    if (ctx.query.to) lista = lista.filter((e) => e.ano <= Number(ctx.query.to));
    lista.sort((a, b) => a.data.localeCompare(b.data));
    return { eventos: lista.slice(0, 5000), total: lista.length };
  });

  // ---- Mapa: só locais com coordenadas informadas; rotas só entre pontos datados ----
  r.get('/api/trees/:treeId/map', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const pessoas = all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, t);
    const pontos = new Map();
    const rotas = [];
    const semCoord = new Set();
    const add = (placeId, tipo, p, data, vivoResid) => {
      const l = local(placeId);
      if (!l) return null;
      if (l.lat === null) { semCoord.add(l.name); return null; }
      // Residência de pessoa viva: coordenada reduzida (~10 km), nunca exata.
      const lat = vivoResid ? Math.round(l.lat * 10) / 10 : l.lat, lng = vivoResid ? Math.round(l.lng * 10) / 10 : l.lng;
      const k = `${lat},${lng}`;
      if (!pontos.has(k)) pontos.set(k, { lat, lng, nome: l.name, precisao: vivoResid ? 'region' : l.precision, eventos: [] });
      pontos.get(k).eventos.push({ tipo, rotulo: ROT_EVT[tipo], pessoa: p.full_name, pessoa_id: p.id, ano: ano(data) });
      return { lat, lng, nome: l.name, ano: ano(data) };
    };
    for (const p of pessoas) {
      if (restrita(p, papel, ctx.user.id)) continue;
      const passos = [];
      const vivo = p.living_status === 'living';
      const n = add(p.birth_place_id, 'birth', p, p.birth_date); if (n) passos.push(n);
      for (const e of all(`SELECT * FROM life_events WHERE person_id = ? AND tree_id = ? AND deleted_at IS NULL AND place_id IS NOT NULL`, p.id, t)) {
        const x = add(e.place_id, e.type, p, e.date, vivo && e.type === 'residence'); if (x) passos.push(x);
      }
      const f = add(p.death_place_id, 'death', p, p.death_date); if (f) passos.push(f);
      const datados = passos.filter((x) => x.ano).sort((a, b) => a.ano - b.ano);
      for (let i = 1; i < datados.length; i++) {
        if (datados[i].lat === datados[i - 1].lat && datados[i].lng === datados[i - 1].lng) continue;
        rotas.push({ pessoa: p.full_name, pessoa_id: p.id, de: datados[i - 1], para: datados[i] });
      }
    }
    return { pontos: [...pontos.values()], rotas, locais_sem_coordenadas: [...semCoord].slice(0, 100) };
  });

  r.get('/api/external-sources', () => ({ fontes: FONTES_EXTERNAS, aviso: 'Links para sites oficiais. Não há integração automática nem consulta em seu nome.' }));
}
