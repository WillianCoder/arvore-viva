// Colaboração: membros e papéis, convites com expiração, revogação, histórico de alterações e pedidos de revisão.
import { h, botao, campo, entrada, seletor, modal, confirmar, toast, erroToast, carregando, erroBloco, aviso, abas, tempoRelativo, fmtDataHora, selo } from '../ui.js';
import { GET, POST, PATCH, DEL } from '../api.js';
import { estado, T, pode, carregarArvores, escolherArvore, emit } from '../estado.js';
import { semArvore, parametros } from '../app.js';

export const NOME_PAPEL = { owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', contributor: 'Colaborador', reader: 'Leitor' };
const DESC_PAPEL = { owner: 'Controle total, inclusive excluir a árvore.', admin: 'Gerencia membros, convites e vê identificadores completos (auditado).', editor: 'Edita e exclui qualquer registro; vê dados de pessoas vivas.', contributor: 'Adiciona pessoas, vínculos e documentos; altera só o que criou.', reader: 'Apenas visualiza; pessoas vivas aparecem protegidas.' };

export async function render(c) {
  if (!estado.arvoreId) { semArvore(c); return; }
  const area = h('div');
  const mostrar = (a) => (a === 'membros' ? membros(area) : a === 'historico' ? historico(area) : revisoes(area));
  const ini = parametros().aba || 'membros';
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Colaboração familiar' }), h('p', { text: 'Convide parentes para colaborar. Cada pessoa vê só as árvores para as quais foi convidada, conforme seu papel.' }))),
    abas([['membros', 'Membros e convites'], ['revisoes', 'Pedidos de revisão'], ['historico', 'Histórico de alterações']], mostrar, ini), area);
  mostrar(ini);
}

async function membros(area) {
  area.replaceChildren(carregando());
  try {
    const r = await GET(`${T()}/members`);
    const admin = pode('admin');
    area.replaceChildren(
      h('div', { class: 'grade lateral' },
        h('div', {}, h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Membro', 'Papel', 'Desde', ''].map((t) => h('th', { text: t })))),
          h('tbody', {}, r.membros.map((m) => h('tr', {}, h('td', {}, h('b', { text: m.name }), m.id === estado.usuario.id ? [' ', selo('Você', 'azul')] : null, m.email ? h('div', { class: 'pequeno mudo', text: m.email }) : null),
            h('td', {}, admin && m.role !== 'owner' && m.id !== estado.usuario.id ? seletor(Object.entries(NOME_PAPEL).filter(([k]) => k !== 'owner' && (k !== 'admin' || estado.arvore.papel === 'owner')), m.role, { 'aria-label': `Papel de ${m.name}`, on: { change: async (e) => { try { await PATCH(`${T()}/members/${m.id}`, { role: e.target.value }); toast('Papel alterado.', 'sucesso'); } catch (err) { erroToast(err); membros(area); } } } }) : NOME_PAPEL[m.role]),
            h('td', { text: tempoRelativo(m.created_at) }),
            h('td', {}, m.role !== 'owner' && (admin || m.id === estado.usuario.id) ? botao(m.id === estado.usuario.id ? 'Sair' : 'Revogar acesso', { tipo: 'pequeno perigo', acao: async () => {
              if (!(await confirmar(m.id === estado.usuario.id ? 'Sair desta árvore? Você perderá o acesso.' : `Revogar o acesso de ${m.name}?`, { perigo: true, texto: 'Confirmar' }))) return;
              try { await DEL(`${T()}/members/${m.id}`); toast('Acesso revogado.', 'sucesso'); if (m.id === estado.usuario.id) { await carregarArvores(); await escolherArvore(estado.arvores[0]?.id || null); emit('arvores'); location.hash = '#/painel'; } else membros(area); } catch (e) { erroToast(e); }
            } }) : null)))))),
        admin && r.convites.length ? h('div', { class: 'cartao', style: { marginTop: '16px' } }, h('h3', { text: 'Convites' }), h('ul', { class: 'lista' }, r.convites.map((cv) => {
          const st = cv.accepted_at ? selo('Aceito', 'verde') : cv.revoked_at ? selo('Revogado', 'contorno') : new Date(cv.expires_at) < new Date() ? selo('Expirado', 'contorno') : selo(`Válido até ${fmtDataHora(cv.expires_at)}`, 'ambar');
          return h('li', {}, h('div', { style: { flex: 1 } }, h('b', { text: cv.email }), ` · ${NOME_PAPEL[cv.role]} `, st), !cv.accepted_at && !cv.revoked_at ? botao('Revogar', { tipo: 'pequeno', acao: async () => { await DEL(`${T()}/invitations/${cv.id}`); toast('Convite revogado.', 'sucesso'); membros(area); } }) : null);
        }))) : null),
        h('div', {}, admin ? h('div', { class: 'cartao' }, h('h3', { text: 'Convidar pessoa' }), formConvite(() => membros(area))) : aviso('Somente administradores convidam novos membros.'),
          h('div', { class: 'cartao' }, h('h3', { text: 'Papéis' }), h('dl', { class: 'dados', style: { gridTemplateColumns: '110px 1fr' } }, Object.entries(NOME_PAPEL).flatMap(([k, n]) => [h('dt', {}, h('b', { text: n })), h('dd', { class: 'pequeno', text: DESC_PAPEL[k] })]))))));
  } catch (e) { area.replaceChildren(erroBloco(e, () => membros(area))); }
}

