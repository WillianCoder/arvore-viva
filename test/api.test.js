import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciar, cliente } from './ajuda.js';

let srv, ana, bia, leitor;
const cpfTeste = (() => { const b = '529982247'; const dv = (s, n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(s[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(b, 9); return b + d1 + dv(b + d1, 10); })();
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6360000002000154A24F5D0000000049454E44AE426082', 'hex').toString('base64');

before(async () => {
  srv = await iniciar();
  ana = cliente(srv.base); bia = cliente(srv.base); leitor = cliente(srv.base);
  await ana.registrar('ana@exemplo.test', 'Ana');
  await bia.registrar('bia@exemplo.test', 'Bia');
  await leitor.registrar('leo@exemplo.test', 'Leo');
});
after(() => srv.fechar());

let arvore, avo, pai, filho, prima, tia, docId, relPai;

test('cadastro e autenticação', async () => {
  const anon = cliente(srv.base);
  assert.equal((await anon.get('/api/trees')).status, 401);
  assert.equal((await anon.post('/api/auth/register', { name: 'X', email: 'x@exemplo.test', password: 'curta' })).status, 400);
  assert.equal((await anon.post('/api/auth/register', { name: 'Ana 2', email: 'ana@exemplo.test', password: 'senhaforte123' })).status, 409);
  assert.equal((await anon.post('/api/auth/login', { email: 'ana@exemplo.test', password: 'errada123' })).status, 401);
  const ok = await anon.post('/api/auth/login', { email: 'ana@exemplo.test', password: 'senhaforte123' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const me = await anon.get('/api/auth/me');
  assert.equal(me.dados.usuario.email, 'ana@exemplo.test');
  // Sem token CSRF a escrita é recusada.
  const t = anon.csrf; anon.csrf = 'errado';
  assert.equal((await anon.post('/api/trees', { name: 'X' })).status, 403);
  anon.csrf = t;
  assert.equal((await anon.post('/api/auth/logout')).status, 200);
  assert.equal((await anon.get('/api/trees')).status, 401);
});

test('criação de árvore e cadastro de pessoas com vínculos', async () => {
  const r = await ana.post('/api/trees', { name: 'Família Teste' });
  assert.equal(r.status, 201);
  arvore = r.dados.id;
  const T = `/api/trees/${arvore}`;
  avo = (await ana.post(`${T}/persons`, { full_name: 'Antônio Ferraz', sex: 'M', birth_date: '1900', living_status: 'deceased', birth_place: { municipality: 'Campinas', state: 'SP', country: 'Brasil' } })).dados.id;
  pai = (await ana.post(`${T}/persons`, { full_name: 'Bruno Ferraz', sex: 'M', birth_date: '1930', relate: { person_id: avo, as: 'child' } })).dados.id;
  tia = (await ana.post(`${T}/persons`, { full_name: 'Carla Ferraz', sex: 'F', birth_date: '1933', relate: { person_id: pai, as: 'sibling' } })).dados.id;
  filho = (await ana.post(`${T}/persons`, { full_name: 'Daniel Ferraz', sex: 'M', birth_date: '1960', living_status: 'living', relate: { person_id: pai, as: 'child' } })).dados.id;
  prima = (await ana.post(`${T}/persons`, { full_name: 'Elisa Ferraz Lima', sex: 'F', birth_date: '1962', relate: { person_id: tia, as: 'child' }, nicknames: ['Lisa'] })).dados.id;
  assert.ok(avo && pai && tia && filho && prima);
  const g = await ana.get(`${T}/graph`);
  assert.equal(g.dados.pessoas.length, 5);
  assert.equal(g.dados.relacoes.filter((x) => x.type === 'parent').length, 4);
  relPai = g.dados.relacoes.find((x) => x.person_a === avo && x.person_b === pai).id;
  // Ciclo é recusado.
  assert.equal((await ana.post(`${T}/relationships`, { person_a: filho, person_b: avo, type: 'parent' })).status, 400);
  // Vínculo duplicado é recusado.
  assert.equal((await ana.post(`${T}/relationships`, { person_a: avo, person_b: pai, type: 'parent' })).status, 409);
  // Edição e conflito de versão.
  const det = await ana.get(`${T}/persons/${pai}`);
  assert.equal((await ana.patch(`${T}/persons/${pai}`, { bio: 'Ferroviário.', updated_at: det.dados.pessoa.updated_at })).status, 200);
  assert.equal((await ana.patch(`${T}/persons/${pai}`, { bio: 'Outro.', updated_at: det.dados.pessoa.updated_at })).status, 409);
  // Validação de datas.
  assert.equal((await ana.post(`${T}/persons`, { full_name: 'Data Ruim', birth_date: '31/12/1900' })).status, 400);
  assert.equal((await ana.post(`${T}/persons`, { full_name: 'Morte Antes', birth_date: '1950', death_date: '1940' })).status, 400);
});

test('detecção de duplicidade antes de cadastrar', async () => {
  const T = `/api/trees/${arvore}`;
  const d = await ana.post(`${T}/persons/check-duplicates`, { full_name: 'Antonio Feraz', birth_date: '1900' });
  assert.ok(d.dados.semelhantes.some((s) => s.pessoa.id === avo));
  const r = await ana.post(`${T}/persons`, { full_name: 'Antonio Ferraz', birth_date: '1900', birth_place: { municipality: 'Campinas' } });
  assert.equal(r.status, 409);
  assert.ok(r.dados.detalhes.semelhantes.length);
  const forcado = await ana.post(`${T}/persons`, { full_name: 'Antonio Ferraz', birth_date: '1900', ignore_duplicates: true });
  assert.equal(forcado.status, 201);
  await ana.del(`${T}/persons/${forcado.dados.id}`);
});

test('cálculo de parentesco com caminho', async () => {
  const k = await ana.get(`/api/trees/${arvore}/kinship?a=${filho}&b=${prima}`);
  assert.equal(k.dados.resultados[0].descricao, 'primo de primeiro grau');
  assert.deepEqual(k.dados.resultados[0].caminho.map((c) => c.nome), ['Daniel Ferraz', 'Bruno Ferraz', 'Antônio Ferraz', 'Carla Ferraz', 'Elisa Ferraz Lima']);
  const k2 = await ana.get(`/api/trees/${arvore}/kinship?a=${tia}&b=${filho}`);
  assert.equal(k2.dados.resultados[0].descricao, 'tia');
});

test('pesquisa por nomes, variações e filtros combinados', async () => {
  const s = (q) => ana.get(`/api/search?${new URLSearchParams(q)}`);
  assert.ok((await s({ q: 'antonio ferras' })).dados.resultados.some((r) => r.pessoa.id === avo), 'sem acento e com erro');
  assert.ok((await s({ q: 'lisa' })).dados.resultados.some((r) => r.pessoa.id === prima), 'apelido');
  const comb = await s({ surname: 'Ferraz', birth_from: '1925', birth_to: '1940', has_parents: '1' });
  assert.deepEqual(comb.dados.resultados.map((r) => r.pessoa.id).sort(), [pai, tia].sort());
  assert.ok((await s({ municipality: 'campinas' })).dados.resultados.some((r) => r.pessoa.id === avo));
  assert.ok((await s({ parent: 'Bruno' })).dados.resultados.some((r) => r.pessoa.id === filho));
  assert.ok((await s({ q: 'ferraz' })).dados.resultados[0].motivos.length);
});

test('CPF: validação, máscara, revelação auditada e busca restrita', async () => {
  const T = `/api/trees/${arvore}`;
  assert.equal((await ana.post(`${T}/persons/${pai}/identifiers`, { kind: 'cpf', value: '111.111.111-11', purpose_ack: true })).status, 400);
  assert.equal((await ana.post(`${T}/persons/${pai}/identifiers`, { kind: 'cpf', value: cpfTeste })).status, 400, 'exige finalidade');
  const c = await ana.post(`${T}/persons/${pai}/identifiers`, { kind: 'cpf', value: cpfTeste, purpose_ack: true });
  assert.equal(c.status, 201);
  const det = await ana.get(`${T}/persons/${pai}`);
  const id = det.dados.identificadores[0];
  assert.equal(id.mascarado, `•••.•••.•••-${cpfTeste.slice(-2)}`);
  assert.ok(!JSON.stringify(det.dados).includes(cpfTeste), 'CPF completo não aparece no detalhe');
  const rev = await ana.post(`${T}/persons/${pai}/identifiers/${id.id}/reveal`);
  assert.equal(rev.dados.valor, cpfTeste);
  const atv = await ana.get(`${T}/activity`);
  assert.ok(atv.dados.atividades.some((a) => a.action === 'identificador.revelado'));
  assert.ok(!JSON.stringify(atv.dados).includes(cpfTeste), 'CPF não vai para o log');
  const busca = await ana.get(`/api/search?tree_id=${arvore}&identifier=${cpfTeste}&identifier_kind=cpf`);
  assert.deepEqual(busca.dados.resultados.map((r) => r.pessoa.id), [pai]);
  assert.equal((await ana.get(`/api/search?identifier=${cpfTeste}`)).status, 400, 'exige escolher árvore');
});

test('isolamento: outro usuário não acessa árvore, pessoas, documentos nem identificadores', async () => {
  const T = `/api/trees/${arvore}`;
  docId = (await ana.post(`${T}/documents`, { title: 'Certidão teste', category: 'birth_cert', file_base64: PNG, file_name: 'c.png', person_ids: [avo] })).dados.id;
  assert.ok(docId);
  for (const [m, u, c] of [['get', T], ['get', `${T}/graph`], ['get', `${T}/persons/${pai}`], ['get', `${T}/documents/${docId}`], ['post', `${T}/documents/${docId}/file-url`],
    ['get', `${T}/kinship?a=${pai}&b=${filho}`], ['post', `${T}/persons/${pai}/identifiers/x/reveal`], ['patch', `${T}/persons/${pai}`, { full_name: 'Hack' }],
    ['del', `${T}/persons/${pai}`], ['post', `${T}/export`, { format: 'json' }], ['get', `${T}/matches`], ['get', `${T}/timeline`]]) {
    const r = await bia[m](u, c);
    assert.equal(r.status, 404, `${m} ${u} deveria ser 404, veio ${r.status}`);
  }
  const busca = await bia.get('/api/search?q=ferraz');
  assert.equal(busca.dados.total, 0, 'busca não vaza pessoas de outra conta');
  const buscaId = await bia.get(`/api/search?tree_id=${arvore}&identifier=${cpfTeste}`);
  assert.equal(buscaId.dados.total, 0);
  // Bia não consegue colocar uma pessoa da Ana na própria árvore.
  const dela = (await bia.post('/api/trees', { name: 'Árvore da Bia' })).dados.id;
  assert.equal((await bia.post(`/api/trees/${dela}/persons/link-existing`, { source_tree_id: arvore, person_id: pai })).status, 404);
  assert.equal((await bia.post(`/api/trees/${dela}/relationships`, { person_a: pai, person_b: filho, type: 'parent' })).status, 404);
  // URL temporária de outra conta não serve.
  const url = (await ana.post(`${T}/documents/${docId}/file-url`)).dados.url;
  assert.equal((await bia.get(url)).status, 403);
  const arq = await ana.get(url);
  assert.equal(arq.status, 200);
  assert.equal(arq.headers.get('content-type'), 'image/png');
  assert.equal((await ana.get(url.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).status, 403, 'assinatura adulterada');
});

test('papéis: leitor vê pessoas vivas restritas e não edita', async () => {
  const T = `/api/trees/${arvore}`;
  const conv = await ana.post(`${T}/invitations`, { email: 'leo@exemplo.test', role: 'reader' });
  const token = conv.dados.link.split('/').pop();
  assert.equal((await bia.post(`/api/invitations/${token}/accept`)).status, 403, 'convite é do e-mail convidado');
  assert.equal((await leitor.post(`/api/invitations/${token}/accept`)).status, 200);
  assert.equal((await leitor.post(`/api/invitations/${token}/accept`)).status, 404, 'convite usado não serve de novo');
  const g = await leitor.get(`${T}/graph`);
  const daniel = g.dados.pessoas.find((p) => p.id === filho);
  assert.equal(daniel.restrito, true);
  assert.equal(daniel.full_name, 'Pessoa viva (privado)');
  assert.ok(!JSON.stringify(g.dados).includes('Daniel'));
  const det = await leitor.get(`${T}/persons/${pai}`);
  assert.equal(det.dados.identificadores, null, 'leitor não vê identificadores');
  assert.equal((await leitor.patch(`${T}/persons/${pai}`, { full_name: 'X' })).status, 403);
  assert.equal((await leitor.post(`${T}/persons`, { full_name: 'X' })).status, 403);
  assert.equal((await leitor.post(`${T}/export`, { format: 'json', include_living: true })).status, 403);
  const exp = await leitor.post(`${T}/export`, { format: 'json' });
  assert.ok(!exp.dados.content.includes('Daniel'));
  assert.ok(!exp.dados.content.includes(cpfTeste));
  // Documento restrito a editores some para o leitor.
  await ana.patch(`${T}/documents/${docId}`, { access_level: 'editors' });
  assert.equal((await leitor.get(`${T}/documents/${docId}`)).status, 404);
  assert.equal((await leitor.get(`${T}/documents`)).dados.total, 0);
  // Revogação de acesso.
  const membros = await ana.get(`${T}/members`);
  const leo = membros.dados.membros.find((m) => m.name === 'Leo');
  assert.equal((await ana.del(`${T}/members/${leo.id}`)).status, 200);
  assert.equal((await leitor.get(`${T}/graph`)).status, 404);
});

test('documentos: tipo real do arquivo e vínculo como evidência', async () => {
  const T = `/api/trees/${arvore}`;
  const falso = Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.equal((await ana.post(`${T}/documents`, { title: 'Falso', file_base64: falso, file_name: 'x.png' })).status, 415);
  const d = (await ana.post(`${T}/documents`, { title: 'Certidão de nascimento de Bruno', category: 'birth_cert', transcription: 'Bruno Ferraz, filho de Antônio Ferraz e Maria Souza, nascido em 10/05/1930.' })).dados.id;
  assert.equal((await ana.post(`${T}/documents/${d}/links`, { relationship_id: relPai })).status, 201);
  const ev = await ana.get(`${T}/evidence?target_id=${relPai}`);
  assert.equal(ev.dados.evidencias[0].kind, 'documented');
  const ext = await ana.post(`${T}/documents/${d}/extract`);
  assert.equal(ext.dados.disponivel, true);
  assert.ok(ext.dados.sugestoes.datas.some((x) => x.valor === '1930-05-10'));
});

test('correspondências: análise, revisão, desfazer e união com confirmação', async () => {
  const T = `/api/trees/${arvore}`;
  const solto = (await ana.post(`${T}/persons`, { full_name: 'Bruno Feraz', sex: 'M', birth_date: '1930', ignore_duplicates: true })).dados.id;
  const an = await ana.post(`${T}/matches/analyze`);
  assert.ok(an.dados.criadas >= 1);
  const lista = await ana.get(`${T}/matches`);
  const m = lista.dados.correspondencias.find((x) => [x.a.id, x.b.id].includes(solto));
  assert.ok(m, 'gera correspondência');
  assert.ok(lista.dados.aviso.includes('não uma probabilidade'));
  assert.equal((await ana.post(`${T}/matches/${m.id}/review`, { decision: 'later', justification: 'Ver certidão' })).status, 200);
  assert.equal((await ana.post(`${T}/matches/${m.id}/review`, { decision: 'accepted' })).status, 200);
  const und = await ana.post(`${T}/matches/${m.id}/undo`);
  assert.equal(und.dados.status, 'later');
  const det = await ana.get(`${T}/matches/${m.id}`);
  assert.equal(det.dados.revisoes.length, 3);
  assert.equal((await ana.post(`${T}/persons/merge`, { keep_id: pai, remove_id: solto })).status, 400, 'sem confirmação não une');
  assert.equal((await ana.post(`${T}/persons/merge`, { keep_id: pai, remove_id: solto, confirm: true })).status, 200);
  assert.equal((await ana.get(`${T}/persons/${solto}`)).status, 404);
  const pai2 = await ana.get(`${T}/persons/${pai}`);
  assert.ok(pai2.dados.nomes.some((n) => n.name === 'Bruno Feraz'));
});

test('importação GEDCOM e CSV com prévia, e exportação', async () => {
  const T = `/api/trees/${arvore}`;
  const ged = ['0 HEAD', '0 @I1@ INDI', '1 NAME Ugo /Bellini/', '1 SEX M', '1 BIRT', '2 DATE ABT 1880', '0 @I2@ INDI', '1 NAME Vera /Bellini/', '1 SEX F', '1 FAMC @F1@',
    '0 @F1@ FAM', '1 HUSB @I1@', '1 CHIL @I2@', '1 CHIL @I9@', '0 TRLR'].join('\n');
  const pre = await ana.post(`${T}/import/preview`, { format: 'gedcom', content: ged });
  assert.equal(pre.dados.total_pessoas, 2);
  assert.ok(pre.dados.avisos.some((a) => a.includes('@I9@')));
  assert.equal((await ana.post(`${T}/import/commit`, { format: 'gedcom', content: ged })).status, 400, 'exige confirmação');
  const com = await ana.post(`${T}/import/commit`, { format: 'gedcom', content: ged, confirm: true, filename: 'teste.ged' });
  assert.equal(com.dados.pessoas, 2);
  assert.equal(com.dados.relacoes, 1);
  const csv = 'Código;Nome completo;Nascimento;Pai\nc1;Xavier Lopes;01/02/1901;\nc2;Yara Lopes;c. 1930;c1\n';
  const p1 = await ana.post(`${T}/import/preview`, { format: 'csv', content: csv });
  assert.ok(p1.dados.cabecalho.includes('Nome completo'));
  const p2 = await ana.post(`${T}/import/preview`, { format: 'csv', content: csv, mapping: { ref: 'Código', full_name: 'Nome completo', birth_date: 'Nascimento', father_ref: 'Pai' } });
  assert.equal(p2.dados.total_relacoes, 1);
  const c2 = await ana.post(`${T}/import/commit`, { format: 'csv', content: csv, confirm: true, mapping: { ref: 'Código', full_name: 'Nome completo', birth_date: 'Nascimento', father_ref: 'Pai' } });
  assert.equal(c2.dados.pessoas, 2);
  const s = await ana.get('/api/search?q=yara');
  assert.equal(s.dados.resultados[0].pessoa.birth_qual, 'about');
  // Exportação: sem vivos e sem identificadores por padrão.
  const g = await ana.post(`${T}/export`, { format: 'gedcom' });
  assert.match(g.dados.content, /0 HEAD/);
  assert.ok(!g.dados.content.includes('Daniel'));
  const j = JSON.parse((await ana.post(`${T}/export`, { format: 'json' })).dados.content);
  assert.equal(j.identificadores, undefined);
  const jv = JSON.parse((await ana.post(`${T}/export`, { format: 'json', include_living: true })).dados.content);
  assert.ok(jv.pessoas.some((p) => p.full_name === 'Daniel Ferraz'));
  // JSON exportado volta a ser importável.
  const pj = await ana.post(`${T}/import/preview`, { format: 'json', content: JSON.stringify(jv) });
  assert.ok(pj.dados.total_pessoas >= 5);
  const ramo = JSON.parse((await ana.post(`${T}/export`, { format: 'json', root_id: pai, branch: 'ancestors' })).dados.content);
  assert.deepEqual(ramo.pessoas.map((p) => p.full_name).sort(), ['Antônio Ferraz', 'Bruno Ferraz']);
});

test('painel com números reais, linha do tempo e mapa', async () => {
  const T = `/api/trees/${arvore}`;
  const d = await ana.get(`${T}/dashboard`);
  const g = await ana.get(`${T}/graph`);
  assert.equal(d.dados.indicadores.pessoas, g.dados.pessoas.length);
  assert.equal(d.dados.indicadores.relacoes, g.dados.relacoes.length);
  assert.ok(d.dados.indicadores.geracoes >= 3);
  assert.ok(d.dados.atividades.length > 0);
  const tl = await ana.get(`${T}/timeline?type=birth`);
  assert.ok(tl.dados.eventos.every((e) => e.tipo === 'birth'));
  const mapa = await ana.get(`${T}/map`);
  assert.ok(Array.isArray(mapa.dados.pontos));
  assert.ok(mapa.dados.locais_sem_coordenadas.includes('Campinas, SP, Brasil'), 'não inventa coordenadas');
});

test('dados de demonstração: criação e remoção sem afetar registros reais', async () => {
  const antes = (await ana.get(`/api/trees/${arvore}/graph`)).dados.pessoas.length;
  const demo = await ana.post('/api/demo');
  assert.equal(demo.status, 201);
  const D = `/api/trees/${demo.dados.tree_id}`;
  const g = await ana.get(`${D}/graph`);
  assert.ok(g.dados.pessoas.length >= 19);
  const dash = await ana.get(`${D}/dashboard`);
  assert.ok(dash.dados.indicadores.geracoes >= 4);
  assert.ok(dash.dados.indicadores.documentos >= 4);
  const an = await ana.post(`${D}/matches/analyze`);
  assert.ok(an.dados.criadas >= 2, 'demo gera correspondências');
  const nome = (n) => g.dados.pessoas.find((p) => p.full_name === n).id;
  const k = await ana.get(`${D}/kinship?a=${nome('Celina Brandemar Corvalli')}&b=${nome('Augusto Arantes Brandemar')}`);
  assert.equal(k.dados.resultados[0].descricao, 'meia-irmã');
  const k2 = await ana.get(`${D}/kinship?a=${nome('Beatriz Corvalli Nogueira')}&b=${nome('Matteo Corvalli')}`);
  assert.equal(k2.dados.resultados[0].descricao, 'trineta');
  assert.equal((await ana.del('/api/demo')).dados.removidas, 1);
  assert.equal((await ana.get(`${D}/graph`)).status, 404);
  assert.equal((await ana.get(`/api/trees/${arvore}/graph`)).dados.pessoas.length, antes);
});

test('recuperação após erros e mensagens compreensíveis', async () => {
  const r = await fetch(`${srv.base}/api/trees`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: '' }, body: '{quebrado' });
  assert.ok([400, 401].includes(r.status));
  const ruim = await ana.req('POST', '/api/trees', undefined, { 'content-type': 'application/json' });
  assert.equal(ruim.status, 400);
  const inval = await fetch(`${srv.base}/api/trees`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': ana.csrf } , body: '{x' });
  assert.ok([400, 401].includes(inval.status));
  assert.equal((await ana.get('/api/trees/nao-existe/graph')).status, 404);
  assert.match((await ana.get('/api/trees/nao-existe/graph')).dados.erro, /não encontrada/);
  assert.equal((await ana.get('/api/trees')).status, 200, 'continua funcionando');
  const h = await fetch(srv.base + '/api/health');
  assert.match(h.headers.get('content-security-policy'), /script-src 'self'/);
});

test('administração técnica restrita e link de redefinição de senha', async () => {
  assert.equal((await ana.get('/api/admin/status')).status, 404);
  const adm = cliente(srv.base);
  await adm.registrar('admin@exemplo.test', 'Admin');
  assert.equal((await adm.get('/api/admin/status')).status, 200);
  const link = await adm.post('/api/admin/reset-link', { email: 'bia@exemplo.test' });
  const token = link.dados.link.split('/').pop();
  const anon = cliente(srv.base);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'novasenha456' })).status, 200);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'novasenha456' })).status, 400, 'link de uso único');
  assert.equal((await anon.post('/api/auth/login', { email: 'bia@exemplo.test', password: 'novasenha456' })).status, 200);
});
