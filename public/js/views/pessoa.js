// Perfil da pessoa (painel lateral), cadastro/edição com verificação de duplicidade, vínculos, eventos, identificadores e evidências.
import { h, icone, botao, gaveta, fecharGaveta, modal, confirmar, toast, erroToast, carregando, erroBloco, campo, entrada, seletor, valores, abas,
  seloVerif, selo, fmtData, anos, avatar, lugar, SUBTIPO, TIPO_REL, SITUACAO, VERIF, TIPO_ID, TIPO_EVT, CATEGORIA_DOC, tempoRelativo, aviso } from '../ui.js';
import { GET, POST, PATCH, DEL } from '../api.js';
import { estado, T, grafo, alterado, pode, selecionar } from '../estado.js';
import { campoData, camposLocal, lerLocal, normalizarData, escolherPessoa, paraExibir } from '../componentes.js';
import { cpfValido } from '../nomes.js';

const VERIF_OPC = Object.entries(VERIF).map(([k, v]) => [k, v[0]]);

// ---------- Perfil ----------
export async function abrirPessoa(id, abaInicial = 'resumo') {
  const g = gaveta('Carregando…', carregando());
  const carregar = async (aba = abaInicial) => {
    try {
      const d = await GET(`${T()}/persons/${id}`);
      g.definirTitulo(d.pessoa.full_name);
      g.corpo.replaceChildren(perfil(d, () => carregar(abaAtual), aba));
    } catch (e) { g.corpo.replaceChildren(erroBloco(e, () => carregar())); }
  };
  let abaAtual = abaInicial;
  const perfil = (d, recarregar, aba) => {
    const p = d.pessoa;
    const area = h('div');
    const mostrar = (a) => { abaAtual = a; area.replaceChildren(({ resumo, eventos, documentos, identificadores, comentarios }[a] || resumo)(d, recarregar)); };
    const lista = [['resumo', 'Resumo'], ...(d.restrito ? [] : [['eventos', 'Eventos'], ['documentos', 'Documentos e evidências']]), ...(d.identificadores ? [['identificadores', 'Identificadores']] : []), ['comentarios', 'Comentários']];
    const foto = avatar(p, true);
    if (p.photo_document_id) POST(`${T()}/documents/${p.photo_document_id}/file-url`).then((r) => { foto.replaceChildren(h('img', { src: r.url, alt: `Foto de ${p.full_name}` })); }).catch(() => {});
    const topo = h('div', { class: 'perfil-topo' }, foto, h('div', {},
      h('h2', { text: p.full_name }), h('div', { class: 'mudo', text: [anos(p), SITUACAO[p.living_status]].filter(Boolean).join(' · ') }),
      h('div', { class: 'selos', style: { marginTop: '6px' } }, d.restrito ? selo('Registro protegido', 'contorno', 'cadeado') : seloVerif(p.verification),
        p.is_demo ? selo('Demonstração', 'demo') : null, d.documentos?.length ? selo(`${d.documentos.length} documento(s)`, 'azul', 'documento') : null,
        d.correspondencias?.length ? selo('Possível correspondência', 'ouro', 'correspondencia') : null, d.em_arvores > 1 ? selo(`Em ${d.em_arvores} árvores`, 'contorno', 'camadas') : null)));
    const acoes = h('div', { class: 'acoes', style: { marginBottom: '12px' } },
      botao('Ver na árvore', { icone: 'arvore', tipo: 'pequeno', acao: () => { selecionar(p.id); fecharGaveta(); location.hash = '#/arvore'; } }),
      botao('Parentesco com…', { icone: 'parentesco', tipo: 'pequeno', acao: () => { fecharGaveta(); location.hash = `#/parentesco?a=${p.id}`; } }),
      !d.restrito && podeEditar(p) ? botao('Editar', { icone: 'editar', tipo: 'pequeno', acao: () => editarPessoa(id, recarregar) }) : null,
      !d.restrito && pode('editor') ? botao('', { icone: 'lixo', tipo: 'pequeno perigo', titulo: 'Excluir pessoa desta árvore', acao: () => excluirPessoa(p) }) : null);
    if (!['resumo', ...lista.map((x) => x[0])].includes(aba)) aba = 'resumo';
    const barra = abas(lista, mostrar, aba);
    mostrar(aba);
    return h('div', {}, topo, acoes, d.restrito ? aviso('Pessoa viva ou registro privado: os dados pessoais ficam visíveis apenas para editores e para quem a cadastrou.', 'ambar', 'cadeado') : null, barra, area);
  };
  carregar();
}

const podeEditar = (p) => pode('editor') || (pode('contributor') && p.created_by === estado.usuario.id);

