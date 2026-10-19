// Fontes históricas, citações, grafo de evidências e catálogo de fontes externas legítimas.
import { h, s, botao, modal, toast, carregando, erroBloco, vazio, aviso, campo, entrada, valores, abas, selo, seletor, confirmar } from '../ui.js';
import { GET, POST, DEL } from '../api.js';
import { estado, T, pode, grafo } from '../estado.js';
import { semArvore } from '../app.js';
import { abrirPessoa } from './pessoa.js';
import { abrirDocumento } from './documentos.js';

const KIND = { declared: ['Declarada pelo usuário', 'contorno'], extracted: ['Extraída automaticamente', 'azul'], documented: ['Sustentada por documento', 'verde'], confirmed: ['Confirmada após revisão', 'verde'], contested: ['Contestada', 'vermelho'], hypothesis: ['Hipótese', 'ambar'] };

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const area = h('div');
  const mostrar = (aba) => ({ fontes, evidencias, externas }[aba])(area);
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Fontes e evidências' }), h('p', { text: 'Registre de onde vem cada informação e veja quais documentos sustentam (ou contradizem) pessoas e vínculos.' }))),
    abas([['evidencias', 'Grafo de evidências'], ['fontes', 'Fontes da árvore'], ['externas', 'Catálogo de fontes externas']], mostrar, 'evidencias'), area);
  mostrar('evidencias');
}

async function fontes(area) {
  area.replaceChildren(carregando());
  try {
    const r = await GET(`${T()}/sources`);
    area.replaceChildren(pode('contributor') ? h('div', { class: 'acoes', style: { marginBottom: '12px' } }, botao('Nova fonte', { icone: 'mais', tipo: 'primario', acao: () => novaFonte(() => fontes(area)) })) : '',
      r.fontes.length ? h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fonte', 'Repositório', 'Cobertura', 'Período', 'Citações', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.fontes.map((f) => h('tr', {}, h('td', {}, h('b', { text: f.title }), f.author ? h('div', { class: 'pequeno mudo', text: f.author }) : null, f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', class: 'pequeno', text: 'Link' }) : null),
          h('td', { text: f.repository || '—' }), h('td', { text: f.coverage || '—' }), h('td', { text: f.period || '—' }), h('td', { text: String(f.citacoes) }),
          h('td', { class: 'acoes' }, pode('contributor') ? botao('Citar', { tipo: 'pequeno', acao: () => citar(f, () => fontes(area)) }) : null,
            pode('editor') ? botao('', { icone: 'lixo', tipo: 'fantasma pequeno perigo', titulo: 'Excluir fonte', acao: async () => { if (await confirmar('Excluir esta fonte?', { perigo: true, texto: 'Excluir' })) { await DEL(`${T()}/sources/${f.id}`); fontes(area); } } }) : null)))))) 
        : h('div', { class: 'cartao' }, vazio({ icone: 'fonte', titulo: 'Nenhuma fonte cadastrada', texto: 'Uma fonte pode ser um livro de registros, um arquivo, um jornal ou um relato. Uma mesma fonte pode ser citada por vários documentos e pessoas.' })));
  } catch (e) { area.replaceChildren(erroBloco(e, () => fontes(area))); }
}

