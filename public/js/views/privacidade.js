// Segurança da conta e privacidade (LGPD): senha, dados do titular, exclusão e explicação das proteções.
import { h, botao, campo, entrada, modal, confirmar, toast, erroToast, aviso, baixarArquivo, icone } from '../ui.js';
import { GET, POST } from '../api.js';

export async function render(c) {
  const item = (ic, titulo, texto) => h('li', {}, icone(ic, 18, { class: 'mudo' }), h('div', {}, h('b', { text: titulo }), h('div', { class: 'pequeno mudo', text: texto })));
  c.append(h('div', { class: 'cabecalho' }, h('div', {}, h('h1', { text: 'Segurança e privacidade' }), h('p', { text: 'Privacidade por padrão, com controles para você e para as pessoas cadastradas.' }))),
    h('div', { class: 'grade c2' },
      h('div', { class: 'cartao' }, h('h2', { text: 'Como seus dados são protegidos' }), h('ul', { class: 'lista' },
        item('cadeado', 'Pessoas vivas protegidas', 'Leitores e colaboradores veem apenas "Pessoa viva (privado)". Documentos de pessoas vivas ficam restritos a editores por padrão.'),
        item('chave', 'Identificadores criptografados', 'CPF, RG e passaporte são opcionais, guardados com criptografia AES-256, exibidos mascarados e nunca usados como chave, em URLs ou em logs.'),
        item('escudo', 'Permissões verificadas no servidor', 'Cada pedido confere se você é membro da árvore e se seu papel permite a ação — a interface não é a única barreira.'),
        item('documento', 'Arquivos privados', 'Documentos são criptografados no servidor e abertos só por links temporários (5 minutos) emitidos para a sua conta.'),
        item('historico', 'Auditoria', 'Alterações e acessos a identificadores ficam registrados, sem gravar os valores sensíveis.'),
        item('olhoFechado', 'Sem indexação pública', 'Nenhum perfil é público; o servidor pede aos buscadores que não indexem as páginas.'))),
      h('div', {},
        h('div', { class: 'cartao' }, h('h2', { text: 'Alterar senha' }), formSenha()),
        h('div', { class: 'cartao' }, h('h2', { text: 'Seus direitos (LGPD)' }),
          h('p', { class: 'pequeno', text: 'Você pode obter uma cópia dos dados da sua conta, corrigir informações e excluir a conta. Para dados de pessoas cadastradas em uma árvore, peça ao proprietário ou administrador dela — eles podem corrigir, restringir ou excluir o registro.' }),
          h('div', { class: 'acoes' }, botao('Baixar dados da minha conta', { icone: 'exportar', acao: async () => { try { const d = await GET('/api/auth/my-data'); baixarArquivo('meus-dados-arvore-viva.json', JSON.stringify(d, null, 2), 'application/json'); } catch (e) { erroToast(e); } } }))),
        h('div', { class: 'cartao' }, h('h2', { text: 'Excluir conta' }),
          aviso('Exclui definitivamente sua conta e todas as árvores das quais você é proprietário(a), com pessoas, documentos e histórico. Árvores de outras pessoas não são afetadas.', 'vermelho', 'alerta'),
          botao('Excluir minha conta', { icone: 'lixo', tipo: 'perigo', acao: excluirConta })),
        h('div', { class: 'cartao' }, h('h2', { text: 'Verificação em duas etapas' }), aviso('A autenticação multifator ainda não está disponível nesta versão. Use uma senha longa e exclusiva.', 'ambar')))));
}

function formSenha() {
  const atual = entrada({ type: 'password', autocomplete: 'current-password' });
  const nova = entrada({ type: 'password', autocomplete: 'new-password', minLength: 10 });
  return h('form', { on: { submit: async (e) => {
    e.preventDefault();
    try { await POST('/api/auth/password', { current: atual.value, password: nova.value }); toast('Senha alterada. Outras sessões foram encerradas.', 'sucesso'); atual.value = nova.value = ''; } catch (err) { erroToast(err); }
  } } }, campo('Senha atual', atual), campo('Nova senha', nova, { ajuda: 'Mínimo de 10 caracteres, com letras e números.' }), h('button', { type: 'submit', class: 'botao primario', text: 'Alterar senha' }));
}

async function excluirConta() {
  const senha = entrada({ type: 'password', autocomplete: 'current-password' });
  const confirmacao = await confirmar('Esta ação não pode ser desfeita.', { titulo: 'Excluir conta', perigo: true, texto: 'Continuar', exigir: 'EXCLUIR' });
  if (!confirmacao) return;
  await modal({ titulo: 'Confirme sua senha', corpo: campo('Senha', senha), acoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Excluir definitivamente', tipo: 'perigo cheio', acao: async () => {
    await POST('/api/auth/delete-account', { password: senha.value, confirm: 'EXCLUIR' });
    location.href = '/';
  } }] });
}
