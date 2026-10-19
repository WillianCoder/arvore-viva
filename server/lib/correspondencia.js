// Correspondência genealógica explicável. A pontuação é uma estimativa interna de
// compatibilidade (0–100), não uma probabilidade estatística calibrada.
import { similaridade, sobrenome, ano, normalizar, foneticoToken, tokens } from './nomes.js';

export const CATEGORIAS = {
  documental_forte: 'Correspondência documental forte',
  genealogica_consistente: 'Correspondência genealógica consistente',
  possivel: 'Possível correspondência',
  inconclusiva: 'Correspondência inconclusiva',
  improvavel: 'Correspondência improvável',
  conflitante: 'Registros conflitantes',
};

const nomesCasam = (l1, l2) => l1.filter((n) => l2.some((m) => similaridade(n, m) >= 0.85)).length;

// p = { full_name, birth_name, sex, birth_year, death_year, birth_place:{municipality,country},
//       pais:[nomes], conjuges:[nomes], filhos:[nomes], ids:[{kind,hmac}], nomes_alt:[...] }
export function compararPessoas(p, q) {
  const pos = [], neg = [], falt = [];
  let score = 0, conflitoForte = false, documental = false;

  const nomesP = [p.full_name, p.birth_name, ...(p.nomes_alt || [])].filter(Boolean);
  const nomesQ = [q.full_name, q.birth_name, ...(q.nomes_alt || [])].filter(Boolean);
  let sim = 0;
  for (const a of nomesP) for (const b of nomesQ) sim = Math.max(sim, similaridade(a, b));
  score += Math.round(30 * sim);
  pos.push({ fator: 'Nome', detalhe: `semelhança de ${Math.round(sim * 100)}% entre nomes e variações`, peso: Math.round(30 * sim) });
  const sp = sobrenome(p.full_name), sq = sobrenome(q.full_name);
  if (sp && sq && foneticoToken(sp) === foneticoToken(sq)) {
    score += 5;
    pos.push({ fator: 'Sobrenome', detalhe: 'sobrenome compartilhado (sozinho não comprova parentesco)', peso: 5 });
  }

  if (p.sex && q.sex && p.sex !== q.sex) { score -= 30; conflitoForte = true; neg.push({ fator: 'Sexo', detalhe: 'sexo registrado diferente', peso: -30 }); }

  const compAno = (rot, a, b, bom, conflito) => {
    if (a == null || b == null) { falt.push(`${rot} em um dos registros`); return; }
    const d = Math.abs(a - b);
    if (d === 0) { score += bom; pos.push({ fator: rot, detalhe: `mesmo ano (${a})`, peso: bom }); }
    else if (d <= 2) { score += Math.round(bom * 0.6); pos.push({ fator: rot, detalhe: `anos próximos (${a} e ${b})`, peso: Math.round(bom * 0.6) }); }
    else if (d <= 5) { score += 3; pos.push({ fator: rot, detalhe: `diferença de ${d} anos`, peso: 3 }); }
    else if (d > 10) { score -= conflito; conflitoForte = true; neg.push({ fator: rot, detalhe: `diferença de ${d} anos (${a} e ${b})`, peso: -conflito }); }
    else { score -= 5; neg.push({ fator: rot, detalhe: `diferença de ${d} anos`, peso: -5 }); }
  };
  compAno('Ano de nascimento', p.birth_year, q.birth_year, 15, 20);
  compAno('Ano de falecimento', p.death_year, q.death_year, 10, 15);

  const lp = p.birth_place, lq = q.birth_place;
  if (lp?.municipality && lq?.municipality) {
    if (normalizar(lp.municipality) === normalizar(lq.municipality)) { score += 10; pos.push({ fator: 'Local de nascimento', detalhe: `mesmo município (${lp.municipality})`, peso: 10 }); }
    else { score -= 5; neg.push({ fator: 'Local de nascimento', detalhe: `municípios diferentes (${lp.municipality} e ${lq.municipality})`, peso: -5 }); }
  } else if (lp?.country && lq?.country && normalizar(lp.country) === normalizar(lq.country)) {
    score += 3; pos.push({ fator: 'Local de nascimento', detalhe: `mesmo país (${lp.country})`, peso: 3 });
  } else falt.push('local de nascimento comparável');

  const rel = (rot, l1, l2, peso) => {
    if (!l1?.length || !l2?.length) { falt.push(`${rot} registrados nos dois lados`); return; }
    const n = nomesCasam(l1, l2);
    if (n) { score += peso * Math.min(n, 2); pos.push({ fator: rot, detalhe: `${n} nome(s) em comum`, peso: peso * Math.min(n, 2) }); }
    else { score -= 4; neg.push({ fator: rot, detalhe: 'nenhum nome em comum', peso: -4 }); }
  };
  rel('Pais', p.pais, q.pais, 12);
  rel('Cônjuges', p.conjuges, q.conjuges, 10);
  rel('Filhos', p.filhos, q.filhos, 6);

  // Identificador idêntico indica MESMO indivíduo, nunca parentesco entre pessoas diferentes.
  for (const i of p.ids || []) {
    const outro = (q.ids || []).find((j) => j.kind === i.kind);
    if (!outro) continue;
    if (outro.hmac === i.hmac) { documental = true; score += 40; pos.push({ fator: 'Identificador', detalhe: `mesmo ${i.kind.toUpperCase()} nos dois registros (indica a mesma pessoa)`, peso: 40 }); }
    else if (i.kind === 'cpf') { score -= 50; conflitoForte = true; neg.push({ fator: 'Identificador', detalhe: 'CPFs diferentes', peso: -50 }); }
  }

  score = Math.max(0, Math.min(100, score));
  let categoria;
  if (conflitoForte) categoria = score >= 45 ? 'conflitante' : 'improvavel';
  else if (documental && sim >= 0.7) categoria = 'documental_forte';
  else if (score >= 70) categoria = 'genealogica_consistente';
  else if (score >= 45) categoria = 'possivel';
  else if (score >= 25) categoria = 'inconclusiva';
  else categoria = 'improvavel';
  return { score, categoria, rotulo: CATEGORIAS[categoria], fatores: { positivos: pos, negativos: neg, faltantes: falt } };
}

// Bloqueio: só compara pares com algum token fonético em comum (evita O(n²) completo).
export function paresCandidatos(perfis, limite = 5000) {
  const indice = new Map();
  for (const p of perfis) {
    const chaves = new Set([p.full_name, p.birth_name, ...(p.nomes_alt || [])].flatMap((n) => tokens(n)).map(foneticoToken));
    for (const k of chaves) { if (!indice.has(k)) indice.set(k, []); indice.get(k).push(p); }
  }
  const pares = new Map();
  for (const lista of indice.values()) {
    if (lista.length > 400) continue; // token comum demais (ex.: "maria"): não serve para bloquear
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const [a, b] = [lista[i], lista[j]].sort((x, y) => (x.id < y.id ? -1 : 1));
      if (a.id === b.id) continue;
      const k = a.id + '|' + b.id;
      pares.set(k, (pares.get(k) || { a, b, n: 0 }));
      pares.get(k).n++;
      if (pares.size >= limite) return [...pares.values()];
    }
  }
  return [...pares.values()].filter((x) => x.n >= 1);
}
