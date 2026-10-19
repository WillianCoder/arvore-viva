// GEDCOM 5.5.1 (leitura e escrita). Também lê arquivos 7.0 nos campos básicos.
const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function dataGedcomParaIso(v) {
  const s = String(v || '').trim().toUpperCase();
  let qual = 'exact', r = s;
  const m0 = r.match(/^(ABT|ABOUT|CAL|EST|BEF|AFT)\s+(.*)$/);
  if (m0) { qual = { ABT: 'about', ABOUT: 'about', CAL: 'estimated', EST: 'estimated', BEF: 'before', AFT: 'after' }[m0[1]]; r = m0[2]; }
  const bet = r.match(/^BET\s+(.*?)\s+AND\s+/); if (bet) { qual = 'about'; r = bet[1]; }
  const m = r.match(/^(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{3,4})$/);
  if (!m) return { date: '', qual: 'exact', bruto: s };
  const ano = m[3].padStart(4, '0');
  const mes = m[2] ? MESES.indexOf(m[2]) + 1 : 0;
  let date = ano;
  if (mes > 0) date += '-' + String(mes).padStart(2, '0');
  if (mes > 0 && m[1]) date += '-' + m[1].padStart(2, '0');
  return { date, qual };
}

export function isoParaGedcom(date, qual) {
  if (!date) return '';
  const [a, m, d] = date.split('-');
  let s = [d ? String(Number(d)) : '', m ? MESES[Number(m) - 1] : '', a].filter(Boolean).join(' ');
  const pre = { about: 'ABT ', estimated: 'EST ', before: 'BEF ', after: 'AFT ' }[qual] || '';
  return pre + s;
}