async function novaFonte(depois) {
  const form = h('form', {}, campo('Título', entrada({ name: 'title', maxLength: 250 }), { obrigatorio: true }),
    h('div', { class: 'linha-campos' }, campo('Autor', entrada({ name: 'author' })), campo('Repositório/arquivo', entrada({ name: 'repository' }))),
    h('div', { class: 'linha-campos' }, campo('Cobertura geográfica', entrada({ name: 'coverage' })), campo('Período', entrada({ name: 'period', placeholder: 'ex.: 1880–1920' }))),
    campo('URL (se pública)', entrada({ name: 'url', type: 'url' })), campo('Observações', h('textarea', { name: 'notes', rows: 3 })));
  await modal({ titulo: 'Nova fonte', corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', tipo: 'primario', acao: async () => { await POST(`${T()}/sources`, valores(form)); toast('Fonte cadastrada.', 'sucesso'); depois(); } }] });
}

async function citar(f, depois) {
  const docs = (await GET(`${T()}/documents?limit=100`)).documentos;
  const form = h('form', {}, campo('Documento (opcional)', seletor([['', 'Nenhum'], ...docs.map((d) => [d.id, d.title])], '', { name: 'document_id' })),
    campo('Página/folha', entrada({ name: 'page' })), campo('Trecho citado', h('textarea', { name: 'quote', rows: 3 })));
  await modal({ titulo: `Citar: ${f.title}`, corpo: form, acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar citação', tipo: 'primario', acao: async () => { const v = valores(form); await POST(`${T()}/sources/${f.id}/citations`, { ...v, document_id: v.document_id || undefined }); toast('Citação registrada.', 'sucesso'); depois(); } }] });
}

// Grafo bipartido: documentos à esquerda, pessoas/vínculos à direita.
async function evidencias(area) {
  area.replaceChildren(carregando());
  try {
    const [r, g] = await Promise.all([GET(`${T()}/evidence`), grafo()]);
    if (!r.evidencias.length) { area.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'escudo', titulo: 'Nenhuma evidência registrada', texto: 'Vincule documentos a vínculos familiares ou registre evidências no perfil de cada pessoa.' }))); return; }
    const rel = new Map(g.relacoes.map((x) => [x.id, x]));
    const alvoNome = (e) => {
      if (e.target_type === 'person') return g.porId.get(e.target_id)?.full_name || 'Pessoa removida';
      if (e.target_type === 'relationship') { const x = rel.get(e.target_id); if (!x) return 'Vínculo removido'; const t = { parent: 'filiação', spouse: 'casamento', partner: 'união', guardian: 'tutela', sibling: 'irmandade' }[x.type] || x.type; return `${t}: ${g.porId.get(x.person_a)?.full_name?.split(' ')[0]} → ${g.porId.get(x.person_b)?.full_name?.split(' ')[0]}`; }
      return 'Evento';
    };
    const docs = [...new Map(r.evidencias.map((e) => [e.document_id || 'sem', e.documento || 'Sem documento (declaração/hipótese)'])).entries()];
    const alvos = [...new Map(r.evidencias.map((e) => [e.target_id, { nome: alvoNome(e), tipo: e.target_type }])).entries()];
    const altura = Math.max(docs.length, alvos.length) * 34 + 30;
    const svg = s('svg', { viewBox: `0 0 900 ${altura}`, width: '100%', role: 'img', 'aria-label': 'Grafo de evidências: documentos ligados às informações que sustentam ou contradizem' });
    const yDoc = new Map(docs.map(([id], i) => [id, 25 + i * 34])), yAlvo = new Map(alvos.map(([id], i) => [id, 25 + i * 34]));
    for (const e of r.evidencias) {
      const y1 = yDoc.get(e.document_id || 'sem'), y2 = yAlvo.get(e.target_id);
      const cor = e.stance === -1 ? 'var(--red)' : { documented: 'var(--green)', confirmed: 'var(--green)', hypothesis: 'var(--amber)', extracted: 'var(--blue)' }[e.kind] || 'var(--muted)';
      svg.append(s('path', { d: `M300,${y1} C450,${y1} 450,${y2} 600,${y2}`, fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-dasharray': e.kind === 'hypothesis' ? '4 4' : e.stance === -1 ? '2 3' : '' }, s('title', { text: `${KIND[e.kind][0]}${e.stance === -1 ? ' (contradiz)' : ''}${e.note ? ': ' + e.note : ''}` })));
    }
    for (const [id, nome] of docs) svg.append(s('g', { class: id !== 'sem' ? 'clicavel' : '', on: id !== 'sem' ? { click: () => abrirDocumento(id) } : {} }, s('rect', { x: 10, y: yDoc.get(id) - 13, width: 290, height: 26, rx: 6, fill: 'var(--surface)', stroke: 'var(--border-forte)' }), s('text', { x: 20, y: yDoc.get(id) + 4, 'font-size': 12, fill: 'var(--text)', text: nome.length > 42 ? nome.slice(0, 41) + '…' : nome })));
    for (const [id, a] of alvos) svg.append(s('g', { class: a.tipo === 'person' ? 'clicavel' : '', on: a.tipo === 'person' ? { click: () => abrirPessoa(id) } : {} }, s('rect', { x: 600, y: yAlvo.get(id) - 13, width: 290, height: 26, rx: 13, fill: a.tipo === 'person' ? 'var(--surface-2)' : 'var(--gold-suave)', stroke: 'var(--border-forte)' }), s('text', { x: 612, y: yAlvo.get(id) + 4, 'font-size': 12, fill: 'var(--text)', text: a.nome.length > 40 ? a.nome.slice(0, 39) + '…' : a.nome })));
    const leg = h('div', { class: 'selos', style: { marginBottom: '10px' } }, ...Object.entries(KIND).map(([, [t, cl]]) => selo(t, cl)), selo('Linha pontilhada vermelha: contradiz', 'vermelho'));
    area.replaceChildren(h('div', { class: 'cartao' }, h('p', { class: 'mudo', text: 'Documentos (esquerda) e as pessoas ou vínculos que eles sustentam (direita). Passe o mouse sobre as linhas para ver o tipo de evidência.' }), leg, h('div', { style: { overflowX: 'auto' } }, svg)),
      h('div', { class: 'tabela-envolve', style: { marginTop: '16px' } }, h('table', {}, h('thead', {}, h('tr', {}, ['Informação', 'Tipo', 'Efeito', 'Documento', 'Justificativa'].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.evidencias.map((e) => h('tr', {}, h('td', { text: alvoNome(e) }), h('td', {}, selo(KIND[e.kind][0], KIND[e.kind][1])), h('td', { text: e.stance === -1 ? 'Contradiz' : 'Sustenta' }), h('td', { text: e.documento || '—' }), h('td', { class: 'pequeno', text: e.note || '' })))))));
  } catch (e) { area.replaceChildren(erroBloco(e, () => evidencias(area))); }
}

async function externas(area) {
  area.replaceChildren(carregando());
  try {
    const r = await GET('/api/external-sources');
    area.replaceChildren(aviso(`${r.aviso} A Árvore Viva não consulta bases governamentais restritas nem localiza pessoas a partir de CPF. Respeite os termos de uso de cada serviço.`, 'ambar'),
      h('div', { class: 'grade c2' }, r.fontes.map((f) => h('div', { class: 'cartao' }, h('h3', { text: f.nome }), h('p', { class: 'pequeno', text: f.descricao }),
        h('dl', { class: 'dados' }, h('dt', { text: 'Cobertura' }), h('dd', { text: f.cobertura }), h('dt', { text: 'Período' }), h('dd', { text: f.periodo }), h('dt', { text: 'Acesso' }), h('dd', { text: f.acesso })),
        h('a', { class: 'botao pequeno', href: f.url, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir site oficial' })))));
  } catch (e) { area.replaceChildren(erroBloco(e, () => externas(area))); }
}

