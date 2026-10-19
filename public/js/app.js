// Ponto de entrada: autenticação, layout, navegação e tema.
import { h, icone, botao, limpar, toast, erroToast, carregando, erroBloco, seletor } from './ui.js';
import { GET, PATCH, POST, definirCsrf } from './api.js';
import { estado, on, carregarArvores, escolherArvore, emit } from './estado.js';

const ROTAS = [
  ['Investigação', [
    ['painel', 'Painel', 'painel', () => import('./views/painel.js')],
    ['arvore', 'Árvore 2D/3D', 'arvore', () => import('./views/arvore.js')],
    ['pessoas', 'Pessoas', 'pessoas', () => import('./views/pessoas.js')],
    ['pesquisa', 'Pesquisa avançada', 'busca', () => import('./views/pesquisa.js')],
    ['correspondencias', 'Possíveis familiares', 'correspondencia', () => import('./views/correspondencias.js')],
    ['parentesco', 'Parentesco', 'parentesco', () => import('./views/parentesco.js')],
  ]],
  ['Acervo', [
    ['documentos', 'Documentos', 'documento', () => import('./views/documentos.js')],
    ['fontes', 'Fontes e evidências', 'fonte', () => import('./views/fontes.js')],
    ['linha-do-tempo', 'Linha do tempo', 'tempo', () => import('./views/linhatempo.js')],
    ['mapa', 'Mapa de origens', 'mapa', () => import('./views/mapa.js')],
  ]],
  ['Gestão', [
    ['relatorios', 'Relatórios', 'relatorio', () => import('./views/relatorios.js')],
    ['importar-exportar', 'Importar e exportar', 'importar', () => import('./views/portabilidade.js')],
    ['arvores', 'Minhas árvores', 'camadas', () => import('./views/arvores.js')],
    ['colaboracao', 'Colaboração', 'colaboracao', () => import('./views/colaboracao.js')],
    ['privacidade', 'Segurança e privacidade', 'escudo', () => import('./views/privacidade.js')],
    ['configuracoes', 'Configurações', 'config', () => import('./views/configuracoes.js')],
    ['admin', 'Administração técnica', 'ferramenta', () => import('./views/admin.js'), 'admin'],
  ]],
];
const MAPA_ROTAS = new Map(ROTAS.flatMap(([, itens]) => itens.map((i) => [i[0], i])));

// ---- Tema ----
export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'light' || tema === 'dark') raiz.dataset.theme = tema; else delete raiz.dataset.theme;
  try { localStorage.setItem('av-tema', tema || 'system'); } catch { /* armazenamento indisponível */ }
}
export function temaEfetivo() {
  const t = document.documentElement.dataset.theme;
  return t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
export function aplicarMovimento(reduzir) { document.documentElement.classList.toggle('sem-animacao', !!reduzir); }
export const movimentoReduzido = () => document.documentElement.classList.contains('sem-animacao') || matchMedia('(prefers-reduced-motion: reduce)').matches;
try { aplicarTema(localStorage.getItem('av-tema') || 'system'); } catch { /* sem localStorage */ }

const raiz = document.getElementById('raiz');
let limpeza = null;

async function iniciar() {
  window.addEventListener('sessao-expirada', () => { if (estado.usuario) { estado.usuario = null; toast('Sua sessão expirou. Entre novamente.', 'aviso'); mostrarAuth(); } });
  let me;
  try { me = await GET('/api/auth/me'); } catch (e) { limpar(raiz).append(erroBloco(e, () => location.reload())); return; }
  const caminho = location.pathname;
  if (caminho.startsWith('/redefinir/')) { const m = await import('./views/auth.js'); limpar(raiz).append(m.telaRedefinir(caminho.split('/')[2])); raiz.removeAttribute('aria-busy'); return; }
  if (caminho.startsWith('/convite/')) sessionStorage.setItem('av-convite', caminho.split('/')[2]);
  if (caminho !== '/') history.replaceState(null, '', '/' + location.hash);
  if (!me.usuario) return mostrarAuth();
  await entrar(me);
}

export async function entrar(me) {
  estado.usuario = me.usuario;
  definirCsrf(me.csrf);
  const pref = me.usuario.preferences || {};
  if (pref.theme) aplicarTema(pref.theme);
  aplicarMovimento(pref.reduceMotion);
  const convite = sessionStorage.getItem('av-convite');
  if (convite) {
    sessionStorage.removeItem('av-convite');
    const m = await import('./views/colaboracao.js');
    await m.aceitarConvite(convite);
  }
  await carregarArvores().catch(() => []);
  const ultima = estado.arvores.find((a) => a.id === pref.lastTree) || estado.arvores[0];
  if (ultima) await escolherArvore(ultima.id, { salvar: false }).catch(() => {});
  montarLayout();
  if (!location.hash) location.hash = '#/painel';
  else navegar();
}

async function mostrarAuth() {
  const m = await import('./views/auth.js');
  raiz.removeAttribute('aria-busy');
  limpar(raiz).append(m.telaAuth());
}

let layout, conteudo, seletorArvore;
function montarLayout() {
  raiz.removeAttribute('aria-busy');
  const nav = h('nav', { class: 'nav', 'aria-label': 'Módulos' },
    h('a', { class: 'marca', href: '#/painel' }, h('img', { src: '/img/icone.svg', alt: '' }), h('div', {}, h('b', { text: 'Árvore Viva' }), h('span', { text: 'Inteligência genealógica' }))),
    ROTAS.map(([grupo, itens]) => h('div', { class: 'nav-grupo' }, h('span', { text: grupo }),
      itens.filter((i) => i[4] !== 'admin' || estado.usuario.admin_tecnico).map(([id, rot, ic]) => h('a', { href: `#/${id}`, dataset: { rota: id } }, icone(ic, 18), h('span', { text: rot }))))),
    h('div', { class: 'nav-rodape' }, h('div', { text: estado.usuario.name }), h('div', { text: estado.usuario.email })));
  seletorArvore = h('select', { 'aria-label': 'Árvore atual', class: 'seletor', on: { change: async (e) => {
    if (e.target.value === '__nova') { location.hash = '#/arvores?nova=1'; atualizarSeletor(); return; }
    try { await escolherArvore(e.target.value); navegar(); } catch (err) { erroToast(err); }
  } } });
  const botaoTema = botao('', { icone: temaEfetivo() === 'dark' ? 'sol' : 'lua', tipo: 'fantasma', titulo: 'Alternar tema claro/escuro', acao: async () => {
    const novo = temaEfetivo() === 'dark' ? 'light' : 'dark';
    aplicarTema(novo);
    limpar(botaoTema).append(icone(novo === 'dark' ? 'sol' : 'lua', 16));
    PATCH('/api/auth/preferences', { theme: novo }).catch(() => {});
    emit('tema', novo);
  } });
  const buscaRapida = h('form', { class: 'busca-campo rotulo-topo', role: 'search', on: { submit: (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) location.hash = `#/pesquisa?q=${encodeURIComponent(q)}`; } } },
    icone('busca', 16), h('input', { name: 'q', type: 'search', placeholder: 'Buscar pessoa…', 'aria-label': 'Busca rápida de pessoas', style: { width: '220px' } }));
  const topo = h('header', { class: 'topo' },
    botao('', { icone: 'menu', tipo: 'fantasma botao-menu', titulo: 'Abrir menu', acao: () => layout.classList.toggle('menu-aberto') }),
    seletorArvore, h('div', { class: 'espaco' }), buscaRapida, botaoTema,
    botao('', { icone: 'sair', tipo: 'fantasma', titulo: 'Sair da conta', acao: async () => { await POST('/api/auth/logout').catch(() => {}); location.href = '/'; } }));
  conteudo = h('main', { class: 'conteudo', id: 'conteudo', tabindex: '-1' });
  layout = h('div', { class: 'layout' }, nav, h('div', { class: 'principal' }, topo, conteudo));
  layout.addEventListener('click', (e) => { if (e.target.closest('.nav a')) layout.classList.remove('menu-aberto'); else if (layout.classList.contains('menu-aberto') && !e.target.closest('.nav, .botao-menu')) layout.classList.remove('menu-aberto'); });
  limpar(raiz).append(layout);
  atualizarSeletor();
  window.addEventListener('hashchange', navegar);
  on('arvores', atualizarSeletor);
  on('arvore', atualizarSeletor);
}

