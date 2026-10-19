// Preferências: tema, animações, qualidade gráfica do 3D e padrões da visualização.
import { h, campo, seletor, toast, erroToast, aviso } from '../ui.js';
import { PATCH } from '../api.js';
import { estado, emit } from '../estado.js';
import { aplicarTema, aplicarMovimento } from '../app.js';

export async function render(c) {
  const pref = estado.usuario.preferences || {};
  const tema = seletor([['system', 'Seguir o sistema'], ['light', 'Claro'], ['dark', 'Escuro']], pref.theme || 'system');
  const mov = h('input', { type: 'checkbox', checked: !!pref.reduceMotion });
  const qual = h('input', { type: 'checkbox', checked: !!estado.vis.baixaQualidade });
  const layout = seletor([['vertical', 'Árvore vertical'], ['horizontal', 'Árvore horizontal'], ['generations', 'Por gerações'], ['radial', 'Radial'], ['network', 'Rede']], estado.vis.layout);
  const dens = seletor([['compacta', 'Compacta'], ['normal', 'Normal'], ['detalhada', 'Detalhada']], estado.vis.densidade);
  const salvar = async (dados) => { try { const r = await PATCH('/api/auth/preferences', dados); estado.usuario.preferences = r.preferences; toast('Preferência salva.', 'sucesso', 2000); } catch (e) { erroToast(e); } };
  tema.addEventListener('change', () => { aplicarTema(tema.value); salvar({ theme: tema.value }); emit('tema'); });
  mov.addEventListener('change', () => { aplicarMovimento(mov.checked); salvar({ reduceMotion: mov.checked }); });
  qual.addEventListener('change', () => { estado.vis.baixaQualidade = qual.checked; try { localStorage.setItem('av-3d-leve', qual.checked ? '1' : '0'); } catch { /* ignora */ } });
  layout.addEventListener('change', () => { estado.vis.layout = layout.value; });
  dens.addEventListener('change', () => { estado.vis.densidade = dens.value; });
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Configurações' }), h('p', { text: 'Preferências salvas na sua conta.' }))),
    h('div', { class: 'grade c2' },
      h('div', { class: 'cartao' }, h('h2', { text: 'Aparência' }), campo('Tema', tema),
        h('label', { class: 'check' }, mov, h('span', { text: 'Reduzir animações e efeitos visuais (também respeitamos a configuração do sistema)' })),
        h('label', { class: 'check' }, qual, h('span', { text: 'Modo 3D leve (menor resolução, para dispositivos com pouca capacidade gráfica)' }))),
      h('div', { class: 'cartao' }, h('h2', { text: 'Visualização da árvore (nesta sessão)' }), campo('Organização padrão', layout), campo('Densidade', dens),
        aviso('A árvore 2D é a forma principal e acessível. O 3D é opcional e carregado só quando você o abre.'))));
}
try { estado.vis.baixaQualidade = localStorage.getItem('av-3d-leve') === '1'; } catch { /* ignora */ }