// Converte o texto em árvore de nós { tag, valor, xref, filhos }.
export function lerGedcom(texto) {
  const raiz = { filhos: [] };
  const pilha = [raiz];
  const erros = [];
  texto.replace(/^﻿/, '').split(/\r?\n/).forEach((linha, i) => {
    if (!linha.trim()) return;
    const m = linha.match(/^\s*(\d+)\s+(@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!m) { erros.push(`Linha ${i + 1} ignorada (formato inválido)`); return; }
    const nivel = Number(m[1]);
    const no = { tag: m[3].toUpperCase(), xref: m[2] ? m[2].trim() : null, valor: m[4] ?? '', filhos: [] };
    if (nivel > pilha.length - 1) { erros.push(`Linha ${i + 1}: nível inesperado`); return; }
    pilha.length = nivel + 1;
    const pai = pilha[nivel];
    if (no.tag === 'CONC' || no.tag === 'CONT') { pai.valor += (no.tag === 'CONT' ? '\n' : '') + no.valor; return; }
    pai.filhos.push(no);
    pilha.push(no);
  });
  return { raiz, erros };
}

const filho = (no, tag) => no.filhos.find((f) => f.tag === tag);
const filhos = (no, tag) => no.filhos.filter((f) => f.tag === tag);

function lerLocal(texto) {
  const partes = String(texto || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!partes.length) return null;
  return { name: partes.join(', '), municipality: partes[0] || '', state: partes.length > 2 ? partes[1] : '', country: partes.length > 1 ? partes[partes.length - 1] : '' };
}

// Interpreta indivíduos e famílias em estruturas neutras para a prévia de importação.
export function interpretarGedcom(texto) {
  const { raiz, erros } = lerGedcom(texto);
  const avisos = [...erros];
  const pessoas = [], familias = [];
  for (const no of raiz.filhos) {
    if (no.tag === 'INDI') {
      const nome = filho(no, 'NAME');
      const bruto = nome?.valor || '';
      const full = bruto.replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || '(sem nome)';
      const ev = (tag) => {
        const e = filho(no, tag);
        if (!e) return null;
        const d = dataGedcomParaIso(filho(e, 'DATE')?.valor);
        return { ...d, place: lerLocal(filho(e, 'PLAC')?.valor) };
      };
      const nasc = ev('BIRT'), obito = ev('DEAT');
      const sexo = (filho(no, 'SEX')?.valor || '').trim().toUpperCase();
      const famc = filhos(no, 'FAMC').map((f) => ({ fam: f.valor.trim(), pedi: (filho(f, 'PEDI')?.valor || '').toLowerCase() }));
      pessoas.push({
        ref: no.xref, full_name: full,
        nicknames: filhos(nome || { filhos: [] }, 'NICK').map((n) => n.valor),
        sex: ['M', 'F'].includes(sexo) ? sexo : '',
        birth: nasc, death: obito,
        living_status: obito || filho(no, 'DEAT') ? 'deceased' : 'unknown',
        famc,
        notes: filhos(no, 'NOTE').map((n) => n.valor).join('\n'),
      });
    } else if (no.tag === 'FAM') {
      const marr = filho(no, 'MARR');
      familias.push({
        ref: no.xref,
        husb: filho(no, 'HUSB')?.valor.trim() || null,
        wife: filho(no, 'WIFE')?.valor.trim() || null,
        chil: filhos(no, 'CHIL').map((c) => c.valor.trim()),
        marr: marr ? { ...dataGedcomParaIso(filho(marr, 'DATE')?.valor), place: lerLocal(filho(marr, 'PLAC')?.valor) } : null,
        div: !!filho(no, 'DIV'),
      });
    }
  }
  const refs = new Set(pessoas.map((p) => p.ref));
  for (const f of familias) for (const r of [f.husb, f.wife, ...f.chil]) if (r && !refs.has(r)) avisos.push(`Família ${f.ref} cita ${r}, que não existe no arquivo`);
  return { pessoas, familias, avisos };
}

const linhaTexto = (nivel, tag, valor) => {
  const v = String(valor ?? '').replace(/\r/g, '');
  const partes = v.split('\n');
  const out = [`${nivel} ${tag}${partes[0] ? ' ' + partes[0] : ''}`];
  for (const p of partes.slice(1)) out.push(`${nivel + 1} CONT ${p}`);
  return out;
};

// dados: { pessoas:[{id,full_name,sex,birth_date,birth_qual,birth_place,death_date,...,privado}], rels }
export function escreverGedcom(dados, nomeArvore) {
  const L = ['0 HEAD', '1 SOUR ARVORE_VIVA', '2 NAME Árvore Viva', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', ...linhaTexto(1, 'NOTE', `Exportado de "${nomeArvore}" em ${new Date().toISOString().slice(0, 10)}`)];
  const ref = new Map(dados.pessoas.map((p, i) => [p.id, `@I${i + 1}@`]));
  // Famílias: agrupa por par de genitores de cada filho, e por casais.
  const fams = new Map();
  const chaveFam = (a, b) => [a || '', b || ''].sort().join('|');
  const pegaFam = (a, b) => { const k = chaveFam(a, b); if (!fams.has(k)) fams.set(k, { a, b, filhos: [], marr: null }); return fams.get(k); };
  const paisDe = new Map();
  for (const r of dados.rels) if (r.type === 'parent' && ref.has(r.person_a) && ref.has(r.person_b)) {
    if (!paisDe.has(r.person_b)) paisDe.set(r.person_b, []);
    paisDe.get(r.person_b).push(r);
  }
  for (const [f, rs] of paisDe) { const fam = pegaFam(rs[0]?.person_a, rs[1]?.person_a); fam.filhos.push({ id: f, pedi: rs[0].subtype === 'adoptive' ? 'adopted' : rs[0].subtype === 'foster' ? 'foster' : '' }); }
  for (const r of dados.rels) if ((r.type === 'spouse' || r.type === 'partner') && ref.has(r.person_a) && ref.has(r.person_b)) pegaFam(r.person_a, r.person_b).marr = r;
  const famRef = new Map([...fams.keys()].map((k, i) => [k, `@F${i + 1}@`]));
  const sexo = new Map(dados.pessoas.map((p) => [p.id, p.sex]));

  for (const p of dados.pessoas) {
    L.push(`0 ${ref.get(p.id)} INDI`);
    if (p.privado) { L.push('1 NAME Privado //', '1 NOTE Pessoa viva ou restrita: dados omitidos'); }
    else {
      const t = p.full_name.trim().split(/\s+/);
      const sob = t.length > 1 ? t.pop() : '';
      L.push(`1 NAME ${t.join(' ')} /${sob}/`);
      if (p.sex === 'M' || p.sex === 'F') L.push(`1 SEX ${p.sex}`);
      for (const [tag, d, q, pl] of [['BIRT', p.birth_date, p.birth_qual, p.birth_place], ['DEAT', p.death_date, p.death_qual, p.death_place]]) {
        if (!d && !pl) continue;
        L.push(`1 ${tag}`);
        if (d) L.push(`2 DATE ${isoParaGedcom(d, q)}`);
        if (pl) L.push(`2 PLAC ${pl}`);
      }
      if (p.living_status === 'deceased' && !p.death_date && !p.death_place) L.push('1 DEAT Y');
    }
    for (const [k, f] of fams) {
      if (f.filhos.some((c) => c.id === p.id)) { L.push(`1 FAMC ${famRef.get(k)}`); const pedi = f.filhos.find((c) => c.id === p.id).pedi; if (pedi) L.push(`2 PEDI ${pedi}`); }
      if (f.a === p.id || f.b === p.id) L.push(`1 FAMS ${famRef.get(k)}`);
    }
  }
  for (const [k, f] of fams) {
    L.push(`0 ${famRef.get(k)} FAM`);
    const [h, w] = sexo.get(f.a) === 'F' || sexo.get(f.b) === 'M' ? [f.b, f.a] : [f.a, f.b];
    if (h) L.push(`1 HUSB ${ref.get(h)}`);
    if (w) L.push(`1 WIFE ${ref.get(w)}`);
    for (const c of f.filhos) L.push(`1 CHIL ${ref.get(c.id)}`);
    if (f.marr?.start_date) L.push('1 MARR', `2 DATE ${isoParaGedcom(f.marr.start_date, 'exact')}`);
  }
  L.push('0 TRLR');
  return L.join('\r\n') + '\r\n';
}