export function atualizarSeletor() {
  if (!seletorArvore) return;
  limpar(seletorArvore);
  if (!estado.arvores.length) seletorArvore.append(h('option', { value: '', text: 'Nenhuma árvore' }));
  for (const a of estado.arvores) seletorArvore.append(h('option', { value: a.id, text: a.name }));
  seletorArvore.append(h('option', { value: '__nova', text: '+ Nova árvore…' }));
  seletorArvore.value = estado.arvoreId || '';
}

export function parametros() {
  const [, q = ''] = location.hash.split('?');
  return Object.fromEntries(new URLSearchParams(q));
}

let navSeq = 0;
async function navegar() {
  const id = (location.hash.slice(2).split('?')[0]) || 'painel';
  const rota = MAPA_ROTAS.get(id) || MAPA_ROTAS.get('painel');
  if (rota[4] === 'admin' && !estado.usuario.admin_tecnico) { location.hash = '#/painel'; return; }
  for (const a of layout.querySelectorAll('.nav a[data-rota]')) { if (a.dataset.rota === rota[0]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  document.title = `${rota[1]} — Árvore Viva`;
  const seq = ++navSeq;
  if (typeof limpeza === 'function') { try { limpeza(); } catch { /* ignora */ } }
  limpeza = null;
  conteudo.className = 'conteudo';
  limpar(conteudo).append(carregando());
  try {
    const mod = await rota[3]();
    if (seq !== navSeq) return;
    limpar(conteudo);
    limpeza = await mod.render(conteudo, parametros());
  } catch (e) {
    if (seq !== navSeq) return;
    console.error(e);
    limpar(conteudo).append(erroBloco(e, navegar));
  }
}
export const recarregarRota = () => navegar();

// Tela "sem árvore" reutilizada pelos módulos.
export function semArvore(container) {
  container.append(h('div', { class: 'cartao' }, h('div', { class: 'vazio' }, icone('arvore', 44), h('h3', { text: 'Comece sua primeira árvore' }),
    h('p', { text: 'Crie uma árvore para cadastrar pessoas, vínculos e documentos — ou explore a demonstração com personagens fictícios.' }),
    h('div', { class: 'acoes', style: { justifyContent: 'center' } },
      botao('Criar árvore', { icone: 'mais', tipo: 'primario', acao: () => { location.hash = '#/arvores?nova=1'; } }),
      botao('Carregar demonstração', { icone: 'estrela', acao: carregarDemo })))));
}
export async function carregarDemo() {
  try {
    const r = await POST('/api/demo');
    await carregarArvores();
    await escolherArvore(r.tree_id);
    // Gera as sugestões de correspondência da demonstração para revisão.
    await POST(`/api/trees/${r.tree_id}/matches/analyze`).catch(() => {});
    emit('arvores');
    toast('Árvore de demonstração criada. Todos os dados são fictícios.', 'sucesso');
    location.hash = '#/painel';
    navegar();
  } catch (e) { erroToast(e); }
}
export { seletor };

iniciar();