function resumo(d, recarregar) {
  const p = d.pessoa;
  const linha = (rot, val) => (val ? [h('dt', { text: rot }), h('dd', {}, val)] : []);
  const apelidos = d.nomes?.filter((n) => n.kind === 'nickname').map((n) => n.name).join(', ');
  const anteriores = d.nomes?.filter((n) => n.kind === 'previous').map((n) => n.name).join(', ');
  const variantes = d.nomes?.filter((n) => n.kind === 'variant').map((n) => n.name).join(', ');
  const dados = d.restrito ? null : h('dl', { class: 'dados' },
    linha('Nome de nascimento', p.birth_name), linha('Apelidos', apelidos), linha('Nomes anteriores', anteriores), linha('Outras grafias', variantes),
    linha('Sexo', { F: 'Feminino', M: 'Masculino', X: 'Outro/não binário' }[p.sex]), linha('Nascimento', [fmtData(p.birth_date, p.birth_qual), lugar(p.birth_place)].filter(Boolean).join(' — ')),
    linha('Falecimento', [fmtData(p.death_date, p.death_qual), lugar(p.death_place)].filter(Boolean).join(' — ')), linha('Situação', SITUACAO[p.living_status]),
    linha('Visibilidade', p.visibility === 'private' ? 'Privada (só editores)' : 'Membros da árvore'), linha('Atualizado', tempoRelativo(p.updated_at)));
  const grupos = { pais: [], filhos: [], conjuges: [], irmaos: [], outros: [] };
  for (const r of d.relacoes) {
    if (r.type === 'parent' || r.type === 'guardian') (r.papel_desta === 'b' ? grupos.pais : grupos.filhos).push(r);
    else if (r.type === 'spouse' || r.type === 'partner') grupos.conjuges.push(r);
    else if (r.type === 'sibling') grupos.irmaos.push(r);
    else grupos.outros.push(r);
  }
  const editar = pode('contributor');
  const item = (r, rot) => h('div', { class: 'vinculo' }, avatar(r.outra),
    h('div', { style: { flex: 1, minWidth: 0 } }, h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: r.outra?.full_name || '—', on: { click: () => abrirPessoa(r.outra.id) } }),
      h('div', { class: 'tipo' }, rot, r.subtype && r.subtype !== 'unknown' && r.type !== 'spouse' ? ` · ${SUBTIPO[r.subtype]}` : '', r.start_date ? ` · desde ${fmtData(r.start_date)}` : '', r.end_date ? ` · até ${fmtData(r.end_date)}${r.end_reason ? ` (${r.end_reason})` : ''}` : ''),
      h('div', { class: 'selos', style: { marginTop: '4px' } }, seloVerif(r.status), r.documentos.length ? selo(`${r.documentos.length} doc.`, 'azul', 'documento') : null)),
    editar ? botao('', { icone: 'editar', tipo: 'fantasma pequeno', titulo: 'Editar vínculo', acao: () => editarVinculo(r, recarregar) }) : null);
  const rotPai = (r) => (r.type === 'guardian' ? 'Tutor(a) legal' : { F: 'Mãe', M: 'Pai' }[r.outra?.sex] || 'Genitor(a)');
  const rotFilho = (r) => (r.type === 'guardian' ? 'Tutelado(a)' : { F: 'Filha', M: 'Filho' }[r.outra?.sex] || 'Filho(a)');
  // Irmãos inferidos pelos pais em comum.
  const g = estado.grafo;
  const irmaosInferidos = [];
  if (g) {
    const meusPais = new Set(g.relacoes.filter((r) => r.type === 'parent' && r.person_b === p.id).map((r) => r.person_a));
    const vistos = new Set();
    for (const r of g.relacoes) if (r.type === 'parent' && meusPais.has(r.person_a) && r.person_b !== p.id && !vistos.has(r.person_b)) {
      vistos.add(r.person_b);
      const outra = g.porId.get(r.person_b);
      const pais2 = new Set(g.relacoes.filter((x) => x.type === 'parent' && x.person_b === r.person_b).map((x) => x.person_a));
      const comum = [...meusPais].filter((x) => pais2.has(x)).length;
      irmaosInferidos.push({ outra, meio: comum < Math.max(meusPais.size, pais2.size) });
    }
  }
  const secao = (titulo, itens, botoes) => h('div', { class: 'secao' }, h('h3', {}, h('span', { text: titulo }), editar && botoes ? h('span', { class: 'acoes' }, botoes) : null), itens.length ? itens : h('p', { class: 'mudo pequeno', text: 'Nenhum registro.' }));
  const add = (como, rot) => botao(rot, { icone: 'mais', tipo: 'fantasma pequeno', acao: () => adicionarVinculo(p, como, recarregar) });
  return h('div', {}, dados, p.bio && !d.restrito ? h('p', { text: p.bio, style: { whiteSpace: 'pre-wrap' } }) : null,
    secao('Pais e responsáveis', grupos.pais.map((r) => item(r, rotPai(r))), [add('parent', 'Pai/mãe'), add('guardian', 'Tutor')]),
    secao('Cônjuges e parceiros', grupos.conjuges.map((r) => item(r, r.type === 'spouse' ? 'Cônjuge' : 'União/parceria')), [add('spouse', 'Cônjuge'), add('partner', 'Parceria')]),
    secao('Filhos', grupos.filhos.map((r) => item(r, rotFilho(r))), [add('child', 'Filho(a)')]),
    secao('Irmãos', [...irmaosInferidos.map((i) => h('div', { class: 'vinculo' }, avatar(i.outra), h('div', { style: { flex: 1 } }, h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: i.outra.full_name, on: { click: () => abrirPessoa(i.outra.id) } }), h('div', { class: 'tipo', text: i.meio ? 'Meio-irmão(ã) — um genitor em comum' : 'Irmão(ã) — mesmos genitores registrados' })))),
      ...grupos.irmaos.map((r) => item(r, 'Irmão(ã) declarado(a)'))], [add('sibling', 'Irmão(ã)')]),
    grupos.outros.length ? secao('Parentesco não confirmado', grupos.outros.map((r) => item(r, 'Vínculo a confirmar'))) : null);
}

