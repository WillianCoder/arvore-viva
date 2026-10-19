// Normalização de nomes no navegador (mesma regra básica do servidor).
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const tokens = (s) => normalizar(s).split(' ').filter((t) => t && !PARTICULAS.has(t));
export const sobrenome = (n) => { const t = tokens(n); return t.length > 1 ? t[t.length - 1] : ''; };
export function cpfValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
