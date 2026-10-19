// Administração técnica: estado do sistema, backup, auditoria global e links de redefinição.
import { h, botao, campo, entrada, toast, erroToast, carregando, erroBloco, aviso, fmtDataHora, modal } from '../ui.js';
import { GET, POST } from '../api.js';

export async function render(c) {
  const area = h('div', {}, carregando());
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Administração técnica' }), h('p', { text: 'Visível apenas para e-mails configurados em ADMIN_EMAILS.' }))), area);
  const carregar = async () => {
    try {
      const [s, a] = await Promise.all([GET('/api/admin/status'), GET('/api/admin/audit')]);
      const email = entrada({ type: 'email' });
      area.replaceChildren(
        !s.chave_configurada ? aviso('ENCRYPTION_KEY não está definida: uma chave local foi gerada em data/.chave. Em produção, defina a variável e guarde-a com segurança (sem ela, CPFs e arquivos não podem ser lidos).', 'vermelho', 'alerta') : null,
        !s.cookie_seguro ? aviso('COOKIE_SECURE=false. Em produção (HTTPS), defina COOKIE_SECURE=true.', 'ambar') : null,
        h('div', { class: 'grade c4', style: { marginBottom: '16px' } }, Object.entries(s.contagens).map(([k, v]) => h('div', { class: 'indicador' }, h('span', { text: k }), h('b', { text: v.toLocaleString('pt-BR') })))),
        h('div', { class: 'grade c2' },
          h('div', { class: 'cartao' }, h('h3', { text: 'Sistema' }), h('dl', { class: 'dados' }, h('dt', { text: 'Versão' }), h('dd', { text: s.versao }), h('dt', { text: 'Node.js' }), h('dd', { text: s.node }), h('dt', { text: 'Em execução há' }), h('dd', { text: `${Math.round(s.uptime_s / 60)} min` }),
            h('dt', { text: 'Banco' }), h('dd', { text: `${(s.banco_bytes / 1048576).toFixed(2)} MB` }), h('dt', { text: 'Migrações' }), h('dd', { text: s.migracoes.map((m) => m.version).join(', ') }),
            h('dt', { text: 'E-mail' }), h('dd', { text: s.email_configurado ? 'Configurado' : 'Não configurado' }), h('dt', { text: 'OCR de imagens' }), h('dd', { text: s.ocr_imagens ? 'Disponível' : 'Não configurado (requer Tesseract)' })),
          h('div', { class: 'acoes' }, botao('Criar backup agora', { icone: 'exportar', acao: async () => { try { const r = await POST('/api/admin/backup'); toast(`Backup criado: ${r.arquivo}`, 'sucesso', 7000); toast(r.aviso, 'aviso', 9000); } catch (e) { erroToast(e); } } }),
            botao('Limpar arquivos órfãos', { acao: async () => { try { const r = await POST('/api/admin/cleanup-files'); toast(`${r.removidos} arquivo(s) removido(s).`, 'sucesso'); } catch (e) { erroToast(e); } } }))),
          h('div', { class: 'cartao' }, h('h3', { text: 'Link de redefinição de senha' }), h('p', { class: 'pequeno mudo', text: 'Sem e-mail configurado, gere aqui um link de uso único (válido por 1 hora) e entregue-o ao titular da conta por um canal seguro.' }),
            campo('E-mail da conta', email), botao('Gerar link', { tipo: 'primario', acao: async () => { try { const r = await POST('/api/admin/reset-link', { email: email.value }); const link = location.origin + r.link; modal({ titulo: 'Link gerado', corpo: h('input', { value: link, readOnly: true, 'aria-label': 'Link de redefinição' }), acoes: [{ rotulo: 'Fechar' }] }); } catch (e) { erroToast(e); } } }))),
        h('div', { class: 'cartao' }, h('h3', { text: 'Auditoria recente (todas as árvores)' }), h('div', { class: 'tabela-envolve' }, h('table', {}, h('thead', {}, h('tr', {}, ['Quando', 'Usuário', 'Ação', 'Entidade', 'Resumo'].map((t) => h('th', { text: t })))),
          h('tbody', {}, a.registros.map((x) => h('tr', {}, h('td', { text: fmtDataHora(x.created_at) }), h('td', { text: x.email || '—' }), h('td', { text: x.action }), h('td', { text: x.entity }), h('td', { text: x.summary }))))))));
    } catch (e) { area.replaceChildren(erroBloco(e, carregar)); }
  };
  carregar();
}
