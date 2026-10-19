// Configuração lida do ambiente (.env opcional). Nada aqui vai para o navegador.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Carrega .env simples (CHAVE=valor) sem dependências.
const arqEnv = path.join(raiz, '.env');
if (fs.existsSync(arqEnv)) {
  for (const linha of fs.readFileSync(arqEnv, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const config = {
  raiz,
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(raiz, process.env.DATA_DIR || './data'),
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionDays: 7,
  maxUploadBytes: 10 * 1024 * 1024,
};
