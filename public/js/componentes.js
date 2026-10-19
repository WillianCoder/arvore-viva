// Componentes de formulário reutilizados: datas parciais, locais, escolha de pessoa.
import { h, campo, entrada, seletor, QUAL, avatar, anos } from './ui.js';
import { tokens } from './nomes.js';

// Aceita AAAA, AAAA-MM, AAAA-MM-DD ou DD/MM/AAAA e devolve no formato da API.
export function normalizarData(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return t;
}
export function paraExibir(d) {
  if (!d) return '';
  const [a, m, dia] = d.split('-');
  return dia ? `${dia}/${m}/${a}` : m ? `${m}/${a}` : a;
}

export function campoData(rotulo, nome, valor, qual) {
  const inp = entrada({ name: nome, value: paraExibir(valor), placeholder: 'DD/MM/AAAA, MM/AAAA ou AAAA', inputMode: 'numeric', autocomplete: 'off' });
  const q = seletor(Object.entries(QUAL), qual || 'exact', { name: `${nome.replace('_date', '')}_qual`, 'aria-label': `Precisão de ${rotulo.toLowerCase()}` });
  inp.addEventListener('blur', () => {
    const n = normalizarData(inp.value);
    const ok = !n || /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(n);
    inp.setAttribute('aria-invalid', String(!ok));
  });
  return h('div', { class: 'linha-campos' }, campo(rotulo, inp, { ajuda: 'Pode ser só o ano.' }), campo('Precisão', q));
}

export function camposLocal(rotulo, prefixo, l) {
  const m = entrada({ name: `${prefixo}_municipality`, value: l?.municipality || '', placeholder: 'Município', autocomplete: 'off' });
  const e = entrada({ name: `${prefixo}_state`, value: l?.state || '', placeholder: 'Estado/região' });
  const p = entrada({ name: `${prefixo}_country`, value: l?.country || '', placeholder: 'País' });
  const lat = entrada({ name: `${prefixo}_lat`, value: l?.lat ?? '', inputMode: 'decimal', placeholder: 'ex.: -22.9099' });
  const lng = entrada({ name: `${prefixo}_lng`, value: l?.lng ?? '', inputMode: 'decimal', placeholder: 'ex.: -47.0626' });
  return h('fieldset', {}, h('legend', { text: rotulo }),
    h('div', { class: 'linha-campos' }, campo('Município', m), campo('Estado', e), campo('País', p)),
    h('details', {}, h('summary', { class: 'pequeno mudo', text: 'Coordenadas para o mapa (opcional)' }),
      h('p', { class: 'pequeno mudo', text: 'Informe apenas se souber. O sistema não inventa coordenadas. Para pessoas vivas, o mapa mostra só a região aproximada.' }),
      h('div', { class: 'linha-campos' }, campo('Latitude', lat), campo('Longitude', lng))));
}
export function lerLocal(d, prefixo) {
  const l = { municipality: d[`${prefixo}_municipality`] || '', state: d[`${prefixo}_state`] || '', country: d[`${prefixo}_country`] || '', lat: d[`${prefixo}_lat`] || '', lng: d[`${prefixo}_lng`] || '' };
  if (!l.municipality && !l.state && !l.country) return null;
  if (l.lat !== '' && l.lng !== '') l.precision = 'city';
  return l;
}

// Campo de busca de pessoa na árvore (lista filtrável acessível).
export function escolherPessoa(grafo, { rotulo = 'Pessoa', aoEscolher, excluir = [], valor } = {}) {
  const id = 'p' + Math.random().toString(36).slice(2);
  const inp = entrada({ role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list', placeholder: 'Digite um nome…', autocomplete: 'off' });
  const lista = h('ul', { id, role: 'listbox', class: 'lista', style: { maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', display: 'none', background: 'var(--surface)' } });
  let escolhido = valor || null, ativo = -1, itens = [];
  if (valor && grafo.porId.get(valor)) inp.value = grafo.porId.get(valor).full_name;
  const filtrar = () => {
    const q = tokens(inp.value);
    itens = grafo.pessoas.filter((p) => !excluir.includes(p.id) && !p.restrito && (!q.length || q.every((t) => tokens(p.full_name).some((u) => u.startsWith(t))))).slice(0, 30);
    lista.replaceChildren(...itens.map((p, i) => h('li', { role: 'option', id: `${id}-${i}`, 'aria-selected': 'false', style: { cursor: 'pointer', padding: '6px 10px' }, on: { mousedown: (e) => { e.preventDefault(); escolher(p); } } },
      h('span', { class: 'item-pessoa' }, avatar(p), h('span', {}, h('span', { class: 'nome', text: p.full_name }), ' ', h('small', { class: 'mudo', text: anos(p) }))))));
    if (!itens.length) lista.append(h('li', { class: 'mudo', style: { padding: '6px 10px' }, text: 'Nenhuma pessoa encontrada.' }));
    lista.style.display = 'block'; inp.setAttribute('aria-expanded', 'true'); ativo = -1;
  };
  const escolher = (p) => { escolhido = p.id; inp.value = p.full_name; lista.style.display = 'none'; inp.setAttribute('aria-expanded', 'false'); aoEscolher?.(p); };
  inp.addEventListener('input', () => { escolhido = null; filtrar(); });
  inp.addEventListener('focus', filtrar);
  inp.addEventListener('blur', () => setTimeout(() => { lista.style.display = 'none'; inp.setAttribute('aria-expanded', 'false'); }, 120));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      ativo = Math.max(0, Math.min(itens.length - 1, ativo + (e.key === 'ArrowDown' ? 1 : -1)));
      [...lista.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === ativo)));
      lista.children[ativo]?.scrollIntoView({ block: 'nearest' });
      inp.setAttribute('aria-activedescendant', `${id}-${ativo}`);
    } else if (e.key === 'Enter' && ativo >= 0 && itens[ativo]) { e.preventDefault(); escolher(itens[ativo]); }
    else if (e.key === 'Escape') { lista.style.display = 'none'; }
  });
  const el = h('div', { style: { position: 'relative' } }, campo(rotulo, inp), lista);
  el.valor = () => escolhido;
  return el;
}
