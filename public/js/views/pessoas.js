// Lista de pessoas da árvore (alternativa acessível à visualização gráfica), com paginação.
import { h, botao, avatar, anos, seloVerif, selo, lugar, vazio, carregando, erroBloco, SITUACAO } from '../ui.js';
import { estado, grafo, pode, on } from '../estado.js';
import { semArvore } from '../app.js';
import { abrirPessoa, novaPessoa } from './pessoa.js';
import { tokens } from '../nomes.js';

const POR_PAGINA = 50;
export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const filtro = h('input', { type: 'search', placeholder: 'Filtrar por nome…', 'aria-label': 'Filtrar pessoas por nome' });
  const ordem = h('select', { 'aria-label': 'Ordenar por' }, [['nome', 'Nome'], ['nasc', 'Nascimento'], ['atual', 'Atualização recente']].map(([v, t]) => h('option', { value: v, text: t })));
  const lista = h('div', {}, carregando());
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Pessoas' }), h('p', { text: 'Cada pessoa tem um registro próprio, independente da posição na árvore.' })),
    h('div', { class: 'acoes' }, pode('contributor') ? botao('Nova pessoa', { icone: 'mais', tipo: 'primario', acao: () => novaPessoa() }) : null)),
  h('div', { class: 'acoes', style: { marginBottom: '12px' } }, h('div', { style: { flex: '1 1 260px' } }, filtro), ordem), lista);
  let pagina = 1;
  const desenhar = async () => {
    let g;
    try { g = await grafo(); } catch (e) { lista.replaceChildren(erroBloco(e, desenhar)); return; }
    const q = tokens(filtro.value);
    let pessoas = g.pessoas.filter((p) => !q.length || q.every((t) => tokens(p.full_name).some((u) => u.startsWith(t))));
    const chave = { nome: (p) => p.full_name, nasc: (p) => p.birth_date || '9999', atual: (p) => p.updated_at || '' }[ordem.value];
    pessoas.sort((a, b) => (ordem.value === 'atual' ? chave(b).localeCompare(chave(a)) : chave(a).localeCompare(chave(b), 'pt-BR')));
    if (!pessoas.length) { lista.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'pessoas', titulo: g.pessoas.length ? 'Ninguém com esse nome' : 'Nenhuma pessoa cadastrada', texto: g.pessoas.length ? 'Tente outro termo ou use a pesquisa avançada.' : 'Adicione a primeira pessoa da árvore.' }))); return; }
    const total = Math.ceil(pessoas.length / POR_PAGINA);
    pagina = Math.min(pagina, total);
    const pg = pessoas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    lista.replaceChildren(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Pessoa', 'Nascimento', 'Situação', 'Verificação', 'Indicadores'].map((t) => h('th', { text: t })))),
      h('tbody', {}, pg.map((p) => h('tr', {},
        h('td', {}, h('span', { class: 'item-pessoa' }, avatar(p), h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: p.full_name, on: { click: () => abrirPessoa(p.id) } }))),
        h('td', { text: p.restrito ? '—' : [anos(p), lugar(p.birth_place)].filter(Boolean).join(' · ') || '—' }),
        h('td', { text: SITUACAO[p.living_status] }), h('td', {}, p.restrito ? selo('Protegido', 'contorno', 'cadeado') : seloVerif(p.verification)),
        h('td', {}, h('span', { class: 'selos' }, p.tem_documentos ? selo(`${p.tem_documentos} doc.`, 'azul', 'documento') : null, p.tem_correspondencia ? selo('Correspondência', 'ouro') : null, p.is_demo ? selo('Demo', 'demo') : null))))))),
    total > 1 ? h('div', { class: 'acoes', style: { justifyContent: 'center', marginTop: '12px' } },
      botao('Anterior', { icone: 'esquerda', tipo: 'pequeno', desativado: pagina === 1, acao: () => { pagina--; desenhar(); } }),
      h('span', { class: 'pequeno mudo', text: `Página ${pagina} de ${total} · ${pessoas.length} pessoas` }),
      botao('Próxima', { icone: 'direita', tipo: 'pequeno', desativado: pagina === total, acao: () => { pagina++; desenhar(); } })) : h('p', { class: 'pequeno mudo', style: { marginTop: '8px' }, text: `${pessoas.length} pessoa(s)` }));
  };
  filtro.addEventListener('input', () => { pagina = 1; desenhar(); });
  ordem.addEventListener('change', desenhar);
  desenhar();
  return on('dados', desenhar);
}