function eventos(d, recarregar) {
  const lista = d.eventos;
  return h('div', {}, pode('contributor') ? h('div', { class: 'acoes', style: { marginBottom: '10px' } }, botao('Adicionar evento', { icone: 'mais', tipo: 'pequeno', acao: () => formEvento(d.pessoa, null, recarregar) })) : null,
    lista.length ? h('ul', { class: 'lista' }, lista.map((e) => h('li', {}, icone('tempo', 16, { class: 'mudo' }), h('div', { style: { flex: 1 } },
      h('div', {}, h('b', { text: TIPO_EVT[e.type] }), e.date ? ` · ${fmtData(e.date, e.date_qual)}` : ' · data desconhecida', e.place ? ` · ${e.place.name}` : ''),
      e.description ? h('div', { class: 'pequeno', text: e.description }) : null, h('div', { class: 'selos', style: { marginTop: '4px' } }, seloVerif(e.verification))),
    podeEditar({ created_by: e.created_by }) ? h('span', { class: 'acoes' }, botao('', { icone: 'editar', tipo: 'fantasma pequeno', titulo: 'Editar evento', acao: () => formEvento(d.pessoa, e, recarregar) }),
      botao('', { icone: 'lixo', tipo: 'fantasma pequeno perigo', titulo: 'Excluir evento', acao: async () => { if (await confirmar('Excluir este evento?', { perigo: true, texto: 'Excluir' })) { try { await DEL(`${T()}/events/${e.id}`); toast('Evento excluído.', 'sucesso'); recarregar(); } catch (err) { erroToast(err); } } } })) : null)))
      : h('p', { class: 'mudo', text: 'Nenhum evento além de nascimento e falecimento. Registre casamentos, mudanças de cidade, imigração e outros acontecimentos.' }));
}

function documentos(d, recarregar) {
  const p = d.pessoa;
  const ROT_EV = { declared: 'Declarada pelo usuário', extracted: 'Extraída automaticamente', documented: 'Sustentada por documento', confirmed: 'Confirmada após revisão', contested: 'Contestada', hypothesis: 'Hipótese' };
  return h('div', {},
    pode('contributor') ? h('div', { class: 'acoes', style: { marginBottom: '10px' } },
      botao('Anexar novo documento', { icone: 'clipe', tipo: 'pequeno', acao: async () => { const m = await import('./documentos.js'); m.novoDocumento({ pessoas: [p.id], aoSalvar: recarregar }); } }),
      botao('Vincular documento existente', { icone: 'link', tipo: 'pequeno', acao: () => vincularDocumento(p, recarregar) }),
      botao('Registrar evidência', { icone: 'escudo', tipo: 'pequeno', acao: () => formEvidencia('person', p.id, recarregar) })) : null,
    h('div', { class: 'secao' }, h('h3', { text: 'Documentos' }), d.documentos.length ? h('ul', { class: 'lista' }, d.documentos.map((doc) => h('li', {}, icone('documento', 16, { class: 'mudo' }),
      h('div', { style: { flex: 1 } }, h('button', { class: 'link-botao', text: doc.title, on: { click: async () => { const m = await import('./documentos.js'); m.abrirDocumento(doc.id); } } }),
        h('div', { class: 'pequeno mudo', text: [CATEGORIA_DOC[doc.category], fmtData(doc.doc_date)].filter(Boolean).join(' · ') }), h('div', { class: 'selos' }, seloVerif(doc.verification), doc.access_level !== 'tree' ? selo('Acesso restrito', 'contorno', 'cadeado') : null)))))
      : h('p', { class: 'mudo pequeno', text: 'Nenhum documento vinculado.' })),
    h('div', { class: 'secao' }, h('h3', { text: 'Evidências sobre esta pessoa' }), d.evidencias.length ? h('ul', { class: 'lista' }, d.evidencias.map((e) => h('li', {}, icone(e.stance === -1 ? 'alerta' : 'escudo', 16, { class: e.stance === -1 ? '' : 'mudo' }),
      h('div', {}, h('div', {}, selo(e.stance === -1 ? 'Contesta' : 'Sustenta', e.stance === -1 ? 'vermelho' : 'verde'), ' ', h('b', { text: ROT_EV[e.kind] })), e.documento ? h('div', { class: 'pequeno', text: `Documento: ${e.documento}` }) : null, e.note ? h('div', { class: 'pequeno mudo', text: e.note }) : null)))) : h('p', { class: 'mudo pequeno', text: 'Nenhuma evidência registrada.' })));
}

function identificadores(d, recarregar) {
  const p = d.pessoa;
  return h('div', {}, aviso('Identificadores são opcionais, guardados criptografados e exibidos mascarados. Só administradores da árvore podem ver o número completo, e cada acesso fica registrado.', '', 'cadeado'),
    pode('editor') ? h('div', { class: 'acoes', style: { marginBottom: '10px' } }, botao('Adicionar identificador', { icone: 'mais', tipo: 'pequeno', acao: () => formIdentificador(p, recarregar) })) : null,
    d.identificadores.length ? h('ul', { class: 'lista' }, d.identificadores.map((i) => {
      const valor = h('span', { class: 'mono', text: i.mascarado });
      return h('li', {}, icone('chave', 16, { class: 'mudo' }), h('div', { style: { flex: 1 } }, h('div', {}, h('b', { text: TIPO_ID[i.kind] }), ' ', valor),
        h('div', { class: 'pequeno mudo', text: [i.issuer, i.country, i.issued_at && `emissão ${fmtData(i.issued_at)}`, i.expires_at && `validade ${fmtData(i.expires_at)}`, i.origin && `origem: ${i.origin}`].filter(Boolean).join(' · ') }), seloVerif(i.verification)),
      h('span', { class: 'acoes' }, pode('admin') ? botao('', { icone: 'olho', tipo: 'fantasma pequeno', titulo: 'Ver número completo (acesso registrado)', acao: async () => {
        if (!(await confirmar('O acesso ao número completo será registrado no histórico da árvore. Continuar?', { texto: 'Ver número' }))) return;
        try { const r = await POST(`${T()}/persons/${p.id}/identifiers/${i.id}/reveal`); valor.textContent = r.valor; setTimeout(() => { valor.textContent = i.mascarado; }, 20000); } catch (e) { erroToast(e); }
      } }) : null, botao('', { icone: 'lixo', tipo: 'fantasma pequeno perigo', titulo: 'Excluir identificador', acao: async () => {
        if (!(await confirmar('Excluir este identificador definitivamente?', { perigo: true, texto: 'Excluir' }))) return;
        try { await DEL(`${T()}/persons/${p.id}/identifiers/${i.id}`); toast('Identificador excluído.', 'sucesso'); recarregar(); } catch (e) { erroToast(e); }
      } })));
    })) : h('p', { class: 'mudo', text: 'Nenhum identificador cadastrado. O CPF nunca é obrigatório.' }));
}

