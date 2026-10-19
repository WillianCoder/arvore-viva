// Pessoas, nomes, identificadores sensíveis, eventos de vida, vínculos, duplicidade e união de registros.
import { all, get, run, tx, uuid } from '../db.js';
import { erro } from '../http.js';
import { papelNaArvore, pessoaNaArvore, pode, exigirEdicao, auditar, texto, opcao, dataParcial, exigirUuid } from '../acesso.js';
import { salvarLocal, serializarPessoa, carregarArvore, indexarBusca, restrita, serializarRelacao, local } from '../servicos.js';
import { cpfValido, soDigitos, mascarar } from '../lib/cpf.js';
import { cifrarTexto, decifrarTexto, hmacIdentificador } from '../lib/seguranca.js';
import { compararPessoas } from '../lib/correspondencia.js';
import { ano } from '../lib/nomes.js';

const VERIF = ['declared', 'extracted', 'documented', 'confirmed', 'contested', 'hypothesis'];
const QUAL = ['exact', 'about', 'before', 'after', 'estimated'];
const TIPOS_REL = ['parent', 'spouse', 'partner', 'guardian', 'sibling', 'unknown'];
const SUB_REL = ['biological', 'legal', 'adoptive', 'step', 'foster', 'unknown'];
const TIPOS_EVT = ['birth', 'death', 'marriage', 'divorce', 'immigration', 'emigration', 'residence', 'name_change', 'baptism', 'burial', 'military', 'other'];
const TIPOS_ID = ['cpf', 'rg', 'passport', 'birth_cert', 'marriage_cert', 'death_cert', 'foreign', 'other'];

function lerPessoa(b, atual = {}) {
  const v = (k, f) => (b[k] !== undefined ? f(b[k]) : atual[k]);
  const p = {
    full_name: v('full_name', (x) => texto(x, { campo: 'Nome completo', max: 200, obrigatorio: true })),
    birth_name: v('birth_name', (x) => texto(x, { campo: 'Nome de nascimento', max: 200 })) ?? '',
    sex: v('sex', (x) => opcao(x, ['F', 'M', 'X'], '', 'Sexo')) ?? '',
    bio: v('bio', (x) => texto(x, { campo: 'Biografia', max: 10000 })) ?? '',
    living_status: v('living_status', (x) => opcao(x, ['living', 'deceased', 'unknown'], 'unknown', 'Situação')) ?? 'unknown',
    birth_date: v('birth_date', (x) => dataParcial(x, 'Data de nascimento')) ?? '',
    birth_qual: v('birth_qual', (x) => opcao(x, QUAL, 'exact', 'Precisão')) ?? 'exact',
    death_date: v('death_date', (x) => dataParcial(x, 'Data de falecimento')) ?? '',
    death_qual: v('death_qual', (x) => opcao(x, QUAL, 'exact', 'Precisão')) ?? 'exact',
    verification: v('verification', (x) => opcao(x, VERIF, 'declared', 'Verificação')) ?? 'declared',
    visibility: v('visibility', (x) => opcao(x, ['private', 'tree'], 'tree', 'Visibilidade')) ?? 'tree',
    birth_place_id: b.birth_place !== undefined ? salvarLocal(b.birth_place) : atual.birth_place_id ?? null,
    death_place_id: b.death_place !== undefined ? salvarLocal(b.death_place) : atual.death_place_id ?? null,
  };
  if (!p.full_name) throw erro(400, 'Nome completo é obrigatório.');
  if (p.death_date && p.living_status === 'living') throw erro(400, 'Pessoa com data de falecimento não pode estar marcada como viva.');
  if (p.death_date) p.living_status = 'deceased';
  if (p.birth_date && p.death_date && p.death_date < p.birth_date) throw erro(400, 'A data de falecimento é anterior ao nascimento.');
  return p;
}

