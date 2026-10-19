// CSV simples com aspas (RFC 4180). Detecta ; ou , como separador.
export function lerCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/)[0] || '';
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x !== '')) linhas.push(linha);
  const [cab = [], ...dados] = linhas;
  return { cabecalho: cab.map((c) => c.trim()), linhas: dados };
}

// Evita injeção de fórmulas em planilhas (=, +, -, @).
const celula = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const escreverCsv = (cab, linhas) => '﻿' + [cab, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
