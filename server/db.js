// Banco SQLite embutido (node:sqlite) com migrações versionadas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'arvore.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export function migrar() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const feitas = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const pasta = path.join(config.raiz, 'server', 'migrations');
  const aplicadas = [];
  for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    if (feitas.has(arq)) continue;
    tx(() => {
      db.exec(fs.readFileSync(path.join(pasta, arq), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(arq, new Date().toISOString());
    });
    aplicadas.push(arq);
  }
  return aplicadas;
}

export const uuid = () => crypto.randomUUID();
export const agora = () => new Date().toISOString();
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

let nivel = 0;
// Transação reentrante (savepoints quando aninhada).
export function tx(fn) {
  const nome = `sp${nivel}`;
  db.exec(nivel === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${nome}`);
  nivel++;
  try {
    const r = fn();
    nivel--;
    db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${nome}`);
    return r;
  } catch (e) {
    nivel--;
    db.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
    throw e;
  }
}
