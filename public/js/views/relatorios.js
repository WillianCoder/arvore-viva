// Relatórios profissionais para impressão/PDF (pelo navegador) e CSV. Respeitam as permissões do usuário.
import { h, botao, campo, seletor, carregando, erroBloco, aviso, fmtData, anos, lugar, SITUACAO, VERIF, CATEGORIA_DOC, SUBTIPO, baixarArquivo, toast } from '../ui.js';
import { GET } from '../api.js';
import { estado, T, grafo } from '../estado.js';
import { semArvore, parametros } from '../app.js';
import { escolherPessoa } from '../componentes.js';
import { indices, percorrer, geracoes } from '../layout.js';

const TIPOS = [['geracoes', 'Árvore por gerações'], ['ascendencia', 'Linha de ascendência'], ['descendencia', 'Linha de descendência'], ['biografico', 'Relatório biográfico'],
  ['cronologia', 'Cronologia familiar'], ['documentos', 'Relatório de documentos'], ['relacao', 'Relação entre duas pessoas'], ['pendencias', 'Pendências de pesquisa'],
  ['fontes', 'Relatório de fontes'], ['conflitos', 'Conflitos documentais'], ['correspondencias', 'Resumo de possíveis correspondências']];
const PRECISA_PESSOA = ['ascendencia', 'descendencia', 'biografico', 'relacao'];

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const g = await grafo();
  const p = parametros();
  const tipo = seletor(TIPOS, p.tipo || 'geracoes', { 'aria-label': 'Tipo de relatório' });
  const pessoa = escolherPessoa(g, { rotulo: 'Pessoa de referência', valor: estado.selecionado });
  const pessoaB = escolherPessoa(g, { rotulo: 'Segunda pessoa' });
  const detalhe = seletor([['completo', 'Completo'], ['resumido', 'Resumido']], 'completo');
  const orient = seletor([['retrato', 'Retrato'], ['paisagem', 'Paisagem']], 'retrato');
  const quebra = h('input', { type: 'checkbox', checked: true });
  const area = h('div', { style: { marginTop: '16px' } });
  const ajustar = () => { pessoa.hidden = !PRECISA_PESSOA.includes(tipo.value); pessoaB.hidden = tipo.value !== 'relacao'; };
  tipo.addEventListener('change', ajustar); ajustar();
  let ultimoCsv = null;
  c.append(h('div', { class: 'cabecalho nao-imprimir' }, h('div', {}, h('h1', { text: 'Relatórios' }), h('p', { text: 'Gere relatórios com título, data, legenda e fontes. Para PDF, use "Imprimir / salvar PDF" e escolha "Salvar como PDF" no navegador.' }))),
    h('div', { class: 'cartao nao-imprimir' }, h('div', { class: 'grade c3' }, campo('Relatório', tipo), campo('Detalhamento', detalhe), campo('Orientação', orient)),
      h('div', { class: 'grade c2' }, pessoa, pessoaB), h('label', { class: 'check' }, quebra, h('span', { text: 'Uma página por geração (árvores grandes)' })),
      aviso('Relatórios incluem apenas o que você pode ver. Pessoas vivas aparecem protegidas para quem não é editor. Revise antes de compartilhar: podem conter dados de terceiros.', 'ambar'),
      h('div', { class: 'acoes' }, botao('Gerar relatório', { icone: 'relatorio', tipo: 'primario', acao: gerar }), botao('Imprimir / salvar PDF', { icone: 'impressora', acao: () => { if (!area.firstChild) return toast('Gere o relatório primeiro.', 'aviso'); window.print(); } }),
        botao('Baixar CSV', { icone: 'exportar', acao: () => { if (!ultimoCsv) return toast('Este relatório não tem versão em tabela, ou ainda não foi gerado.', 'aviso'); baixarArquivo(`${tipo.value}.csv`, ultimoCsv, 'text/csv'); } }))), area);

  async function gerar() {
    if (PRECISA_PESSOA.includes(tipo.value) && !pessoa.valor()) return toast('Escolha a pessoa de referência.', 'aviso');
    if (tipo.value === 'relacao' && !pessoaB.valor()) return toast('Escolha a segunda pessoa.', 'aviso');
    area.replaceChildren(carregando('Gerando relatório…'));
    try {
      const gg = await grafo(true);
      const r = await construir(tipo.value, gg, { a: pessoa.valor(), b: pessoaB.valor(), completo: detalhe.value === 'completo', quebra: quebra.checked });
      ultimoCsv = r.csv || null;
      const titulo = TIPOS.find((t) => t[0] === tipo.value)[1];
      area.replaceChildren(h('article', { class: `relatorio ${orient.value === 'paisagem' ? 'paisagem' : ''}` },
        h('header', {}, h('h1', { text: titulo }), h('p', {}, h('b', { text: estado.arvore.name }), ` · gerado em ${new Date().toLocaleString('pt-BR')} por ${estado.usuario.name}`), r.subtitulo ? h('p', { text: r.subtitulo }) : null),
        r.corpo,
        h('footer', { class: 'rodape-rel' }, h('p', {}, h('b', { text: 'Legenda de verificação: ' }), Object.values(VERIF).map((v) => v[0]).join(' · ')),
          h('p', { text: 'Pessoas vivas ou privadas podem aparecer como "Pessoa viva (privado)". Pontuações de correspondência são estimativas internas, não probabilidades. Datas com "c." são aproximadas.' }),
          estado.arvore.is_demo ? h('p', { text: 'ATENÇÃO: dados fictícios de demonstração.' }) : null)));
    } catch (e) { area.replaceChildren(erroBloco(e, gerar)); }
  }
  if (p.tipo) gerar();
}

