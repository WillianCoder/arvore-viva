// Mapa de origens e migrações (Leaflet + OpenStreetMap). Só coordenadas informadas; vivos com precisão reduzida.
import { h, erroBloco, aviso, seletor, entrada, campo, vazio } from '../ui.js';
import { GET } from '../api.js';
import { estado, T } from '../estado.js';
import { semArvore } from '../app.js';

let carregandoLeaflet = null;
function leaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!carregandoLeaflet) carregandoLeaflet = new Promise((ok, falha) => {
    document.head.append(h('link', { rel: 'stylesheet', href: '/vendor/leaflet/leaflet.css' }));
    const sc = h('script', { src: '/vendor/leaflet/leaflet.js' });
    sc.onload = () => ok(window.L); sc.onerror = () => falha(new Error('Não foi possível carregar o mapa.'));
    document.head.append(sc);
  });
  return carregandoLeaflet;
}
const COR = { birth: '#2d5c9a', death: '#677186', marriage: '#a9802f', residence: '#2c7a57', immigration: '#6a4f9c', emigration: '#6a4f9c', other: '#a86a12' };

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const tipo = seletor([['', 'Todos os eventos'], ['birth', 'Nascimentos'], ['marriage', 'Casamentos'], ['residence', 'Residências'], ['death', 'Falecimentos'], ['immigration', 'Imigração']], '', { 'aria-label': 'Tipo' });
  const de = entrada({ type: 'number', placeholder: 'De (ano)', 'aria-label': 'Ano inicial' }), ate = entrada({ type: 'number', placeholder: 'Até (ano)', 'aria-label': 'Ano final' });
  const rotas = h('input', { type: 'checkbox', checked: true });
  const div = h('div', { class: 'mapa', role: 'region', 'aria-label': 'Mapa de locais da família' });
  const lista = h('div');
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Mapa de origens e migrações' }), h('p', { text: 'Locais de nascimento, casamento, residência e falecimento. Rotas aparecem só entre locais com data e coordenadas conhecidas.' }))),
    aviso('O mapa usa imagens do OpenStreetMap, carregadas diretamente dos servidores do projeto (seu endereço IP fica visível para eles). Coordenadas exatas de residência de pessoas vivas nunca são exibidas.', '', 'info'),
    h('div', { class: 'cartao', style: { marginBottom: '12px' } }, h('div', { class: 'grade c4' }, campo('Evento', tipo), campo('De', de), campo('Até', ate), h('label', { class: 'check', style: { alignSelf: 'center' } }, rotas, h('span', { text: 'Mostrar rotas migratórias' })))),
    div, lista);
  let L, mapa, camada;
  let dados;
  try {
    [L, dados] = await Promise.all([leaflet(), GET(`${T()}/map`)]);
  } catch (e) { div.replaceWith(erroBloco(e, () => render(c.replaceChildren() || c))); return; }
  mapa = L.map(div, { worldCopyJump: true, zoomControl: true }).setView([-15, -30], 3);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© colaboradores do OpenStreetMap' }).addTo(mapa);
  camada = L.layerGroup().addTo(mapa);
  const desenhar = () => {
    camada.clearLayers();
    const t = tipo.value, a0 = Number(de.value) || -Infinity, a1 = Number(ate.value) || Infinity;
    const okEv = (e) => (!t || e.tipo === t) && (e.ano == null ? !de.value && !ate.value : e.ano >= a0 && e.ano <= a1);
    const limites = [];
    for (const p of dados.pontos) {
      const evs = p.eventos.filter(okEv);
      if (!evs.length) continue;
      const cor = COR[evs[0].tipo] || COR.other;
      const m = L.circleMarker([p.lat, p.lng], { radius: Math.min(22, 6 + Math.sqrt(evs.length) * 3), color: cor, weight: 2, fillOpacity: 0.35 });
      const conteudo = h('div', {}, h('b', { text: p.nome }), p.precisao !== 'exact' && p.precisao !== 'city' ? h('div', { class: 'pequeno', text: 'Localização aproximada' }) : null,
        h('ul', { style: { paddingLeft: '16px', margin: '6px 0 0' } }, evs.slice(0, 30).map((e) => h('li', { text: `${e.rotulo}: ${e.pessoa}${e.ano ? ` (${e.ano})` : ''}` }))));
      m.bindPopup(conteudo);
      m.addTo(camada);
      limites.push([p.lat, p.lng]);
    }
    if (rotas.checked) for (const r of dados.rotas) {
      if (!(r.para.ano >= a0 && r.para.ano <= a1)) continue;
      L.polyline([[r.de.lat, r.de.lng], [r.para.lat, r.para.lng]], { color: '#a9802f', weight: 2, opacity: 0.7, dashArray: '6 6' }).bindTooltip(`${r.pessoa}: ${r.de.nome} (${r.de.ano}) → ${r.para.nome} (${r.para.ano})`).addTo(camada);
    }
    if (limites.length) mapa.fitBounds(limites, { padding: [30, 30], maxZoom: 7 });
  };
  [tipo, de, ate, rotas].forEach((x) => x.addEventListener('change', desenhar));
  desenhar();
  lista.replaceChildren(!dados.pontos.length ? h('div', { class: 'cartao', style: { marginTop: '12px' } }, vazio({ icone: 'mapa', titulo: 'Nenhum local com coordenadas', texto: 'Informe latitude e longitude nos locais (opcional) para que apareçam no mapa.' })) : '',
    dados.locais_sem_coordenadas.length ? h('div', { class: 'cartao', style: { marginTop: '12px' } }, h('h3', { text: 'Locais sem coordenadas (não aparecem no mapa)' }), h('p', { class: 'pequeno mudo', text: dados.locais_sem_coordenadas.join(' · ') })) : '');

  return () => mapa?.remove();
}
