// Mini-framework HTTP: rotas, JSON, cabeçalhos de segurança, limite de requisições e arquivos estáticos.
import fs from 'node:fs';
import path from 'node:path';

export class AppError extends Error {
  constructor(status, mensagem, detalhes) { super(mensagem); this.status = status; this.detalhes = detalhes; }
}
export const erro = (status, msg, det) => new AppError(status, msg, det);

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

export function cabecalhosSeguranca(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // perfis nunca indexados
}

// Limite de requisições por IP (janela deslizante simples, em memória).
const baldes = new Map();
export function limitar(chave, max, janelaMs) {
  const agora = Date.now();
  const b = baldes.get(chave) || [];
  const recentes = b.filter((t) => agora - t < janelaMs);
  recentes.push(agora);
  baldes.set(chave, recentes);
  if (baldes.size > 50000) baldes.clear();
  return recentes.length <= max;
}
export const limparLimites = () => baldes.clear();

export function lerCookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

function lerCorpo(req, max) {
  return new Promise((ok, falha) => {
    let total = 0;
    const partes = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > max) { falha(erro(413, 'Conteúdo maior que o permitido.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falha);
  });
}

export class Router {
  constructor() { this.rotas = []; }
  add(metodo, padrao, handler, opcoes = {}) {
    const nomes = [];
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '$');
    this.rotas.push({ metodo, re, nomes, handler, opcoes });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  patch(p, h, o) { this.add('PATCH', p, h, o); }
  delete(p, h, o) { this.add('DELETE', p, h, o); }
  achar(metodo, caminho) {
    for (const r of this.rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (m) return { rota: r, params: Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

// Envia resposta. Handler pode devolver objeto (JSON) ou { status, body, headers, raw }.
function responder(res, r) {
  if (r && r.raw !== undefined) {
    res.writeHead(r.status || 200, r.headers || {});
    res.end(r.raw);
    return;
  }
  const status = r?.status && r?.body !== undefined ? r.status : 200;
  const corpo = r?.status && r?.body !== undefined ? r.body : (r ?? { ok: true });
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

export function criarHandler({ router, antes, estaticos }) {
  return async (req, res) => {
    cabecalhosSeguranca(res);
    const url = new URL(req.url, 'http://local');
    const ip = req.socket.remoteAddress || '?';
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!limitar('geral:' + ip, 600, 60000)) throw erro(429, 'Muitas requisições. Aguarde um minuto.');
        const achado = router.achar(req.method, url.pathname);
        if (!achado) throw erro(404, 'Recurso não encontrado.');
        const { rota, params } = achado;
        const ctx = { req, res, ip, params, query: Object.fromEntries(url.searchParams), body: {}, opcoes: rota.opcoes };
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          const tipo = req.headers['content-type'] || '';
          const bruto = await lerCorpo(req, rota.opcoes.maxBody || 1024 * 1024);
          if (bruto.length) {
            if (!tipo.includes('application/json')) throw erro(415, 'Envie os dados em JSON.');
            try { ctx.body = JSON.parse(bruto.toString('utf8')); } catch { throw erro(400, 'JSON inválido.'); }
            if (typeof ctx.body !== 'object' || ctx.body === null || Array.isArray(ctx.body)) throw erro(400, 'Corpo da requisição inválido.');
          }
        }
        await antes(ctx);
        responder(res, await rota.handler(ctx));
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw erro(405, 'Método não permitido.');
      servirEstatico(estaticos, url.pathname, res);
    } catch (e) {
      if (!(e instanceof AppError)) console.error('[erro]', req.method, url.pathname, e?.stack || e);
      const status = e instanceof AppError ? e.status : 500;
      if (res.headersSent) { res.end(); return; }
      responder(res, { status, body: { erro: e instanceof AppError ? e.message : 'Erro interno. Tente novamente.', detalhes: e.detalhes } });
    }
  };
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function servirEstatico(mapas, caminho, res) {
  for (const [prefixo, pasta] of mapas) {
    if (!caminho.startsWith(prefixo)) continue;
    const rel = caminho.slice(prefixo.length) || 'index.html';
    const alvo = path.resolve(pasta, '.' + path.posix.normalize('/' + rel));
    if (!alvo.startsWith(path.resolve(pasta) + path.sep)) break;
    if (fs.existsSync(alvo) && fs.statSync(alvo).isFile()) {
      enviarArquivo(res, alvo);
      return;
    }
  }
  // SPA: rotas desconhecidas sem extensão devolvem o app.
  const idx = path.join(mapas[mapas.length - 1][1], 'index.html');
  if (!path.extname(caminho) && fs.existsSync(idx)) { enviarArquivo(res, idx); return; }
  throw erro(404, 'Arquivo não encontrado.');
}

function enviarArquivo(res, arq) {
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(arq).on('error', () => res.destroy()).pipe(res);
}