function comentarios(d) {
  const p = d.pessoa;
  const lista = h('div', {}, carregando());
  const carregar = async () => {
    try {
      const r = await GET(`${T()}/comments?target_id=${p.id}`);
      lista.replaceChildren(r.comentarios.length ? h('ul', { class: 'lista' }, r.comentarios.map((c) => h('li', {}, icone(c.kind === 'review_request' ? 'alerta' : 'comentario', 16, { class: 'mudo' }),
        h('div', { style: { flex: 1 } }, h('div', { text: c.body, style: { whiteSpace: 'pre-wrap' } }), h('small', { class: 'mudo' }, `${c.autor || ''} · ${tempoRelativo(c.created_at)}`, c.kind === 'review_request' ? [' · ', selo(c.resolved ? 'Revisão concluída' : 'Revisão solicitada', c.resolved ? 'verde' : 'ambar')] : '')),
        c.kind === 'review_request' && !c.resolved && pode('editor') ? botao('Concluir', { tipo: 'pequeno', acao: async () => { await PATCH(`${T()}/comments/${c.id}`, { resolved: true }); carregar(); } }) : null,
        c.user_id === estado.usuario.id || pode('admin') ? botao('', { icone: 'lixo', tipo: 'fantasma pequeno', titulo: 'Apagar comentário', acao: async () => { await DEL(`${T()}/comments/${c.id}`); carregar(); } }) : null)))
        : h('p', { class: 'mudo', text: 'Nenhum comentário.' }));
    } catch (e) { lista.replaceChildren(erroBloco(e, carregar)); }
  };
  carregar();
  const texto = h('textarea', { rows: 3, maxLength: 4000, 'aria-label': 'Novo comentário' });
  const enviar = async (kind) => {
    if (!texto.value.trim()) return toast('Escreva o comentário.', 'aviso');
    try { await POST(`${T()}/comments`, { target_type: 'person', target_id: p.id, body: texto.value, kind }); texto.value = ''; carregar(); toast(kind === 'review_request' ? 'Revisão solicitada.' : 'Comentário enviado.', 'sucesso'); } catch (e) { erroToast(e); }
  };
  return h('div', {}, pode('contributor') ? h('div', {}, texto, h('div', { class: 'acoes', style: { margin: '8px 0 16px' } }, botao('Comentar', { tipo: 'primario pequeno', acao: () => enviar('comment') }), botao('Pedir revisão', { tipo: 'pequeno', acao: () => enviar('review_request') }))) : null, lista);
}

// ---------- Formulário de pessoa ----------
function formPessoa(p = {}, nomes = [], extra) {
  const lista = (k) => nomes.filter((n) => n.kind === k).map((n) => n.name).join(', ');
  const form = h('form', { novalidate: true },
    extra || null,
    h('fieldset', {}, h('legend', { text: 'Identificação' }),
      campo('Nome completo', entrada({ name: 'full_name', value: p.full_name || '', maxLength: 200, autocomplete: 'off' }), { obrigatorio: true }),
      h('div', { class: 'linha-campos' }, campo('Nome de nascimento', entrada({ name: 'birth_name', value: p.birth_name || '', maxLength: 200 }), { ajuda: 'Se diferente do atual (ex.: antes do casamento).' }),
        campo('Apelidos', entrada({ name: 'nicknames', value: lista('nickname') }), { ajuda: 'Separe por vírgula.' })),
      h('div', { class: 'linha-campos' }, campo('Nomes anteriores', entrada({ name: 'previous_names', value: lista('previous') }), { ajuda: 'Separe por vírgula.' }),
        campo('Outras grafias', entrada({ name: 'variants', value: lista('variant') }), { ajuda: 'Ex.: Souza / Sousa.' })),
      h('div', { class: 'linha-campos' }, campo('Sexo', seletor([['', 'Não informado'], ['F', 'Feminino'], ['M', 'Masculino'], ['X', 'Outro/não binário']], p.sex || '', { name: 'sex' }), { ajuda: 'Opcional, só quando pertinente à pesquisa.' }),
        campo('Situação', seletor(Object.entries(SITUACAO), p.living_status || 'unknown', { name: 'living_status' })),
        campo('Visibilidade', seletor([['tree', 'Membros da árvore'], ['private', 'Privada (só editores)']], p.visibility || 'tree', { name: 'visibility' }), { ajuda: 'Pessoas vivas já ficam protegidas.' }))),
    h('fieldset', {}, h('legend', { text: 'Nascimento' }), campoData('Data de nascimento', 'birth_date', p.birth_date, p.birth_qual), camposLocal('Local de nascimento', 'birth', p.birth_place)),
    h('fieldset', {}, h('legend', { text: 'Falecimento' }), campoData('Data de falecimento', 'death_date', p.death_date, p.death_qual), camposLocal('Local de falecimento', 'death', p.death_place)),
    h('fieldset', {}, h('legend', { text: 'Biografia e verificação' }),
      campo('Descrição biográfica', h('textarea', { name: 'bio', rows: 4, maxLength: 10000, value: p.bio || '' })),
      campo('Situação de verificação', seletor(VERIF_OPC, p.verification || 'declared', { name: 'verification' }), { ajuda: 'Diferencia o que é declarado, documentado, confirmado, contestado ou hipótese.' })));
  return form;
}
function lerFormPessoa(form) {
  const d = valores(form);
  const sep = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    full_name: d.full_name, birth_name: d.birth_name, sex: d.sex, living_status: d.living_status, visibility: d.visibility, bio: d.bio, verification: d.verification,
    birth_date: normalizarData(d.birth_date), birth_qual: d.birth_qual, death_date: normalizarData(d.death_date), death_qual: d.death_qual,
    birth_place: lerLocal(d, 'birth'), death_place: lerLocal(d, 'death'),
    nicknames: sep(d.nicknames), previous_names: sep(d.previous_names), variants: sep(d.variants),
  };
}

