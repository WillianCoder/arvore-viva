// Normalização e comparação de nomes tolerante a acentos, grafias e erros de digitação.
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di', 'del', 'van', 'von', 'y']);
const ABREV = { ma: 'maria', jo: 'jose', jos: 'jose', ant: 'antonio', fco: 'francisco', fca: 'francisca', mel: 'manoel', sebas: 'sebastiao' };

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function tokens(s) {
  return normalizar(s).split(' ').filter((t) => t && !PARTICULAS.has(t)).map((t) => ABREV[t] || t);
}

// Chave fonética simplificada para o português (Souza/Sousa, Thereza/Teresa, Luiz/Luis...).
export function foneticoToken(t) {
  let s = t;
  s = s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/sch|sh|ch/g, 'x').replace(/lh/g, 'li').replace(/nh/g, 'ni')
    .replace(/y/g, 'i').replace(/w/g, 'v').replace(/k/g, 'c').replace(/qu/g, 'c').replace(/gu(?=[ei])/g, 'g')
    .replace(/c(?=[ei])/g, 's').replace(/ç/g, 's').replace(/z/g, 's').replace(/^h/, '').replace(/h/g, '')
    .replace(/(.)\1+/g, '$1').replace(/m$/, 'n').replace(/[ao]$/, 'a').replace(/e$/, 'i');
  return s;
}
export const fonetico = (s) => tokens(s).map(foneticoToken).join(' ');

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = cur;
  }
  return ant[b.length];
}

function simToken(a, b) {
  if (a === b) return 1;
  if (foneticoToken(a) === foneticoToken(b)) return 0.92;
  // Inicial ("J." casa com "Jose")
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.7;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.8;
  const d = levenshtein(a, b);
  return Math.max(0, 1 - d / Math.max(a.length, b.length));
}

// Similaridade 0..1 entre dois nomes, tolerando ordem e tokens faltantes.
export function similaridade(n1, n2) {
  const a = tokens(n1), b = tokens(n2);
  if (!a.length || !b.length) return 0;
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  let soma = 0;
  const usados = new Set();
  for (const t of menor) {
    let melhor = 0, idx = -1;
    maior.forEach((u, i) => { if (!usados.has(i)) { const s = simToken(t, u); if (s > melhor) { melhor = s; idx = i; } } });
    if (idx >= 0) usados.add(idx);
    soma += melhor;
  }
  const cobertura = menor.length / maior.length;
  return (soma / menor.length) * (0.75 + 0.25 * cobertura);
}

// Consulta parcial: cada termo digitado precisa casar com algum token.
export function casaConsulta(consulta, nome) {
  const q = tokens(consulta), t = tokens(nome);
  if (!q.length) return 1;
  let soma = 0;
  for (const termo of q) {
    let melhor = 0;
    for (const u of t) {
      let s = simToken(termo, u);
      if (u.startsWith(termo) && termo.length >= 2) s = Math.max(s, 0.9);
      melhor = Math.max(melhor, s);
    }
    if (melhor < 0.6) return 0;
    soma += melhor;
  }
  return soma / q.length;
}

export const sobrenome = (nome) => { const t = tokens(nome); return t.length > 1 ? t[t.length - 1] : ''; };
export const ano = (data) => { const m = String(data ?? '').match(/^(\d{4})/); return m ? Number(m[1]) : null; };
