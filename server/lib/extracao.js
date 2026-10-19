// Extração assistida (heurística) de nomes, datas e locais em transcrições em português.
// Nada é gravado automaticamente: o resultado é uma lista de sugestões para revisão humana.
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const NUM = { um: 1, primeiro: 1, dois: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const pad = (n) => String(n).padStart(2, '0');

export function extrairDados(texto) {
  const t = String(texto).slice(0, 200000);
  const out = { datas: [], nomes: [], locais: [], relacoes: [] };
  const trecho = (i, n) => t.slice(Math.max(0, i - 40), Math.min(t.length, i + n + 40)).replace(/\s+/g, ' ');

  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const [d, mm, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const ok = d >= 1 && d <= 31 && mm >= 1 && mm <= 12;
    out.datas.push({ valor: ok ? `${a}-${pad(mm)}-${pad(d)}` : String(a), texto: m[0], trecho: trecho(m.index, m[0].length), incerto: !ok });
  }
  for (const m of t.matchAll(/\b(\d{1,2}|[a-zçã]+)\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/gi)) {
    const dia = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1].toLowerCase()];
    const mes = MESES[m[2].toLowerCase()];
    out.datas.push({ valor: dia ? `${m[3]}-${pad(mes)}-${pad(dia)}` : `${m[3]}-${pad(mes)}`, texto: m[0], trecho: trecho(m.index, m[0].length), incerto: !dia });
  }
  // Nomes: sequências de 2+ palavras capitalizadas (com partículas).
  const vistos = new Set();
  for (const m of t.matchAll(/\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,6})\b/g)) {
    const nome = m[1].replace(/\s+/g, ' ');
    if (vistos.has(nome) || /^(Cart[oó]rio|Registro|Certid[aã]o|Estado|Rep[uú]blica|Livro|Folha|Termo)/.test(nome)) continue;
    vistos.add(nome);
    out.nomes.push({ valor: nome, trecho: trecho(m.index, nome.length) });
  }
  for (const m of t.matchAll(/\b(?:natural de|nascid[oa] em|residente em|na cidade de|no munic[ií]pio de|em)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+(?:de|do|da)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)*)/g)) {
    out.locais.push({ valor: m[1], trecho: trecho(m.index, m[0].length), incerto: m[0].toLowerCase().startsWith('em ') });
  }
  for (const m of t.matchAll(/\bfilh[oa] de\s+([^,.;]+?)\s+e\s+(?:de\s+)?([^,.;]+?)[,.;]/gi)) {
    out.relacoes.push({ tipo: 'filiação', genitores: [m[1].trim(), m[2].trim()], trecho: trecho(m.index, m[0].length) });
  }
  for (const m of t.matchAll(/\b(?:casad[oa] com|c[oô]njuge|esposa de|esposo de|marido de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^,.;]+)/g)) {
    out.relacoes.push({ tipo: 'casamento', pessoa: m[1].trim(), trecho: trecho(m.index, m[0].length) });
  }
  return out;
}
