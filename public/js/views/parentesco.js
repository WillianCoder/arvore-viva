// Cálculo de parentesco com explicação do caminho e alternativas.
import { h, botao, icone, toast, erroToast, aviso, carregando, selo } from '../ui.js';
import { GET } from '../api.js';
import { estado, grafo, T, selecionar } from '../estado.js';
import { semArvore, parametros } from '../app.js';
import { escolherPessoa } from '../componentes.js';
import { abrirPessoa } from './pessoa.js';

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const g = await grafo();
  const p = parametros();
  const a = escolherPessoa(g, { rotulo: 'Pessoa A', valor: p.a || estado.selecionado });
  const b = escolherPessoa(g, { rotulo: 'Pessoa B', valor: p.b });
  const res = h('div', { 'aria-live': 'polite' });
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Cálculo de parentesco' }), h('p', { text: 'Explica como duas pessoas se relacionam, mostrando os intermediários e cada vínculo do caminho.' }))),
    h('div', { class: 'cartao' }, h('div', { class: 'grade c2' }, a, b), botao('Calcular parentesco', { icone: 'parentesco', tipo: 'primario', acao: calcular })), res);
  async function calcular() {
    if (!a.valor() || !b.valor()) return toast('Escolha as duas pessoas na lista.', 'aviso');
    res.replaceChildren(carregando());
    try {
      const r = await GET(`${T()}/kinship?a=${a.valor()}&b=${b.valor()}`);
      const caminhoEl = (cam) => h('ol', { class: 'lista', style: { marginTop: '8px' } }, cam.map((n, i) => h('li', {}, h('span', { class: 'selo contorno', text: String(i + 1) }),
        h('div', {}, i > 0 ? h('div', { class: 'pequeno mudo' }, `…que é ${n.rotulo || 'ligado(a) a'}`, n.status && n.status !== 'declared' ? [' · ', selo({ hypothesis: 'hipótese', contested: 'contestado', documented: 'documentado', confirmed: 'confirmado', extracted: 'extraído' }[n.status] || n.status, n.status === 'hypothesis' ? 'ambar' : n.status === 'contested' ? 'vermelho' : 'verde')] : '') : null,
          h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: n.nome, on: { click: () => abrirPessoa(n.id) } })))));
      const destacar = (cam) => botao('Destacar na árvore', { icone: 'arvore', tipo: 'pequeno', acao: () => { estado.caminho = cam.map((x) => x.id); selecionar(r.a.id); location.hash = '#/arvore'; } });
      if (r.indeterminado) {
        res.replaceChildren(h('div', { class: 'cartao', style: { marginTop: '16px' } }, h('h2', { text: 'Parentesco indeterminado' }), aviso(r.motivo, 'ambar'),
          r.caminho?.length ? [h('h3', { text: 'Ligação encontrada entre os registros' }), caminhoEl(r.caminho), destacar(r.caminho)] : h('p', { class: 'mudo', text: 'Registre mais vínculos (pais, casamentos) ou fontes para que o parentesco possa ser determinado.' })));
        return;
      }
      res.replaceChildren(...r.resultados.map((x, i) => h('div', { class: 'cartao', style: { marginTop: '16px' } },
        h('h2', {}, i === 0 ? '' : `Alternativa ${i + 1}: `, `${r.a.nome} é `, h('span', { style: { color: 'var(--gold)' }, text: x.descricao }), ` de ${r.b.nome}`),
        x.ancestrais?.length ? h('p', {}, icone('arvore', 14), ` Ancestral(is) comum(ns): ${x.ancestrais.map((y) => y.nome).join(' e ')}`, x.geracoes ? ` · ${x.geracoes.a} geração(ões) acima de A e ${x.geracoes.b} acima de B` : '') : null,
        x.tipo === 'afinidade' ? aviso('Parentesco por afinidade (via casamento ou união), sem ancestral comum.', '') : null,
        ...(x.avisos || []).map((t) => aviso(`Atenção: ${t}.`, 'ambar')), h('h3', { text: 'Caminho' }), caminhoEl(x.caminho), destacar(x.caminho))));
    } catch (e) { erroToast(e); res.replaceChildren(); }
  }
  if (a.valor() && b.valor()) calcular();
}
