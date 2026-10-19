// Gerenciar árvores: criar, renomear, excluir, demonstração.
import { h, botao, campo, entrada, modal, confirmar, toast, erroToast, vazio, selo, tempoRelativo, carregando } from '../ui.js';
import { POST, PATCH, DEL } from '../api.js';
import { estado, carregarArvores, escolherArvore, emit } from '../estado.js';
import { carregarDemo, recarregarRota } from '../app.js';
import { NOME_PAPEL } from './colaboracao.js';

export async function render(c, params) {
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Minhas árvores' }), h('p', { text: 'Cada árvore tem seus membros e permissões. Uma mesma pessoa pode aparecer em mais de uma árvore sem ser duplicada.' })),
    h('div', { class: 'acoes' }, botao('Nova árvore', { icone: 'mais', tipo: 'primario', acao: () => criar() }), botao('Carregar demonstração', { icone: 'estrela', acao: carregarDemo }))));
  const lista = h('div', {}, carregando());
  c.append(lista);
  await carregarArvores();
  desenhar(lista);
  if (params.nova) criar();
}

function desenhar(lista) {
  if (!estado.arvores.length) { lista.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'arvore', titulo: 'Nenhuma árvore ainda', texto: 'Crie sua primeira árvore ou carregue a demonstração.' }))); return; }
  const temDemo = estado.arvores.some((a) => a.is_demo);
  lista.replaceChildren(h('div', { class: 'tabela-envolve' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Árvore', 'Pessoas', 'Seu papel', 'Atualizada', ''].map((t) => h('th', { text: t })))),
    h('tbody', {}, estado.arvores.map((a) => h('tr', {},
      h('td', {}, h('button', { class: 'link-botao', text: a.name, on: { click: async () => { await escolherArvore(a.id); location.hash = '#/painel'; } } }), ' ', a.is_demo ? selo('Demonstração', 'demo') : null, a.id === estado.arvoreId ? selo('Atual', 'azul') : null, a.description ? h('div', { class: 'mudo pequeno', text: a.description }) : null),
      h('td', { text: a.pessoas.toLocaleString('pt-BR') }), h('td', { text: NOME_PAPEL[a.role] }), h('td', { text: tempoRelativo(a.updated_at) }),
      h('td', { class: 'acoes' },
        ['owner', 'admin'].includes(a.role) ? botao('', { icone: 'editar', tipo: 'fantasma pequeno', titulo: 'Renomear', acao: () => editar(a, lista) }) : null,
        a.role === 'owner' ? botao('', { icone: 'lixo', tipo: 'fantasma pequeno perigo', titulo: 'Excluir árvore', acao: () => excluir(a, lista) }) : null))))),
  ), temDemo ? h('div', { class: 'cartao', style: { marginTop: '16px' } }, h('h3', { text: 'Dados de demonstração' }), h('p', { class: 'mudo', text: 'Remove apenas as árvores marcadas como demonstração. Seus registros reais não são afetados.' }),
    botao('Remover dados de demonstração', { icone: 'lixo', tipo: 'perigo', acao: async () => {
      if (!(await confirmar('Remover todas as árvores de demonstração?', { perigo: true, texto: 'Remover' }))) return;
      try { const r = await DEL('/api/demo'); toast(`${r.removidas} árvore(s) de demonstração removida(s).`, 'sucesso'); await atualizar(lista); } catch (e) { erroToast(e); }
    } })) : null);
}

async function atualizar(lista) {
  await carregarArvores();
  if (!estado.arvores.find((a) => a.id === estado.arvoreId)) await escolherArvore(estado.arvores[0]?.id || null);
  emit('arvores');
  desenhar(lista);
}

export async function criar() {
  const nome = entrada({ maxLength: 120, required: true, placeholder: 'Ex.: Família Silva de Campinas' });
  const desc = h('textarea', { maxLength: 2000, rows: 3 });
  await modal({ titulo: 'Nova árvore', corpo: h('div', {}, campo('Nome', nome, { obrigatorio: true }), campo('Descrição (opcional)', desc)), acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Criar árvore', tipo: 'primario', acao: async () => {
    const r = await POST('/api/trees', { name: nome.value, description: desc.value });
    await carregarArvores(); await escolherArvore(r.id); emit('arvores');
    toast('Árvore criada.', 'sucesso');
    location.hash = '#/painel';
    recarregarRota();
  } }] });
}

async function editar(a, lista) {
  const nome = entrada({ value: a.name, maxLength: 120 });
  const desc = h('textarea', { maxLength: 2000, rows: 3, value: a.description || '' });
  await modal({ titulo: 'Editar árvore', corpo: h('div', {}, campo('Nome', nome, { obrigatorio: true }), campo('Descrição', desc)), acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', tipo: 'primario', acao: async () => {
    await PATCH(`/api/trees/${a.id}`, { name: nome.value, description: desc.value }); toast('Árvore atualizada.', 'sucesso'); await atualizar(lista);
    if (a.id === estado.arvoreId) await escolherArvore(a.id, { salvar: false });
  } }] });
}

async function excluir(a, lista) {
  const ok = await confirmar(`A árvore "${a.name}" e todas as pessoas que só existem nela serão excluídas definitivamente, com documentos e histórico. Esta ação não pode ser desfeita.`, { titulo: 'Excluir árvore', perigo: true, texto: 'Excluir definitivamente', exigir: a.name });
  if (!ok) return;
  try { await DEL(`/api/trees/${a.id}`, { confirm: a.name }); toast('Árvore excluída.', 'sucesso'); await atualizar(lista); } catch (e) { erroToast(e); }
}
