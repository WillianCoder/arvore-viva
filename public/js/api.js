// Cliente da API: envia o token CSRF, trata erros com mensagens claras.
let csrf = '';
export const definirCsrf = (v) => { csrf = v || ''; };
export class ErroApi extends Error { constructor(msg, status, detalhes) { super(msg); this.status = status; this.detalhes = detalhes; } }

export async function api(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {}, credentials: 'same-origin' };
  if (metodo !== 'GET') opcoes.headers['X-CSRF-Token'] = csrf;
  if (corpo !== undefined) { opcoes.headers['Content-Type'] = 'application/json'; opcoes.body = JSON.stringify(corpo); }
  let r;
  try { r = await fetch(url, opcoes); } catch { throw new ErroApi('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0); }
  let dados = null;
  if ((r.headers.get('content-type') || '').includes('json')) { try { dados = await r.json(); } catch { dados = null; } }
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new CustomEvent('sessao-expirada'));
    throw new ErroApi(dados?.erro || `Erro ${r.status}. Tente novamente.`, r.status, dados?.detalhes);
  }
  return dados;
}
export const GET = (u) => api('GET', u);
export const POST = (u, c = {}) => api('POST', u, c);
export const PATCH = (u, c = {}) => api('PATCH', u, c);
export const DEL = (u, c) => api('DELETE', u, c);
export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