// Mostra pessoas semelhantes enquanto digita (antes de cadastrar).
function painelDuplicidade(form, relate, aoUsarExistente) {
  const area = h('div', { 'aria-live': 'polite' });
  let t;
  const verificar = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const d = lerFormPessoa(form);
      if (d.full_name.length < 3) { area.replaceChildren(); return; }
      try {
        const r = await POST(`${T()}/persons/check-duplicates`, { full_name: d.full_name, birth_date: d.birth_date, sex: d.sex, birth_place: d.birth_place });
        area.replaceChildren(r.semelhantes.length ? h('div', { class: 'aviso ambar' }, icone('alerta', 18), h('div', { style: { flex: 1 } },
          h('p', {}, h('b', { text: 'Pessoas semelhantes já cadastradas.' }), ' Verifique se não é o mesmo indivíduo antes de criar outro registro.'),
          h('ul', { class: 'lista' }, r.semelhantes.slice(0, 4).map((s) => h('li', {}, avatar(s.pessoa), h('div', { style: { flex: 1 } }, h('b', { text: s.pessoa.full_name }), ' ', h('small', { class: 'mudo', text: anos(s.pessoa) }),
            h('div', { class: 'pequeno mudo', text: `${s.rotulo} · compatibilidade interna ${s.score}/100` })),
          h('span', { class: 'acoes' }, botao('Comparar', { tipo: 'pequeno', acao: () => compararComFormulario(d, s) }), relate ? botao('É esta pessoa', { tipo: 'pequeno', acao: () => aoUsarExistente(s.pessoa) }) : null))))))
          : null);
      } catch { /* silencioso: verificação é auxiliar */ }
    }, 450);
  };
  form.addEventListener('input', (e) => { if (['full_name', 'birth_date', 'birth_municipality'].includes(e.target.name)) verificar(); });
  return area;
}

function compararComFormulario(novo, s) {
  const p = s.pessoa;
  const linhas = [['Nome', novo.full_name, p.full_name], ['Nascimento', fmtData(novo.birth_date, novo.birth_qual), fmtData(p.birth_date, p.birth_qual)],
    ['Local de nascimento', novo.birth_place?.municipality || '', p.birth_place?.municipality || ''], ['Falecimento', fmtData(novo.death_date), fmtData(p.death_date)], ['Sexo', novo.sex, p.sex]];
  modal({ titulo: 'Comparar registros', largo: true, corpo: h('div', {},
    h('div', { class: 'comparacao' }, h('div', { class: 'r', text: '' }), h('div', { class: 'r', text: 'Novo cadastro' }), h('div', { class: 'r', text: 'Registro existente' }),
      linhas.flatMap(([r, a, b]) => [h('div', { class: 'r', text: r }), h('div', { class: a && b ? (String(a).toLowerCase() === String(b).toLowerCase() ? 'igual' : 'diferente') : '', text: a || '—' }), h('div', { class: a && b ? (String(a).toLowerCase() === String(b).toLowerCase() ? 'igual' : 'diferente') : '', text: b || '—' })])),
    h('h3', { style: { marginTop: '16px' }, text: `${s.rotulo} — ${s.score}/100` }), h('p', { class: 'pequeno mudo', text: 'Estimativa interna de compatibilidade, não uma probabilidade estatística.' }),
    listaFatores(s.fatores)), acoes: [{ rotulo: 'Fechar' }] });
}
export function listaFatores(f) {
  return h('div', { class: 'grade c3' },
    h('div', {}, h('h4', { text: 'A favor' }), h('ul', { class: 'lista fatores' }, f.positivos.length ? f.positivos.map((x) => h('li', {}, icone('check', 14), h('span', {}, h('b', { text: x.fator }), `: ${x.detalhe}`))) : h('li', { class: 'mudo', text: 'Nenhum' }))),
    h('div', {}, h('h4', { text: 'Contra / conflitos' }), h('ul', { class: 'lista fatores' }, f.negativos.length ? f.negativos.map((x) => h('li', {}, icone('alerta', 14), h('span', {}, h('b', { text: x.fator }), `: ${x.detalhe}`))) : h('li', { class: 'mudo', text: 'Nenhum' }))),
    h('div', {}, h('h4', { text: 'Evidências que faltam' }), h('ul', { class: 'lista fatores' }, f.faltantes.length ? f.faltantes.map((x) => h('li', {}, icone('info', 14), h('span', { text: x }))) : h('li', { class: 'mudo', text: 'Nenhuma' }))));
}

