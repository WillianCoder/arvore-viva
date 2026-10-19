// Repositório documental: envio seguro, metadados, vínculos, visualização por URL temporária e extração assistida.
import { h, botao, modal, confirmar, toast, erroToast, carregando, erroBloco, vazio, aviso, campo, entrada, seletor, valores, selo, seloVerif, fmtData, tempoRelativo,
  CATEGORIA_DOC, ACESSO, VERIF, lerArquivoBase64, gaveta, fecharGaveta, icone } from '../ui.js';
import { GET, POST, PATCH, DEL, qs } from '../api.js';
import { estado, T, pode, grafo, alterado } from '../estado.js';
import { semArvore, parametros } from '../app.js';
import { campoData, camposLocal, lerLocal, normalizarData, escolherPessoa, paraExibir } from '../componentes.js';
import { abrirPessoa } from './pessoa.js';

const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX = 10 * 1024 * 1024;

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const p = parametros();
  const busca = h('input', { type: 'search', placeholder: 'Título, referência ou instituição…', 'aria-label': 'Buscar documentos' });
  const cat = seletor([['', 'Todas as categorias'], ...Object.entries(CATEGORIA_DOC)], '', { 'aria-label': 'Categoria' });
  const lista = h('div', {}, carregando());
  let offset = 0;
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Documentos e certidões' }), h('p', { text: 'Arquivos guardados criptografados, com acesso por permissão e links temporários. O original nunca é alterado.' })),
    pode('contributor') ? botao('Anexar documento', { icone: 'clipe', tipo: 'primario', acao: () => novoDocumento({ aoSalvar: carregar }) }) : null),
  h('div', { class: 'acoes', style: { marginBottom: '12px' } }, h('div', { style: { flex: '1 1 260px' } }, busca), cat), lista);
  async function carregar() {
    lista.replaceChildren(carregando());
    try {
      const r = await GET(`${T()}/documents?${qs({ q: busca.value, category: cat.value, limit: 50, offset })}`);
      if (!r.total) { lista.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'documento', titulo: 'Nenhum documento', texto: 'Anexe certidões, fotografias antigas, cartas e registros históricos. Também é possível cadastrar apenas os metadados de uma fonte sem arquivo.' }))); return; }
      lista.replaceChildren(h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Documento', 'Categoria', 'Data', 'Verificação', 'Acesso', 'Vínculos'].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.documentos.map((d) => h('tr', {}, h('td', {}, icone(d.mime?.startsWith('image/') ? 'imagem' : 'documento', 14, { class: 'mudo' }), ' ', h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: d.title, on: { click: () => abrirDocumento(d.id, carregar) } }), d.is_demo ? [' ', selo('Exemplo', 'demo')] : null, d.reference ? h('div', { class: 'pequeno mudo', text: d.reference }) : null),
          h('td', { text: CATEGORIA_DOC[d.category] }), h('td', { text: fmtData(d.doc_date) || '—' }), h('td', {}, seloVerif(d.verification)), h('td', {}, d.access_level === 'tree' ? selo('Árvore', 'contorno') : selo(d.access_level === 'editors' ? 'Editores' : 'Proprietário', 'contorno', 'cadeado')), h('td', { text: String(d.vinculos) })))))),
      r.total > 50 ? h('div', { class: 'acoes', style: { justifyContent: 'center', marginTop: '12px' } }, botao('Anteriores', { tipo: 'pequeno', desativado: offset === 0, acao: () => { offset = Math.max(0, offset - 50); carregar(); } }), h('span', { class: 'pequeno mudo', text: `${offset + 1}–${Math.min(offset + 50, r.total)} de ${r.total}` }), botao('Próximos', { tipo: 'pequeno', desativado: offset + 50 >= r.total, acao: () => { offset += 50; carregar(); } })) : null);
    } catch (e) { lista.replaceChildren(erroBloco(e, carregar)); }
  }
  let t; busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { offset = 0; carregar(); }, 300); });
  cat.addEventListener('change', () => { offset = 0; carregar(); });
  carregar();
  if (p.novo && pode('contributor')) novoDocumento({ aoSalvar: carregar });
}

