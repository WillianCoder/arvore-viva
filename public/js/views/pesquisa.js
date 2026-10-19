// Pesquisa avançada: tolerante a erros, acentos e grafias; filtros combináveis; só registros permitidos.
import { h, botao, campo, entrada, seletor, avatar, anos, lugar, selo, seloVerif, vazio, carregando, erroBloco, aviso, tempoRelativo, valores } from '../ui.js';
import { GET, qs } from '../api.js';
import { estado, pode, escolherArvore } from '../estado.js';
import { parametros } from '../app.js';
import { abrirPessoa } from './pessoa.js';

export async function render(c) {
  const p = parametros();
  const arvores = estado.arvores;
  const form = h('form', { class: 'cartao', role: 'search' },
    h('div', { class: 'linha-campos' },
      campo('Nome, parte do nome ou apelido', entrada({ name: 'q', value: p.q || '', placeholder: 'Ex.: Jose Sousa, Pina, Corvali' }), { ajuda: 'Tolera acentos, abreviações e erros de digitação.' }),
      campo('Sobrenome (variações fonéticas)', entrada({ name: 'surname', value: p.surname || '' }), { ajuda: 'Souza encontra Sousa.' })),
    h('details', { open: Object.keys(p).some((k) => !['q', 'surname'].includes(k)) }, h('summary', { text: 'Mais filtros', style: { cursor: 'pointer', fontWeight: 600, marginBottom: '10px' } }),
      h('div', { class: 'linha-campos' },
        campo('Nascido a partir de (ano)', entrada({ name: 'birth_from', type: 'number', value: p.birth_from || '', min: 1000, max: 2100 })),
        campo('Nascido até (ano)', entrada({ name: 'birth_to', type: 'number', value: p.birth_to || '', min: 1000, max: 2100 })),
        campo('Ano de falecimento', entrada({ name: 'death_year', type: 'number', value: p.death_year || '' }))),
      h('div', { class: 'linha-campos' }, campo('Município', entrada({ name: 'municipality', value: p.municipality || '' })), campo('Estado', entrada({ name: 'state', value: p.state || '' })), campo('País', entrada({ name: 'country', value: p.country || '' }))),
      h('div', { class: 'linha-campos' }, campo('Nome do pai ou da mãe', entrada({ name: 'parent', value: p.parent || '' })), campo('Nome do cônjuge', entrada({ name: 'spouse', value: p.spouse || '' })),
        campo('Fonte ou referência de certidão', entrada({ name: 'source', value: p.source || '' }), { ajuda: 'Busca em título, referência e instituição de documentos.' })),
      h('div', { class: 'linha-campos' }, campo('Árvore', seletor([['', 'Todas as minhas árvores'], ...arvores.map((a) => [a.id, a.name])], p.tree_id || '', { name: 'tree_id' })),
        h('label', { class: 'check', style: { alignSelf: 'center' } }, h('input', { type: 'checkbox', name: 'has_parents', value: '1', checked: p.has_parents === '1' }), h('span', { text: 'Somente com pai ou mãe conhecidos' }))),
      pode('editor') ? h('fieldset', {}, h('legend', { text: 'Número de documento (restrito)' }),
        h('p', { class: 'pequeno mudo', text: 'Disponível só para editores, dentro de uma árvore escolhida, com correspondência exata, limite de consultas e registro no histórico. Não revela pessoas de outras contas.' }),
        h('div', { class: 'linha-campos' }, campo('Tipo', seletor([['cpf', 'CPF'], ['rg', 'RG'], ['passport', 'Passaporte'], ['birth_cert', 'Certidão de nascimento'], ['marriage_cert', 'Certidão de casamento'], ['death_cert', 'Certidão de óbito']], 'cpf', { name: 'identifier_kind' })),
          campo('Número', entrada({ name: 'identifier', autocomplete: 'off' })))) : null),
    h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'botao primario', text: 'Pesquisar' }), botao('Limpar', { acao: () => { location.hash = '#/pesquisa'; } })));
  const resultados = h('div', { style: { marginTop: '16px' } });
  let modo = 'lista';
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Pesquisa avançada' }), h('p', { text: 'Procure pessoas em todas as árvores a que você tem acesso. Pessoas vivas e registros privados só aparecem para quem pode vê-los.' }))), form, resultados);
  let ultimo = null;
  const buscar = async (pagina = 1) => {
    const d = valores(form);
    if (!form.has_parents.checked) delete d.has_parents;
    if (!d.identifier) { delete d.identifier; delete d.identifier_kind; }
    if (!Object.values(d).some(Boolean)) { resultados.replaceChildren(aviso('Preencha ao menos um campo para pesquisar.')); return; }
    resultados.replaceChildren(carregando('Pesquisando…'));
    try {
      const r = await GET(`/api/search?${qs({ ...d, page: pagina })}`);
      ultimo = { r, d, pagina };
      desenhar();
    } catch (e) { resultados.replaceChildren(erroBloco(e, () => buscar(pagina))); }
  };
  const desenhar = () => {
    const { r, pagina } = ultimo;
    if (!r.total) { resultados.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'busca', titulo: 'Nenhum resultado', texto: 'Tente remover filtros, usar só o sobrenome ou ampliar o intervalo de anos.' }))); return; }
    const abrir = async (x) => { if (x.arvores[0].id !== estado.arvoreId) await escolherArvore(x.arvores[0].id); abrirPessoa(x.pessoa.id); };
    const alternar = h('div', { class: 'grupo-botoes' }, ...[['lista', 'Lista'], ['cartoes', 'Cartões comparáveis']].map(([m, t]) => botao(t, { tipo: 'pequeno', 'aria-pressed': String(modo === m), acao: () => { modo = m; desenhar(); } })));
    const item = (x) => [h('span', { class: 'item-pessoa' }, avatar(x.pessoa), h('span', {}, h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: x.pessoa.full_name, on: { click: () => abrir(x) } }), x.pessoa.apelidos?.length ? h('small', { class: 'mudo', text: ` “${x.pessoa.apelidos.join('”, “')}”` }) : null))];
    const corpo = modo === 'lista'
      ? h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Pessoa', 'Nascimento', 'Pais', 'Por que apareceu', 'Origem e atualização'].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.resultados.map((x) => h('tr', {}, h('td', {}, item(x), h('div', { class: 'pequeno mudo', text: x.arvores.map((a) => a.nome).join(', ') })),
          h('td', { text: [anos(x.pessoa), lugar(x.pessoa.birth_place)].filter(Boolean).join(' · ') || '—' }), h('td', { class: 'pequeno', text: x.pais.join(' e ') || '—' }),
          h('td', {}, h('div', { class: 'selos' }, x.motivos.map((m) => selo(m, 'contorno')))), h('td', { class: 'pequeno' }, h('div', { text: x.origem }), h('div', { class: 'mudo', text: `Atualizado ${tempoRelativo(x.atualizado)}` }), seloVerif(x.pessoa.verification)))))))
      : h('div', { class: 'grade c3' }, r.resultados.map((x) => h('div', { class: 'cartao' }, item(x), h('dl', { class: 'dados', style: { marginTop: '10px' } },
        h('dt', { text: 'Nascimento' }), h('dd', { text: [anos(x.pessoa), lugar(x.pessoa.birth_place)].filter(Boolean).join(' · ') || '—' }), h('dt', { text: 'Pais' }), h('dd', { text: x.pais.join(' e ') || '—' }),
        h('dt', { text: 'Árvore' }), h('dd', { text: x.arvores.map((a) => a.nome).join(', ') }), h('dt', { text: 'Origem' }), h('dd', { text: x.origem }), h('dt', { text: 'Atualizado' }), h('dd', { text: tempoRelativo(x.atualizado) })),
        h('div', { class: 'selos' }, seloVerif(x.pessoa.verification), ...x.motivos.map((m) => selo(m, 'contorno'))))));
    const paginas = Math.ceil(r.total / 20);
    resultados.replaceChildren(h('div', { class: 'cartao-cabecalho' }, h('h2', { text: `${r.total} resultado(s)` }), alternar), corpo,
      paginas > 1 ? h('div', { class: 'acoes', style: { justifyContent: 'center', marginTop: '12px' } }, botao('Anterior', { tipo: 'pequeno', desativado: pagina <= 1, acao: () => buscar(pagina - 1) }), h('span', { class: 'pequeno mudo', text: `Página ${pagina} de ${paginas}` }), botao('Próxima', { tipo: 'pequeno', desativado: pagina >= paginas, acao: () => buscar(pagina + 1) })) : null);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); buscar(1); });
  if (Object.keys(p).length) buscar(1);
}
