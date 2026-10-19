// Construtor e navegação da árvore: 2D (padrão, acessível) e 3D (opcional), com o mesmo contexto.
import { h, s, icone, botao, toast, erroToast, carregando, erroBloco, seletor, anos, avatar, seloVerif, selo, baixarArquivo, lugar, aviso } from '../ui.js';
import { GET } from '../api.js';
import { estado, on, grafo, selecionar, pode, T } from '../estado.js';
import { semArvore, movimentoReduzido } from '../app.js';
import { Arvore2D } from '../tree2d.js';
import { abrirPessoa, novaPessoa } from './pessoa.js';
import { escolherPessoa } from '../componentes.js';
import { tokens } from '../nomes.js';

const LAYOUTS = [['vertical', 'Árvore vertical'], ['horizontal', 'Árvore horizontal'], ['ancestors', 'Ascendentes'], ['descendants', 'Descendentes'], ['generations', 'Por gerações'], ['radial', 'Radial'], ['network', 'Rede de relações'], ['lineage', 'Linhagem selecionada']];
const ESTILOS3D = [['vertical', 'Árvore vertical espacial'], ['radial', 'Árvore radial'], ['network', 'Rede de relações']];

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  c.className = 'conteudo cheio';
  const palco = h('div', { class: 'palco' }, carregando('Montando a árvore…'));
  c.append(palco);
  let g;
  try { g = await grafo(); } catch (e) { palco.replaceChildren(erroBloco(e, () => render(c))); return; }
  palco.replaceChildren();
  if (!g.pessoas.length) {
    palco.append(h('div', { class: 'cartao', style: { margin: '40px auto', maxWidth: '560px' } }, h('div', { class: 'vazio' }, icone('pessoa', 44), h('h3', { text: 'A árvore está vazia' }),
      h('p', { text: 'Comece por qualquer pessoa — você mesmo(a), um avô ou um ancestral distante. Depois adicione pais, filhos, cônjuges e irmãos a partir do cartão.' }),
      pode('contributor') ? botao('Adicionar primeira pessoa', { icone: 'mais', tipo: 'primario', acao: () => novaPessoa() }) : null)));
    const off = on('dados', () => render(limparConteudo(c)));
    return () => off();
  }
  const v = estado.vis;
  if (!estado.selecionado || !g.porId.has(estado.selecionado)) estado.selecionado = estado.usuario.preferences?.lastPerson && g.porId.has(estado.usuario.preferences.lastPerson) ? estado.usuario.preferences.lastPerson : null;
  let vis = null; // instância 2D ou 3D
  const area = h('div', { style: { position: 'absolute', inset: 0 } });
  const status = h('span', { class: 'pequeno mudo', 'aria-live': 'polite' });
  const info = h('div', { class: 'painel-flutuante info-no', hidden: true });
  const legenda = montarLegenda();

  const opcoes = () => ({ layout: v.layout, densidade: v.densidade, foco: estado.selecionado, recolhidos: v.recolhidos, filtros: v.filtros, selecionado: estado.selecionado, caminho: estado.caminho, estilo3d: v.estilo3d });
  const callbacks = {
    aoSelecionar: (id) => selecionar(id), aoAbrir: (id) => abrirPessoa(id), podeEditar: () => pode('contributor'), semAnimacao: movimentoReduzido,
    aoAdicionar: (id, como) => novaPessoa({ relate: { person_id: id, as: como } }),
    aoRecolher: (id) => { if (v.recolhidos.has(id)) v.recolhidos.delete(id); else v.recolhidos.add(id); redesenhar(); },
    aoDesenhar: (d) => { status.textContent = v.modo === '3d' ? `${d.nos} pessoas em 3D${d.cortado ? ' (limitado à linhagem selecionada)' : ''}` : `${d.total} pessoas · ${d.nos} desenhadas agora`; },
    baixaQualidade: () => v.baixaQualidade,
  };

  async function montarVis() {
    vis?.destruir?.();
    vis = null;
    area.replaceChildren();
    if (v.modo === '3d') {
      const { Arvore3D, suporta3D } = await import('../tree3d.js').catch((e) => { throw new Error('Não foi possível carregar o módulo 3D: ' + e.message); });
      if (!(await suporta3D())) { toast('Seu dispositivo não suporta WebGL. Voltando para a visualização 2D.', 'aviso', 7000); v.modo = '2d'; atualizarBarra(); return montarVis(); }
      area.append(carregando('Carregando 3D…'));
      try { vis = await Arvore3D.criar(area, callbacks); } catch (e) { erroToast(new Error('Falha ao iniciar o 3D. Use a visualização 2D.')); v.modo = '2d'; atualizarBarra(); return montarVis(); }
      area.querySelector('.carregando')?.remove();
      vis.atualizar(estado.grafo, opcoes());
      vis.definirModoCamera(v.camera || 'livre');
      if (estado.selecionado) vis.focar(estado.selecionado);
    } else {
      vis = new Arvore2D(area, callbacks);
      vis.atualizar(estado.grafo, opcoes());
      if (estado.selecionado && vis.L.nos.has(estado.selecionado)) vis.centralizar(estado.selecionado, false); else vis.ajustar();
    }
    mostrarInfo();
  }
  const redesenhar = () => { if (!vis) return; vis.atualizar(estado.grafo, opcoes()); mostrarInfo(); };

  // ---- Barra de ferramentas ----
  const btnModo = h('div', { class: 'grupo-botoes', role: 'group', 'aria-label': 'Modo de visualização' });
  const selLayout = seletor(LAYOUTS, v.layout, { 'aria-label': 'Organização da árvore', on: { change: (e) => { v.layout = e.target.value; if (['ancestors', 'descendants', 'lineage'].includes(v.layout) && !estado.selecionado) toast('Selecione uma pessoa para este modo.', 'info'); redesenhar(); vis?.ajustar?.(); } } });
  const selEstilo = seletor(ESTILOS3D, v.estilo3d, { 'aria-label': 'Estilo 3D', on: { change: (e) => { v.estilo3d = e.target.value; vis.posicionada = false; redesenhar(); vis.enquadrar?.(); } } });
  const selDens = seletor([['compacta', 'Compacta'], ['normal', 'Normal'], ['detalhada', 'Detalhada']], v.densidade, { 'aria-label': 'Densidade visual', on: { change: (e) => { v.densidade = e.target.value; redesenhar(); } } });
  const selCam = seletor([['livre', 'Câmera livre'], ['focada', 'Câmera focada']], v.camera || 'livre', { 'aria-label': 'Modo de câmera', on: { change: (e) => { v.camera = e.target.value; vis.definirModoCamera?.(v.camera); } } });
  const busca = buscaNaArvore(g, (id) => { selecionar(id); vis?.centralizar?.(id, true); vis?.focar?.(id); });
  const historico = h('div', { class: 'historico-nav' });
  function atualizarBarra() {
    btnModo.replaceChildren(...[['2d', '2D', 'plano'], ['3d', '3D', 'cubo']].map(([m, rot, ic]) => botao(rot, { icone: ic, tipo: 'pequeno', 'aria-pressed': String(v.modo === m), titulo: m === '3d' ? 'Visualização 3D (opcional)' : 'Visualização 2D', acao: async () => { if (v.modo === m) return; v.modo = m; atualizarBarra(); try { await montarVis(); } catch (e) { erroToast(e); v.modo = '2d'; atualizarBarra(); montarVis(); } } })));
    selLayout.hidden = v.modo === '3d'; selEstilo.hidden = v.modo !== '3d'; selCam.hidden = v.modo !== '3d'; selDens.hidden = v.modo === '3d';
  }
  atualizarBarra();
  const barra = h('div', { class: 'barra-arvore nao-imprimir' },
    h('div', { class: 'painel-flutuante' }, btnModo, selLayout, selEstilo, selDens, selCam),
    h('div', { class: 'painel-flutuante' }, busca),
    h('div', { class: 'painel-flutuante' },
      botao('', { icone: 'filtro', tipo: 'fantasma pequeno', titulo: 'Filtros', acao: () => abrirFiltros(g, redesenhar) }),
      botao('', { icone: 'rota', tipo: 'fantasma pequeno', titulo: 'Caminho de parentesco entre duas pessoas', acao: () => caminhoEntre(g, redesenhar, vis) }),
      botao('', { icone: 'recolher', tipo: 'fantasma pequeno', titulo: 'Expandir todos os ramos', acao: () => { v.recolhidos.clear(); redesenhar(); } }),
      botao('', { icone: 'imagem', tipo: 'fantasma pequeno', titulo: 'Baixar imagem da árvore', acao: () => exportarImagem(vis, v) }),
      botao('', { icone: 'teclado', tipo: 'fantasma pequeno', titulo: 'Atalhos de teclado', acao: atalhos }),
      pode('contributor') ? botao('Pessoa', { icone: 'mais', tipo: 'pequeno primario', acao: () => novaPessoa() }) : null),
    h('div', { class: 'painel-flutuante status-arvore' }, historico, status));
  const zoom = h('div', { class: 'controles-zoom painel-flutuante nao-imprimir', style: { flexDirection: 'column' } },
    botao('', { icone: 'zoomMais', tipo: 'fantasma pequeno', titulo: 'Aproximar', acao: () => vis?.zoom(1.25) }),
    botao('', { icone: 'zoomMenos', tipo: 'fantasma pequeno', titulo: 'Afastar', acao: () => vis?.zoom(0.8) }),
    botao('', { icone: 'ajustar', tipo: 'fantasma pequeno', titulo: 'Ver a árvore inteira', acao: () => (vis?.ajustar ? vis.ajustar() : vis?.enquadrar()) }),
    botao('', { icone: 'centro', tipo: 'fantasma pequeno', titulo: 'Centralizar pessoa selecionada', acao: () => { if (!estado.selecionado) return toast('Selecione uma pessoa.', 'info'); vis?.centralizar?.(estado.selecionado, true); vis?.focar?.(estado.selecionado); } }));
  palco.append(area, barra, zoom, legenda, info);

  function mostrarInfo() {
    const id = estado.selecionado, p = id && estado.grafo.porId.get(id);
    historico.replaceChildren(...(estado.historico.length > 1 ? [icone('historico', 14, { class: 'mudo' }), ...estado.historico.slice(1, 5).map((x) => estado.grafo.porId.get(x)).filter(Boolean).map((x) =>
      h('button', { class: 'link-botao pequeno', text: x.full_name.split(' ')[0], title: `Voltar para ${x.full_name}`, on: { click: () => { selecionar(x.id); vis?.centralizar?.(x.id, true); vis?.focar?.(x.id); } } }))] : []));
    if (!p) { info.hidden = true; return; }
    info.hidden = false;
    const caminho = estado.caminho;
    info.replaceChildren(...[h('div', { class: 'item-pessoa', style: { marginBottom: '8px' } }, avatar(p), h('div', { style: { minWidth: 0 } }, h('div', { class: 'nome', text: p.full_name }), h('small', { class: 'mudo', text: [anos(p), lugar(p.birth_place)].filter(Boolean).join(' · ') }))),
      h('div', { class: 'selos', style: { marginBottom: '8px' } }, p.restrito ? selo('Protegido', 'contorno', 'cadeado') : seloVerif(p.verification), p.tem_documentos ? selo(`${p.tem_documentos} doc.`, 'azul', 'documento') : null, p.tem_correspondencia ? selo('Correspondência', 'ouro') : null),
      caminho ? h('p', { class: 'pequeno' }, h('b', { text: 'Caminho destacado. ' }), h('button', { class: 'link-botao', text: 'Limpar', on: { click: () => { estado.caminho = null; redesenhar(); } } })) : null,
      h('div', { class: 'acoes' }, botao('Perfil completo', { tipo: 'pequeno primario', acao: () => abrirPessoa(id) }),
        botao('Linhagem', { tipo: 'pequeno', titulo: 'Focar nesta linhagem', acao: () => { v.layout = 'lineage'; selLayout.value = 'lineage'; redesenhar(); vis?.ajustar?.(); } }),
        botao('', { icone: 'fechar', tipo: 'fantasma pequeno', titulo: 'Fechar', acao: () => { selecionar(null); } }))].filter(Boolean));
  }

  const offSel = on('selecao', () => { if (!vis) return; if (['ancestors', 'descendants', 'lineage'].includes(v.layout)) redesenhar(); else vis.destacar(estado.selecionado, estado.caminho); mostrarInfo(); });
  const offDados = on('dados', async () => { await grafo(); if (estado.selecionado && !estado.grafo.porId.has(estado.selecionado)) estado.selecionado = null; redesenhar(); });
  const offTema = on('tema', () => { vis?.tema?.(); redesenhar(); });
  await montarVis().catch((e) => { erroToast(e); });
  return () => { offSel(); offDados(); offTema(); vis?.destruir?.(); };
}

