// Utilitários de interface: criação segura de elementos (só textContent), ícones, toasts, modais, gaveta e formatação.
const SVGNS = 'http://www.w3.org/2000/svg';

// append/prepend/replaceChildren ignoram null, undefined e false e aceitam listas (evita "null" escrito na tela).
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const original = proto[m];
    proto[m] = function (...itens) { return original.apply(this, itens.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); };
  }
}

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && !k.startsWith('aria') && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  anexar(el, filhos);
  return el;
}
function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}
export function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v);
  }
  anexar(el, filhos);
  return el;
}
export const limpar = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// Ícones de traço (24×24). "c x y r" desenha um círculo.
const ICONES = {
  painel: ['M3 13h8V3H3z', 'M13 21h8V11h-8z', 'M13 3v6h8V3z', 'M3 21h8v-6H3z'],
  arvore: ['M12 21v-8', 'M12 13c-3 0-6-1.5-6-4V7', 'M12 13c3 0 6-1.5 6-4V7', 'c 6 5 2', 'c 18 5 2', 'c 12 5 2', 'M12 7v6'],
  pessoas: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c 9 7 4', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  pessoa: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'c 12 7 4'],
  busca: ['c 11 11 7', 'M21 21l-4.3-4.3'],
  correspondencia: ['M16 3h5v5', 'M8 3H3v5', 'M21 3l-7 7', 'M3 3l7 7', 'M12 14v7'],
  documento: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  fonte: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  tempo: ['c 12 12 9', 'M12 7v5l3 2'],
  mapa: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
  parentesco: ['c 6 6 3', 'c 18 18 3', 'M9 6h4a4 4 0 0 1 4 4v5'],
  relatorio: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  importar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  exportar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  colaboracao: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'c 9 7 4', 'M19 8v6', 'M22 11h-6'],
  escudo: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  config: ['c 12 12 3', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  ferramenta: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  mais: ['M12 5v14', 'M5 12h14'], fechar: ['M18 6 6 18', 'M6 6l12 12'], check: ['M20 6 9 17l-5-5'],
  alerta: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  info: ['c 12 12 10', 'M12 16v-4', 'M12 8h.01'],
  esquerda: ['M15 18l-6-6 6-6'], direita: ['M9 18l6-6-6-6'], baixo: ['M6 9l6 6 6-6'], cima: ['M18 15l-6-6-6 6'],
  zoomMais: ['c 11 11 7', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'], zoomMenos: ['c 11 11 7', 'M21 21l-4.3-4.3', 'M8 11h6'],
  ajustar: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  centro: ['c 12 12 3', 'M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4'],
  cubo: ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.3 7 12 12l8.7-5', 'M12 22V12'],
  plano: ['M3 3h18v18H3z', 'M3 9h18', 'M9 21V9'],
  olho: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'c 12 12 3'],
  olhoFechado: ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19', 'M1 1l22 22'],
  lixo: ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6', 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
  editar: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  unir: ['M8 6h8', 'M8 18h8', 'M6 8v8', 'M18 8l-6 4 6 4'],
  filtro: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
  sol: ['c 12 12 4', 'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'],
  lua: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  sair: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  historico: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  rota: ['c 6 19 3', 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', 'c 18 5 3'],
  impressora: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  menu: ['M3 12h18', 'M3 6h18', 'M3 18h18'], link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  clipe: ['M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  estrela: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  cadeado: ['M5 11h14v10H5z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  chave: ['c 7.5 15.5 5.5', 'M21 2l-9.6 9.6', 'M15.5 7.5l3 3L22 7l-3-3'],
  recolher: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  expandir: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  camadas: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  copiar: ['M9 9h11v11H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  comentario: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  desfazer: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
  imagem: ['M3 3h18v18H3z', 'c 8.5 8.5 1.5', 'M21 15l-5-5L5 21'],
  teclado: ['M2 6h20v12H2z', 'M6 10h.01', 'M10 10h.01', 'M14 10h.01', 'M18 10h.01', 'M7 14h10'],
};
export function icone(nome, tam = 18, extra = {}) {
  const el = s('svg', { viewBox: '0 0 24 24', width: tam, height: tam, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', ...extra });
  for (const d of ICONES[nome] || ICONES.info) {
    if (d.startsWith('c ')) { const [, cx, cy, r] = d.split(' '); el.append(s('circle', { cx, cy, r })); }
    else el.append(s('path', { d }));
  }
  return el;
}

export function botao(rotulo, { icone: ic, tipo = '', acao, titulo, desativado, tam = 16, ...resto } = {}) {
  const so = !rotulo;
  return h('button', { type: 'button', class: `botao ${tipo} ${so ? 'icone' : ''}`, title: titulo || (so ? resto['aria-label'] : undefined), 'aria-label': so ? (titulo || resto['aria-label']) : undefined, disabled: desativado, on: acao ? { click: acao } : undefined, ...resto },
    ic ? icone(ic, tam) : null, rotulo ? h('span', { text: rotulo }) : null);
}

// ---- Toasts ----
export function toast(msg, tipo = 'info', ms = 4200) {
  const area = document.getElementById('toasts');
  const ic = { sucesso: 'check', erro: 'alerta', aviso: 'alerta', info: 'info' }[tipo] || 'info';
  const t = h('div', { class: `toast ${tipo === 'aviso' ? 'aviso-t' : tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, icone(ic, 18), h('div', { text: msg }));
  area.append(t);
  setTimeout(() => t.remove(), ms);
}
export function erroToast(e) { toast(e?.message || 'Algo deu errado. Tente novamente.', 'erro', 6000); }

// ---- Modal acessível (prende o foco, Esc fecha) ----
export function modal({ titulo, corpo, acoes = [], largo = false, aoFechar }) {
  return new Promise((resolver) => {
    const anterior = document.activeElement;
    const idTitulo = 'm' + Math.random().toString(36).slice(2);
    let fechado = false;
    const fechar = (v) => { if (fechado) return; fechado = true; fundo.remove(); document.removeEventListener('keydown', tecla); anterior?.focus?.(); aoFechar?.(v); resolver(v); };
    const rodape = h('div', { class: 'modal-rodape' }, acoes.map((a) => botao(a.rotulo, { tipo: a.tipo, icone: a.icone, acao: async () => {
      if (!a.acao) return fechar(a.valor);
      try { const r = await a.acao(); if (r !== false) fechar(r ?? a.valor); } catch (e) { erroToast(e); }
    } })));
    const caixa = h('div', { class: `modal ${largo ? 'largo' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo },
      h('div', { class: 'modal-cabecalho' }, h('h2', { id: idTitulo, text: titulo }), botao('', { icone: 'fechar', tipo: 'fantasma', titulo: 'Fechar', acao: () => fechar(null) })),
      h('div', { class: 'modal-corpo' }, corpo), acoes.length ? rodape : null);
    const fundo = h('div', { class: 'fundo', on: { mousedown: (e) => { if (e.target === fundo) fechar(null); } } }, caixa);
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(null); }
      if (e.key === 'Tab') {
        const foc = [...caixa.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
        if (!foc.length) return;
        if (e.shiftKey && document.activeElement === foc[0]) { e.preventDefault(); foc[foc.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === foc[foc.length - 1]) { e.preventDefault(); foc[0].focus(); }
      }
    }
    document.addEventListener('keydown', tecla);
    document.body.append(fundo);
    (caixa.querySelector('.modal-corpo input, .modal-corpo select, .modal-corpo textarea') || caixa.querySelector('.modal-rodape .primario') || caixa).focus?.();
    caixa.fechar = fechar;
  });
}

// Confirmação para operações destrutivas; pode exigir digitar um texto.
export async function confirmar(mensagem, { titulo = 'Confirmar', texto = 'Confirmar', perigo = false, exigir } = {}) {
  const campo = exigir ? h('input', { type: 'text', 'aria-label': `Digite ${exigir}`, autocomplete: 'off' }) : null;
  const corpo = h('div', {}, h('p', { text: mensagem }), exigir ? h('div', { class: 'campo' }, h('label', { text: `Digite "${exigir}" para confirmar` }), campo) : null);
  const r = await modal({ titulo, corpo, acoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: texto, tipo: perigo ? 'perigo cheio' : 'primario', acao: () => {
    if (exigir && campo.value.trim() !== exigir) { campo.setAttribute('aria-invalid', 'true'); toast(`Digite exatamente "${exigir}".`, 'aviso'); return false; }
    return exigir ? campo.value.trim() : true;
  } }] });
  return r;
}

// ---- Gaveta lateral ----
let gavetaAtual = null;
export function gaveta(titulo, conteudo, { acoes = [] } = {}) {
  fecharGaveta();
  const anterior = document.activeElement;
  const fundo = h('div', { class: 'gaveta-fundo', on: { click: () => fecharGaveta() } });
  const tituloEl = h('h2', { text: titulo, id: 'gaveta-titulo' });
  const painel = h('aside', { class: 'gaveta', role: 'dialog', 'aria-labelledby': 'gaveta-titulo', tabindex: '-1' },
    h('div', { class: 'gaveta-cabecalho' }, tituloEl, ...acoes, botao('', { icone: 'fechar', tipo: 'fantasma', titulo: 'Fechar painel', acao: () => fecharGaveta() })),
    h('div', { class: 'gaveta-corpo' }, conteudo));
  const tecla = (e) => { if (e.key === 'Escape' && !document.querySelector('.fundo')) fecharGaveta(); };
  document.addEventListener('keydown', tecla);
  document.body.append(fundo, painel);
  painel.focus();
  gavetaAtual = { fundo, painel, tecla, anterior, tituloEl };
  return { corpo: painel.querySelector('.gaveta-corpo'), definirTitulo: (t) => { tituloEl.textContent = t; } };
}
export function fecharGaveta() {
  if (!gavetaAtual) return;
  gavetaAtual.fundo.remove(); gavetaAtual.painel.remove();
  document.removeEventListener('keydown', gavetaAtual.tecla);
  gavetaAtual.anterior?.focus?.();
  gavetaAtual = null;
}

// ---- Estados ----
export const carregando = (msg = 'Carregando…') => h('div', { class: 'carregando', role: 'status' }, h('div', { class: 'spinner' }), h('span', { text: msg }));
export const vazio = ({ icone: ic = 'info', titulo, texto, acao }) => h('div', { class: 'vazio' }, icone(ic, 40), h('h3', { text: titulo }), texto ? h('p', { text: texto }) : null, acao || null);
export const aviso = (texto, tipo = '', ic = 'info') => h('div', { class: `aviso ${tipo}`, role: tipo === 'vermelho' ? 'alert' : undefined }, icone(ic, 18), h('div', {}, texto));
export function erroBloco(e, tentar) {
  return h('div', { class: 'vazio', role: 'alert' }, icone('alerta', 40), h('h3', { text: 'Não foi possível carregar' }), h('p', { text: e?.message || 'Erro desconhecido.' }),
    tentar ? botao('Tentar novamente', { acao: tentar }) : null);
}

// ---- Formulário ----
let seqCampo = 0;
export function campo(rotulo, entrada, { ajuda, obrigatorio } = {}) {
  const id = entrada.id || `c${++seqCampo}`;
  entrada.id = id;
  if (obrigatorio) entrada.required = true;
  const idAjuda = ajuda ? `${id}-ajuda` : null;
  if (idAjuda) entrada.setAttribute('aria-describedby', idAjuda);
  return h('div', { class: 'campo' }, h('label', { for: id }, rotulo, obrigatorio ? h('span', { 'aria-hidden': 'true', text: ' *', class: 'mudo' }) : null), entrada, ajuda ? h('span', { class: 'ajuda', id: idAjuda, text: ajuda }) : null);
}
export const entrada = (props = {}) => h('input', { type: 'text', ...props });
export function seletor(opcoes, valor, props = {}) {
  const el = h('select', props, opcoes.map(([v, t]) => h('option', { value: v, text: t })));
  if (valor !== undefined && valor !== null) el.value = valor;
  return el;
}
export const valores = (form) => Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

// ---- Rótulos e formatação ----
export const VERIF = {
  declared: ['Declarada pelo usuário', 'contorno', 'pessoa'], extracted: ['Extraída automaticamente', 'azul', 'documento'], documented: ['Sustentada por documento', 'verde', 'documento'],
  confirmed: ['Confirmada após revisão', 'verde', 'check'], contested: ['Contestada', 'vermelho', 'alerta'], hypothesis: ['Hipótese não comprovada', 'ambar', 'info'],
};
export const selo = (texto, cls = '', ic) => h('span', { class: `selo ${cls}` }, ic ? icone(ic, 12) : null, texto);
export const seloVerif = (v) => { const [t, c, i] = VERIF[v] || VERIF.declared; return selo(t, c, i); };
export const SUBTIPO = { biological: 'biológico', legal: 'legal', adoptive: 'adotivo', step: 'de criação (padrasto/madrasta)', foster: 'acolhimento', unknown: 'não informado' };
export const TIPO_REL = { parent: 'Filiação', spouse: 'Casamento', partner: 'União/parceria', guardian: 'Tutela', sibling: 'Irmandade', unknown: 'Parentesco não confirmado' };
export const SITUACAO = { living: 'Viva', deceased: 'Falecida', unknown: 'Situação desconhecida' };
export const CATEGORIA_DOC = { birth_cert: 'Certidão de nascimento', marriage_cert: 'Certidão de casamento', death_cert: 'Certidão de óbito', identity: 'Documento de identificação', photo: 'Fotografia antiga',
  letter: 'Carta', religious: 'Registro religioso', immigration: 'Registro de imigração', military: 'Documento militar', inventory: 'Inventário', will: 'Testamento', newspaper: 'Jornal histórico', notary: 'Documento cartorial', other: 'Outro registro' };
export const TIPO_ID = { cpf: 'CPF', rg: 'RG', passport: 'Passaporte', birth_cert: 'Certidão de nascimento', marriage_cert: 'Certidão de casamento', death_cert: 'Certidão de óbito', foreign: 'Documento estrangeiro', other: 'Outro' };
export const TIPO_EVT = { birth: 'Nascimento', death: 'Falecimento', marriage: 'Casamento', divorce: 'Divórcio', immigration: 'Imigração', emigration: 'Emigração', residence: 'Residência', name_change: 'Mudança de nome', baptism: 'Batismo', burial: 'Sepultamento', military: 'Serviço militar', other: 'Outro' };
export const QUAL = { exact: 'Exata', about: 'Aproximada', before: 'Antes de', after: 'Depois de', estimated: 'Estimada' };
export const ACESSO = { tree: 'Todos os membros da árvore', editors: 'Somente editores e acima', owner: 'Somente proprietário e administradores' };

export function fmtData(d, qual = 'exact') {
  if (!d) return '';
  const [a, m, dia] = d.split('-');
  let t = dia ? `${dia}/${m}/${a}` : m ? `${m}/${a}` : a;
  return { about: `c. ${t}`, estimated: `${t} (estimada)`, before: `antes de ${t}`, after: `depois de ${t}` }[qual] || t;
}
export function anos(p) {
  if (!p || p.restrito) return '';
  const n = p.birth_date ? (p.birth_qual === 'exact' ? '' : 'c. ') + p.birth_date.slice(0, 4) : '';
  const f = p.death_date ? (p.death_qual === 'exact' ? '' : 'c. ') + p.death_date.slice(0, 4) : (p.living_status === 'deceased' ? '?' : '');
  return n || f ? `${n || '?'}${f || p.living_status === 'deceased' ? '–' + (f || '?') : ''}` : '';
}
export const iniciais = (nome) => (nome || '?').split(/\s+/).filter((x) => x.length > 2 || x === x.toUpperCase()).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
export const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export function tempoRelativo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} dia(s)`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
export const lugar = (l) => (l ? l.name : '');

export function avatar(p, grande = false) {
  return h('span', { class: `avatar ${grande ? 'g' : ''} ${p?.sex || ''}`, 'aria-hidden': 'true', text: p?.restrito ? '•' : iniciais(p?.full_name) });
}

export function baixarArquivo(nome, conteudo, mime = 'text/plain') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const lerArquivoTexto = (f) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsText(f, 'utf-8'); });
export const lerArquivoBase64 = (f) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });
export function abas(lista, aoMudar, ativa = lista[0][0]) {
  const barra = h('div', { class: 'abas', role: 'tablist' });
  const botoes = lista.map(([id, rot]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === ativa), text: rot, on: { click: () => { for (const b of botoes) b.setAttribute('aria-selected', String(b === botoes[lista.findIndex((x) => x[0] === id)])); aoMudar(id); } } }));
  barra.append(...botoes);
  barra.addEventListener('keydown', (e) => {
    const i = botoes.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight') { botoes[(i + 1) % botoes.length].focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { botoes[(i - 1 + botoes.length) % botoes.length].focus(); e.preventDefault(); }
  });
  return barra;
}
