// Sobe o servidor em porta livre com banco temporário e oferece um cliente com cookie e CSRF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function iniciar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvore-teste-'));
  process.env.DATA_DIR = dir;
  process.env.ADMIN_EMAILS = 'admin@exemplo.test';
  const { criarServidor } = await import('../server/app.js');
  const srv = criarServidor();
  await new Promise((ok) => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, fechar: () => new Promise((ok) => { srv.closeAllConnections(); srv.close(() => { fs.rmSync(dir, { recursive: true, force: true }); ok(); }); }) };
}

export function cliente(base) {
  let cookie = '', csrf = '';
  async function req(metodo, url, corpo, extras = {}) {
    const h = { ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...extras };
    if (corpo !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(base + url, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    if (dados && dados.csrf) csrf = dados.csrf;
    return { status: r.status, dados, headers: r.headers };
  }
  return {
    get: (u) => req('GET', u), post: (u, c = {}) => req('POST', u, c), patch: (u, c = {}) => req('PATCH', u, c), del: (u, c) => req('DELETE', u, c), req,
    async registrar(email, nome = 'Usuário Teste') { const r = await req('POST', '/api/auth/register', { name: nome, email, password: 'senhaforte123' }); if (r.status !== 200) throw new Error(JSON.stringify(r.dados)); return r.dados.usuario; },
    get csrf() { return csrf; }, set csrf(v) { csrf = v; },
  };
}