function formConvite(depois) {
  const email = entrada({ type: 'email', placeholder: 'email@exemplo.com' });
  const papel = seletor(Object.entries(NOME_PAPEL).filter(([k]) => k !== 'owner' && (k !== 'admin' || estado.arvore.papel === 'owner')), 'reader');
  const dias = seletor([['1', '1 dia'], ['7', '7 dias'], ['30', '30 dias']], '7');
  return h('form', { on: { submit: async (e) => {
    e.preventDefault();
    try {
      const r = await POST(`${T()}/invitations`, { email: email.value, role: papel.value, days: Number(dias.value) });
      const link = `${location.origin}${r.link}`;
      await modal({ titulo: 'Convite criado', corpo: h('div', {}, aviso('O envio de e-mail não está configurado neste servidor. Copie o link e envie você mesmo(a) à pessoa convidada. Ele só funciona para quem entrar com o e-mail convidado.', 'ambar'),
        h('input', { value: link, readOnly: true, 'aria-label': 'Link do convite', on: { focus: (ev) => ev.target.select() } })),
      acoes: [{ rotulo: 'Copiar link', tipo: 'primario', acao: async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado.', 'sucesso'); } catch { toast('Selecione e copie o link manualmente.', 'aviso'); return false; } } }] });
      email.value = ''; depois();
    } catch (err) { erroToast(err); }
  } } }, campo('E-mail', email, { obrigatorio: true }), h('div', { class: 'linha-campos' }, campo('Papel', papel), campo('Expira em', dias)), h('button', { type: 'submit', class: 'botao primario', text: 'Criar convite' }));
}

async function historico(area) {
  area.replaceChildren(carregando());
  let antes = null;
  const lista = h('ul', { class: 'lista' });
  const mais = botao('Carregar mais', { tipo: 'pequeno', acao: () => carregar() });
  const carregar = async () => {
    try {
      const r = await GET(`${T()}/activity?limit=50${antes ? `&before=${encodeURIComponent(antes)}` : ''}`);
      lista.append(...r.atividades.map((a) => h('li', {}, h('div', { style: { flex: 1 } }, h('b', { text: a.autor || 'Sistema' }), ` ${a.descricao}`, a.summary ? h('span', { class: 'mudo', text: ` (${a.summary})` }) : null), h('small', { class: 'mudo', text: fmtDataHora(a.created_at) }))));
      antes = r.atividades.at(-1)?.created_at;
      mais.hidden = r.atividades.length < 50;
    } catch (e) { erroToast(e); }
  };
  area.replaceChildren(h('div', { class: 'cartao' }, h('p', { class: 'pequeno mudo', text: 'Registro de quem fez cada alteração. Valores sensíveis (como números de documentos) nunca são gravados no histórico.' }), lista, mais));
  carregar();
}

async function revisoes(area) {
  area.replaceChildren(carregando());
  try {
    const r = await GET(`${T()}/comments?kind=review_request`);
    const { abrirPessoa } = await import('./pessoa.js');
    area.replaceChildren(r.comentarios.length ? h('div', { class: 'cartao' }, h('ul', { class: 'lista' }, r.comentarios.map((c) => h('li', {}, h('div', { style: { flex: 1 } }, h('div', { text: c.body }), h('small', { class: 'mudo' }, `${c.autor || ''} · ${tempoRelativo(c.created_at)} · `, c.target_type === 'person' ? h('button', { class: 'link-botao', text: 'abrir registro', on: { click: () => abrirPessoa(c.target_id, 'comentarios') } }) : c.target_type)),
      pode('editor') ? botao('Concluir revisão', { tipo: 'pequeno', acao: async () => { await PATCH(`${T()}/comments/${c.id}`, { resolved: true }); revisoes(area); } }) : null))))
      : aviso('Nenhum pedido de revisão aberto. Use "Pedir revisão" nos comentários de um registro para solicitar aprovação de alterações sensíveis.'));
  } catch (e) { area.replaceChildren(erroBloco(e, () => revisoes(area))); }
}

export async function aceitarConvite(token) {
  try {
    const c = await GET(`/api/invitations/${token}`);
    const ok = await confirmar(`Você foi convidado(a) para a árvore "${c.arvore}" como ${c.papel}. Aceitar?`, { titulo: 'Convite', texto: 'Aceitar convite' });
    if (!ok) return;
    const r = await POST(`/api/invitations/${token}/accept`);
    await carregarArvores();
    await escolherArvore(r.tree_id);
    toast('Convite aceito.', 'sucesso');
  } catch (e) { erroToast(e); }
}
