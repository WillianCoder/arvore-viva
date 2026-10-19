// Contas: cadastro, login, sessão, preferências, recuperação e direitos do titular (LGPD).
import { all, get, run, tx, uuid } from '../db.js';
import { erro, limitar } from '../http.js';
import { COOKIE, texto, auditar, ehAdminTecnico } from '../acesso.js';
import { hashSenha, conferirSenha, tokenAleatorio, sha256 } from '../lib/seguranca.js';
import { config } from '../config.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validarSenha(s) {
  if (typeof s !== 'string' || s.length < 10) throw erro(400, 'A senha precisa ter pelo menos 10 caracteres.');
  if (s.length > 200) throw erro(400, 'Senha longa demais.');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw erro(400, 'Use letras e números na senha.');
}

function abrirSessao(ctx, userId) {
  const token = tokenAleatorio();
  const csrf = tokenAleatorio(24);
  const expira = new Date(Date.now() + config.sessionDays * 864e5).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?,?,?,?)', sha256(token), userId, csrf, expira);
  run(`DELETE FROM sessions WHERE expires_at < ?`, new Date().toISOString());
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${config.sessionDays * 86400}`];
  if (config.cookieSecure) attrs.push('Secure');
  ctx.res.setHeader('Set-Cookie', attrs.join('; '));
  return csrf;
}

const perfil = (u, csrf) => ({ usuario: { id: u.id, name: u.name, email: u.email, preferences: typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences, admin_tecnico: ehAdminTecnico(u) }, csrf });

export function rotasAuth(r) {
  r.get('/api/auth/me', (ctx) => (ctx.user ? perfil(ctx.user, ctx.sessao.csrf) : { usuario: null }), { publica: true });

  r.post('/api/auth/register', (ctx) => {
    if (!limitar('cadastro:' + ctx.ip, 10, 15 * 60000)) throw erro(429, 'Muitas tentativas. Tente mais tarde.');
    const name = texto(ctx.body.name, { campo: 'Nome', max: 120, obrigatorio: true });
    const email = texto(ctx.body.email, { campo: 'E-mail', max: 200, obrigatorio: true }).toLowerCase();
    if (!EMAIL.test(email)) throw erro(400, 'E-mail inválido.');
    validarSenha(ctx.body.password);
    if (get('SELECT 1 FROM users WHERE email = ?', email)) throw erro(409, 'Já existe uma conta com este e-mail.');
    const id = uuid();
    run('INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)', id, email, name, hashSenha(ctx.body.password));
    ctx.user = { id };
    auditar(ctx, null, 'conta.criada', 'user', id);
    const csrf = abrirSessao(ctx, id);
    return perfil(get('SELECT * FROM users WHERE id = ?', id), csrf);
  }, { publica: true });

  r.post('/api/auth/login', (ctx) => {
    if (!limitar('login:' + ctx.ip, 20, 15 * 60000)) throw erro(429, 'Muitas tentativas. Tente mais tarde.');
    const email = texto(ctx.body.email, { campo: 'E-mail', max: 200 }).toLowerCase();
    const u = get('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', email);
    const falha = erro(401, 'E-mail ou senha incorretos.');
    if (!u) { hashSenha('tempo-constante'); throw falha; }
    if (u.locked_until && u.locked_until > new Date().toISOString()) throw erro(423, 'Conta bloqueada temporariamente por tentativas erradas. Tente em 15 minutos.');
    if (!conferirSenha(String(ctx.body.password || ''), u.password_hash)) {
      const n = u.failed_logins + 1;
      run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', n >= 8 ? 0 : n, n >= 8 ? new Date(Date.now() + 15 * 60000).toISOString() : null, u.id);
      throw falha;
    }
    run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', u.id);
    ctx.user = u;
    auditar(ctx, null, 'conta.login', 'user', u.id);
    return perfil(u, abrirSessao(ctx, u.id));
  }, { publica: true });

  r.post('/api/auth/logout', (ctx) => {
    if (ctx.sessao) run('DELETE FROM sessions WHERE token_hash = ?', ctx.sessao.hash);
    ctx.res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  }, { publica: true });

  r.patch('/api/auth/preferences', (ctx) => {
    const pref = { ...ctx.user.preferences };
    if (ctx.body.theme !== undefined) pref.theme = ['light', 'dark', 'system'].includes(ctx.body.theme) ? ctx.body.theme : 'system';
    if (ctx.body.reduceMotion !== undefined) pref.reduceMotion = !!ctx.body.reduceMotion;
    if (ctx.body.lastTree !== undefined) pref.lastTree = typeof ctx.body.lastTree === 'string' ? ctx.body.lastTree.slice(0, 40) : null;
    if (ctx.body.lastPerson !== undefined) pref.lastPerson = typeof ctx.body.lastPerson === 'string' ? ctx.body.lastPerson.slice(0, 40) : null;
    run('UPDATE users SET preferences = ? WHERE id = ?', JSON.stringify(pref), ctx.user.id);
    return { preferences: pref };
  });

  r.post('/api/auth/password', (ctx) => {
    const u = get('SELECT * FROM users WHERE id = ?', ctx.user.id);
    if (!conferirSenha(String(ctx.body.current || ''), u.password_hash)) throw erro(400, 'Senha atual incorreta.');
    validarSenha(ctx.body.password);
    tx(() => {
      run('UPDATE users SET password_hash = ? WHERE id = ?', hashSenha(ctx.body.password), u.id);
      run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', u.id, ctx.sessao.hash);
    });
    auditar(ctx, null, 'conta.senha_alterada', 'user', u.id);
    return { ok: true };
  });

  // Recuperação: sem servidor de e-mail configurado, o link é gerado pela administração técnica.
  r.post('/api/auth/recover', (ctx) => {
    if (!limitar('recuperar:' + ctx.ip, 5, 15 * 60000)) throw erro(429, 'Muitas tentativas. Tente mais tarde.');
    return { ok: true, email_configurado: false, mensagem: 'O envio de e-mail ainda não está configurado neste servidor. Peça à administração técnica um link de redefinição de senha.' };
  }, { publica: true });

  r.post('/api/auth/reset', (ctx) => {
    if (!limitar('reset:' + ctx.ip, 10, 15 * 60000)) throw erro(429, 'Muitas tentativas. Tente mais tarde.');
    const token = texto(ctx.body.token, { campo: 'Código', max: 100, obrigatorio: true });
    const u = get('SELECT * FROM users WHERE reset_token_hash = ? AND deleted_at IS NULL', sha256(token));
    if (!u || !u.reset_expires_at || u.reset_expires_at < new Date().toISOString()) throw erro(400, 'Link de redefinição inválido ou expirado.');
    validarSenha(ctx.body.password);
    tx(() => {
      run('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL, failed_logins = 0, locked_until = NULL WHERE id = ?', hashSenha(ctx.body.password), u.id);
      run('DELETE FROM sessions WHERE user_id = ?', u.id);
    });
    ctx.user = u;
    auditar(ctx, null, 'conta.senha_redefinida', 'user', u.id);
    return { ok: true };
  }, { publica: true });

  // Direito de acesso/portabilidade do titular da conta.
  r.get('/api/auth/my-data', (ctx) => {
    const u = get('SELECT id, email, name, created_at, preferences FROM users WHERE id = ?', ctx.user.id);
    return {
      conta: u,
      arvores: all(`SELECT t.id, t.name, m.role FROM tree_memberships m JOIN family_trees t ON t.id = m.tree_id WHERE m.user_id = ? AND t.deleted_at IS NULL`, u.id),
      atividades: all('SELECT action, entity, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000', u.id),
    };
  });

  // Exclusão da conta: apaga árvores das quais é proprietário e remove dados pessoais da conta.
  r.post('/api/auth/delete-account', (ctx) => {
    const u = get('SELECT * FROM users WHERE id = ?', ctx.user.id);
    if (!conferirSenha(String(ctx.body.password || ''), u.password_hash)) throw erro(400, 'Senha incorreta.');
    if (ctx.body.confirm !== 'EXCLUIR') throw erro(400, 'Digite EXCLUIR para confirmar.');
    tx(() => {
      for (const t of all('SELECT id FROM family_trees WHERE owner_id = ?', u.id)) apagarArvoreDefinitivo(t.id);
      run('DELETE FROM tree_memberships WHERE user_id = ?', u.id);
      run('DELETE FROM sessions WHERE user_id = ?', u.id);
      run(`UPDATE users SET email = ?, name = 'Conta excluída', password_hash = '!', preferences = '{}', deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, `excluido-${u.id}@invalido`, u.id);
    });
    auditar(ctx, null, 'conta.excluida', 'user', u.id);
    ctx.res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });
}

// Remove a árvore e as pessoas que só existiam nela (arquivos são apagados pelo chamador de documentos).
export function apagarArvoreDefinitivo(treeId) {
  const exclusivas = all(`SELECT person_id FROM tree_persons WHERE tree_id = ? AND person_id NOT IN
    (SELECT person_id FROM tree_persons WHERE tree_id <> ?)`, treeId, treeId).map((r) => r.person_id);
  run('DELETE FROM family_trees WHERE id = ?', treeId);
  for (const id of exclusivas) run('DELETE FROM persons WHERE id = ?', id);
}
