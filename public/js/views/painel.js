// Painel inicial: indicadores reais, resumo da árvore, atalhos e atividades.
import { h, icone, botao, carregando, erroBloco, tempoRelativo, vazio, selo } from '../ui.js';
import { GET } from '../api.js';
import { estado, T, grafo, pode, selecionar } from '../estado.js';
import { semArvore } from '../app.js';
import { abrirPessoa, novaPessoa } from './pessoa.js';
import { miniArvore } from '../tree2d.js';

export async function render(c) {
  if (!estado.arvoreId) {
    c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: `Olá, ${estado.usuario.name.split(' ')[0]}` }), h('p', { text: 'Painel da sua investigação genealógica.' }))));
    semArvore(c);
    return;
  }
  const corpo = h('div', {}, carregando());
  c.append(h('div', { class: 'cabecalho' },
    h('div', {}, h('h1', { text: estado.arvore.name }), h('p', {}, estado.arvore.description || 'Visão geral da investigação.', ' ', estado.arvore.is_demo ? selo('Dados de demonstração', 'demo') : null)),
    h('div', { class: 'acoes' }, selo(`Seu papel: ${estado.arvore.papel_nome}`, 'contorno', 'escudo'))), corpo);
  const carregar = async () => {
    try {
      const [d, g, rev] = await Promise.all([GET(`${T()}/dashboard`), grafo(), GET(`${T()}/comments?kind=review_request`)]);
      corpo.replaceChildren(montar(d, g, rev.comentarios));
    } catch (e) { corpo.replaceChildren(erroBloco(e, carregar)); }
  };
  carregar();
}

function montar(d, g, revisoes) {
  const i = d.indicadores;
  const ind = (rot, valor, ic, href, cls = '', nota) => h('a', { class: `indicador ${cls}`, href }, h('span', {}, icone(ic, 14), rot), h('b', { text: valor.toLocaleString('pt-BR') }), nota ? h('small', { text: nota }) : null);
  const indicadores = h('div', { class: 'grade c4', style: { marginBottom: '16px' } },
    ind('Pessoas', i.pessoas, 'pessoas', '#/pessoas'), ind('Gerações', i.geracoes, 'arvore', '#/arvore', 'ouro'),
    ind('Relações registradas', i.relacoes, 'link', '#/arvore'), ind('Documentos', i.documentos, 'documento', '#/documentos'),
    ind('Itens verificados', i.verificados, 'check', '#/fontes', 'verde', 'pessoas e vínculos com documento ou revisão'),
    ind('Possíveis correspondências', i.correspondencias, 'correspondencia', '#/correspondencias', 'ouro', 'aguardando revisão'),
    ind('Pendentes de confirmação', i.pendentes, 'info', '#/relatorios?tipo=pendencias', 'ambar', 'declaradas, extraídas ou hipóteses'),
    ind('Conflitos documentais', i.conflitos, 'alerta', '#/relatorios?tipo=conflitos', 'vermelho'));

  const editor = pode('contributor');
  const atalho = (rot, ic, fn, ok = true) => botao(rot, { icone: ic, acao: fn, desativado: !ok, titulo: ok ? undefined : 'Seu papel não permite esta ação' });
  const ultima = estado.usuario.preferences?.lastPerson && g.porId.get(estado.usuario.preferences.lastPerson);
  const atalhos = h('div', { class: 'cartao' }, h('h3', { text: 'Atalhos' }), h('div', { class: 'acoes' },
    atalho('Adicionar pessoa', 'mais', () => novaPessoa(), editor),
    atalho('Buscar familiar', 'busca', () => { location.hash = '#/pesquisa'; }),
    atalho('Anexar documento', 'clipe', () => { location.hash = '#/documentos?novo=1'; }, editor),
    atalho('Revisar correspondências', 'correspondencia', () => { location.hash = '#/correspondencias'; }),
    atalho('Importar arquivo genealógico', 'importar', () => { location.hash = '#/importar-exportar'; }, pode('editor')),
    atalho('Criar nova árvore', 'camadas', () => { location.hash = '#/arvores?nova=1'; }),
    ultima ? atalho(`Continuar: ${ultima.full_name}`, 'historico', () => { selecionar(ultima.id); location.hash = '#/arvore'; }) : null));

  // Resumo visual: linhagem da última pessoa vista (ou da mais recente).
  const foco = ultima?.id || g.pessoas[g.pessoas.length - 1]?.id;
  const resumo = h('div', { class: 'cartao' }, h('div', { class: 'cartao-cabecalho' }, h('h3', { text: 'Resumo da árvore' }), botao('Abrir árvore', { icone: 'arvore', tipo: 'pequeno', acao: () => { if (foco) selecionar(foco); location.hash = '#/arvore'; } })),
    g.pessoas.length ? miniArvore(g, foco, (id) => abrirPessoa(id)) : vazio({ icone: 'pessoa', titulo: 'Nenhuma pessoa ainda', texto: 'Adicione a primeira pessoa — pode ser você mesmo(a).', acao: editor ? botao('Adicionar pessoa', { icone: 'mais', tipo: 'primario', acao: () => novaPessoa() }) : null }));

  const atividades = h('div', { class: 'cartao' }, h('div', { class: 'cartao-cabecalho' }, h('h3', { text: 'Atividades recentes' }), h('a', { href: '#/colaboracao?aba=historico', class: 'pequeno', text: 'Ver histórico' })),
    d.atividades.length ? h('ul', { class: 'lista' }, d.atividades.map((a) => h('li', {}, icone('historico', 16, { class: 'mudo' }), h('div', {},
      h('div', {}, h('b', { text: a.autor || 'Sistema' }), ` ${a.descricao}`, a.entity === 'person' && g.porId.get(a.entity_id) ? [': ', h('button', { class: 'link-botao', text: g.porId.get(a.entity_id).full_name, on: { click: () => abrirPessoa(a.entity_id) } })] : ''),
      h('small', { class: 'mudo', text: tempoRelativo(a.created_at) }))))) : vazio({ icone: 'historico', titulo: 'Sem atividades', texto: 'As alterações aparecerão aqui.' }));

  const pendRev = h('div', { class: 'cartao' }, h('h3', { text: 'Pedidos de revisão' }),
    revisoes.length ? h('ul', { class: 'lista' }, revisoes.slice(0, 6).map((r) => h('li', {}, icone('comentario', 16, { class: 'mudo' }), h('div', {}, h('div', { text: r.body }),
      h('small', { class: 'mudo' }, `${r.autor || ''} · ${tempoRelativo(r.created_at)} `, r.target_type === 'person' && g.porId.get(r.target_id) ? h('button', { class: 'link-botao', text: g.porId.get(r.target_id).full_name, on: { click: () => abrirPessoa(r.target_id) } }) : null))))) : h('p', { class: 'mudo', text: 'Nenhum pedido aberto.' }));

  return h('div', {}, indicadores, h('div', { class: 'grade lateral' }, h('div', {}, resumo, atalhos), h('div', {}, atividades, pendRev)));
}
