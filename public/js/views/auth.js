// Telas de entrar, criar conta, recuperar e redefinir senha.
import { h, s, campo, entrada, toast, erroToast, aviso } from '../ui.js';
import { POST } from '../api.js';
import { entrar } from '../app.js';

function arte() {
  const rede = s('svg', { class: 'rede', viewBox: '0 0 520 420', 'aria-hidden': 'true' });
  const nos = [[260, 60], [140, 160], [380, 160], [80, 270], [200, 270], [320, 270], [440, 270], [140, 370], [260, 370], [380, 370]];
  const ligacoes = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 7], [4, 8], [5, 8], [6, 9]];
  for (const [a, b] of ligacoes) rede.append(s('line', { x1: nos[a][0], y1: nos[a][1], x2: nos[b][0], y2: nos[b][1], stroke: '#d2ad62', 'stroke-width': 2 }));
  for (const [x, y] of nos) rede.append(s('circle', { cx: x, cy: y, r: 14, fill: '#1e3459', stroke: '#e8ecf3', 'stroke-width': 2 }));
  return h('section', { class: 'auth-arte' },
    h('div', { class: 'marca', style: { padding: 0, border: 0 } }, h('img', { src: '/img/icone.svg', alt: '' }), h('div', {}, h('b', { text: 'Árvore Viva' }), h('span', { text: 'Inteligência genealógica' }))),
    h('div', {}, h('h1', { text: 'Investigue a história da sua família com método e evidências.' }),
      h('p', { text: 'Monte árvores com vínculos biológicos, legais e adotivos, anexe certidões, avalie possíveis parentes e explore tudo em 2D ou 3D.' }),
      h('ul', {}, h('li', { text: 'Cada informação mostra de onde veio e quanto está comprovada.' }), h('li', { text: 'Pessoas vivas protegidas por padrão.' }), h('li', { text: 'Nada é unido ou confirmado sem a sua revisão.' }))),
    h('small', { text: 'Seus dados ficam no servidor desta instalação. CPF e documentos são guardados criptografados.' }), rede);
}

export function telaAuth(modo = 'entrar') {
  const area = h('div', { class: 'auth-form' });
  const raiz = h('div', { class: 'tela-auth' }, arte(), area);
  const mostrar = (m) => { area.replaceChildren(m === 'criar' ? formCriar(mostrar) : m === 'recuperar' ? formRecuperar(mostrar) : formEntrar(mostrar)); area.querySelector('input')?.focus(); };
  mostrar(modo);
  return raiz;
}

function enviar(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = form.querySelector('button[type="submit"]');
    b.disabled = true;
    try { await fn(Object.fromEntries(new FormData(form))); } catch (err) { erroToast(err); } finally { b.disabled = false; }
  });
  return form;
}

function formEntrar(mostrar) {
  return enviar(h('form', { 'aria-labelledby': 'titulo-auth' },
    h('h2', { id: 'titulo-auth', text: 'Entrar' }), h('p', { class: 'mudo', text: 'Acesse suas árvores genealógicas.' }),
    campo('E-mail', entrada({ name: 'email', type: 'email', autocomplete: 'email', required: true })),
    campo('Senha', entrada({ name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    h('button', { type: 'submit', class: 'botao primario', style: { width: '100%' }, text: 'Entrar' }),
    h('p', { style: { marginTop: '16px' } }, h('button', { type: 'button', class: 'link-botao', text: 'Esqueci minha senha', on: { click: () => mostrar('recuperar') } })),
    h('p', {}, 'Ainda não tem conta? ', h('button', { type: 'button', class: 'link-botao', text: 'Criar conta', on: { click: () => mostrar('criar') } }))),
  async (d) => entrar(await POST('/api/auth/login', d)));
}

function formCriar(mostrar) {
  return enviar(h('form', { 'aria-labelledby': 'titulo-auth' },
    h('h2', { id: 'titulo-auth', text: 'Criar conta' }),
    campo('Nome', entrada({ name: 'name', autocomplete: 'name', required: true, maxLength: 120 })),
    campo('E-mail', entrada({ name: 'email', type: 'email', autocomplete: 'email', required: true })),
    campo('Senha', entrada({ name: 'password', type: 'password', autocomplete: 'new-password', required: true, minLength: 10 }), { ajuda: 'Mínimo de 10 caracteres, com letras e números.' }),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', required: true, name: 'aceite' }), h('span', { text: 'Entendo que sou responsável pelos dados de terceiros que cadastrar e que devo ter base legal (LGPD) para registrar dados de pessoas vivas.' })),
    h('button', { type: 'submit', class: 'botao primario', style: { width: '100%' }, text: 'Criar conta' }),
    h('p', { style: { marginTop: '16px' } }, 'Já tem conta? ', h('button', { type: 'button', class: 'link-botao', text: 'Entrar', on: { click: () => mostrar('entrar') } }))),
  async (d) => { const r = await POST('/api/auth/register', { name: d.name, email: d.email, password: d.password }); toast('Conta criada. Bem-vindo(a)!', 'sucesso'); entrar(r); });
}

function formRecuperar(mostrar) {
  const resultado = h('div');
  return enviar(h('form', { 'aria-labelledby': 'titulo-auth' },
    h('h2', { id: 'titulo-auth', text: 'Recuperar acesso' }),
    campo('E-mail da conta', entrada({ name: 'email', type: 'email', required: true })), resultado,
    h('button', { type: 'submit', class: 'botao primario', style: { width: '100%' }, text: 'Solicitar redefinição' }),
    h('p', { style: { marginTop: '16px' } }, h('button', { type: 'button', class: 'link-botao', text: 'Voltar para entrar', on: { click: () => mostrar('entrar') } }))),
  async (d) => { const r = await POST('/api/auth/recover', d); resultado.replaceChildren(aviso(r.mensagem, r.email_configurado ? 'verde' : 'ambar')); });
}

export function telaRedefinir(token) {
  const form = enviar(h('form', {},
    h('h2', { text: 'Definir nova senha' }),
    campo('Nova senha', entrada({ name: 'password', type: 'password', autocomplete: 'new-password', required: true, minLength: 10 }), { ajuda: 'Mínimo de 10 caracteres, com letras e números.' }),
    h('button', { type: 'submit', class: 'botao primario', style: { width: '100%' }, text: 'Salvar nova senha' })),
  async (d) => { await POST('/api/auth/reset', { token, password: d.password }); toast('Senha alterada. Entre com a nova senha.', 'sucesso'); location.href = '/'; });
  return h('div', { class: 'tela-auth' }, arte(), h('div', { class: 'auth-form' }, form));
}