function limparConteudo(c) { c.replaceChildren(); return c; }

function buscaNaArvore(g, aoEscolher) {
  const lista = h('datalist', { id: 'pessoas-arvore' }, g.pessoas.filter((p) => !p.restrito).slice(0, 5000).map((p) => h('option', { value: p.full_name })));
  const inp = h('input', { type: 'search', list: 'pessoas-arvore', placeholder: 'Buscar na árvore…', 'aria-label': 'Buscar pessoa na árvore', style: { width: '190px' } });
  const ir = () => {
    const q = tokens(inp.value);
    if (!q.length) return;
    const p = g.pessoas.find((x) => x.full_name === inp.value) || g.pessoas.find((x) => !x.restrito && q.every((t) => tokens(x.full_name).some((u) => u.startsWith(t))));
    if (p) aoEscolher(p.id); else toast('Ninguém encontrado com esse nome nesta árvore.', 'aviso');
  };
  inp.addEventListener('change', ir);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
  return h('span', {}, inp, lista);
}

function montarLegenda() {
  const linha = (cls, txt, cor, traco) => h('li', {}, s('svg', { width: 34, height: 10, 'aria-hidden': 'true' }, s('line', { x1: 0, y1: 5, x2: 34, y2: 5, stroke: cor, 'stroke-width': cls === 'conjuge' ? 2.5 : 2, 'stroke-dasharray': traco || '' })), h('span', { text: txt }));
  const corpo = h('ul', {},
    linha('bio', 'Filiação biológica', 'var(--muted)'), linha('ad', 'Filiação adotiva', 'var(--green)', '7 4'), linha('leg', 'Filiação legal / tutela', 'var(--blue)', '2 4'),
    linha('step', 'Criação / acolhimento', 'var(--purple)', '8 3 2 3'), linha('conjuge', 'Casamento ou união', 'var(--gold)'), linha('conjuge', 'União encerrada', 'var(--gold)', '5 4'),
    linha('hip', 'Hipótese não confirmada', 'var(--amber)', '3 3'), linha('cont', 'Vínculo contestado', 'var(--red)'),
    h('li', {}, icone('check', 13, { stroke: 'var(--green)' }), h('span', { text: 'Informação verificada' })), h('li', {}, icone('clipe', 13, { stroke: 'var(--blue)' }), h('span', { text: 'Possui documentos' })),
    h('li', {}, icone('correspondencia', 13, { stroke: 'var(--gold)' }), h('span', { text: 'Possível correspondência' })), h('li', {}, icone('cadeado', 13), h('span', { text: 'Pessoa viva / registro protegido' })));
  const det = h('details', { class: 'painel-flutuante legenda nao-imprimir' }, h('summary', { text: 'Legenda', style: { cursor: 'pointer', fontWeight: 600 } }), corpo);
  try { det.open = localStorage.getItem('av-legenda') === '1'; } catch { det.open = false; }
  det.addEventListener('toggle', () => { try { localStorage.setItem('av-legenda', det.open ? '1' : '0'); } catch { /* ignora */ } });
  return det;
}

