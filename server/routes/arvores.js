// Árvores, membros, convites, painel (indicadores reais), atividades e comentários.
import { all, get, run, tx, uuid } from '../db.js';
import { erro } from '../http.js';
import { papelNaArvore, pode, auditar, texto, opcao, exigirUuid, NOME_PAPEL, PAPEIS } from '../acesso.js';
import { tokenAleatorio, sha256 } from '../lib/seguranca.js';
import { contarGeracoes } from '../lib/parentesco.js';
import { apagarArvoreDefinitivo } from './auth.js';
import { removerArquivosOrfaos } from './documentos.js';

export function rotasArvores(r) {
  r.get('/api/trees', (ctx) => ({
    arvores: all(`SELECT t.id, t.name, t.description, t.is_demo, t.updated_at, m.role,
      (SELECT COUNT(*) FROM tree_persons tp JOIN persons p ON p.id = tp.person_id WHERE tp.tree_id = t.id AND p.deleted_at IS NULL) AS pessoas
      FROM tree_memberships m JOIN family_trees t ON t.id = m.tree_id
      WHERE m.user_id = ? AND t.deleted_at IS NULL ORDER BY t.updated_at DESC`, ctx.user.id),
  }));

  r.post('/api/trees', (ctx) => {
    const name = texto(ctx.body.name, { campo: 'Nome da árvore', max: 120, obrigatorio: true });
    const description = texto(ctx.body.description, { campo: 'Descrição', max: 2000 });
    const id = uuid();
    tx(() => {
      run('INSERT INTO family_trees (id, name, description, owner_id) VALUES (?,?,?,?)', id, name, description, ctx.user.id);
      run(`INSERT INTO tree_memberships (tree_id, user_id, role) VALUES (?,?,'owner')`, id, ctx.user.id);
      auditar(ctx, id, 'arvore.criada', 'tree', id, name);
    });
    return { status: 201, body: { id, name } };
  });

  r.get('/api/trees/:treeId', (ctx) => {
    const papel = papelNaArvore(ctx, ctx.params.treeId);
    const t = get('SELECT id, name, description, is_demo, created_at, updated_at, owner_id FROM family_trees WHERE id = ?', ctx.params.treeId);
    return { ...t, papel, papel_nome: NOME_PAPEL[papel] };
  });

  r.patch('/api/trees/:treeId', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'admin');
    const name = texto(ctx.body.name, { campo: 'Nome', max: 120, obrigatorio: true });
    const description = texto(ctx.body.description, { campo: 'Descrição', max: 2000 });
    run('UPDATE family_trees SET name = ?, description = ? WHERE id = ?', name, description, ctx.params.treeId);
    auditar(ctx, ctx.params.treeId, 'arvore.editada', 'tree', ctx.params.treeId, name);
    return { ok: true };
  });

  r.delete('/api/trees/:treeId', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'owner');
    const t = get('SELECT name FROM family_trees WHERE id = ?', ctx.params.treeId);
    if (ctx.body.confirm !== t.name) throw erro(400, 'Digite o nome exato da árvore para confirmar a exclusão.');
    tx(() => apagarArvoreDefinitivo(ctx.params.treeId));
    removerArquivosOrfaos();
    auditar(ctx, null, 'arvore.excluida', 'tree', ctx.params.treeId);
    return { ok: true };
  });

  // Painel: tudo calculado a partir do banco.
  r.get('/api/trees/:treeId/dashboard', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const ids = all(`SELECT p.id FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, t).map((x) => x.id);
    const rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', t);
    const n = (sql, ...p) => get(sql, ...p).n;
    const verificadas = n(`SELECT COUNT(*) n FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL AND p.verification IN ('documented','confirmed')`, t)
      + n(`SELECT COUNT(*) n FROM relationships WHERE tree_id = ? AND deleted_at IS NULL AND status IN ('documented','confirmed')`, t);
    const pendentes = n(`SELECT COUNT(*) n FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL AND p.verification IN ('declared','extracted','hypothesis')`, t)
      + n(`SELECT COUNT(*) n FROM relationships WHERE tree_id = ? AND deleted_at IS NULL AND status IN ('declared','extracted','hypothesis')`, t);
    const conflitos = n(`SELECT COUNT(*) n FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL AND p.verification = 'contested'`, t)
      + n(`SELECT COUNT(*) n FROM relationships WHERE tree_id = ? AND deleted_at IS NULL AND status = 'contested'`, t)
      + n(`SELECT COUNT(*) n FROM evidence_items WHERE tree_id = ? AND stance = -1`, t)
      + n(`SELECT COUNT(*) n FROM match_candidates WHERE tree_id = ? AND category = 'conflitante' AND status IN ('pending','later')`, t);
    return {
      papel,
      indicadores: {
        pessoas: ids.length,
        geracoes: ids.length ? contarGeracoes(ids, rels).geracoes : 0,
        relacoes: rels.length,
        documentos: n(`SELECT COUNT(*) n FROM documents WHERE tree_id = ? AND deleted_at IS NULL`, t),
        verificados: verificadas,
        correspondencias: n(`SELECT COUNT(*) n FROM match_candidates WHERE tree_id = ? AND status IN ('pending','later')`, t),
        pendentes, conflitos,
      },
      atividades: atividades(t, 12),
    };
  });

  r.get('/api/trees/:treeId/activity', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId);
    const limite = Math.min(200, Math.max(1, Number(ctx.query.limit) || 50));
    return { atividades: atividades(ctx.params.treeId, limite, ctx.query.before) };
  });

  // ---- Membros ----
  r.get('/api/trees/:treeId/members', (ctx) => {
    const papel = papelNaArvore(ctx, ctx.params.treeId);
    const membros = all(`SELECT u.id, u.name, u.email, m.role, m.created_at FROM tree_memberships m JOIN users u ON u.id = m.user_id WHERE m.tree_id = ? ORDER BY m.created_at`, ctx.params.treeId);
    const convites = pode(papel, 'admin') ? all(`SELECT id, email, role, expires_at, accepted_at, revoked_at, created_at FROM invitations WHERE tree_id = ? ORDER BY created_at DESC`, ctx.params.treeId) : [];
    // Leitores não veem e-mails dos demais.
    return { membros: membros.map((m) => (pode(papel, 'admin') || m.id === ctx.user.id ? m : { ...m, email: '' })), convites };
  });

  r.patch('/api/trees/:treeId/members/:userId', (ctx) => {
    const meu = papelNaArvore(ctx, ctx.params.treeId, 'admin');
    const alvo = get('SELECT role FROM tree_memberships WHERE tree_id = ? AND user_id = ?', ctx.params.treeId, ctx.params.userId);
    if (!alvo) throw erro(404, 'Membro não encontrado.');
    const role = opcao(ctx.body.role, ['admin', 'editor', 'contributor', 'reader'], null, 'Papel');
    if (!role) throw erro(400, 'Informe o papel.');
    if (alvo.role === 'owner') throw erro(400, 'O papel do proprietário não pode ser alterado.');
    if (meu !== 'owner' && (alvo.role === 'admin' || role === 'admin')) throw erro(403, 'Só o proprietário gerencia administradores.');
    run('UPDATE tree_memberships SET role = ? WHERE tree_id = ? AND user_id = ?', role, ctx.params.treeId, ctx.params.userId);
    auditar(ctx, ctx.params.treeId, 'membro.papel_alterado', 'user', ctx.params.userId, `${alvo.role} → ${role}`);
    return { ok: true };
  });

  r.delete('/api/trees/:treeId/members/:userId', (ctx) => {
    const sairSozinho = ctx.params.userId === ctx.user.id;
    const meu = papelNaArvore(ctx, ctx.params.treeId, sairSozinho ? 'reader' : 'admin');
    const alvo = get('SELECT role FROM tree_memberships WHERE tree_id = ? AND user_id = ?', ctx.params.treeId, ctx.params.userId);
    if (!alvo) throw erro(404, 'Membro não encontrado.');
    if (alvo.role === 'owner') throw erro(400, 'O proprietário não pode ser removido.');
    if (!sairSozinho && meu !== 'owner' && alvo.role === 'admin') throw erro(403, 'Só o proprietário remove administradores.');
    run('DELETE FROM tree_memberships WHERE tree_id = ? AND user_id = ?', ctx.params.treeId, ctx.params.userId);
    auditar(ctx, ctx.params.treeId, 'membro.removido', 'user', ctx.params.userId);
    return { ok: true };
  });

  // ---- Convites (link com expiração; sem e-mail configurado, o link é copiado e enviado pelo usuário) ----
  r.post('/api/trees/:treeId/invitations', (ctx) => {
    const meu = papelNaArvore(ctx, ctx.params.treeId, 'admin');
    const email = texto(ctx.body.email, { campo: 'E-mail', max: 200, obrigatorio: true }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw erro(400, 'E-mail inválido.');
    const role = opcao(ctx.body.role, ['admin', 'editor', 'contributor', 'reader'], 'reader', 'Papel');
    if (role === 'admin' && meu !== 'owner') throw erro(403, 'Só o proprietário convida administradores.');
    const dias = Math.min(30, Math.max(1, Number(ctx.body.days) || 7));
    const token = tokenAleatorio();
    const id = uuid();
    run('INSERT INTO invitations (id, tree_id, email, role, token_hash, expires_at, created_by) VALUES (?,?,?,?,?,?,?)',
      id, ctx.params.treeId, email, role, sha256(token), new Date(Date.now() + dias * 864e5).toISOString(), ctx.user.id);
    auditar(ctx, ctx.params.treeId, 'convite.criado', 'invitation', id, `papel ${role}, ${dias} dia(s)`);
    return { status: 201, body: { id, link: `/convite/${token}`, expira_em_dias: dias } };
  });

  r.delete('/api/trees/:treeId/invitations/:id', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'admin');
    const ok = run(`UPDATE invitations SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND tree_id = ? AND accepted_at IS NULL`, ctx.params.id, ctx.params.treeId);
    if (!ok.changes) throw erro(404, 'Convite não encontrado ou já utilizado.');
    auditar(ctx, ctx.params.treeId, 'convite.revogado', 'invitation', ctx.params.id);
    return { ok: true };
  });

  r.get('/api/invitations/:token', (ctx) => {
    const c = get(`SELECT i.*, t.name tree_name FROM invitations i JOIN family_trees t ON t.id = i.tree_id WHERE i.token_hash = ? AND t.deleted_at IS NULL`, sha256(ctx.params.token));
    if (!c || c.revoked_at || c.accepted_at || c.expires_at < new Date().toISOString()) throw erro(404, 'Convite inválido, expirado ou revogado.');
    return { arvore: c.tree_name, papel: NOME_PAPEL[c.role], email: c.email, expira: c.expires_at };
  });

  r.post('/api/invitations/:token/accept', (ctx) => {
    const c = get('SELECT * FROM invitations WHERE token_hash = ?', sha256(ctx.params.token));
    if (!c || c.revoked_at || c.accepted_at || c.expires_at < new Date().toISOString()) throw erro(404, 'Convite inválido, expirado ou revogado.');
    if (c.email.toLowerCase() !== ctx.user.email.toLowerCase()) throw erro(403, 'Este convite foi enviado para outro e-mail. Entre com a conta convidada.');
    tx(() => {
      const ex = get('SELECT role FROM tree_memberships WHERE tree_id = ? AND user_id = ?', c.tree_id, ctx.user.id);
      if (!ex) run('INSERT INTO tree_memberships (tree_id, user_id, role) VALUES (?,?,?)', c.tree_id, ctx.user.id, c.role);
      else if (PAPEIS[c.role] > PAPEIS[ex.role]) run('UPDATE tree_memberships SET role = ? WHERE tree_id = ? AND user_id = ?', c.role, c.tree_id, ctx.user.id);
      run(`UPDATE invitations SET accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, c.id);
      auditar(ctx, c.tree_id, 'convite.aceito', 'invitation', c.id);
    });
    return { tree_id: c.tree_id };
  });

  // ---- Comentários e pedidos de revisão ----
  r.get('/api/trees/:treeId/comments', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId);
    const filtro = ctx.query.target_id ? 'AND c.target_id = ?' : (ctx.query.kind === 'review_request' ? "AND c.kind = 'review_request' AND c.resolved = 0" : '');
    const args = [ctx.params.treeId, ...(ctx.query.target_id ? [ctx.query.target_id] : [])];
    return { comentarios: all(`SELECT c.id, c.target_type, c.target_id, c.body, c.kind, c.resolved, c.created_at, c.user_id, u.name autor
      FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.tree_id = ? AND c.deleted_at IS NULL ${filtro} ORDER BY c.created_at DESC LIMIT 200`, ...args) };
  });

  r.post('/api/trees/:treeId/comments', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'contributor');
    const target_type = opcao(ctx.body.target_type, ['person', 'relationship', 'document', 'event', 'tree'], 'person', 'Alvo');
    const target_id = target_type === 'tree' ? ctx.params.treeId : exigirUuid(ctx.body.target_id, 'Alvo');
    const body = texto(ctx.body.body, { campo: 'Comentário', max: 4000, obrigatorio: true });
    const kind = opcao(ctx.body.kind, ['comment', 'review_request'], 'comment', 'Tipo');
    const id = uuid();
    run('INSERT INTO comments (id, tree_id, target_type, target_id, user_id, body, kind) VALUES (?,?,?,?,?,?,?)', id, ctx.params.treeId, target_type, target_id, ctx.user.id, body, kind);
    auditar(ctx, ctx.params.treeId, kind === 'review_request' ? 'revisao.solicitada' : 'comentario.criado', target_type, target_id);
    return { status: 201, body: { id } };
  });

  r.patch('/api/trees/:treeId/comments/:id', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'editor');
    run('UPDATE comments SET resolved = ? WHERE id = ? AND tree_id = ?', ctx.body.resolved ? 1 : 0, ctx.params.id, ctx.params.treeId);
    auditar(ctx, ctx.params.treeId, 'revisao.resolvida', 'comment', ctx.params.id);
    return { ok: true };
  });

  r.delete('/api/trees/:treeId/comments/:id', (ctx) => {
    const papel = papelNaArvore(ctx, ctx.params.treeId, 'contributor');
    const c = get('SELECT user_id FROM comments WHERE id = ? AND tree_id = ?', ctx.params.id, ctx.params.treeId);
    if (!c) throw erro(404, 'Comentário não encontrado.');
    if (c.user_id !== ctx.user.id && !pode(papel, 'admin')) throw erro(403, 'Você só pode apagar seus comentários.');
    run(`UPDATE comments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ctx.params.id);
    return { ok: true };
  });
}

const ROTULOS = {
  'arvore.criada': 'criou a árvore', 'arvore.editada': 'editou a árvore', 'pessoa.criada': 'adicionou uma pessoa', 'pessoa.editada': 'editou uma pessoa',
  'pessoa.excluida': 'removeu uma pessoa', 'relacao.criada': 'registrou um vínculo', 'relacao.editada': 'editou um vínculo', 'relacao.excluida': 'removeu um vínculo',
  'documento.criado': 'anexou um documento', 'documento.editado': 'editou um documento', 'documento.excluido': 'removeu um documento', 'documento.vinculado': 'vinculou um documento',
  'evento.criado': 'registrou um evento', 'fonte.criada': 'cadastrou uma fonte', 'evidencia.criada': 'registrou uma evidência',
  'correspondencia.analisada': 'analisou correspondências', 'correspondencia.revisada': 'revisou uma correspondência', 'pessoas.unidas': 'uniu dois registros',
  'importacao.concluida': 'importou um arquivo', 'exportacao.gerada': 'exportou dados', 'identificador.revelado': 'acessou um identificador completo',
  'identificador.criado': 'cadastrou um identificador', 'identificador.excluido': 'excluiu um identificador', 'convite.criado': 'criou um convite',
  'convite.aceito': 'aceitou um convite', 'membro.removido': 'removeu um membro', 'comentario.criado': 'comentou', 'revisao.solicitada': 'pediu revisão',
  'demo.criada': 'carregou os dados de demonstração',
};

function atividades(treeId, limite, antes) {
  return all(`SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.created_at, u.name autor FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.tree_id = ? ${antes ? 'AND a.created_at < ?' : ''} ORDER BY a.created_at DESC LIMIT ?`, ...(antes ? [treeId, antes, limite] : [treeId, limite]))
    .map((a) => ({ ...a, descricao: ROTULOS[a.action] || a.action }));
}
