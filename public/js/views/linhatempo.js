// Linha do tempo familiar: filtros por pessoa, ramo, período e tipo; datas aproximadas sinalizadas.
import { h, botao, carregando, erroBloco, vazio, seletor, selo, fmtData, TIPO_EVT, entrada, campo, seloVerif } from '../ui.js';
import { GET, qs } from '../api.js';
import { estado, T, grafo } from '../estado.js';
import { semArvore } from '../app.js';
import { escolherPessoa } from '../componentes.js';
import { abrirPessoa } from './pessoa.js';

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const g = await grafo();
  const pessoa = escolherPessoa(g, { rotulo: 'Pessoa ou ramo (opcional)' });
  const modo = seletor([['branch', 'Ramo (ascendentes e descendentes)'], ['person', 'Somente a pessoa']], 'branch', { 'aria-label': 'Abrangência' });
  const tipo = seletor([['', 'Todos os tipos'], ...Object.entries(TIPO_EVT)], '', { 'aria-label': 'Tipo de evento' });
  const de = entrada({ type: 'number', placeholder: 'De (ano)', 'aria-label': 'Ano inicial' });
  const ate = entrada({ type: 'number', placeholder: 'Até (ano)', 'aria-label': 'Ano final' });
  const vista = seletor([['lista', 'Lista cronológica'], ['ramos', 'Ramos lado a lado']], 'lista', { 'aria-label': 'Forma de exibição' });
  const area = h('div', {}, carregando());
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Linha do tempo familiar' }), h('p', { text: 'Nascimentos, casamentos, falecimentos, migrações e outros eventos. Datas aproximadas aparecem marcadas.' }))),
    h('div', { class: 'cartao', style: { marginBottom: '16px' } }, h('div', { class: 'grade c3' }, pessoa, campo('Abrangência', modo), campo('Tipo', tipo)), h('div', { class: 'grade c3' }, campo('Período', h('div', { class: 'acoes' }, de, ate)), campo('Exibição', vista), h('div', { style: { alignSelf: 'end', marginBottom: '14px' } }, botao('Aplicar', { tipo: 'primario', acao: carregar })))), area);
  async function carregar() {
    area.replaceChildren(carregando());
    try {
      const id = pessoa.valor();
      const r = await GET(`${T()}/timeline?${qs({ [modo.value]: id || undefined, type: tipo.value, from: de.value, to: ate.value })}`);
      if (!r.eventos.length) { area.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'tempo', titulo: 'Nenhum evento no período', texto: 'Cadastre datas de nascimento, casamento e outros eventos para montar a linha do tempo.' }))); return; }
      const evento = (e) => h('div', { class: `evento-tl ${e.qual !== 'exact' ? 'estimado' : ''}` },
        h('div', {}, h('b', { text: e.rotulo }), ' · ', h('button', { class: 'link-botao', text: e.pessoa, on: { click: () => abrirPessoa(e.pessoa_id) } })),
        h('div', { class: 'pequeno mudo' }, fmtData(e.data, e.qual), e.local ? ` · ${e.local}` : '', e.descricao ? ` · ${e.descricao}` : ''),
        h('div', { class: 'selos', style: { marginTop: '4px' } }, e.qual !== 'exact' ? selo('Data incerta', 'ambar') : null, seloVerif(e.verificacao)));
      if (vista.value === 'ramos') {
        // Colunas por ramo (raízes mais antigas), mostrando eventos simultâneos lado a lado.
        const raiz = new Map();
        const pais = new Map();
        for (const x of g.relacoes) if (x.type === 'parent') { if (!pais.has(x.person_b)) pais.set(x.person_b, []); pais.get(x.person_b).push(x.person_a); }
        const subir = (pid, vis = new Set()) => { if (vis.has(pid)) return pid; vis.add(pid); const ps = pais.get(pid); return ps?.length ? subir(ps[0], vis) : pid; };
        for (const e of r.eventos) { const k = subir(e.pessoa_id); if (!raiz.has(k)) raiz.set(k, []); raiz.get(k).push(e); }
        const anos = [...new Set(r.eventos.map((e) => Math.floor(e.ano / 10) * 10))].sort((a, b) => a - b);
        area.replaceChildren(h('div', { class: 'colunas-tl' }, [...raiz.entries()].slice(0, 8).map(([k, evs]) => h('div', { class: 'cartao' }, h('h3', { text: `Ramo de ${g.porId.get(k)?.full_name || '—'}` }),
          ...anos.map((d) => { const lista = evs.filter((e) => Math.floor(e.ano / 10) * 10 === d); return lista.length ? h('div', {}, h('div', { class: 'ano-tl', style: { marginLeft: 0 }, text: `Década de ${d}` }), h('div', { class: 'linha-tempo' }, lista.map(evento))) : null; })))));
        return;
      }
      const porAno = new Map();
      for (const e of r.eventos) { if (!porAno.has(e.ano)) porAno.set(e.ano, []); porAno.get(e.ano).push(e); }
      area.replaceChildren(h('div', { class: 'cartao' }, h('p', { class: 'mudo pequeno', text: `${r.total} evento(s)${r.total > r.eventos.length ? ` (mostrando ${r.eventos.length})` : ''}` }),
        h('div', { class: 'linha-tempo' }, [...porAno.entries()].map(([a, evs]) => [h('div', { class: 'ano-tl', text: String(a || 'Sem ano') }), ...evs.map(evento)]))));
    } catch (e) { area.replaceChildren(erroBloco(e, carregar)); }
  }
  carregar();
}