async function abrirFiltros(g, redesenhar) {
  const { modal, campo, entrada } = await import('../ui.js');
  const f = estado.vis.filtros;
  const min = entrada({ type: 'number', min: 1, value: f.geracaoMin, inputMode: 'numeric' });
  const max = entrada({ type: 'number', min: 1, value: f.geracaoMax, inputMode: 'numeric' });
  const sob = entrada({ value: f.sobrenome, placeholder: 'Ex.: Corvalli' });
  const tipos = [['biological', 'Biológica'], ['legal', 'Legal'], ['adoptive', 'Adotiva'], ['step', 'Criação'], ['foster', 'Acolhimento'], ['unknown', 'Não informada'], ['hypothesis', 'Hipóteses']];
  const caixas = tipos.map(([k, rot]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.tipos[k] !== false, dataset: { k } }), h('span', { text: rot })));
  const ocultar = h('input', { type: 'checkbox', checked: f.ocultarFiltrados });
  await modal({ titulo: 'Filtros da árvore', corpo: h('div', {},
    h('div', { class: 'linha-campos' }, campo('Da geração', min, { ajuda: '1 = mais antiga' }), campo('Até a geração', max)),
    campo('Sobrenome', sob, { ajuda: 'Mostra quem tem este sobrenome.' }),
    h('fieldset', {}, h('legend', { text: 'Tipo de filiação' }), h('div', { class: 'grade c3' }, caixas)),
    h('label', { class: 'check' }, ocultar, h('span', { text: 'Ocultar quem não passa no filtro (em vez de apenas esmaecer)' }))),
  acoes: [{ rotulo: 'Limpar filtros', acao: () => { Object.assign(f, { geracaoMin: '', geracaoMax: '', sobrenome: '', ocultarFiltrados: false }); for (const k of Object.keys(f.tipos)) f.tipos[k] = true; redesenhar(); } },
    { rotulo: 'Aplicar', tipo: 'primario', acao: () => {
      f.geracaoMin = min.value; f.geracaoMax = max.value; f.sobrenome = sob.value.trim(); f.ocultarFiltrados = ocultar.checked;
      for (const c of caixas) { const i = c.querySelector('input'); f.tipos[i.dataset.k] = i.checked; }
      redesenhar();
    } }] });
}

