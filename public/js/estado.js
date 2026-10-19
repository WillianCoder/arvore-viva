// Estado compartilhado entre os módulos (árvore atual, seleção, filtros, contexto 2D/3D).
import { GET, PATCH } from './api.js';

const PAPEIS = { reader: 1, contributor: 2, editor: 3, admin: 4, owner: 5 };
export const estado = {
  usuario: null, arvores: [], arvoreId: null, arvore: null, grafo: null,
  selecionado: null, historico: [], caminho: null,
  vis: { modo: '2d', layout: 'vertical', densidade: 'normal', estilo3d: 'vertical', recolhidos: new Set(),
    filtros: { geracaoMin: '', geracaoMax: '', sobrenome: '', tipos: { biological: true, legal: true, adoptive: true, step: true, foster: true, unknown: true, hypothesis: true }, ocultarFiltrados: false } },
};
const ouvintes = new Map();
export const on = (ev, fn) => { if (!ouvintes.has(ev)) ouvintes.set(ev, new Set()); ouvintes.get(ev).add(fn); return () => ouvintes.get(ev).delete(fn); };
export const emit = (ev, d) => { for (const fn of ouvintes.get(ev) || []) fn(d); };

export const pode = (minimo) => !!estado.arvore && PAPEIS[estado.arvore.papel] >= PAPEIS[minimo];
export const T = () => `/api/trees/${estado.arvoreId}`;

export async function carregarArvores() {
  estado.arvores = (await GET('/api/trees')).arvores;
  return estado.arvores;
}

export async function escolherArvore(id, { salvar = true } = {}) {
  if (!id) { estado.arvoreId = null; estado.arvore = null; estado.grafo = null; emit('arvore'); return; }
  if (id !== estado.arvoreId) { estado.selecionado = null; estado.historico = []; estado.caminho = null; estado.vis.recolhidos = new Set(); }
  estado.arvoreId = id;
  estado.grafo = null;
  estado.arvore = await GET(`/api/trees/${id}`);
  if (salvar) PATCH('/api/auth/preferences', { lastTree: id }).catch(() => {});
  emit('arvore');
}

let pedidoGrafo = null;
export async function grafo(forcar = false) {
  if (!estado.arvoreId) return null;
  if (estado.grafo && !forcar) return estado.grafo;
  if (!pedidoGrafo || forcar) {
    const id = estado.arvoreId;
    pedidoGrafo = GET(`/api/trees/${id}/graph`).then((g) => {
      pedidoGrafo = null;
      if (id !== estado.arvoreId) return estado.grafo;
      g.porId = new Map(g.pessoas.map((p) => [p.id, p]));
      estado.grafo = g;
      return g;
    }, (e) => { pedidoGrafo = null; throw e; });
  }
  return pedidoGrafo;
}
// Depois de qualquer alteração: recarrega o grafo e avisa as telas.
export async function alterado() { estado.grafo = null; await grafo(true).catch(() => {}); emit('dados'); }

export function selecionar(id, { registrar = true } = {}) {
  estado.selecionado = id;
  if (id && registrar) {
    estado.historico = [id, ...estado.historico.filter((x) => x !== id)].slice(0, 12);
    PATCH('/api/auth/preferences', { lastPerson: id }).catch(() => {});
  }
  emit('selecao', id);
}