const tabela = (cab, linhas) => h('table', {}, h('thead', {}, h('tr', {}, cab.map((t) => h('th', { text: t })))), h('tbody', {}, linhas.map((l) => h('tr', {}, l.map((v) => h('td', { text: v ?? '' }))))));
const linhaPessoa = (p, completo) => [p.full_name, anos(p), completo ? lugar(p.birth_place) : undefined, completo ? lugar(p.death_place) : undefined, SITUACAO[p.living_status], p.restrito ? '—' : VERIF[p.verification]?.[0]].filter((x) => x !== undefined);
const cabPessoa = (completo) => ['Nome', 'Anos', ...(completo ? ['Nascimento', 'Falecimento'] : []), 'Situação', 'Verificação'];
const csvDe = (cab, linhas) => '﻿' + [cab, ...linhas].map((l) => l.map((v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');

async function construir(tipo, g, o) {
  const idx = indices(g);
  const P = (id) => g.porId.get(id);
  if (tipo === 'geracoes' || tipo === 'ascendencia' || tipo === 'descendencia') {
    let ids = new Set(g.pessoas.map((p) => p.id));
    if (tipo === 'ascendencia') ids = new Set([o.a, ...percorrer(idx.pais, o.a)]);
    if (tipo === 'descendencia') ids = new Set([o.a, ...percorrer(idx.filhos, o.a)]);
    const gen = geracoes(ids, idx);
    const grupos = new Map();
    for (const id of ids) { const k = gen.get(id); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(P(id)); }
    const ordem = [...grupos.keys()].sort((a, b) => (tipo === 'ascendencia' ? b - a : a - b));
    const cab = cabPessoa(o.completo);
    const csvLinhas = [];
    const corpo = h('div', {}, ordem.map((k, i) => {
      const lista = grupos.get(k).sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
      const linhas = lista.map((p) => linhaPessoa(p, o.completo));
      csvLinhas.push(...lista.map((p) => [String(k - ordem[0] + 1), ...linhaPessoa(p, true)]));
      const rot = tipo === 'ascendencia' ? (i === 0 ? 'Pessoa de referência' : `${i}ª geração acima`) : tipo === 'descendencia' ? (i === 0 ? 'Pessoa de referência' : `${i}ª geração abaixo`) : `${i + 1}ª geração`;
      return h('section', { class: `geracao-rel ${o.quebra && i > 0 ? 'quebra' : ''}` }, h('h2', { text: `${rot} (${lista.length})` }), tabela(cab, linhas));
    }));
    return { corpo, subtitulo: o.a && tipo !== 'geracoes' ? `Referência: ${P(o.a).full_name}` : `${ids.size} pessoas em ${ordem.length} gerações`, csv: csvDe(['Geração', ...cabPessoa(true)], csvLinhas) };
  }
  if (tipo === 'biografico') {
    const d = await GET(`${T()}/persons/${o.a}`);
    const p = d.pessoa;
    if (d.restrito) return { corpo: h('p', { text: 'Registro protegido: você não tem permissão para ver os detalhes desta pessoa.' }) };
    const rel = d.relacoes.map((r) => [({ parent: r.papel_desta === 'b' ? 'Genitor(a)' : 'Filho(a)', guardian: 'Tutela', spouse: 'Cônjuge', partner: 'União', sibling: 'Irmão(ã)', unknown: 'A confirmar' })[r.type], r.outra?.full_name, SUBTIPO[r.subtype], VERIF[r.status]?.[0]]);
    return { subtitulo: p.full_name, corpo: h('div', {},
      h('h2', { text: p.full_name }), h('p', { text: [fmtData(p.birth_date, p.birth_qual) && `Nascimento: ${fmtData(p.birth_date, p.birth_qual)}${p.birth_place ? ' em ' + p.birth_place.name : ''}`, fmtData(p.death_date, p.death_qual) && `Falecimento: ${fmtData(p.death_date, p.death_qual)}${p.death_place ? ' em ' + p.death_place.name : ''}`].filter(Boolean).join(' · ') }),
      p.bio ? h('p', { text: p.bio, style: { whiteSpace: 'pre-wrap' } }) : null,
      h('h3', { text: 'Vínculos familiares' }), tabela(['Vínculo', 'Pessoa', 'Natureza', 'Verificação'], rel),
      o.completo && d.eventos.length ? [h('h3', { text: 'Eventos' }), tabela(['Evento', 'Data', 'Local', 'Descrição'], d.eventos.map((e) => [e.type, fmtData(e.date, e.date_qual), e.place?.name, e.description]))] : null,
      d.documentos.length ? [h('h3', { text: 'Documentos' }), tabela(['Título', 'Categoria', 'Data', 'Verificação'], d.documentos.map((x) => [x.title, CATEGORIA_DOC[x.category], fmtData(x.doc_date), VERIF[x.verification]?.[0]]))] : null,
      d.evidencias.length ? [h('h3', { text: 'Evidências' }), tabela(['Tipo', 'Efeito', 'Documento', 'Nota'], d.evidencias.map((e) => [VERIF[e.kind]?.[0], e.stance === -1 ? 'Contradiz' : 'Sustenta', e.documento, e.note]))] : null) };
  }
  if (tipo === 'cronologia') {
    const r = await GET(`${T()}/timeline`);
    const linhas = r.eventos.map((e) => [fmtData(e.data, e.qual), e.rotulo, e.pessoa, e.local, e.descricao || '']);
    const cab = ['Data', 'Evento', 'Pessoa', 'Local', 'Descrição'];
    return { corpo: tabela(cab, linhas), subtitulo: `${r.total} evento(s)`, csv: csvDe(cab, linhas) };
  }
  if (tipo === 'documentos') {
    const r = await GET(`${T()}/documents?limit=100`);
    const cab = ['Título', 'Categoria', 'Data', 'Referência', 'Instituição', 'Verificação', 'Vínculos'];
    const linhas = r.documentos.map((d) => [d.title, CATEGORIA_DOC[d.category], fmtData(d.doc_date), d.reference, d.institution, VERIF[d.verification]?.[0], String(d.vinculos)]);
    return { corpo: tabela(cab, linhas), subtitulo: `${r.total} documento(s)${r.total > 100 ? ' (primeiros 100)' : ''}`, csv: csvDe(cab, linhas) };
  }
  if (tipo === 'relacao') {
    const r = await GET(`${T()}/kinship?a=${o.a}&b=${o.b}`);
    if (r.indeterminado) return { corpo: h('p', { text: `Parentesco indeterminado: ${r.motivo}` }) };
    return { corpo: h('div', {}, r.resultados.map((x) => h('section', {}, h('h2', { text: `${r.a.nome} é ${x.descricao} de ${r.b.nome}` }), x.ancestrais?.length ? h('p', { text: `Ancestral(is) comum(ns): ${x.ancestrais.map((y) => y.nome).join(' e ')}` }) : null,
      h('ol', {}, x.caminho.map((n, i) => h('li', { text: i ? `${n.rotulo || 'ligado(a) a'} → ${n.nome}` : n.nome }))), ...(x.avisos || []).map((t) => h('p', { text: `Atenção: ${t}.` }))))) };
  }
  if (tipo === 'pendencias') {
    const temPais = new Set(g.relacoes.filter((r) => r.type === 'parent').map((r) => r.person_b));
    const linhas = [];
    for (const p of g.pessoas) {
      if (p.restrito) continue;
      const falta = [];
      if (!p.birth_date) falta.push('data de nascimento'); if (!p.birth_place) falta.push('local de nascimento');
      if (p.living_status === 'deceased' && !p.death_date) falta.push('data de falecimento');
      if (!temPais.has(p.id)) falta.push('pais');
      if (['declared', 'hypothesis', 'extracted'].includes(p.verification)) falta.push(`confirmação (${VERIF[p.verification][0].toLowerCase()})`);
      if (!p.tem_documentos) falta.push('documentos');
      if (falta.length) linhas.push([p.full_name, anos(p), falta.join(', ')]);
    }
    const hip = g.relacoes.filter((r) => ['hypothesis', 'declared', 'extracted'].includes(r.status)).map((r) => [`${P(r.person_a)?.full_name} → ${P(r.person_b)?.full_name}`, ({ parent: 'Filiação', spouse: 'Casamento', partner: 'União', guardian: 'Tutela', sibling: 'Irmandade', unknown: 'A confirmar' })[r.type], VERIF[r.status][0]]);
    const cab = ['Pessoa', 'Anos', 'O que falta'];
    return { corpo: h('div', {}, h('h2', { text: `Pessoas com informações pendentes (${linhas.length})` }), tabela(cab, linhas), h('h2', { text: `Vínculos sem comprovação (${hip.length})` }), tabela(['Vínculo', 'Tipo', 'Situação'], hip)), csv: csvDe(cab, linhas) };
  }
  if (tipo === 'fontes') {
    const r = await GET(`${T()}/sources`);
    const cab = ['Fonte', 'Autor', 'Repositório', 'Cobertura', 'Período', 'URL', 'Citações'];
    const linhas = r.fontes.map((f) => [f.title, f.author, f.repository, f.coverage, f.period, f.url, String(f.citacoes)]);
    return { corpo: tabela(cab, linhas), csv: csvDe(cab, linhas) };
  }
  if (tipo === 'conflitos') {
    const [ev, m] = await Promise.all([GET(`${T()}/evidence`), GET(`${T()}/matches?status=open`)]);
    const contest = g.pessoas.filter((p) => p.verification === 'contested').map((p) => ['Pessoa contestada', p.full_name, '']);
    const relC = g.relacoes.filter((r) => r.status === 'contested').map((r) => ['Vínculo contestado', `${P(r.person_a)?.full_name} → ${P(r.person_b)?.full_name}`, r.notes]);
    const evC = ev.evidencias.filter((e) => e.stance === -1).map((e) => ['Evidência contrária', e.target_type === 'person' ? P(e.target_id)?.full_name : 'Vínculo', `${e.documento || 'sem documento'}: ${e.note}`]);
    const mC = m.correspondencias.filter((x) => x.categoria === 'conflitante').map((x) => ['Registros conflitantes', `${x.a.full_name} × ${x.b.full_name}`, x.fatores.negativos.map((n) => n.detalhe).join('; ')]);
    const linhas = [...contest, ...relC, ...evC, ...mC];
    const cab = ['Tipo', 'Registro', 'Detalhe'];
    return { corpo: linhas.length ? tabela(cab, linhas) : h('p', { text: 'Nenhum conflito documental registrado.' }), csv: csvDe(cab, linhas) };
  }
  if (tipo === 'correspondencias') {
    const r = await GET(`${T()}/matches?status=open`);
    const cab = ['Registro A', 'Registro B', 'Classificação', 'Compatibilidade interna', 'Fatores a favor', 'Fatores contra', 'Faltando'];
    const linhas = r.correspondencias.map((x) => [x.a.full_name, x.b.full_name, x.rotulo, `${x.score}/100`, x.fatores.positivos.map((f) => f.fator).join(', '), x.fatores.negativos.map((f) => f.fator).join(', '), x.fatores.faltantes.join(', ')]);
    return { corpo: h('div', {}, h('p', { text: r.aviso }), tabela(cab, linhas)), csv: csvDe(cab, linhas) };
  }
  return { corpo: h('p', { text: 'Relatório indisponível.' }) };
}