function salvarNomes(personId, b) {
  for (const [campo, kind] of [['nicknames', 'nickname'], ['previous_names', 'previous'], ['variants', 'variant']]) {
    if (!Array.isArray(b[campo])) continue;
    run('DELETE FROM person_names WHERE person_id = ? AND kind = ?', personId, kind);
    for (const n of b[campo].slice(0, 30)) {
      const nome = texto(n, { campo: 'Nome alternativo', max: 200 });
      if (nome) run('INSERT INTO person_names (id, person_id, kind, name, norm) VALUES (?,?,?,?,?)', uuid(), personId, kind, nome, nome.toLowerCase());
    }
  }
}

// Perfil de comparação (nomes de pais, cônjuges e filhos na árvore).
export function perfilComparacao(treeId, p, relsArvore, nomesPorId) {
  const rels = relsArvore || all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', treeId);
  const nome = (id) => nomesPorId?.get(id) ?? get('SELECT full_name FROM persons WHERE id = ?', id)?.full_name;
  const pais = rels.filter((r) => r.type === 'parent' && r.person_b === p.id).map((r) => nome(r.person_a)).filter(Boolean);
  const filhos = rels.filter((r) => r.type === 'parent' && r.person_a === p.id).map((r) => nome(r.person_b)).filter(Boolean);
  const conjuges = rels.filter((r) => (r.type === 'spouse' || r.type === 'partner') && (r.person_a === p.id || r.person_b === p.id)).map((r) => nome(r.person_a === p.id ? r.person_b : r.person_a)).filter(Boolean);
  return {
    id: p.id, full_name: p.full_name, birth_name: p.birth_name, sex: p.sex,
    birth_year: ano(p.birth_date), death_year: ano(p.death_date),
    birth_place: local(p.birth_place_id), pais, filhos, conjuges,
    nomes_alt: all('SELECT name FROM person_names WHERE person_id = ?', p.id).map((r) => r.name),
    ids: all('SELECT kind, value_hmac hmac FROM person_identifiers WHERE person_id = ?', p.id),
  };
}