async function caminhoEntre(g, redesenhar, vis) {
  const { modal } = await import('../ui.js');
  const a = escolherPessoa(g, { rotulo: 'Primeira pessoa', valor: estado.selecionado });
  const b = escolherPessoa(g, { rotulo: 'Segunda pessoa' });
  const res = h('div', { 'aria-live': 'polite' });
  await modal({ titulo: 'Caminho de parentesco', corpo: h('div', {}, a, b, res), acoes: [{ rotulo: 'Fechar' }, { rotulo: 'Calcular e destacar', tipo: 'primario', acao: async () => {
    if (!a.valor() || !b.valor()) { toast('Escolha as duas pessoas.', 'aviso'); return false; }
    const r = await GET(`${T()}/kinship?a=${a.valor()}&b=${b.valor()}`);
    const cam = r.resultados[0]?.caminho || r.caminho || [];
    if (!cam.length) { res.replaceChildren(aviso(r.motivo || 'Parentesco indeterminado com os dados disponíveis.', 'ambar')); return false; }
    estado.caminho = cam.map((x) => x.id);
    redesenhar();
    vis?.centralizar?.(a.valor(), true);
    toast(r.indeterminado ? 'Ligação encontrada, mas o parentesco não pôde ser nomeado.' : `${r.a.nome} é ${r.resultados[0].descricao} de ${r.b.nome}.`, 'info', 8000);
  } }] });
}

