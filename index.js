// ============================================================
// SANON — index.js
// Script do SITE PRINCIPAL (index.html)
// Dividido em duas partes:
// 1) AUTH   — controle de login/cadastro simulado (localStorage)
//             (é o mesmo bloco usado no login.js, repetido aqui
//             para este arquivo funcionar sozinho)
// 2) HOME   — menu mobile, estado de login no cabeçalho e a
//             calculadora de orçamento fotovoltaico
// ============================================================

// ---------- 1) AUTH (compartilhado com login.js) ----------

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
  // "updates" pode conter qualquer um desses campos; os demais são preservados.
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

// ---------- Tema (claro/escuro), compartilhado com login.js ----------

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

// ---------- 2) HOME (exclusivo da página principal) ----------

/**
 * Sanon Gestão e Energia — main.js
 * Ajuste WHATSAPP_NUMBER para o número real da empresa (formato: 55 + DDD + número).
 */
const WHATSAPP_NUMBER = '5511999999999';

// Preço médio de referência de mercado (R$/Wp), instalação completa (kit + projeto + mão de obra).
// Baseado em dados do Radar Solfácil (1º tri/2026): média nacional ~R$2,45/Wp em equipamentos.
// Ajuste este valor periodicamente conforme cotações reais da Sanon.
const PRECO_POR_WP = 3.8; // R$ por watt-pico instalado
const TARIFA_MEDIA_KWH = 0.97; // R$/kWh, referência para converter valor da conta em consumo
const GERACAO_MENSAL_POR_KWP = 130; // kWh gerados por kWp instalado, média nacional simplificada (usado como fallback)
const TAXA_JUROS_FINANCIAMENTO = 0.0179; // 1,79% a.m., taxa de referência para simular parcelas
const REAJUSTE_TARIFA_ANUAL = 0.08; // reajuste médio anual estimado da tarifa de energia, usado no gráfico de 25 anos

// Fator de ajuste da geração média por kWp conforme a irradiação solar típica de cada
// estado (simplificado). Estados do Nordeste/Centro-Oeste recebem mais sol em média;
// estados do Sul recebem um pouco menos. Multiplica GERACAO_MENSAL_POR_KWP.
const FATOR_IRRADIACAO_UF = {
  AC: 0.98, AL: 1.12, AP: 1.05, AM: 1.00, BA: 1.15, CE: 1.16, DF: 1.10,
  ES: 1.02, GO: 1.10, MA: 1.10, MT: 1.08, MS: 1.08, MG: 1.06, PA: 1.02,
  PB: 1.14, PR: 0.92, PE: 1.13, PI: 1.14, RJ: 1.00, RN: 1.16, RS: 0.90,
  RO: 1.00, RR: 1.00, SC: 0.90, SP: 1.00, SE: 1.13, TO: 1.10
};

document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  initThemeToggle();
  initNav();
  initAuthState();
  initGallery();
  initCalculator();
  initProfileModal();
  initUsinaModal();
  initPrivacyModal();
});

/* ---------------- Botão(ões) de carregamento em formulários assíncronos ---------------- */
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

/* ---------------- Modal "Política de Privacidade" (compartilhado com Login.js) ---------------- */
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

/* ---------------- Geração de números pseudo-aleatórios estáveis (para dados de demonstração) ---------------- */
// Gera um número inteiro a partir de uma string (usado como "seed" para
// que os dados mockados de "Minha usina" sejam sempre os mesmos para o
// mesmo usuário, em vez de mudar a cada abertura do modal.
function seedFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/* ---------------- Modal "Minha usina" (dados de demonstração) ---------------- */
function initUsinaModal() {
  const modal = document.getElementById('usina-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('usina-close');

  function open() {
    const session = Auth.getSession();
    if (!session) return;

    const rand = seededRandom(seedFromString(session.email) || 1);
    const kwp = (2 + rand() * 13).toFixed(2);
    const geracaoMensal = Math.round(kwp * GERACAO_MENSAL_POR_KWP);
    const geracaoHoje = Math.round((geracaoMensal / 30) * (0.7 + rand() * 0.6));
    const economiaMes = geracaoMensal * TARIFA_MEDIA_KWH * 0.9;

    document.getElementById('usina-kwp').textContent = `${kwp} kWp`;
    document.getElementById('usina-hoje').textContent = `${geracaoHoje} kWh`;
    document.getElementById('usina-mes').textContent = `${geracaoMensal} kWh`;
    document.getElementById('usina-economia').textContent = economiaMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    // Mini gráfico de barras dos últimos 7 dias
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const valores = dias.map(() => (geracaoMensal / 30) * (0.55 + rand() * 0.75));
    const max = Math.max(...valores);
    const barsEl = document.getElementById('usina-bars');
    const labelsEl = document.getElementById('usina-bars-labels');
    barsEl.innerHTML = valores.map(v => `<div class="bar" style="height:${Math.max(6, (v / max) * 100)}%" title="${v.toFixed(1)} kWh"></div>`).join('');
    labelsEl.innerHTML = dias.map(d => `<span>${d}</span>`).join('');

    modal.classList.add('open');
  }
  function close() { modal.classList.remove('open'); }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  UsinaModal.open = open;
}
const UsinaModal = { open: () => {} };
function openUsinaModal() { UsinaModal.open(); }

/* ---------------- Botão de tema ---------------- */
function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => Theme.toggle());
}