const COMO = { parent: 'pai/mãe', child: 'filho(a)', spouse: 'cônjuge', partner: 'parceiro(a)', sibling: 'irmão(ã)', guardian: 'tutor(a)' };

export async function novaPessoa({ relate } = {}) {
  if (!pode('contributor')) return toast('Seu papel nesta árvore não permite cadastrar pessoas.', 'aviso');
  if (!estado.arvoreId) return toast('Crie ou escolha uma árvore primeiro.', 'aviso');
  const g = await grafo();
  const base = relate ? g.porId.get(relate.person_id) : null;
  const extra = relate ? h('fieldset', {}, h('legend', { text: `Vínculo com ${base?.full_name}` }), h('p', { class: 'pequeno', text: `A nova pessoa será registrada como ${COMO[relate.as]} de ${base?.full_name}.` }),
    h('div', { class: 'linha-campos' },
      ['parent', 'child'].includes(relate.as) ? campo('Natureza da filiação', seletor(Object.entries(SUBTIPO), 'biological', { name: 'rel_subtype' })) : null,
      campo('Situação do vínculo', seletor(VERIF_OPC, 'declared', { name: 'rel_status' })),
      ['spouse', 'partner'].includes(relate.as) ? campo('Início (data)', entrada({ name: 'rel_start', placeholder: 'AAAA ou DD/MM/AAAA' })) : null)) : null;
  const form = formPessoa({}, [], extra);
  let fecharModal;
  const dup = painelDuplicidade(form, relate, async (existente) => {
    try { await criarVinculo(relate.person_id, existente.id, relate.as, valores(form)); toast('Vínculo registrado com a pessoa existente.', 'sucesso'); fecharModal?.(); await alterado(); abrirPessoa(relate.person_id); } catch (e) { erroToast(e); }
  });
  form.prepend(dup);
  await modal({ titulo: relate ? `Adicionar ${COMO[relate.as]}` : 'Nova pessoa', largo: true, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar pessoa', tipo: 'primario', acao: async () => {
    const d = lerFormPessoa(form);
    if (!d.full_name) { toast('Informe o nome completo.', 'aviso'); form.full_name.focus(); return false; }
    const v = valores(form);
    if (relate) d.relate = { person_id: relate.person_id, as: relate.as, subtype: v.rel_subtype, status: v.rel_status, start_date: normalizarData(v.rel_start) };
    const salvar = async (ignorar) => POST(`${T()}/persons`, { ...d, ignore_duplicates: ignorar });
    let r;
    try { r = await salvar(false); } catch (e) {
      if (e.status !== 409 || !e.detalhes?.semelhantes) throw e;
      const ok = await confirmar(`Encontramos ${e.detalhes.semelhantes.length} pessoa(s) muito parecida(s) (${e.detalhes.semelhantes.map((s) => s.pessoa.full_name).slice(0, 3).join(', ')}). Deseja cadastrar mesmo assim como pessoa diferente?`, { titulo: 'Possível duplicidade', texto: 'Cadastrar mesmo assim' });
      if (!ok) return false;
      r = await salvar(true);
    }
    for (const a of r.avisos || []) toast(a, 'aviso', 8000);
    toast('Pessoa cadastrada.', 'sucesso');
    await alterado();
    selecionar(r.id);
    return r.id;
  } }], aoFechar: () => {} }).then((id) => { if (id) abrirPessoa(relate?.person_id || id); });
  fecharModal = () => document.querySelector('.fundo .modal')?.fechar?.(null);
}

async function criarVinculo(baseId, outroId, como, v = {}) {
  const sub = v.rel_subtype, status = v.rel_status, inicio = normalizarData(v.rel_start || '');
  const corpo = { parent: { person_a: outroId, person_b: baseId, type: 'parent', subtype: sub }, child: { person_a: baseId, person_b: outroId, type: 'parent', subtype: sub },
    spouse: { person_a: baseId, person_b: outroId, type: 'spouse', start_date: inicio }, partner: { person_a: baseId, person_b: outroId, type: 'partner', start_date: inicio },
    sibling: { person_a: baseId, person_b: outroId, type: 'sibling' }, guardian: { person_a: outroId, person_b: baseId, type: 'guardian', subtype: 'legal' } }[como];
  const r = await POST(`${T()}/relationships`, { ...corpo, status });
  for (const a of r.avisos || []) toast(a, 'aviso', 8000);
}

async function adicionarVinculo(p, como, recarregar) {
  const g = await grafo();
  const escolha = await modal({ titulo: `Adicionar ${COMO[como]} de ${p.full_name}`, corpo: h('p', { text: 'A pessoa já está cadastrada nesta árvore?' }),
    acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Escolher existente', valor: 'existente' }, { rotulo: 'Cadastrar nova pessoa', tipo: 'primario', valor: 'nova' }] });
  if (escolha === 'nova') { await novaPessoa({ relate: { person_id: p.id, as: como } }); return; }
  if (escolha !== 'existente') return;
  const sel = escolherPessoa(g, { rotulo: 'Pessoa', excluir: [p.id] });
  const form = h('form', {}, sel, h('div', { class: 'linha-campos' },
    ['parent', 'child'].includes(como) ? campo('Natureza da filiação', seletor(Object.entries(SUBTIPO), 'biological', { name: 'rel_subtype' })) : null,
    campo('Situação do vínculo', seletor(VERIF_OPC, 'declared', { name: 'rel_status' })),
    ['spouse', 'partner'].includes(como) ? campo('Início', entrada({ name: 'rel_start', placeholder: 'AAAA ou DD/MM/AAAA' })) : null));
  await modal({ titulo: `Vincular ${COMO[como]}`, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Vincular', tipo: 'primario', acao: async () => {
    if (!sel.valor()) { toast('Escolha uma pessoa da lista.', 'aviso'); return false; }
    await criarVinculo(p.id, sel.valor(), como, valores(form));
    toast('Vínculo registrado.', 'sucesso'); await alterado(); recarregar();
  } }] });
}

