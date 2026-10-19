// Sessões, autorização por árvore, auditoria e validação de entrada.
import { get, run, uuid } from './db.js';
import { erro, lerCookies, limitar } from './http.js';
import { sha256 } from './lib/seguranca.js';
import { config } from './config.js';

export const COOKIE = 'av_sessao';
export const PAPEIS = { reader: 1, contributor: 2, editor: 3, admin: 4, owner: 5 };
export const NOME_PAPEL = { owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', contributor: 'Colaborador', reader: 'Leitor' };

// Executado antes de cada rota da API.
export async function antes(ctx) {
  const token = lerCookies(ctx.req)[COOKIE];
  if (token) {
    const s = get(`SELECT s.token_hash, s.csrf, s.expires_at, u.id, u.email, u.name, u.preferences FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.deleted_at IS NULL`, sha256(token));
    if (s && s.expires_at > new Date().toISOString()) {
      ctx.user = { id: s.id, email: s.email, name: s.name, preferences: JSON.parse(s.preferences || '{}') };
      ctx.sessao = { hash: s.token_hash, csrf: s.csrf };
    }
  }
  const mutacao = ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD';
  if (mutacao) {
    // CSRF: origem precisa ser a mesma e, com sessão, o token precisa vir no cabeçalho.
    const origem = ctx.req.headers.origin;
    if (origem && new URL(origem).host !== ctx.req.headers.host) throw erro(403, 'Origem não permitida.');
    if (ctx.sessao && ctx.req.headers['x-csrf-token'] !== ctx.sessao.csrf) throw erro(403, 'Sessão inválida. Recarregue a página.');
    if (!ctx.sessao && !ctx.opcoes.publica) throw erro(401, 'Entre na sua conta para continuar.');
  }
  if (ctx.opcoes.publica) return;
  if (!ctx.user) throw erro(401, 'Entre na sua conta para continuar.');
  if (mutacao && !limitar('escrita:' + ctx.user.id, 240, 60000)) throw erro(429, 'Muitas alterações seguidas. Aguarde um minuto.');
}

export const ehAdminTecnico = (user) => !!user && config.adminEmails.includes(user.email.toLowerCase());

// Papel do usuário na árvore. Sem vínculo: 404 (não revela que a árvore existe).
export function papelNaArvore(ctx, treeId, minimo = 'reader') {
  const m = get(`SELECT m.role, t.name, t.owner_id FROM tree_memberships m JOIN family_trees t ON t.id = m.tree_id
    WHERE m.tree_id = ? AND m.user_id = ? AND t.deleted_at IS NULL`, treeId, ctx.user.id);
  if (!m) throw erro(404, 'Árvore não encontrada.');
  if (PAPEIS[m.role] < PAPEIS[minimo]) throw erro(403, `Seu papel (${NOME_PAPEL[m.role]}) não permite esta ação.`);
  return m.role;
}
export const pode = (papel, minimo) => PAPEIS[papel] >= PAPEIS[minimo];

// Pessoa precisa pertencer à árvore informada.
export function pessoaNaArvore(treeId, personId) {
  const p = get(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id
    WHERE tp.tree_id = ? AND p.id = ? AND p.deleted_at IS NULL`, treeId, personId);
  if (!p) throw erro(404, 'Pessoa não encontrada nesta árvore.');
  return p;
}

// Colaboradores só alteram o que criaram; editores ou acima alteram tudo.
export function exigirEdicao(ctx, papel, criador) {
  if (pode(papel, 'editor')) return;
  if (papel === 'contributor' && criador === ctx.user.id) return;
  throw erro(403, 'Você só pode alterar registros que criou. Peça a um editor.');
}

// Auditoria: nunca grave valores sensíveis no resumo.
export function auditar(ctx, treeId, acao, entidade = '', entidadeId = '', resumo = '') {
  run('INSERT INTO audit_logs (id, user_id, tree_id, action, entity, entity_id, summary) VALUES (?,?,?,?,?,?,?)',
    uuid(), ctx.user?.id || null, treeId || null, acao, entidade, entidadeId, String(resumo).slice(0, 300));
  if (treeId) run(`UPDATE family_trees SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, treeId);
}

// ---- Validação ----
export function texto(v, { campo = 'Campo', max = 500, obrigatorio = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw erro(400, `${campo}: valor inválido.`);
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (obrigatorio && !s) throw erro(400, `${campo} é obrigatório.`);
  if (s.length > max) throw erro(400, `${campo}: máximo de ${max} caracteres.`);
  return s;
}
export function opcao(v, lista, padrao, campo = 'Campo') {
  if (v === undefined || v === null || v === '') return padrao;
  if (!lista.includes(v)) throw erro(400, `${campo}: opção inválida.`);
  return v;
}
// Datas parciais: AAAA, AAAA-MM ou AAAA-MM-DD.
export function dataParcial(v, campo = 'Data') {
  const s = texto(v, { campo, max: 10 });
  if (!s) return '';
  if (!/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(s)) throw erro(400, `${campo}: use AAAA, AAAA-MM ou AAAA-MM-DD.`);
  return s;
}
export const ehUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function exigirUuid(v, campo = 'Identificador') { if (!ehUuid(v)) throw erro(400, `${campo} inválido.`); return v; }
export function urlSegura(v, campo = 'URL') {
  const s = texto(v, { campo, max: 1000 });
  if (!s) return '';
  try { const u = new URL(s); if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString(); } catch { /* inválida */ }
  throw erro(400, `${campo}: informe um endereço http(s) válido.`);
}