/* ---------------- Utilidades de perfil/avatar ---------------- */
function getInitials(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function avatarMarkup(session, size) {
  if (session.foto) {
    return `<img src="${session.foto}" alt="Foto de ${escapeHtml(session.nome)}">`;
  }
  return `<span class="avatar-initials">${getInitials(session.nome)}</span>`;
}

// Reduz a foto enviada para um quadrado de até 200px (evita estourar o localStorage)
function resizePhoto(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------- Navegação mobile ---------------- */
function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav ul');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = nav.style.display === 'flex';
    nav.style.display = open ? 'none' : 'flex';
    nav.style.cssText += open ? '' : 'position:absolute;top:74px;left:0;right:0;background:#fbf9f6;flex-direction:column;padding:20px 28px;gap:16px;border-bottom:1px solid var(--line);';
  });
}

/* ---------------- Estado de login no header ---------------- */
function initAuthState() {
  const slot = document.getElementById('auth-slot');
  if (!slot) return;
  const session = Auth.getSession();
  if (session) {
    slot.innerHTML = `
      <button class="user-chip-btn" id="open-profile" type="button">
        <span class="avatar-mini">${avatarMarkup(session)}</span>
        <span class="user-chip">Olá, ${escapeHtml(session.nome.split(' ')[0])}</span>
      </button>
      <button class="btn btn-ghost btn-sm" id="open-usina-btn" type="button">Minha usina</button>
      <button class="btn btn-ghost" id="logout-btn">Sair</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      window.location.reload();
    });
    document.getElementById('open-profile').addEventListener('click', openProfileModal);
    document.getElementById('open-usina-btn').addEventListener('click', openUsinaModal);
  }
}

/* ---------------- Modal "Meu perfil" ---------------- */
function initProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('profile-close');
  const form = document.getElementById('profile-form');
  const fotoInput = document.getElementById('profile-foto');
  const preview = document.getElementById('avatar-preview');
  const msg = document.getElementById('profile-msg');

  let pendingFoto; // undefined = foto não alterada durante esta abertura do modal

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = 'form-msg show ' + type;
  }

  function open() {
    const session = Auth.getSession();
    if (!session) return;

    document.getElementById('profile-nome').value = session.nome || '';
    document.getElementById('profile-email').value = session.email || '';
    document.getElementById('profile-telefone').value = session.telefone || '';
    document.getElementById('profile-endereco').value = session.endereco || '';
    preview.innerHTML = avatarMarkup(session);

    pendingFoto = undefined;
    msg.className = 'form-msg';
    msg.textContent = '';

    modal.classList.add('open');
  }

  function close() {
    modal.classList.remove('open');
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  fotoInput.addEventListener('change', () => {
    const file = fotoInput.files && fotoInput.files[0];
    if (!file) return;
    resizePhoto(file, (dataUrl) => {
      pendingFoto = dataUrl;
      preview.innerHTML = `<img src="${dataUrl}" alt="Pré-visualização da foto">`;
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const session = Auth.getSession();
    if (!session) return;

    const updates = {
      nome: document.getElementById('profile-nome').value.trim(),
      telefone: document.getElementById('profile-telefone').value.trim(),
      endereco: document.getElementById('profile-endereco').value.trim()
    };
    if (pendingFoto !== undefined) updates.foto = pendingFoto;

    if (!updates.nome) {
      showMsg('Informe seu nome completo.', 'error');
      return;
    }

    const result = Auth.updateProfile(session.email, updates);
    if (!result.ok) {
      showMsg(result.message, 'error');
      return;
    }

    showMsg('Perfil atualizado com sucesso!', 'success');
    initAuthState(); // atualiza avatar/nome no cabeçalho
    setTimeout(close, 900);
  });

  // Expõe só o "abrir", usado pelo clique no avatar do cabeçalho.
  ProfileModal.open = open;
}

const ProfileModal = { open: () => {} };
function openProfileModal() {
  ProfileModal.open();
}

/* ---------------- Galeria (placeholder) ---------------- */
function initGallery() {
  // Espaço reservado para trocar os blocos de cor por <img> reais dos projetos da Sanon.
}

/* ---------------- Calculadora de orçamento ---------------- */
function initCalculator() {
  const form = document.getElementById('quote-form');
  if (!form) return;

  const modeButtons = document.querySelectorAll('.mode-toggle button');
  const fieldConsumo = document.getElementById('field-consumo');
  const fieldConta = document.getElementById('field-conta');
  let mode = 'consumo';

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.toggle('active', b === btn));
      fieldConsumo.style.display = mode === 'consumo' ? 'block' : 'none';
      fieldConta.style.display = mode === 'conta' ? 'block' : 'none';
    });
  });

  const resultBox = document.getElementById('quote-result-box');
  const placeholder = document.getElementById('result-placeholder');
  const loginGate = document.getElementById('login-gate');
  const ctaBtn = document.getElementById('quote-cta');

  const ufSelect = document.getElementById('input-uf');
  const parcelasSelect = document.getElementById('input-parcelas');
  const parcelaRow = document.getElementById('result-parcela-row');
  const chartWrap = document.getElementById('savings-chart-wrap');

  let lastEstimate = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    let kwhMensal;
    if (mode === 'consumo') {
      kwhMensal = parseFloat(document.getElementById('input-consumo').value);
    } else {
      const valorConta = parseFloat(document.getElementById('input-conta').value);
      kwhMensal = valorConta / TARIFA_MEDIA_KWH;
    }

    if (!kwhMensal || kwhMensal <= 0) {
      placeholder.style.display = 'block';
      placeholder.textContent = 'Informe um valor válido para calcularmos sua estimativa.';
      resultBox.style.display = 'none';
      return;
    }

    const uf = ufSelect ? ufSelect.value : 'SP';
    const fatorRegional = FATOR_IRRADIACAO_UF[uf] || 1;
    const geracaoAjustada = GERACAO_MENSAL_POR_KWP * fatorRegional;

    const kwpNecessario = kwhMensal / geracaoAjustada;
    const precoEstimado = kwpNecessario * PRECO_POR_WP * 1000; // PRECO_POR_WP é por Wp, então x1000 para kWp
    const parcelas = parseInt(parcelasSelect ? parcelasSelect.value : '1', 10);

    lastEstimate = { kwhMensal, kwpNecessario, precoEstimado, parcelas };
    renderResult(lastEstimate);
  });

  function renderResult({ kwhMensal, kwpNecessario, precoEstimado, parcelas }) {
    placeholder.style.display = 'none';
    resultBox.style.display = 'block';

    document.getElementById('result-price').textContent =
      precoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    document.getElementById('result-kwp').innerHTML = `<b>${kwpNecessario.toFixed(2)} kWp</b>`;
    document.getElementById('result-kwh').innerHTML = `<b>${Math.round(kwhMensal)} kWh/mês</b>`;
    document.getElementById('result-payback').innerHTML = `<b>~ ${estimatePayback(kwhMensal, precoEstimado)} anos</b>`;

    if (parcelas > 1) {
      const parcela = calcularParcela(precoEstimado, parcelas);
      document.getElementById('result-parcela').innerHTML = `<b>${parcelas}x de ${parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</b>`;
      parcelaRow.style.display = 'flex';
    } else {
      parcelaRow.style.display = 'none';
    }

    desenharGraficoEconomia(kwhMensal, precoEstimado);
  }

  function estimatePayback(kwhMensal, preco) {
    const economiaMensal = kwhMensal * TARIFA_MEDIA_KWH * 0.9; // ~90% de economia média na conta
    const economiaAnual = economiaMensal * 12;
    if (economiaAnual <= 0) return '—';
    return (preco / economiaAnual).toFixed(1);
  }

  // Simula o valor da parcela de um financiamento (tabela Price) com a taxa de
  // referência definida em TAXA_JUROS_FINANCIAMENTO.
  function calcularParcela(valorFinanciado, numParcelas) {
    const i = TAXA_JUROS_FINANCIAMENTO;
    if (numParcelas <= 1) return valorFinanciado;
    return valorFinanciado * (i / (1 - Math.pow(1 + i, -numParcelas)));
  }

  // Desenha, em um <canvas>, a comparação entre o gasto acumulado em 25 anos
  // pagando conta de luz "cheia" versus tendo o sistema fotovoltaico instalado
  // (investimento inicial + conta residual), considerando reajuste anual da tarifa.
  function desenharGraficoEconomia(kwhMensal, precoEstimado) {
    const canvas = document.getElementById('savings-chart');
    if (!canvas) return;
    chartWrap.style.display = 'block';

    const anos = 25;
    const semSolar = [];
    const comSolar = [];
    let acumSem = 0;
    let acumCom = precoEstimado; // investimento inicial já entra no ano 0
    for (let ano = 1; ano <= anos; ano++) {
      const tarifaAjustada = Math.pow(1 + REAJUSTE_TARIFA_ANUAL, ano - 1);
      const contaAnualCheia = kwhMensal * TARIFA_MEDIA_KWH * tarifaAjustada * 12;
      const contaAnualResidual = contaAnualCheia * 0.10; // ~10% da conta continua existindo (taxa mínima etc.)
      acumSem += contaAnualCheia;
      acumCom += contaAnualResidual;
      semSolar.push(acumSem);
      comSolar.push(acumCom);
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const padding = { top: 16, right: 16, bottom: 22, left: 16 };
    const maxVal = Math.max(semSolar[anos - 1], comSolar[anos - 1]);

    ctx.clearRect(0, 0, w, h);

    function xFor(i) { return padding.left + (i / (anos - 1)) * (w - padding.left - padding.right); }
    function yFor(v) { return h - padding.bottom - (v / maxVal) * (h - padding.top - padding.bottom); }

    // Linhas de grade horizontais discretas
    ctx.strokeStyle = 'rgba(246,243,238,0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padding.top + (g / 4) * (h - padding.top - padding.bottom);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    function desenharLinha(dados, cor) {
      ctx.beginPath();
      dados.forEach((v, i) => {
        const x = xFor(i), y = yFor(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    desenharLinha(semSolar, 'rgba(246,243,238,0.55)');
    desenharLinha(comSolar, '#ff8a34');

    const economiaTotal = semSolar[anos - 1] - comSolar[anos - 1];
    const summaryEl = document.getElementById('savings-summary');
    if (summaryEl) {
      summaryEl.textContent = economiaTotal > 0
        ? `Em 25 anos, a economia estimada é de ${economiaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}, considerando reajuste médio de 8% ao ano na tarifa de energia.`
        : 'Informe um consumo maior para ver a projeção de economia em 25 anos.';
    }
  }

  ctaBtn.addEventListener('click', () => {
    if (!lastEstimate) {
      placeholder.style.display = 'block';
      placeholder.textContent = 'Calcule sua estimativa acima antes de solicitar o orçamento.';
      return;
    }

    if (!Auth.isLoggedIn()) {
      loginGate.style.display = 'block';
      loginGate.querySelector('a').href = `Login.html?next=${encodeURIComponent('index.html#orcamento')}`;
      return;
    }

    loginGate.style.display = 'none';
    const { kwpNecessario, precoEstimado, parcelas } = lastEstimate;
    const session = Auth.getSession();
    const enderecoTexto = session.endereco ? ` Meu endereço: ${session.endereco}.` : '';
    const parcelaTexto = parcelas > 1 ? ` Tenho interesse em financiar em ${parcelas}x.` : '';
    const texto = `Olá, Sanon! Meu nome é ${session.nome}. Simulei um sistema fotovoltaico de aproximadamente ${kwpNecessario.toFixed(2)} kWp, com investimento estimado de ${precoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}.${parcelaTexto}${enderecoTexto} Gostaria de solicitar um orçamento detalhado para instalação.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
  });
}