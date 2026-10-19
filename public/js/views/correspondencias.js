// Possíveis familiares/correspondências: análise explicável e revisão humana obrigatória.
import { h, botao, modal, confirmar, toast, erroToast, carregando, erroBloco, vazio, aviso, selo, avatar, anos, fmtData, lugar, tempoRelativo, campo } from '../ui.js';
import { GET, POST } from '../api.js';
import { estado, T, pode, alterado } from '../estado.js';
import { semArvore } from '../app.js';
import { abrirPessoa, listaFatores } from './pessoa.js';

const COR = { documental_forte: 'verde', genealogica_consistente: 'verde', possivel: 'ouro', inconclusiva: 'contorno', improvavel: 'contorno', conflitante: 'vermelho' };
const STATUS = { pending: 'Pendente', later: 'Analisar depois', accepted: 'Aceita', rejected: 'Rejeitada', merged: 'Registros unidos' };

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  let filtro = 'open';
  const lista = h('div', {}, carregando());
  const outras = h('input', { type: 'checkbox' });
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Possíveis familiares e correspondências' }), h('p', { text: 'Compara registros autorizados considerando nomes, datas, locais, pais, cônjuges, filhos e documentos. Nada é confirmado ou unido sem a sua revisão.' })),
    pode('editor') ? h('div', { class: 'acoes' }, h('label', { class: 'check', style: { margin: 0 } }, outras, h('span', { class: 'pequeno', text: 'Incluir minhas outras árvores' })),
      botao('Analisar agora', { icone: 'correspondencia', tipo: 'primario', acao: async (e) => {
        e.currentTarget.disabled = true;
        try { const r = await POST(`${T()}/matches/analyze`, { include_other_trees: outras.checked }); toast(`${r.comparadas} registros comparados: ${r.criadas} nova(s) sugestão(ões), ${r.atualizadas} atualizada(s).`, 'sucesso'); await alterado(); carregar(); } catch (err) { erroToast(err); } finally { e.currentTarget && (e.currentTarget.disabled = false); }
      } })) : null),
  aviso('A pontuação é uma estimativa interna de compatibilidade (0–100), não uma probabilidade estatística validada. Sobrenome parecido não comprova parentesco, e um mesmo CPF indica que dois registros podem ser a mesma pessoa — nunca parentesco entre pessoas diferentes.', 'ambar'),
  h('div', { class: 'grupo-botoes', style: { marginBottom: '12px' } }, ...[['open', 'Abertas'], ['accepted', 'Aceitas'], ['rejected', 'Rejeitadas'], ['merged', 'Unidas']].map(([k, t]) => botao(t, { tipo: 'pequeno', 'aria-pressed': String(k === filtro), acao: (e) => { filtro = k; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); carregar(); } }))), lista);
  async function carregar() {
    lista.replaceChildren(carregando());
    try {
      const r = await GET(`${T()}/matches?status=${filtro}`);
      if (!r.correspondencias.length) { lista.replaceChildren(h('div', { class: 'cartao' }, vazio({ icone: 'correspondencia', titulo: 'Nenhuma correspondência aqui', texto: filtro === 'open' ? 'Clique em "Analisar agora" para comparar os registros da árvore.' : 'Nenhuma decisão deste tipo ainda.' }))); return; }
      lista.replaceChildren(h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Registro A', 'Registro B', 'Classificação', 'Compatibilidade', 'Situação', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, r.correspondencias.map((m) => h('tr', {},
          ...[m.a, m.b].map((p) => h('td', {}, h('span', { class: 'item-pessoa' }, avatar(p), h('span', {}, h('button', { class: 'link-botao', style: { fontWeight: 600 }, text: p.full_name, on: { click: () => abrirPessoa(p.id) } }), h('div', { class: 'pequeno mudo', text: [anos(p), lugar(p.birth_place)].filter(Boolean).join(' · ') }))))),
          h('td', {}, selo(m.rotulo, COR[m.categoria])), h('td', {}, h('div', { class: 'barra-score', title: `${m.score}/100` }, h('i', { style: { width: `${m.score}%` } })), h('small', { class: 'mudo', text: `${m.score}/100` })),
          h('td', { text: STATUS[m.status] }), h('td', {}, botao('Revisar', { tipo: 'pequeno', acao: () => revisar(m.id, carregar) }))))))));
    } catch (e) { lista.replaceChildren(erroBloco(e, carregar)); }
  }
  carregar();
}