// Procura pessoas parecidas na árvore antes de cadastrar.
export function buscarDuplicidades(treeId, dados, papel, userId, ignorarId) {
  const novo = { full_name: dados.full_name, birth_name: dados.birth_name, sex: dados.sex, birth_year: ano(dados.birth_date), death_year: ano(dados.death_date), birth_place: dados.birth_place || null, pais: dados.pais || [], filhos: [], conjuges: [], nomes_alt: [], ids: [] };
  const pessoas = all(`SELECT p.* FROM persons p JOIN tree_persons tp ON tp.person_id = p.id WHERE tp.tree_id = ? AND p.deleted_at IS NULL`, treeId);
  const rels = all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL', treeId);
  const nomes = new Map(pessoas.map((p) => [p.id, p.full_name]));
  const out = [];
  for (const p of pessoas) {
    if (p.id === ignorarId || restrita(p, papel, userId)) continue;
    const c = compararPessoas(novo, perfilComparacao(treeId, p, rels, nomes));
    // Mostra também quem tem nome muito parecido, mesmo com poucos dados para comparar.
    const pesoNome = c.fatores.positivos.find((f) => f.fator === 'Nome')?.peso || 0;
    if ((c.score >= 40 && c.categoria !== 'improvavel') || (pesoNome >= 26 && c.categoria !== 'conflitante' && c.categoria !== 'improvavel')) out.push({ pessoa: serializarPessoa(p, papel, userId), ...c });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

// Impede ciclos: sobe pelos ancestrais do futuro genitor; se achar o futuro filho, haveria ciclo.
function criariaCiclo(treeId, pai, filho) {
  const visit = new Set();
  const fila = [pai];
  while (fila.length) {
    const x = fila.shift();
    if (x === filho) return true;
    if (visit.has(x)) continue;
    visit.add(x);
    for (const r of all(`SELECT person_a FROM relationships WHERE tree_id = ? AND type = 'parent' AND person_b = ? AND deleted_at IS NULL`, treeId, x)) fila.push(r.person_a);
  }
  return false;
}

export function criarRelacao(ctx, treeId, b) {
  const a = exigirUuid(b.person_a, 'Pessoa A'), bb = exigirUuid(b.person_b, 'Pessoa B');
  if (a === bb) throw erro(400, 'Uma pessoa não pode ter vínculo consigo mesma.');
  pessoaNaArvore(treeId, a); pessoaNaArvore(treeId, bb);
  const type = opcao(b.type, TIPOS_REL, null, 'Tipo de vínculo');
  if (!type) throw erro(400, 'Informe o tipo de vínculo.');
  const subtype = opcao(b.subtype, SUB_REL, type === 'parent' ? 'biological' : 'unknown', 'Natureza do vínculo');
  const status = opcao(b.status, VERIF, 'declared', 'Situação do vínculo');
  const simetrico = ['spouse', 'partner', 'sibling', 'unknown'].includes(type);
  const dup = get(`SELECT id FROM relationships WHERE tree_id = ? AND type = ? AND deleted_at IS NULL AND ((person_a = ? AND person_b = ?) ${simetrico ? 'OR (person_a = ? AND person_b = ?)' : ''})`,
    ...(simetrico ? [treeId, type, a, bb, bb, a] : [treeId, type, a, bb]));
  if (dup) throw erro(409, 'Este vínculo já está registrado.');
  if (type === 'parent' && criariaCiclo(treeId, a, bb)) throw erro(400, 'Este vínculo criaria um ciclo (a pessoa seria ancestral de si mesma).');
  const avisos = [];
  if (type === 'parent' && subtype === 'biological') {
    const n = get(`SELECT COUNT(*) n FROM relationships WHERE tree_id = ? AND type = 'parent' AND subtype = 'biological' AND person_b = ? AND deleted_at IS NULL`, treeId, bb).n;
    if (n >= 2) avisos.push('Esta pessoa já tem dois genitores biológicos registrados. Verifique se o vínculo não é legal ou adotivo.');
    const pa = get('SELECT birth_date FROM persons WHERE id = ?', a), pf = get('SELECT birth_date FROM persons WHERE id = ?', bb);
    const d = ano(pf.birth_date) - ano(pa.birth_date);
    if (ano(pa.birth_date) && ano(pf.birth_date) && (d < 12 || d > 70)) avisos.push(`Diferença de idade incomum entre genitor e filho(a): ${d} anos.`);
  }
  const id = uuid();
  run(`INSERT INTO relationships (id, tree_id, person_a, person_b, type, subtype, status, start_date, end_date, end_reason, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, treeId, a, bb, type, subtype, status, dataParcial(b.start_date, 'Início'), dataParcial(b.end_date, 'Fim'),
    texto(b.end_reason, { campo: 'Motivo do fim', max: 200 }), texto(b.notes, { campo: 'Observações', max: 2000 }), ctx.user.id);
  auditar(ctx, treeId, 'relacao.criada', 'relationship', id, `${type}/${subtype}`);
  return { id, avisos };
}

export function rotasPessoas(r) {
  r.get('/api/trees/:treeId/graph', (ctx) => {
    const papel = papelNaArvore(ctx, ctx.params.treeId);
    const { pessoas, relacoes } = carregarArvore(ctx.params.treeId, papel, ctx.user.id);
    return { papel, pessoas, relacoes };
  });

  r.post('/api/trees/:treeId/persons/check-duplicates', (ctx) => {
    const papel = papelNaArvore(ctx, ctx.params.treeId, 'contributor');
    const full_name = texto(ctx.body.full_name, { campo: 'Nome', max: 200, obrigatorio: true });
    return { semelhantes: buscarDuplicidades(ctx.params.treeId, { ...ctx.body, full_name, birth_date: dataParcial(ctx.body.birth_date) }, papel, ctx.user.id, ctx.body.ignore_id) };
  });

  r.post('/api/trees/:treeId/persons', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const dados = lerPessoa(ctx.body);
    if (!ctx.body.ignore_duplicates) {
      const sem = buscarDuplicidades(t, { ...ctx.body, ...dados }, papel, ctx.user.id);
      if (sem.some((s) => s.score >= 55)) throw erro(409, 'Há pessoas parecidas já cadastradas. Compare antes de continuar.', { semelhantes: sem });
    }
    const id = uuid();
    const resultado = tx(() => {
      run(`INSERT INTO persons (id, full_name, birth_name, sex, bio, living_status, birth_date, birth_qual, birth_place_id, death_date, death_qual, death_place_id, verification, visibility, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, dados.full_name, dados.birth_name, dados.sex, dados.bio, dados.living_status, dados.birth_date, dados.birth_qual,
      dados.birth_place_id, dados.death_date, dados.death_qual, dados.death_place_id, dados.verification, dados.visibility, ctx.user.id);
      run('INSERT INTO tree_persons (tree_id, person_id) VALUES (?,?)', t, id);
      salvarNomes(id, ctx.body);
      indexarBusca(id);
      auditar(ctx, t, 'pessoa.criada', 'person', id, dados.living_status === 'living' ? 'pessoa viva' : dados.full_name);
      // Cadastro a partir de um cartão: já cria o vínculo.
      let rel = null;
      const v = ctx.body.relate;
      if (v && typeof v === 'object') {
        const outro = exigirUuid(v.person_id, 'Pessoa relacionada');
        const papelRel = opcao(v.as, ['parent', 'child', 'spouse', 'partner', 'sibling', 'guardian'], null, 'Vínculo');
        const sub = v.subtype;
        if (papelRel === 'parent') rel = criarRelacao(ctx, t, { person_a: id, person_b: outro, type: 'parent', subtype: sub, status: v.status });
        else if (papelRel === 'child') rel = criarRelacao(ctx, t, { person_a: outro, person_b: id, type: 'parent', subtype: sub, status: v.status });
        else if (papelRel === 'guardian') rel = criarRelacao(ctx, t, { person_a: id, person_b: outro, type: 'guardian', subtype: 'legal', status: v.status });
        else if (papelRel === 'sibling') {
          // Irmão: compartilha os genitores conhecidos; sem genitores, registra vínculo de irmandade.
          const pais = all(`SELECT person_a, subtype FROM relationships WHERE tree_id = ? AND type = 'parent' AND person_b = ? AND deleted_at IS NULL`, t, outro);
          if (pais.length && v.share_parents !== false) for (const p of pais) rel = criarRelacao(ctx, t, { person_a: p.person_a, person_b: id, type: 'parent', subtype: p.subtype, status: v.status });
          else rel = criarRelacao(ctx, t, { person_a: id, person_b: outro, type: 'sibling', status: v.status });
        } else if (papelRel) rel = criarRelacao(ctx, t, { person_a: outro, person_b: id, type: papelRel, status: v.status, start_date: v.start_date });
      }
      return { id, avisos: rel?.avisos || [] };
    });
    return { status: 201, body: resultado };
  });

  // Inclui na árvore uma pessoa que já existe em outra árvore acessível (sem duplicar).
  r.post('/api/trees/:treeId/persons/link-existing', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const origem = exigirUuid(ctx.body.source_tree_id, 'Árvore de origem');
    const papelOrigem = papelNaArvore(ctx, origem);
    const p = pessoaNaArvore(origem, exigirUuid(ctx.body.person_id, 'Pessoa'));
    if (restrita(p, papelOrigem, ctx.user.id)) throw erro(403, 'Registro privado na árvore de origem.');
    run('INSERT OR IGNORE INTO tree_persons (tree_id, person_id) VALUES (?,?)', t, p.id);
    auditar(ctx, t, 'pessoa.vinculada_arvore', 'person', p.id);
    return { ok: true, id: p.id };
  });

  r.get('/api/trees/:treeId/persons/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const p = pessoaNaArvore(t, ctx.params.id);
    const nomes = all('SELECT id, kind, name FROM person_names WHERE person_id = ?', p.id);
    const rest = restrita(p, papel, ctx.user.id);
    const outro = (id) => { const o = get('SELECT * FROM persons WHERE id = ?', id); return o ? serializarPessoa(o, papel, ctx.user.id) : null; };
    const relacoes = all(`SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL AND (person_a = ? OR person_b = ?)`, t, p.id, p.id).map((r) => ({
      ...serializarRelacao(r), outra: outro(r.person_a === p.id ? r.person_b : r.person_a), papel_desta: r.person_a === p.id ? 'a' : 'b',
      documentos: all(`SELECT d.id, d.title FROM document_links dl JOIN documents d ON d.id = dl.document_id WHERE dl.relationship_id = ? AND d.deleted_at IS NULL`, r.id),
    }));
    if (rest) return { pessoa: serializarPessoa(p, papel, ctx.user.id), relacoes, restrito: true, papel };
    const eventos = all(`SELECT * FROM life_events WHERE person_id = ? AND tree_id = ? AND deleted_at IS NULL ORDER BY date`, p.id, t).map((e) => ({ ...e, place: local(e.place_id) }));
    const nivelDoc = pode(papel, 'admin') ? ['tree', 'editors', 'owner'] : pode(papel, 'editor') ? ['tree', 'editors'] : ['tree'];
    const documentos = all(`SELECT d.id, d.title, d.category, d.doc_date, d.verification, d.mime, d.access_level, dl.note FROM document_links dl JOIN documents d ON d.id = dl.document_id
      WHERE dl.person_id = ? AND d.tree_id = ? AND d.deleted_at IS NULL AND d.access_level IN (${nivelDoc.map(() => '?').join(',')})`, p.id, t, ...nivelDoc);
    const evidencias = all(`SELECT e.*, d.title documento FROM evidence_items e LEFT JOIN documents d ON d.id = e.document_id WHERE e.tree_id = ? AND e.target_type = 'person' AND e.target_id = ?`, t, p.id);
    // Identificadores: só editores veem (mascarados); colaboradores e leitores não veem.
    const identificadores = pode(papel, 'editor')
      ? all('SELECT id, kind, country, issuer, issued_at, expires_at, last_digits, origin, verification, created_at FROM person_identifiers WHERE person_id = ?', p.id)
        .map((i) => ({ ...i, mascarado: mascarar(i.kind, i.last_digits), last_digits: undefined }))
      : null;
    const correspondencias = all(`SELECT id, score, category, status FROM match_candidates WHERE tree_id = ? AND (person_a = ? OR person_b = ?) AND status IN ('pending','later')`, t, p.id, p.id);
    const arvores = get('SELECT COUNT(*) n FROM tree_persons WHERE person_id = ?', p.id).n;
    return { pessoa: serializarPessoa(p, papel, ctx.user.id), nomes, eventos, relacoes, documentos, evidencias, identificadores, correspondencias, em_arvores: arvores, papel };
  });

  r.patch('/api/trees/:treeId/persons/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const atual = pessoaNaArvore(t, ctx.params.id);
    exigirEdicao(ctx, papel, atual.created_by);
    if (ctx.body.updated_at && ctx.body.updated_at !== atual.updated_at) throw erro(409, 'Este registro foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.');
    const d = lerPessoa(ctx.body, atual);
    tx(() => {
      run(`UPDATE persons SET full_name=?, birth_name=?, sex=?, bio=?, living_status=?, birth_date=?, birth_qual=?, birth_place_id=?, death_date=?, death_qual=?, death_place_id=?, verification=?, visibility=?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, d.full_name, d.birth_name, d.sex, d.bio, d.living_status, d.birth_date, d.birth_qual, d.birth_place_id,
      d.death_date, d.death_qual, d.death_place_id, d.verification, d.visibility, atual.id);
      if (ctx.body.photo_document_id !== undefined) {
        const doc = ctx.body.photo_document_id ? get(`SELECT id FROM documents WHERE id = ? AND tree_id = ? AND mime LIKE 'image/%' AND deleted_at IS NULL`, ctx.body.photo_document_id, t) : null;
        if (ctx.body.photo_document_id && !doc) throw erro(400, 'Foto inválida: escolha uma imagem anexada a esta árvore.');
        run('UPDATE persons SET photo_document_id = ? WHERE id = ?', doc?.id || null, atual.id);
      }
      salvarNomes(atual.id, ctx.body);
      indexarBusca(atual.id);
      auditar(ctx, t, 'pessoa.editada', 'person', atual.id);
    });
    return { ok: true };
  });

  r.delete('/api/trees/:treeId/persons/:id', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const p = pessoaNaArvore(t, ctx.params.id);
    tx(() => {
      run(`UPDATE relationships SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tree_id = ? AND (person_a = ? OR person_b = ?)`, t, p.id, p.id);
      run('DELETE FROM tree_persons WHERE tree_id = ? AND person_id = ?', t, p.id);
      run(`DELETE FROM match_candidates WHERE tree_id = ? AND (person_a = ? OR person_b = ?)`, t, p.id, p.id);
      // Só some de vez se não estiver em nenhuma outra árvore (exclusão lógica, recuperável pela administração).
      if (!get('SELECT 1 FROM tree_persons WHERE person_id = ?', p.id)) run(`UPDATE persons SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, p.id);
      auditar(ctx, t, 'pessoa.excluida', 'person', p.id);
    });
    return { ok: true };
  });

  // ---- Identificadores (CPF, RG, passaporte, certidões) ----
  r.post('/api/trees/:treeId/persons/:id/identifiers', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const p = pessoaNaArvore(t, ctx.params.id);
    const kind = opcao(ctx.body.kind, TIPOS_ID, null, 'Tipo de documento');
    if (!kind) throw erro(400, 'Informe o tipo de documento.');
    let valor = texto(ctx.body.value, { campo: 'Número', max: 60, obrigatorio: true });
    if (kind === 'cpf') {
      valor = soDigitos(valor);
      if (!cpfValido(valor)) throw erro(400, 'CPF inválido (dígitos verificadores não conferem). A validação é apenas matemática.');
    } else valor = valor.toUpperCase().replace(/\s+/g, '');
    if (!ctx.body.purpose_ack) throw erro(400, 'Confirme que há finalidade legítima para guardar este identificador.');
    const hmac = hmacIdentificador(kind, valor);
    // Duplicidade verificada só dentro da própria árvore (não permite enumerar em outras).
    const mesmo = get(`SELECT pi.person_id FROM person_identifiers pi JOIN tree_persons tp ON tp.person_id = pi.person_id WHERE tp.tree_id = ? AND pi.value_hmac = ? AND pi.person_id <> ?`, t, hmac, p.id);
    const id = uuid();
    run(`INSERT INTO person_identifiers (id, person_id, kind, country, issuer, issued_at, expires_at, value_enc, value_hmac, last_digits, origin, verification, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, p.id, kind, texto(ctx.body.country, { campo: 'País', max: 60 }) || 'BR', texto(ctx.body.issuer, { campo: 'Órgão emissor', max: 120 }),
      dataParcial(ctx.body.issued_at, 'Emissão'), dataParcial(ctx.body.expires_at, 'Validade'), cifrarTexto(valor), hmac, valor.slice(-2),
      texto(ctx.body.origin, { campo: 'Origem', max: 200 }), opcao(ctx.body.verification, VERIF, 'declared', 'Verificação'), ctx.user.id);
    auditar(ctx, t, 'identificador.criado', 'person', p.id, kind);
    return { status: 201, body: { id, aviso: mesmo ? 'Outro registro desta árvore tem o mesmo identificador. Pode ser a mesma pessoa: revise as correspondências.' : null } };
  });

  // Ver o número completo: só administradores, sempre auditado.
  r.post('/api/trees/:treeId/persons/:id/identifiers/:iid/reveal', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'admin');
    const p = pessoaNaArvore(t, ctx.params.id);
    const i = get('SELECT * FROM person_identifiers WHERE id = ? AND person_id = ?', ctx.params.iid, p.id);
    if (!i) throw erro(404, 'Identificador não encontrado.');
    auditar(ctx, t, 'identificador.revelado', 'person', p.id, i.kind);
    return { valor: decifrarTexto(i.value_enc) };
  });

  r.delete('/api/trees/:treeId/persons/:id/identifiers/:iid', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const p = pessoaNaArvore(t, ctx.params.id);
    const ok = run('DELETE FROM person_identifiers WHERE id = ? AND person_id = ?', ctx.params.iid, p.id);
    if (!ok.changes) throw erro(404, 'Identificador não encontrado.');
    auditar(ctx, t, 'identificador.excluido', 'person', p.id);
    return { ok: true };
  });

  // ---- Eventos de vida ----
  const lerEvento = (b) => ({
    type: opcao(b.type, TIPOS_EVT, 'other', 'Tipo de evento'),
    date: dataParcial(b.date, 'Data'), date_qual: opcao(b.date_qual, QUAL, 'exact', 'Precisão'),
    place_id: b.place !== undefined ? salvarLocal(b.place) : null,
    description: texto(b.description, { campo: 'Descrição', max: 2000 }),
    verification: opcao(b.verification, VERIF, 'declared', 'Verificação'),
  });
  r.post('/api/trees/:treeId/persons/:id/events', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'contributor');
    const p = pessoaNaArvore(t, ctx.params.id);
    const e = lerEvento(ctx.body);
    const rel = ctx.body.related_person_id ? pessoaNaArvore(t, exigirUuid(ctx.body.related_person_id)).id : null;
    const id = uuid();
    run(`INSERT INTO life_events (id, tree_id, person_id, related_person_id, type, date, date_qual, place_id, description, verification, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, t, p.id, rel, e.type, e.date, e.date_qual, e.place_id, e.description, e.verification, ctx.user.id);
    auditar(ctx, t, 'evento.criado', 'event', id, e.type);
    return { status: 201, body: { id } };
  });
  r.patch('/api/trees/:treeId/events/:eid', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const ev = get('SELECT * FROM life_events WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', ctx.params.eid, t);
    if (!ev) throw erro(404, 'Evento não encontrado.');
    exigirEdicao(ctx, papel, ev.created_by);
    const e = lerEvento({ place: undefined, ...ctx.body });
    run('UPDATE life_events SET type=?, date=?, date_qual=?, place_id=COALESCE(?, place_id), description=?, verification=? WHERE id = ?', e.type, e.date, e.date_qual, e.place_id, e.description, e.verification, ev.id);
    auditar(ctx, t, 'evento.editado', 'event', ev.id);
    return { ok: true };
  });
  r.delete('/api/trees/:treeId/events/:eid', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const ev = get('SELECT * FROM life_events WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', ctx.params.eid, t);
    if (!ev) throw erro(404, 'Evento não encontrado.');
    exigirEdicao(ctx, papel, ev.created_by);
    run(`UPDATE life_events SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ev.id);
    auditar(ctx, t, 'evento.excluido', 'event', ev.id);
    return { ok: true };
  });

  // ---- Vínculos ----
  r.post('/api/trees/:treeId/relationships', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId, 'contributor');
    return { status: 201, body: tx(() => criarRelacao(ctx, ctx.params.treeId, ctx.body)) };
  });
  r.patch('/api/trees/:treeId/relationships/:rid', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const rel = get('SELECT * FROM relationships WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', ctx.params.rid, t);
    if (!rel) throw erro(404, 'Vínculo não encontrado.');
    exigirEdicao(ctx, papel, rel.created_by);
    const b = ctx.body;
    run('UPDATE relationships SET subtype=?, status=?, start_date=?, end_date=?, end_reason=?, notes=? WHERE id = ?',
      opcao(b.subtype, SUB_REL, rel.subtype, 'Natureza'), opcao(b.status, VERIF, rel.status, 'Situação'),
      b.start_date !== undefined ? dataParcial(b.start_date, 'Início') : rel.start_date, b.end_date !== undefined ? dataParcial(b.end_date, 'Fim') : rel.end_date,
      b.end_reason !== undefined ? texto(b.end_reason, { max: 200 }) : rel.end_reason, b.notes !== undefined ? texto(b.notes, { max: 2000 }) : rel.notes, rel.id);
    auditar(ctx, t, 'relacao.editada', 'relationship', rel.id);
    return { ok: true };
  });
  r.delete('/api/trees/:treeId/relationships/:rid', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const rel = get('SELECT * FROM relationships WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', ctx.params.rid, t);
    if (!rel) throw erro(404, 'Vínculo não encontrado.');
    exigirEdicao(ctx, papel, rel.created_by);
    run(`UPDATE relationships SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, rel.id);
    auditar(ctx, t, 'relacao.excluida', 'relationship', rel.id, rel.type);
    return { ok: true };
  });

  // ---- União de registros (sempre com confirmação explícita) ----
  r.post('/api/trees/:treeId/persons/merge', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    const manter = pessoaNaArvore(t, exigirUuid(ctx.body.keep_id, 'Registro mantido'));
    const remover = pessoaNaArvore(t, exigirUuid(ctx.body.remove_id, 'Registro unido'));
    if (manter.id === remover.id) throw erro(400, 'Escolha dois registros diferentes.');
    if (ctx.body.confirm !== true) throw erro(400, 'Confirme explicitamente a união dos registros.');
    tx(() => mesclar(ctx, t, manter, remover, texto(ctx.body.justification, { campo: 'Justificativa', max: 2000 })));
    return { ok: true, id: manter.id };
  });
}

