// Importação (prévia, mapeamento, duplicidades, confirmação) e exportação (com proteção de dados por padrão).
import { h, botao, campo, seletor, carregando, erroBloco, aviso, toast, erroToast, confirmar, lerArquivoTexto, baixarArquivo, abas, selo, tempoRelativo } from '../ui.js';
import { GET, POST } from '../api.js';
import { estado, T, pode, grafo, alterado } from '../estado.js';
import { semArvore } from '../app.js';
import { escolherPessoa } from '../componentes.js';

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const area = h('div');
  const mostrar = (a) => (a === 'importar' ? importar(area) : a === 'exportar' ? exportar(area) : historico(area));
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Importar e exportar' }), h('p', { text: 'GEDCOM (5.5.1, leitura básica do 7.0), CSV e JSON. Nada é gravado sem prévia e confirmação.' }))),
    abas([['importar', 'Importar'], ['exportar', 'Exportar'], ['historico', 'Histórico de importações']], mostrar, pode('editor') ? 'importar' : 'exportar'), area);
  mostrar(pode('editor') ? 'importar' : 'exportar');
}

function importar(area) {
  if (!pode('editor')) { area.replaceChildren(aviso('Somente editores ou acima podem importar arquivos.', 'ambar')); return; }
  const arq = h('input', { type: 'file', accept: '.ged,.gedcom,.csv,.json,.txt' });
  const formato = seletor([['auto', 'Detectar pela extensão'], ['gedcom', 'GEDCOM'], ['csv', 'CSV'], ['json', 'JSON (Árvore Viva)']], 'auto');
  const previa = h('div', { style: { marginTop: '16px' } });
  let conteudo = '', nome = '', fmt = '', mapeamento = {};
  const detectar = () => (formato.value !== 'auto' ? formato.value : /\.ged(com)?$/i.test(nome) ? 'gedcom' : /\.csv$/i.test(nome) ? 'csv' : /\.json$/i.test(nome) ? 'json' : (conteudo.trimStart().startsWith('0 HEAD') ? 'gedcom' : conteudo.trimStart().startsWith('{') ? 'json' : 'csv'));
  const analisar = async () => {
    const f = arq.files[0];
    if (!f) return toast('Escolha um arquivo.', 'aviso');
    if (f.size > 8 * 1024 * 1024) return toast('Arquivo maior que 8 MB.', 'aviso');
    previa.replaceChildren(carregando('Validando arquivo…'));
    try {
      conteudo = await lerArquivoTexto(f); nome = f.name; fmt = detectar();
      await mostrarPrevia();
    } catch (e) { previa.replaceChildren(erroBloco(e)); }
  };
  async function mostrarPrevia() {
    const r = await POST(`${T()}/import/preview`, { format: fmt, content: conteudo, mapping: mapeamento });
    const pular = new Set();
    const mapa = r.cabecalho ? h('fieldset', {}, h('legend', { text: 'Mapeamento de colunas do CSV' }), h('div', { class: 'grade c3' }, r.campos.map((cmp) => campo(ROT_CAMPO[cmp] || cmp, seletor([['', '— não importar —'], ...r.cabecalho.map((x) => [x, x])], r.mapa?.[cmp] || '', { dataset: { campo: cmp } })))),
      botao('Aplicar mapeamento', { tipo: 'pequeno', acao: async () => { mapeamento = Object.fromEntries([...previa.querySelectorAll('select[data-campo]')].map((s) => [s.dataset.campo, s.value])); previa.replaceChildren(carregando()); try { await mostrarPrevia(); } catch (e) { previa.replaceChildren(erroBloco(e)); } } })) : null;
    previa.replaceChildren(h('div', { class: 'cartao' },
      h('h2', { text: `Prévia: ${nome}` }), h('div', { class: 'selos', style: { marginBottom: '12px' } }, selo(`Formato: ${fmt.toUpperCase()}`, 'contorno'), selo(`${r.total_pessoas} pessoa(s)`, 'azul'), selo(`${r.total_relacoes} vínculo(s)`, 'azul'), r.total_eventos ? selo(`${r.total_eventos} evento(s)`, 'azul') : null),
      mapa,
      r.erros.length ? aviso(h('div', {}, h('b', { text: `${r.erros.length} erro(s):` }), h('ul', {}, r.erros.slice(0, 20).map((e) => h('li', { text: e })))), 'vermelho', 'alerta') : null,
      r.avisos.length ? aviso(h('div', {}, h('b', { text: `${r.avisos.length} aviso(s):` }), h('ul', {}, r.avisos.slice(0, 20).map((e) => h('li', { text: e })))), 'ambar') : null,
      r.inconsistencias.length ? aviso(h('div', {}, h('b', { text: 'Relações inconsistentes:' }), h('ul', {}, r.inconsistencias.slice(0, 20).map((e) => h('li', { text: e })))), 'ambar', 'alerta') : null,
      r.duplicidades.length ? h('div', { class: 'secao' }, h('h3', { text: `Possíveis duplicidades com a árvore atual (${r.duplicidades.length})` }), h('p', { class: 'pequeno mudo', text: 'Marque para NÃO importar registros que já existem. Depois você pode revisar correspondências com calma.' }),
        h('ul', { class: 'lista' }, r.duplicidades.map((d) => h('li', {}, h('label', { class: 'check', style: { margin: 0 } }, h('input', { type: 'checkbox', on: { change: (e) => (e.target.checked ? pular.add(d.ref) : pular.delete(d.ref)) } }), h('span', {}, h('b', { text: d.nome }), ' parece com ', d.semelhantes.map((s) => `${s.nome} (${s.rotulo}, ${s.score}/100)`).join('; '))))))) : null,
      h('div', { class: 'secao' }, h('h3', { text: 'Amostra dos registros' }), h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nome', 'Sexo', 'Nascimento', 'Local', 'Falecimento'].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.amostra.map((p) => h('tr', {}, [p.full_name, p.sex, p.birth_date, p.birth_place, p.death_date].map((v) => h('td', { text: v || '—' })))))))),
      h('div', { class: 'acoes', style: { marginTop: '16px' } }, botao(`Importar ${r.total_pessoas} pessoa(s)`, { icone: 'importar', tipo: 'primario', desativado: !r.total_pessoas, acao: async () => {
        if (!(await confirmar(`Gravar ${r.total_pessoas - pular.size} pessoa(s) e ${r.total_relacoes} vínculo(s) em "${estado.arvore.name}"? Os registros ficam marcados como "declarados" e a origem da importação é registrada.`, { texto: 'Importar' }))) return;
        try {
          const res = await POST(`${T()}/import/commit`, { format: fmt, content: conteudo, mapping: mapeamento, confirm: true, filename: nome, skip_refs: [...pular] });
          toast(`Importação concluída: ${res.pessoas} pessoa(s), ${res.relacoes} vínculo(s).`, 'sucesso', 7000);
          await alterado();
          previa.replaceChildren(aviso(`Importação concluída: ${res.pessoas} pessoa(s), ${res.relacoes} vínculo(s), ${res.eventos} evento(s). ${res.ignoradas} ignorada(s). Recomenda-se rodar a análise de correspondências.`, 'verde', 'check'));
        } catch (e) { erroToast(e); }
      } }))));
  }
  area.replaceChildren(h('div', { class: 'cartao' }, h('div', { class: 'grade c2' }, h('div', { class: 'campo' }, h('label', { text: 'Arquivo' }), arq, h('span', { class: 'ajuda', text: 'Até 8 MB. CSV com cabeçalho; separador vírgula ou ponto e vírgula.' })), campo('Formato', formato)),
    botao('Validar e ver prévia', { icone: 'busca', tipo: 'primario', acao: analisar }),
    h('details', { style: { marginTop: '12px' } }, h('summary', { text: 'Modelo de CSV', class: 'pequeno' }), h('pre', { class: 'mono pequeno', style: { whiteSpace: 'pre-wrap' }, text: 'ref;full_name;birth_date;birth_place;death_date;father_ref;mother_ref;spouse_ref\np1;João da Silva;c. 1900;Campinas, SP, Brasil;1970;;;p2\np2;Maria Souza;12/03/1905;;;;;p1\np3;Ana da Silva;1930;;;p1;p2;' }))), previa);
}
const ROT_CAMPO = { ref: 'Identificador da linha', full_name: 'Nome completo', birth_name: 'Nome de nascimento', sex: 'Sexo', birth_date: 'Data de nascimento', birth_place: 'Local de nascimento', death_date: 'Data de falecimento', death_place: 'Local de falecimento', living_status: 'Vivo/falecido', father_ref: 'Pai (identificador)', mother_ref: 'Mãe (identificador)', spouse_ref: 'Cônjuge (identificador)', nicknames: 'Apelidos', notes: 'Observações' };

async function exportar(area) {
  const g = await grafo();
  const formato = seletor([['gedcom', 'GEDCOM 5.5.1 (.ged)'], ['csv', 'CSV (.csv)'], ['json', 'JSON (.json)']], 'gedcom');
  const escopo = seletor([['todos', 'Árvore completa'], ['ancestors', 'Ascendentes de uma pessoa'], ['descendants', 'Descendentes de uma pessoa'], ['ramo', 'Ramo (ascendentes e descendentes)']], 'todos');
  const raiz = escolherPessoa(g, { rotulo: 'Pessoa de referência', valor: estado.selecionado });
  raiz.hidden = true;
  escopo.addEventListener('change', () => { raiz.hidden = escopo.value === 'todos'; });
  const vivos = h('input', { type: 'checkbox', disabled: !pode('editor') });
  const ids = h('input', { type: 'checkbox', disabled: !pode('admin') });
  const docs = h('input', { type: 'checkbox' });
  area.replaceChildren(h('div', { class: 'cartao' },
    aviso('Por padrão, pessoas vivas aparecem como "Privado" e CPF/documentos ficam de fora. A exportação é registrada no histórico. Verifique com quem vai compartilhar: o arquivo pode conter dados de terceiros.', 'ambar', 'escudo'),
    h('div', { class: 'grade c2' }, campo('Formato', formato), campo('O que exportar', escopo)), raiz,
    h('fieldset', {}, h('legend', { text: 'Dados sensíveis (desligados por padrão)' }),
      h('label', { class: 'check' }, vivos, h('span', { text: `Incluir dados de pessoas vivas${pode('editor') ? '' : ' (somente editores)'}` })),
      h('label', { class: 'check' }, docs, h('span', { text: 'Incluir lista de documentos (metadados, só no JSON; nunca os arquivos)' })),
      h('label', { class: 'check' }, ids, h('span', { text: `Incluir identificadores como CPF/RG (somente administradores, só JSON)${pode('admin') ? '' : ' — indisponível para seu papel'}` }))),
    botao('Gerar arquivo', { icone: 'exportar', tipo: 'primario', acao: async () => {
      if (escopo.value !== 'todos' && !raiz.valor()) return toast('Escolha a pessoa de referência.', 'aviso');
      if (ids.checked && !(await confirmar('O arquivo conterá identificadores completos (CPF, RG etc.). Guarde-o em local seguro e não compartilhe publicamente. Continuar?', { perigo: true, texto: 'Exportar com identificadores' }))) return;
      try {
        const r = await POST(`${T()}/export`, { format: formato.value, include_living: vivos.checked, include_identifiers: ids.checked, include_documents: docs.checked, root_id: escopo.value !== 'todos' ? raiz.valor() : undefined, branch: escopo.value === 'ramo' ? 'both' : escopo.value });
        baixarArquivo(r.filename, r.content, r.mime);
        toast(r.aviso, 'aviso', 7000);
      } catch (e) { erroToast(e); }
    } })));
}

async function historico(area) {
  if (!pode('editor')) { area.replaceChildren(aviso('Disponível para editores.', 'ambar')); return; }
  area.replaceChildren(carregando());
  try {
    const r = await GET(`${T()}/imports`);
    area.replaceChildren(r.importacoes.length ? h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Arquivo', 'Formato', 'Resultado', 'Por', 'Quando'].map((t) => h('th', { text: t })))),
      h('tbody', {}, r.importacoes.map((i) => h('tr', {}, h('td', { text: i.filename || '—' }), h('td', { text: i.format.toUpperCase() }), h('td', {}, `${i.summary.pessoas} pessoa(s), ${i.summary.relacoes} vínculo(s)`, i.summary.lista_avisos?.length ? h('details', {}, h('summary', { class: 'pequeno', text: `${i.summary.lista_avisos.length} aviso(s)` }), h('ul', { class: 'pequeno' }, i.summary.lista_avisos.map((a) => h('li', { text: a })))) : null),
        h('td', { text: i.autor || '' }), h('td', { text: tempoRelativo(i.created_at) }))))))
      : aviso('Nenhuma importação realizada nesta árvore.'));
  } catch (e) { area.replaceChildren(erroBloco(e, () => historico(area))); }
}