function formMeta(d = {}) {
  return h('div', {},
    campo('Título', entrada({ name: 'title', value: d.title || '', maxLength: 250 }), { obrigatorio: true }),
    h('div', { class: 'linha-campos' }, campo('Categoria', seletor(Object.entries(CATEGORIA_DOC), d.category || 'other', { name: 'category' })),
      campo('Verificação', seletor(Object.entries(VERIF).map(([k, v]) => [k, v[0]]), d.verification || 'declared', { name: 'verification' })),
      campo('Nível de acesso', seletor([...(d.id ? [] : [['', 'Automático (restrito se envolver pessoa viva)']]), ...Object.entries(ACESSO).filter(([k]) => k !== 'owner' || pode('admin'))], d.access_level || '', { name: 'access_level' }), { ajuda: 'Documentos de pessoas vivas ficam restritos a editores por padrão.' })),
    campoData('Data do documento', 'doc_date', d.doc_date),
    h('div', { class: 'linha-campos' }, campo('Instituição emissora', entrada({ name: 'institution', value: d.institution || '' })), campo('Autor ou responsável', entrada({ name: 'author', value: d.author || '' }))),
    h('div', { class: 'linha-campos' }, campo('Número de referência', entrada({ name: 'reference', value: d.reference || '' }), { ajuda: 'Livro, folha, termo, protocolo.' }), campo('Página ou trecho relevante', entrada({ name: 'page', value: d.page || '' }))),
    h('div', { class: 'linha-campos' }, campo('URL da fonte (se pública)', entrada({ name: 'url', type: 'url', value: d.url || '' })), campo('Data de acesso', entrada({ name: 'accessed_at', value: paraExibir(d.accessed_at), placeholder: 'DD/MM/AAAA' }))),
    camposLocal('Local de emissão', 'place', d.place),
    campo('Transcrição', h('textarea', { name: 'transcription', rows: 4, value: d.transcription || '' }), { ajuda: 'Digite ou cole o texto do documento para usar a extração assistida.' }),
    campo('Observações', h('textarea', { name: 'notes', rows: 3, value: d.notes || '' })));
}
const lerMeta = (form) => { const v = valores(form); if (!v.access_level) delete v.access_level; return { ...v, doc_date: normalizarData(v.doc_date), accessed_at: normalizarData(v.accessed_at), place: lerLocal(v, 'place') }; };

export async function novoDocumento({ pessoas = [], aoSalvar } = {}) {
  if (!pode('contributor')) return toast('Seu papel não permite anexar documentos.', 'aviso');
  const g = await grafo();
  const arquivo = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp' });
  const infoArq = h('span', { class: 'ajuda', text: 'PDF, JPG, PNG ou WEBP, até 10 MB. O tipo real do arquivo é conferido no servidor.' });
  arquivo.addEventListener('change', () => {
    const f = arquivo.files[0];
    if (!f) return;
    if (f.size > MAX) { infoArq.textContent = 'Arquivo maior que 10 MB.'; arquivo.value = ''; return; }
    if (f.type && !TIPOS_OK.includes(f.type)) { infoArq.textContent = 'Tipo não permitido.'; arquivo.value = ''; return; }
    infoArq.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
  });
  const selecionadas = new Set(pessoas);
  const chips = h('div', { class: 'selos' });
  const desenharChips = () => chips.replaceChildren(...[...selecionadas].map((id) => h('span', { class: 'selo azul' }, g.porId.get(id)?.full_name || '?', h('button', { type: 'button', class: 'link-botao', 'aria-label': 'Remover', text: ' ×', on: { click: () => { selecionadas.delete(id); desenharChips(); } } }))));
  desenharChips();
  const escolha = escolherPessoa(g, { rotulo: 'Relacionar pessoa', aoEscolher: (p) => { selecionadas.add(p.id); desenharChips(); } });
  const form = h('form', {}, h('div', { class: 'campo' }, h('label', { text: 'Arquivo (opcional)' }), arquivo, infoArq), formMeta(), h('fieldset', {}, h('legend', { text: 'Pessoas relacionadas' }), escolha, chips));
  await modal({ titulo: 'Anexar documento', largo: true, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar documento', tipo: 'primario', acao: async () => {
    const meta = lerMeta(form);
    if (!meta.title) { toast('Informe o título.', 'aviso'); return false; }
    const f = arquivo.files[0];
    const corpo = { ...meta, person_ids: [...selecionadas] };
    if (f) { corpo.file_base64 = await lerArquivoBase64(f); corpo.file_name = f.name; }
    const r = await POST(`${T()}/documents`, corpo);
    toast('Documento salvo.', 'sucesso');
    await alterado();
    aoSalvar?.();
    abrirDocumento(r.id, aoSalvar);
  } }] });
}

