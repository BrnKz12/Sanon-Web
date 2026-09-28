// ============================================================
// SANON — login.js
// Script da PÁGINA DE LOGIN (login.html)
// Dividido em duas partes:
// 1) AUTH   — controle de login/cadastro simulado (localStorage)
//             (é o mesmo bloco usado no index.js, repetido aqui
//             para este arquivo funcionar sozinho)
// 2) LOGIN  — alterna as abas Login/Cadastro, anima o slide do
//             formulário e trata o envio dos formulários
// ============================================================

// ---------- 1) AUTH (compartilhado com index.js) ----------

/**
 * Sanon Gestão e Energia — auth.js
 * Autenticação simulada em localStorage (sem backend).
 * Troque por chamadas reais à sua API quando tiver um servidor.
 */

const Auth = (() => {
  const USERS_KEY = 'sanon_users';
  const SESSION_KEY = 'sanon_session';

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // Gera um hash SHA-256 (hexadecimal) da senha usando a Web Crypto API nativa
  // do navegador. Isso evita guardar a senha em texto puro no localStorage.
  // IMPORTANTE: isso NÃO substitui um backend real — qualquer pessoa com
  // acesso ao navegador ainda consegue ler o hash salvo. Em produção, a
  // validação de senha deve acontecer no servidor, com hash+salt no banco.
  async function hashSenha(senha) {
    const bytes = new TextEncoder().encode(senha);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function register({ nome, email, senha }) {
    const users = getUsers();
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return { ok: false, message: 'Já existe uma conta com esse e-mail.' };
    }
    const senhaHash = await hashSenha(senha);
    // foto, endereco e telefone começam vazios; são preenchidos depois em "Meu perfil"
    users.push({ nome, email, senhaHash, foto: null, endereco: '', telefone: '' });
    saveUsers(users);
    setSession({ nome, email, foto: null, endereco: '', telefone: '' });
    return { ok: true };
  }

  async function login({ email, senha }) {
    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return { ok: false, message: 'E-mail ou senha inválidos.' };
    }
    const senhaHash = await hashSenha(senha);
    // "user.senha" é suporte a contas antigas criadas antes do hashing existir
    const senhaConfere = user.senhaHash ? user.senhaHash === senhaHash : user.senha === senha;
    if (!senhaConfere) {
      return { ok: false, message: 'E-mail ou senha inválidos.' };
    }
    setSession({
      nome: user.nome,
      email: user.email,
      foto: user.foto || null,
      endereco: user.endereco || '',
      telefone: user.telefone || ''
    });
    return { ok: true };
  }

  // Redefinição de senha simulada: como este site não tem backend nem envio
  // de e-mail, redefinimos a senha direto (sem confirmar posse do e-mail).
  // Em produção, isso deveria enviar um link de redefinição por e-mail.
  async function resetPassword({ email, novaSenha }) {
    const users = getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      return { ok: false, message: 'Não encontramos nenhuma conta com esse e-mail.' };
    }
    users[idx].senhaHash = await hashSenha(novaSenha);
    delete users[idx].senha;
    saveUsers(users);
    return { ok: true };
  }

  // Atualiza os dados de perfil (nome, foto, endereço, telefone) do usuário logado.
  function updateProfile(email, updates) {
    const users = getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      return { ok: false, message: 'Usuário não encontrado.' };
    }
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
    setSession({
      nome: users[idx].nome,
      email: users[idx].email,
      foto: users[idx].foto || null,
      endereco: users[idx].endereco || '',
      telefone: users[idx].telefone || ''
    });
    return { ok: true };
  }

  function setSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return { register, login, logout, isLoggedIn, getSession, updateProfile, resetPassword };
})();

// ---------- Tema (claro/escuro), compartilhado com index.js ----------