function exportarImagem(vis, v) {
  if (!vis) return;
  if (v.modo === '3d') { const url = vis.capturar(); const a = h('a', { href: url, download: 'arvore-3d.png' }); document.body.append(a); a.click(); a.remove(); return; }
  try {
    const svgTxt = vis.exportarSVG();
    baixarArquivo('arvore.svg', svgTxt, 'image/svg+xml');
    toast('Imagem SVG gerada. Ela pode conter dados de pessoas vivas visíveis para você — compartilhe com cuidado.', 'aviso', 8000);
  } catch (e) { erroToast(e); }
}

async function atalhos() {
  const { modal } = await import('../ui.js');
  const l = [['Setas ↑ ↓', 'Pais / filhos'], ['Setas ← →', 'Pessoas ao lado (irmãos, cônjuges)'], ['Enter', 'Abrir perfil completo'], ['+ / −', 'Aproximar / afastar'], ['0', 'Ver a árvore inteira'], ['C', 'Centralizar selecionada (2D)'], ['Duplo clique', 'Abrir perfil'], ['Arrastar', 'Mover (2D) ou girar (3D)'], ['Shift + arrastar', 'Mover a cena (3D)']];
  modal({ titulo: 'Atalhos de teclado', corpo: h('table', {}, h('tbody', {}, l.map(([k, d]) => h('tr', {}, h('td', {}, h('b', { class: 'mono', text: k })), h('td', { text: d }))))), acoes: [{ rotulo: 'Fechar' }] });
}
