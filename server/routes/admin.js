// Administração técnica (e-mails em ADMIN_EMAILS): estado, backup, auditoria, links de redefinição.
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, db } from '../db.js';
import { erro } from '../http.js';
import { ehAdminTecnico, auditar, texto } from '../acesso.js';
import { tokenAleatorio, sha256 } from '../lib/seguranca.js';
import { config } from '../config.js';
import { removerArquivosOrfaos } from './documentos.js';

const exigirAdmin = (ctx) => { if (!ehAdminTecnico(ctx.user)) throw erro(404, 'Recurso não encontrado.'); };

export function fazerBackup() {
  const pasta = path.join(config.raiz, 'backups');
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, `arvore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.prepare('VACUUM INTO ?').run(arq);
  return arq;
}

export function rotasAdmin(r) {
  r.get('/api/admin/status', (ctx) => {
    exigirAdmin(ctx);
    const n = (t) => get(`SELECT COUNT(*) n FROM ${t}`).n;
    const arqDb = path.join(config.dataDir, 'arvore.db');
    return {
      versao: JSON.parse(fs.readFileSync(path.join(config.raiz, 'package.json'), 'utf8')).version,
      node: process.version, uptime_s: Math.round(process.uptime()),
      banco_bytes: fs.existsSync(arqDb) ? fs.statSync(arqDb).size : 0,
      migracoes: all('SELECT version, applied_at FROM schema_migrations ORDER BY version'),
      contagens: { usuarios: n('users'), arvores: n('family_trees'), pessoas: n('persons'), relacoes: n('relationships'), documentos: n('documents'), auditoria: n('audit_logs') },
      chave_configurada: config.encryptionKey.length >= 32,
      cookie_seguro: config.cookieSecure,
      email_configurado: false, ocr_imagens: false,
    };
  });
  r.post('/api/admin/backup', (ctx) => {
    exigirAdmin(ctx);
    const arq = fazerBackup();
    auditar(ctx, null, 'admin.backup', 'system', '', path.basename(arq));
    return { arquivo: path.basename(arq), aviso: 'O backup do banco não inclui a pasta de arquivos enviados (data/arquivos). Copie-a junto, com a ENCRYPTION_KEY guardada em local seguro.' };
  });
  r.get('/api/admin/audit', (ctx) => {
    exigirAdmin(ctx);
    return { registros: all(`SELECT a.action, a.entity, a.entity_id, a.tree_id, a.summary, a.created_at, u.email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 300`) };
  });
  r.post('/api/admin/reset-link', (ctx) => {
    exigirAdmin(ctx);
    const email = texto(ctx.body.email, { campo: 'E-mail', max: 200, obrigatorio: true }).toLowerCase();
    const u = get('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', email);
    if (!u) throw erro(404, 'Conta não encontrada.');
    const token = tokenAleatorio();
    run('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?', sha256(token), new Date(Date.now() + 3600e3).toISOString(), u.id);
    auditar(ctx, null, 'admin.link_redefinicao', 'user', u.id);
    return { link: `/redefinir/${token}`, expira_em: '1 hora' };
  });
  r.post('/api/admin/cleanup-files', (ctx) => {
    exigirAdmin(ctx);
    return { removidos: removerArquivosOrfaos() };
  });
}