export function mesclar(ctx, t, manter, remover, justificativa) {
  // Campos vazios do registro mantido são completados pelo outro.
  for (const c of ['birth_name', 'sex', 'bio', 'birth_date', 'birth_place_id', 'death_date', 'death_place_id', 'photo_document_id']) {
    if (!manter[c] && remover[c]) run(`UPDATE persons SET ${c} = ? WHERE id = ?`, remover[c], manter.id);
  }
  if (manter.full_name !== remover.full_name) run(`INSERT INTO person_names (id, person_id, kind, name, norm) VALUES (?,?,'variant',?,?)`, uuid(), manter.id, remover.full_name, remover.full_name.toLowerCase());
  run('UPDATE person_names SET person_id = ? WHERE person_id = ?', manter.id, remover.id);
  run('UPDATE OR IGNORE person_identifiers SET person_id = ? WHERE person_id = ?', manter.id, remover.id);
  run('UPDATE life_events SET person_id = ? WHERE person_id = ?', manter.id, remover.id);
  run('UPDATE life_events SET related_person_id = ? WHERE related_person_id = ?', manter.id, remover.id);
  run('UPDATE document_links SET person_id = ? WHERE person_id = ?', manter.id, remover.id);
  run(`UPDATE evidence_items SET target_id = ? WHERE target_type = 'person' AND target_id = ?`, manter.id, remover.id);
  run('UPDATE relationships SET person_a = ? WHERE person_a = ? AND person_b <> ?', manter.id, remover.id, manter.id);
  run('UPDATE relationships SET person_b = ? WHERE person_b = ? AND person_a <> ?', manter.id, remover.id, manter.id);
  run(`UPDATE relationships SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE person_a = ? OR person_b = ?`, remover.id, remover.id);
  // Remove vínculos que ficaram duplicados.
  const vistos = new Set();
  for (const r of all('SELECT * FROM relationships WHERE tree_id = ? AND deleted_at IS NULL AND (person_a = ? OR person_b = ?) ORDER BY created_at', t, manter.id, manter.id)) {
    const par = ['spouse', 'partner', 'sibling', 'unknown'].includes(r.type) ? [r.person_a, r.person_b].sort().join() : `${r.person_a}>${r.person_b}`;
    const k = `${r.type}:${par}`;
    if (vistos.has(k)) run(`UPDATE relationships SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, r.id);
    vistos.add(k);
  }
  for (const tp of all('SELECT tree_id FROM tree_persons WHERE person_id = ?', remover.id)) run('INSERT OR IGNORE INTO tree_persons (tree_id, person_id) VALUES (?,?)', tp.tree_id, manter.id);
  run('DELETE FROM tree_persons WHERE person_id = ?', remover.id);
  run(`UPDATE match_candidates SET status = 'merged', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE (person_a = ? AND person_b = ?) OR (person_a = ? AND person_b = ?)`, manter.id, remover.id, remover.id, manter.id);
  run(`DELETE FROM match_candidates WHERE (person_a = ? OR person_b = ?) AND status <> 'merged'`, remover.id, remover.id);
  run(`UPDATE persons SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), bio = bio || ? WHERE id = ?`, `\n[Unido ao registro ${manter.id}]`, remover.id);
  run(`UPDATE persons SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, manter.id);
  indexarBusca(manter.id);
  auditar(ctx, t, 'pessoas.unidas', 'person', manter.id, justificativa ? `justificativa registrada` : '');
}