async function editarVinculo(r, recarregar) {
  const form = h('form', {}, h('p', {}, h('b', { text: TIPO_REL[r.type] }), ` com ${r.outra?.full_name}`),
    h('div', { class: 'linha-campos' },
      ['parent', 'guardian'].includes(r.type) ? campo('Natureza', seletor(Object.entries(SUBTIPO), r.subtype, { name: 'subtype' })) : null,
      campo('Situação', seletor(VERIF_OPC, r.status, { name: 'status' }))),
    ['spouse', 'partner'].includes(r.type) ? h('div', { class: 'linha-campos' }, campo('Início', entrada({ name: 'start_date', value: paraExibir(r.start_date) })), campo('Fim', entrada({ name: 'end_date', value: paraExibir(r.end_date) })),
      campo('Motivo do fim', entrada({ name: 'end_reason', value: r.end_reason, placeholder: 'divórcio, viuvez…' }))) : null,
    campo('Observações', h('textarea', { name: 'notes', rows: 3, value: r.notes || '' })),
    h('div', { class: 'acoes' }, botao('Anexar documento que comprova', { icone: 'clipe', tipo: 'pequeno', acao: () => vincularDocumento(null, recarregar, r.id) }),
      botao('Registrar evidência', { icone: 'escudo', tipo: 'pequeno', acao: () => formEvidencia('relationship', r.id, recarregar) })));
  const res = await modal({ titulo: 'Editar vínculo', corpo: form, acoes: [
    { rotulo: 'Excluir vínculo', tipo: 'perigo', acao: async () => { if (!(await confirmar('Excluir este vínculo? As pessoas continuam cadastradas.', { perigo: true, texto: 'Excluir' }))) return false; await DEL(`${T()}/relationships/${r.id}`); toast('Vínculo excluído.', 'sucesso'); return 'ok'; } },
    { rotulo: 'Cancelar' },
    { rotulo: 'Salvar', tipo: 'primario', acao: async () => { const v = valores(form); await PATCH(`${T()}/relationships/${r.id}`, { ...v, start_date: normalizarData(v.start_date), end_date: normalizarData(v.end_date) }); toast('Vínculo atualizado.', 'sucesso'); return 'ok'; } }] });
  if (res === 'ok') { await alterado(); recarregar(); }
}

export async function editarPessoa(id, aoSalvar) {
  const d = await GET(`${T()}/persons/${id}`);
  const form = formPessoa(d.pessoa, d.nomes);
  const fotos = (await GET(`${T()}/documents?category=photo&limit=100`).catch(() => ({ documentos: [] }))).documentos.filter((x) => x.mime?.startsWith('image/'));
  if (fotos.length) form.append(campo('Fotografia', seletor([['', 'Sem foto'], ...fotos.map((f) => [f.id, f.title])], d.pessoa.photo_document_id || '', { name: 'photo_document_id' }), { ajuda: 'Escolha entre as fotografias anexadas à árvore.' }));
  await modal({ titulo: `Editar ${d.pessoa.full_name}`, largo: true, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar alterações', tipo: 'primario', acao: async () => {
    const dados = lerFormPessoa(form);
    if (fotos.length) dados.photo_document_id = valores(form).photo_document_id || null;
    await PATCH(`${T()}/persons/${id}`, { ...dados, updated_at: d.pessoa.updated_at });
    toast('Alterações salvas.', 'sucesso');
    await alterado(); aoSalvar?.();
  } }] });
}

async function excluirPessoa(p) {
  const ok = await confirmar(`Remover ${p.full_name} desta árvore? Os vínculos dela nesta árvore também serão removidos. Se a pessoa não estiver em outra árvore, o registro será desativado (a administração pode recuperá-lo).`, { titulo: 'Excluir pessoa', perigo: true, texto: 'Excluir', exigir: 'EXCLUIR' });
  if (!ok) return;
  try { await DEL(`${T()}/persons/${p.id}`); toast('Pessoa removida.', 'sucesso'); fecharGaveta(); if (estado.selecionado === p.id) selecionar(null); await alterado(); } catch (e) { erroToast(e); }
}

async function formEvento(p, e, recarregar) {
  const form = h('form', {}, campo('Tipo de evento', seletor(Object.entries(TIPO_EVT), e?.type || 'residence', { name: 'type' })),
    campoData('Data', 'date', e?.date, e?.date_qual), camposLocal('Local', 'place', e?.place),
    campo('Descrição', h('textarea', { name: 'description', rows: 3, value: e?.description || '' })), campo('Verificação', seletor(VERIF_OPC, e?.verification || 'declared', { name: 'verification' })));
  await modal({ titulo: e ? 'Editar evento' : `Novo evento de ${p.full_name}`, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', tipo: 'primario', acao: async () => {
    const v = valores(form);
    const corpo = { type: v.type, date: normalizarData(v.date), date_qual: v.date_qual || v.qual || 'exact', description: v.description, verification: v.verification, place: lerLocal(v, 'place') };
    if (e) await PATCH(`${T()}/events/${e.id}`, corpo); else await POST(`${T()}/persons/${p.id}/events`, corpo);
    toast('Evento salvo.', 'sucesso'); recarregar();
  } }] });
}