export async function abrirDocumento(id, aoMudar) {
  const gv = gaveta('Documento', carregando());
  const carregar = async () => {
    try {
      const r = await GET(`${T()}/documents/${id}`);
      const d = r.documento;
      gv.definirTitulo(d.title);
      const previa = h('div');
      if (d.tem_arquivo) {
        previa.append(botao('Abrir arquivo original', { icone: 'olho', tipo: 'pequeno', acao: async () => {
          try {
            const u = await POST(`${T()}/documents/${d.id}/file-url`);
            if (d.mime.startsWith('image/')) previa.replaceChildren(h('img', { src: u.url, alt: d.title, style: { maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border)' } }), h('p', { class: 'pequeno mudo', text: 'Link temporário válido por 5 minutos.' }));
            else window.open(u.url, '_blank', 'noopener');
          } catch (e) { erroToast(e); }
        } }));
      } else previa.append(h('p', { class: 'mudo pequeno', text: 'Sem arquivo anexado (apenas metadados).' }));
      const linha = (rot, v) => (v ? [h('dt', { text: rot }), h('dd', {}, v)] : []);
      gv.corpo.replaceChildren(
        h('div', { class: 'selos', style: { marginBottom: '10px' } }, seloVerif(d.verification), selo(ACESSO[d.access_level], 'contorno', 'cadeado'), d.is_demo ? selo('Documento fictício de exemplo', 'demo') : null),
        previa,
        h('dl', { class: 'dados', style: { marginTop: '12px' } }, linha('Categoria', CATEGORIA_DOC[d.category]), linha('Data', fmtData(d.doc_date)), linha('Local', d.place?.name), linha('Instituição', d.institution), linha('Autor', d.author),
          linha('Referência', d.reference), linha('Página/trecho', d.page), linha('URL', d.url ? h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer', text: d.url }) : ''), linha('Acesso em', fmtData(d.accessed_at)),
          linha('Arquivo', d.tem_arquivo ? `${d.mime} · ${(d.size / 1024).toFixed(0)} KB · SHA-256 ${d.sha256.slice(0, 12)}…` : ''), linha('Observações', d.notes)),
        d.transcription ? h('div', { class: 'secao' }, h('h3', { text: 'Transcrição' }), h('p', { text: d.transcription, style: { whiteSpace: 'pre-wrap' } })) : null,
        h('div', { class: 'acoes' },
          pode('contributor') ? botao('Extração assistida', { icone: 'busca', tipo: 'pequeno', acao: () => extracao(d, carregar) }) : null,
          pode('contributor') ? botao('Editar', { icone: 'editar', tipo: 'pequeno', acao: () => editar(d, carregar) }) : null,
          pode('contributor') ? botao('Vincular', { icone: 'link', tipo: 'pequeno', acao: () => vincular(d, carregar) }) : null,
          pode('editor') ? botao('', { icone: 'lixo', tipo: 'pequeno perigo', titulo: 'Excluir documento', acao: async () => {
            if (!(await confirmar('Excluir este documento? Os vínculos e evidências apontando para ele deixam de exibi-lo.', { perigo: true, texto: 'Excluir' }))) return;
            try { await DEL(`${T()}/documents/${d.id}`); toast('Documento excluído.', 'sucesso'); fecharGaveta(); await alterado(); aoMudar?.(); } catch (e) { erroToast(e); }
          } }) : null),
        h('div', { class: 'secao' }, h('h3', { text: 'Pessoas, vínculos e eventos sustentados' }), r.vinculos.length ? h('ul', { class: 'lista' }, r.vinculos.map((v) => h('li', {}, icone('link', 14, { class: 'mudo' }), h('div', { style: { flex: 1 } },
          v.person_id ? h('button', { class: 'link-botao', text: v.pessoa, on: { click: () => abrirPessoa(v.person_id) } }) : v.relacao ? h('span', { text: `Vínculo (${({ parent: 'filiação', spouse: 'casamento', partner: 'união', guardian: 'tutela', sibling: 'irmandade' })[v.relacao.type] || v.relacao.type}): ${v.relacao.a} → ${v.relacao.b}` }) : h('span', { text: `Evento: ${v.evento}` }),
          v.note ? h('div', { class: 'pequeno mudo', text: v.note }) : null),
        pode('editor') ? botao('', { icone: 'fechar', tipo: 'fantasma pequeno', titulo: 'Remover vínculo', acao: async () => { await DEL(`${T()}/documents/${d.id}/links/${v.id}`); await alterado(); carregar(); } }) : null))) : h('p', { class: 'mudo pequeno', text: 'Nenhum vínculo ainda.' })),
        r.citacoes.length ? h('div', { class: 'secao' }, h('h3', { text: 'Citado nas fontes' }), h('ul', { class: 'lista' }, r.citacoes.map((ci) => h('li', {}, h('div', {}, h('b', { text: ci.title }), ci.page ? ` · ${ci.page}` : '', ci.quote ? h('div', { class: 'pequeno mudo', text: `“${ci.quote}”` }) : null))))) : null,
        h('div', { class: 'secao' }, h('h3', { text: 'Histórico de alterações' }), h('ul', { class: 'lista' }, r.historico.map((x) => h('li', { class: 'pequeno' }, `${x.autor || 'Sistema'} · ${x.action.replace('documento.', '')} · ${tempoRelativo(x.created_at)}`)))));
    } catch (e) { gv.corpo.replaceChildren(erroBloco(e, carregar)); }
  };
  carregar();
}

async function editar(d, recarregar) {
  const form = h('form', {}, formMeta(d));
  await modal({ titulo: 'Editar metadados', largo: true, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', tipo: 'primario', acao: async () => { await PATCH(`${T()}/documents/${d.id}`, lerMeta(form)); toast('Documento atualizado.', 'sucesso'); recarregar(); } }] });
}

async function vincular(d, recarregar) {
  const g = await grafo();
  const sel = escolherPessoa(g, { rotulo: 'Pessoa' });
  const relSel = h('select', { name: 'rel' }, h('option', { value: '', text: 'Escolha a pessoa acima para listar os vínculos dela' }));
  sel.addEventListener('input', () => setTimeout(() => {
    const id = sel.valor();
    relSel.replaceChildren(h('option', { value: '', text: id ? 'Apenas a pessoa' : '—' }), ...(id ? g.relacoes.filter((r) => r.person_a === id || r.person_b === id).map((r) => h('option', { value: r.id, text: `${({ parent: 'Filiação', spouse: 'Casamento', partner: 'União', guardian: 'Tutela', sibling: 'Irmandade', unknown: 'A confirmar' })[r.type]}: ${g.porId.get(r.person_a)?.full_name} → ${g.porId.get(r.person_b)?.full_name}` })) : []));
  }, 50));
  sel.addEventListener('focusout', () => sel.dispatchEvent(new Event('input')));
  const nota = entrada({ name: 'note', maxLength: 500 });
  const contradiz = h('input', { type: 'checkbox' });
  await modal({ titulo: 'Vincular documento', corpo: h('div', {}, sel, campo('Vínculo específico (opcional)', relSel, { ajuda: 'Ex.: a certidão de nascimento sustenta a filiação.' }), campo('Página ou trecho', nota),
    h('label', { class: 'check' }, contradiz, h('span', { text: 'O documento contradiz o vínculo (conflito documental)' }))),
  acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Vincular', tipo: 'primario', acao: async () => {
    if (!sel.valor()) { toast('Escolha uma pessoa.', 'aviso'); return false; }
    await POST(`${T()}/documents/${d.id}/links`, relSel.value ? { relationship_id: relSel.value, note: nota.value, contradicts: contradiz.checked } : { person_id: sel.valor(), note: nota.value });
    toast('Vínculo registrado.', 'sucesso'); await alterado(); recarregar();
  } }] });
}

// Sugestões extraídas → revisão humana → gravação explícita como "extraída".
async function extracao(d, recarregar) {
  let r;
  try { r = await POST(`${T()}/documents/${d.id}/extract`); } catch (e) { return erroToast(e); }
  if (!r.disponivel) return modal({ titulo: 'Extração assistida', corpo: aviso(r.mensagem, 'ambar'), acoes: [{ rotulo: 'Fechar' }] });
  const g = await grafo();
  const s = r.sugestoes;
  const linhaSug = (rot, itens, render) => h('div', { class: 'secao' }, h('h3', { text: `${rot} (${itens.length})` }), itens.length ? h('ul', { class: 'lista' }, itens.slice(0, 40).map(render)) : h('p', { class: 'mudo pequeno', text: 'Nada encontrado.' }));
  const trecho = (t) => h('div', { class: 'pequeno mudo', text: `…${t}…` });
  const incerto = (x) => (x.incerto ? selo('Leitura incerta — confirme', 'ambar') : null);
  const criarPessoa = async (nome) => {
    const { novaPessoa } = await import('./pessoa.js');
    toast(`Revise os dados de "${nome}" antes de salvar. A informação ficará marcada como extraída.`, 'info', 7000);
    await novaPessoa();
    const campoNome = document.querySelector('.modal input[name="full_name"]');
    if (campoNome) { campoNome.value = nome; campoNome.dispatchEvent(new Event('input', { bubbles: true })); }
    const v = document.querySelector('.modal select[name="verification"]'); if (v) v.value = 'extracted';
  };
  const corpo = h('div', {}, aviso(`${r.aviso} Origem do texto: ${r.origem}.`, 'ambar'),
    linhaSug('Nomes', s.nomes, (n) => { const existe = g.pessoas.find((p) => p.full_name.toLowerCase() === n.valor.toLowerCase()); return h('li', {}, h('div', { style: { flex: 1 } }, h('b', { text: n.valor }), trecho(n.trecho)),
      existe ? botao('Vincular a esta pessoa', { tipo: 'pequeno', acao: async () => { await POST(`${T()}/documents/${d.id}/links`, { person_id: existe.id, note: `Extraído: "${n.valor}"` }); await POST(`${T()}/evidence`, { target_type: 'person', target_id: existe.id, document_id: d.id, kind: 'extracted', note: `Nome encontrado no documento: ${n.trecho}` }); toast('Vinculado e registrado como informação extraída.', 'sucesso'); await alterado(); recarregar(); } })
        : pode('contributor') ? botao('Cadastrar…', { tipo: 'pequeno', acao: () => criarPessoa(n.valor) }) : null); }),
    linhaSug('Datas', s.datas, (x) => h('li', {}, h('div', {}, h('b', { text: fmtData(x.valor) }), ' ', incerto(x), trecho(x.trecho)))),
    linhaSug('Locais', s.locais, (x) => h('li', {}, h('div', {}, h('b', { text: x.valor }), ' ', incerto(x), trecho(x.trecho)))),
    linhaSug('Relações familiares', s.relacoes, (x) => h('li', {}, h('div', {}, h('b', { text: x.tipo === 'filiação' ? `Filiação: ${x.genitores.join(' e ')}` : `Casamento com ${x.pessoa}` }), trecho(x.trecho)))),
    h('p', { class: 'pequeno mudo', text: 'Para registrar datas e locais, edite a pessoa correspondente e use "Registrar evidência" apontando este documento como fonte.' }));
  modal({ titulo: 'Extração assistida — revisão', largo: true, corpo, acoes: [{ rotulo: 'Fechar' }] });
}