async function revisar(id, aoMudar) {
  let d;
  try { d = await GET(`${T()}/matches/${id}`); } catch (e) { return erroToast(e); }
  const linhas = [['Nome', (p) => p.full_name], ['Nome de nascimento', (p) => p.birth_name], ['Outros nomes', (p) => p.nomes_alt?.join(', ')], ['Sexo', (p) => p.sex],
    ['Nascimento', (p) => fmtData(p.birth_date, p.birth_qual)], ['Local de nascimento', (p) => lugar(p.birth_place)], ['Falecimento', (p) => fmtData(p.death_date, p.death_qual)],
    ['Local de falecimento', (p) => lugar(p.death_place)], ['Pais', (p) => p.pais.join(', ')], ['Cônjuges', (p) => p.conjuges.join(', ')], ['Filhos', (p) => p.filhos.join(', ')],
    ['Documentos', (p) => String(p.documentos)], ['Na árvore atual', (p) => (p.na_arvore ? 'Sim' : 'Não (outra árvore sua)')]];
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const comparacao = h('div', { class: 'comparacao' }, h('div', { class: 'r' }), h('div', { class: 'r', text: 'Registro A' }), h('div', { class: 'r', text: 'Registro B' }),
    linhas.flatMap(([rot, f]) => { const a = f(d.a), b = f(d.b); const cls = a && b ? (norm(a) === norm(b) ? 'igual' : 'diferente') : ''; return [h('div', { class: 'r', text: rot }), h('div', { class: cls, text: a || '—' }), h('div', { class: cls, text: b || '—' })]; }));
  const just = h('textarea', { rows: 3, maxLength: 2000, placeholder: 'Ex.: certidão de casamento confirma os mesmos pais.' });
  const corpo = h('div', {},
    h('div', { class: 'acoes', style: { marginBottom: '12px' } }, selo(d.rotulo, COR[d.categoria]), h('span', { class: 'pequeno mudo', text: `Compatibilidade interna ${d.score}/100 · situação: ${STATUS[d.status]}` })),
    comparacao, h('h3', { style: { marginTop: '16px' }, text: 'O que pesou na classificação' }), listaFatores(d.fatores),
    h('div', { class: 'secao' }, h('h3', { text: 'Histórico de revisão' }), d.revisoes.length ? h('ul', { class: 'lista' }, d.revisoes.map((r) => h('li', {}, h('div', {}, h('b', { text: ({ accepted: 'Aceitou', rejected: 'Rejeitou', later: 'Marcou para depois', undo: 'Desfez decisão' })[r.decision] || r.decision }), ` · ${r.autor || ''} · ${tempoRelativo(r.created_at)}`, r.justification ? h('div', { class: 'pequeno mudo', text: r.justification }) : null)))) : h('p', { class: 'mudo pequeno', text: 'Nenhuma decisão registrada.' })),
    pode('editor') && d.status !== 'merged' ? campo('Justificativa da decisão', just) : null);
  const decidir = (decision) => async () => { await POST(`${T()}/matches/${id}/review`, { decision, justification: just.value }); toast('Decisão registrada.', 'sucesso'); aoMudar(); };
  const acoes = pode('editor') && d.status !== 'merged' ? [
    d.revisoes.length ? { rotulo: 'Desfazer última decisão', icone: 'desfazer', acao: async () => { const r = await POST(`${T()}/matches/${id}/undo`, { justification: just.value }); toast(`Decisão desfeita. Situação: ${STATUS[r.status]}.`, 'sucesso'); aoMudar(); } } : null,
    { rotulo: 'Analisar depois', acao: decidir('later') }, { rotulo: 'Rejeitar', tipo: 'perigo', acao: decidir('rejected') }, { rotulo: 'Aceitar', tipo: 'primario', acao: decidir('accepted') },
    d.a.na_arvore && d.b.na_arvore ? { rotulo: 'Unir registros…', icone: 'unir', acao: () => unir(d, just.value, aoMudar) } : null,
  ].filter(Boolean) : [{ rotulo: 'Fechar' }];
  await modal({ titulo: 'Comparar registros', largo: true, corpo, acoes });
}

async function unir(d, justificativa, aoMudar) {
  const escolha = await modal({ titulo: 'Unir registros', corpo: h('div', {}, aviso('Unir significa afirmar que os dois registros são a MESMA pessoa. Vínculos, eventos, documentos e nomes serão transferidos para o registro mantido. Esta operação não pode ser desfeita automaticamente.', 'vermelho', 'alerta'),
    h('p', { text: 'Qual registro deve ser mantido como principal?' })),
  acoes: [{ rotulo: 'Cancelar' }, { rotulo: `Manter "${d.a.full_name}"`, valor: 'a' }, { rotulo: `Manter "${d.b.full_name}"`, valor: 'b' }] });
  if (!escolha) return false;
  const [manter, remover] = escolha === 'a' ? [d.a, d.b] : [d.b, d.a];
  const ok = await confirmar(`Confirmar: "${remover.full_name}" será unido a "${manter.full_name}".`, { titulo: 'Confirmação explícita', perigo: true, texto: 'Unir definitivamente', exigir: 'UNIR' });
  if (!ok) return false;
  try { await POST(`${T()}/persons/merge`, { keep_id: manter.id, remove_id: remover.id, confirm: true, justification: justificativa }); toast('Registros unidos.', 'sucesso'); await alterado(); aoMudar(); return true; } catch (e) { erroToast(e); return false; }
}