const Theme = (() => {
  const KEY = 'sanon_theme';

  function get() {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  }

  function toggle() {
    apply(get() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    apply(get());
  }

  return { get, apply, toggle, init };
})();

// ---------- 2) LOGIN (exclusivo da página de login) ----------

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', () => Theme.toggle());

  const toggle = document.querySelector('.tab-toggle');
  const authShell = document.getElementById('auth-shell');
  const tabLogin = document.getElementById('tab-login');
  const tabCadastro = document.getElementById('tab-cadastro');
  const formLogin = document.getElementById('form-login');
  const formCadastro = document.getElementById('form-cadastro');
  const formReset = document.getElementById('form-reset');

  // Se já estiver logado, manda direto pra home
  if (Auth.isLoggedIn()) {
    window.location.href = redirectTarget();
  }

  function redirectTarget() {
    const params = new URLSearchParams(window.location.search);
    return params.get('next') || 'index.html';
  }

  function setMode(mode) {
    const isCadastro = mode === 'cadastro';
    toggle.classList.toggle('mode-cadastro', isCadastro);
    authShell.classList.toggle('mode-cadastro', isCadastro); // desliza o formulário para o lado certo
    tabLogin.classList.toggle('active', !isCadastro);
    tabCadastro.classList.toggle('active', isCadastro);
    formLogin.classList.toggle('active', !isCadastro);
    formCadastro.classList.toggle('active', isCadastro);
    formReset.classList.remove('active');
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabCadastro.addEventListener('click', () => setMode('cadastro'));

  // ---- "Esqueci minha senha" (troca para o formulário de redefinição) ----
  const showResetBtn = document.getElementById('show-reset');
  const backToLoginBtn = document.getElementById('back-to-login');

  showResetBtn.addEventListener('click', () => {
    formLogin.classList.remove('active');
    formCadastro.classList.remove('active');
    formReset.classList.add('active');
    toggle.style.visibility = 'hidden'; // esconde as abas Login/Cadastro enquanto redefine a senha
  });
  backToLoginBtn.addEventListener('click', () => {
    toggle.style.visibility = 'visible';
    setMode('login');
  });

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg show ' + type;
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.classList.add('is-loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    }
  }

  // ---- Login ----
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const msg = document.getElementById('login-msg');
    const btn = formLogin.querySelector('button[type="submit"]');

    setBtnLoading(btn, true);
    const result = await Auth.login({ email, senha });
    setBtnLoading(btn, false);

    if (!result.ok) {
      showMsg(msg, result.message, 'error');
      return;
    }
    showMsg(msg, 'Login realizado! Redirecionando…', 'success');
    setTimeout(() => { window.location.href = redirectTarget(); }, 600);
  });

  // ---- Cadastro ----
  formCadastro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cad-nome').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const senha2 = document.getElementById('cad-senha2').value;
    const lgpd = document.getElementById('cad-lgpd').checked;
    const msg = document.getElementById('cadastro-msg');
    const btn = formCadastro.querySelector('button[type="submit"]');

    if (senha.length < 6) {
      showMsg(msg, 'A senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (senha !== senha2) {
      showMsg(msg, 'As senhas não coincidem.', 'error');
      return;
    }
    if (!lgpd) {
      showMsg(msg, 'Você precisa concordar com a Política de Privacidade para criar sua conta.', 'error');
      return;
    }

    setBtnLoading(btn, true);
    const result = await Auth.register({ nome, email, senha });
    setBtnLoading(btn, false);

    if (!result.ok) {
      showMsg(msg, result.message, 'error');
      return;
    }
    showMsg(msg, 'Conta criada com sucesso! Redirecionando…', 'success');
    setTimeout(() => { window.location.href = redirectTarget(); }, 600);
  });

  // ---- Redefinir senha (fluxo simplificado, sem verificação por e-mail) ----
  formReset.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    const novaSenha = document.getElementById('reset-senha').value;
    const novaSenha2 = document.getElementById('reset-senha2').value;
    const msg = document.getElementById('reset-msg');
    const btn = formReset.querySelector('button[type="submit"]');

    if (novaSenha.length < 6) {
      showMsg(msg, 'A nova senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (novaSenha !== novaSenha2) {
      showMsg(msg, 'As senhas não coincidem.', 'error');
      return;
    }

    setBtnLoading(btn, true);
    const result = await Auth.resetPassword({ email, novaSenha });
    setBtnLoading(btn, false);

    if (!result.ok) {
      showMsg(msg, result.message, 'error');
      return;
    }
    showMsg(msg, 'Senha redefinida! Você já pode entrar com a nova senha.', 'success');
    setTimeout(() => {
      toggle.style.visibility = 'visible';
      setMode('login');
      formLogin.reset();
      formReset.reset();
      msg.className = 'form-msg';
    }, 1200);
  });

  initPrivacyModal();
});

/* ---------------- Modal "Política de Privacidade" (compartilhado com index.js) ---------------- */
function initPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('privacy-close');
  const openers = document.querySelectorAll('[data-open-privacy]');

  function open() { modal.classList.add('open'); }
  function close() { modal.classList.remove('open'); }

  openers.forEach(btn => btn.addEventListener('click', open));
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}