async function formIdentificador(p, recarregar) {
  const tipo = seletor(Object.entries(TIPO_ID), 'cpf', { name: 'kind' });
  const valor = entrada({ name: 'value', autocomplete: 'off', inputMode: 'text' });
  const status = h('span', { class: 'ajuda', 'aria-live': 'polite' });
  valor.addEventListener('input', () => {
    if (tipo.value !== 'cpf') { status.textContent = ''; return; }
    const d = valor.value.replace(/\D/g, '');
    status.textContent = d.length < 11 ? '' : cpfValido(d) ? 'Dígitos verificadores conferem (validação apenas matemática, não confirma identidade).' : 'CPF inválido: dígitos verificadores não conferem.';
  });
  const form = h('form', {}, aviso('Guarde identificadores apenas quando houver finalidade legítima (ex.: diferenciar homônimos ou vincular uma certidão). O número é criptografado e não aparece em listas, buscas, URLs ou relatórios comuns.', 'ambar', 'cadeado'),
    h('div', { class: 'linha-campos' }, campo('Tipo', tipo), h('div', { class: 'campo' }, h('label', { for: 'id-valor', text: 'Número' }), Object.assign(valor, { id: 'id-valor' }), status)),
    h('div', { class: 'linha-campos' }, campo('País', entrada({ name: 'country', value: 'BR', maxLength: 60 })), campo('Órgão emissor', entrada({ name: 'issuer', maxLength: 120 }))),
    h('div', { class: 'linha-campos' }, campo('Emissão', entrada({ name: 'issued_at', placeholder: 'AAAA-MM-DD' })), campo('Validade', entrada({ name: 'expires_at', placeholder: 'AAAA-MM-DD' }))),
    campo('Origem da informação', entrada({ name: 'origin', maxLength: 200, placeholder: 'Ex.: certidão de nascimento, livro A-7' })),
    campo('Verificação', seletor(VERIF_OPC, 'declared', { name: 'verification' })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'purpose_ack' }), h('span', { text: 'Confirmo que há finalidade legítima e base legal para guardar este identificador.' })));
  await modal({ titulo: 'Adicionar identificador', corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', tipo: 'primario', acao: async () => {
    const v = valores(form);
    if (v.kind === 'cpf' && !cpfValido(v.value)) { toast('CPF inválido.', 'aviso'); return false; }
    const r = await POST(`${T()}/persons/${p.id}/identifiers`, { ...v, purpose_ack: !!form.purpose_ack.checked, issued_at: normalizarData(v.issued_at), expires_at: normalizarData(v.expires_at) });
    toast('Identificador salvo.', 'sucesso'); if (r.aviso) toast(r.aviso, 'aviso', 9000); recarregar();
  } }] });
}

async function vincularDocumento(p, recarregar, relationshipId) {
  const docs = (await GET(`${T()}/documents?limit=100`)).documentos;
  if (!docs.length) return toast('Nenhum documento na árvore. Anexe um primeiro.', 'aviso');
  const sel = seletor(docs.map((d) => [d.id, `${d.title}${d.doc_date ? ` (${d.doc_date})` : ''}`]), docs[0].id, { name: 'doc' });
  const form = h('form', {}, campo('Documento', sel), campo('Página ou trecho relevante', entrada({ name: 'note', maxLength: 500 })),
    relationshipId ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'contradicts' }), h('span', { text: 'Este documento contradiz o vínculo (conflito documental)' })) : null);
  await modal({ titulo: relationshipId ? 'Documento que sustenta o vínculo' : 'Vincular documento', corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Vincular', tipo: 'primario', acao: async () => {
    const v = valores(form);
    await POST(`${T()}/documents/${v.doc}/links`, relationshipId ? { relationship_id: relationshipId, note: v.note, contradicts: !!form.contradicts?.checked } : { person_id: p.id, note: v.note });
    toast('Documento vinculado.', 'sucesso'); await alterado(); recarregar();
  } }] });
}

export async function formEvidencia(tipo, alvo, recarregar) {
  const docs = (await GET(`${T()}/documents?limit=100`).catch(() => ({ documentos: [] }))).documentos;
  const form = h('form', {},
    campo('Tipo de informação', seletor([['declared', 'Declarada pelo usuário'], ['extracted', 'Extraída automaticamente'], ['documented', 'Sustentada por documento'], ['confirmed', 'Confirmada após revisão'], ['contested', 'Contestada'], ['hypothesis', 'Hipótese ainda não comprovada']], 'documented', { name: 'kind' })),
    campo('Efeito', seletor([['1', 'Sustenta a informação'], ['-1', 'Contradiz a informação (conflito)']], '1', { name: 'stance' })),
    campo('Documento (opcional)', seletor([['', 'Nenhum'], ...docs.map((d) => [d.id, d.title])], '', { name: 'document_id' })),
    campo('Campo específico (opcional)', seletor([['', 'Registro como um todo'], ['birth_date', 'Data de nascimento'], ['birth_place', 'Local de nascimento'], ['death_date', 'Data de falecimento'], ['full_name', 'Nome']], '', { name: 'field' })),
    campo('Justificativa', h('textarea', { name: 'note', rows: 3, maxLength: 2000 })));
  await modal({ titulo: 'Registrar evidência', corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Registrar', tipo: 'primario', acao: async () => {
    const v = valores(form);
    await POST(`${T()}/evidence`, { target_type: tipo, target_id: alvo, kind: v.kind, stance: Number(v.stance), document_id: v.document_id || undefined, field: v.field, note: v.note });
    toast('Evidência registrada.', 'sucesso'); await alterado(); recarregar?.();
  } }] });
}

