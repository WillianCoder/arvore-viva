import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpfValido, mascarar } from '../server/lib/cpf.js';
import { similaridade, casaConsulta, fonetico, normalizar } from '../server/lib/nomes.js';
import { calcularParentesco, descrever, contarGeracoes } from '../server/lib/parentesco.js';
import { compararPessoas } from '../server/lib/correspondencia.js';
import { interpretarGedcom, escreverGedcom, dataGedcomParaIso } from '../server/lib/gedcom.js';
import { lerCsv, escreverCsv } from '../server/lib/csv.js';
import { extrairDados } from '../server/lib/extracao.js';

test('CPF: dígitos verificadores', () => {
  // Gera um CPF matematicamente válido só para o teste (não é de ninguém conhecido).
  const base = '123456789';
  const dv = (s, n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(s[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 9), d2 = dv(base + d1, 10);
  assert.equal(cpfValido(base + d1 + d2), true);
  assert.equal(cpfValido(`${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6)}-${d1}${d2}`), true);
  assert.equal(cpfValido(base + d1 + ((d2 + 1) % 10)), false);
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cpfValido('123'), false);
  assert.equal(mascarar('cpf', '09'), '•••.•••.•••-09');
});

test('Nomes: acentos, grafias e erros de digitação', () => {
  assert.equal(normalizar('  Conceição  Ávila '), 'conceicao avila');
  assert.equal(fonetico('Souza'), fonetico('Sousa'));
  assert.equal(fonetico('Thereza'), fonetico('Teresa'));
  assert.equal(fonetico('Luiz'), fonetico('Luis'));
  assert.ok(similaridade('José da Silva Souza', 'Jose Silva Sousa') > 0.85);
  assert.ok(similaridade('Maria Aparecida', 'Pedro Henrique') < 0.5);
  assert.ok(casaConsulta('corvali', 'Pietro Corvalli') > 0.6, 'tolera erro de digitação');
  assert.ok(casaConsulta('ped corv', 'Pedro Corvalli') > 0.6, 'aceita nome parcial');
  assert.equal(casaConsulta('Ferreira', 'Pietro Corvalli'), 0);
});

// Árvore de teste: avô G, filhos P e T, netos A (de P) e B (de T), bisneto C (de A).
const P = (id, sex = 'M') => [id, { id, sex }];
const rel = (a, b, type = 'parent', subtype = 'biological') => ({ id: `${a}-${b}`, person_a: a, person_b: b, type, subtype, status: 'declared' });
const pessoas = new Map([P('G'), P('G2', 'F'), P('P'), P('T', 'F'), P('A'), P('B', 'F'), P('C'), P('S', 'F'), P('X'), P('M2', 'F')]);
const rels = [rel('G', 'P'), rel('G2', 'P'), rel('G', 'T'), rel('G2', 'T'), rel('P', 'A'), rel('T', 'B'), rel('A', 'C'), rel('A', 'S', 'spouse'), rel('G', 'X'), rel('M2', 'X')];

test('Parentesco: graus e caminhos', () => {
  const desc = (a, b) => calcularParentesco(pessoas, rels, a, b).resultados?.[0]?.descricao;
  assert.equal(desc('G', 'A'), 'avô');
  assert.equal(desc('G', 'C'), 'bisavô');
  assert.equal(desc('C', 'G'), 'bisneto');
  assert.equal(desc('P', 'T'), 'irmão');
  assert.equal(desc('T', 'A'), 'tia');
  assert.equal(desc('A', 'B'), 'primo de primeiro grau');
  assert.equal(desc('C', 'B'), 'primo de primeiro grau, afastado 1 geração');
  assert.equal(desc('P', 'X'), 'meio-irmão');
  assert.equal(desc('S', 'A'), 'cônjuge/parceira');
  const r = calcularParentesco(pessoas, rels, 'A', 'B');
  assert.equal(r.resultados.length, 1, 'casal de avós gera um só resultado');
  assert.equal(r.resultados[0].ancestrais.length, 2);
  assert.deepEqual(r.resultados[0].caminho.map((n) => n.id), ['A', 'P', 'G', 'T', 'B']);
  const ind = calcularParentesco(new Map([...pessoas, P('Z')]), rels, 'A', 'Z');
  assert.equal(ind.indeterminado, true);
  assert.equal(descrever(3, 1, 'M'), 'sobrinho-neto');
  assert.equal(contarGeracoes([...pessoas.keys()], rels).geracoes, 4);
});

test('Parentesco: vínculo adotivo é sinalizado', () => {
  const r2 = [...rels, rel('B', 'Y', 'parent', 'adoptive')];
  const res = calcularParentesco(new Map([...pessoas, P('Y')]), r2, 'T', 'Y');
  assert.equal(res.resultados[0].descricao, 'avó');
  assert.ok(res.resultados[0].avisos.includes('inclui vínculo adotivo'));
});

test('Correspondência: explica fatores e nunca trata sobrenome como prova', () => {
  const a = { full_name: 'Pietro Corvalli', sex: 'M', birth_year: 1895, birth_place: { municipality: 'São Paulo' }, pais: ['Matteo Corvalli'] };
  const b = { full_name: 'Pedro Corvali', sex: 'M', birth_year: 1895, birth_place: { municipality: 'Sao Paulo' }, pais: ['Mateo Corvalli'] };
  const c = compararPessoas(a, b);
  assert.ok(c.score >= 60, `score ${c.score}`);
  assert.ok(c.fatores.positivos.some((f) => f.fator === 'Pais'));
  const so = compararPessoas({ full_name: 'Ana Corvalli' }, { full_name: 'Bruno Corvalli' });
  assert.ok(['improvavel', 'inconclusiva'].includes(so.categoria), so.categoria);
  const conflito = compararPessoas({ ...a, ids: [{ kind: 'cpf', hmac: 'x' }] }, { ...b, ids: [{ kind: 'cpf', hmac: 'y' }] });
  assert.ok(['conflitante', 'improvavel'].includes(conflito.categoria));
  const doc = compararPessoas({ ...a, ids: [{ kind: 'cpf', hmac: 'x' }] }, { ...b, ids: [{ kind: 'cpf', hmac: 'x' }] });
  assert.equal(doc.categoria, 'documental_forte');
});

test('GEDCOM: leitura, datas e ida-e-volta', () => {
  assert.deepEqual(dataGedcomParaIso('ABT 1920'), { date: '1920', qual: 'about' });
  assert.deepEqual(dataGedcomParaIso('12 MAR 1920'), { date: '1920-03-12', qual: 'exact' });
  const ged = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME João /Teste/', '1 SEX M', '1 BIRT', '2 DATE 1900', '2 PLAC Campinas, SP, Brasil', '1 FAMS @F1@',
    '0 @I2@ INDI', '1 NAME Maria /Teste/', '1 SEX F', '1 FAMS @F1@', '0 @I3@ INDI', '1 NAME Filho /Teste/', '1 FAMC @F1@', '2 PEDI adopted',
    '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 CHIL @I3@', '1 MARR', '2 DATE 1925', '0 TRLR'].join('\n');
  const g = interpretarGedcom(ged);
  assert.equal(g.pessoas.length, 3);
  assert.equal(g.pessoas[0].birth.place.municipality, 'Campinas');
  assert.equal(g.pessoas[2].famc[0].pedi, 'adopted');
  const out = escreverGedcom({ pessoas: [{ id: 'a', full_name: 'João Teste', sex: 'M', birth_date: '1900', birth_place: 'Campinas' }, { id: 'b', full_name: 'Filho Teste', sex: 'M' }, { id: 'c', privado: true }],
    rels: [{ type: 'parent', person_a: 'a', person_b: 'b', subtype: 'adoptive' }] }, 'Teste');
  assert.match(out, /1 NAME João \/Teste\//);
  assert.match(out, /2 PEDI adopted/);
  assert.match(out, /1 NAME Privado/);
  const volta = interpretarGedcom(out);
  assert.equal(volta.pessoas.length, 3);
});

test('CSV: aspas, separador e proteção contra fórmulas', () => {
  const { cabecalho, linhas } = lerCsv('nome;nascimento\n"Silva; José";1900\nAna;1901\n');
  assert.deepEqual(cabecalho, ['nome', 'nascimento']);
  assert.equal(linhas[0][0], 'Silva; José');
  const out = escreverCsv(['a'], [['=CMD()']]);
  assert.match(out, /'=CMD\(\)/);
});

test('Extração assistida: datas, nomes e filiação para revisão', () => {
  const e = extrairDados('Aos dezessete de setembro de 1921, em São Paulo, Pietro Corvalli, filho de Matteo Corvalli e Giuseppina Rando, nascido em 14/07/1895.');
  assert.ok(e.datas.some((d) => d.valor === '1895-07-14'));
  assert.ok(e.datas.some((d) => d.valor === '1921-09' && d.incerto));
  assert.ok(e.nomes.some((n) => n.valor === 'Pietro Corvalli'));
  assert.equal(e.relacoes[0].genitores[0], 'Matteo Corvalli');
});
