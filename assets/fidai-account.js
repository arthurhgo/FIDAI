(() => {
  'use strict';

  const SUPABASE_URL = 'https://wtuyxbmvmovdxkfvyhnl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_f97dIrOYA6-X6_tlNievGQ_Z0-HwoKp';
  const RECOVERY_QUERY = 'account=recovery';
  const RECOVERY_REDIRECT = `${window.location.origin}${window.location.pathname}?${RECOVERY_QUERY}`;
  const RECOVERY_TOKEN_KEY = 'fidai-password-recovery-token';
  const RECOVERY_FLAG_KEY = 'fidai-password-recovery-pending';
  const MIN_PASSWORD_LENGTH = 8;

  let managerOpening = false;
  let lastSessionEmail = '';

  function parseJson(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }

  function storedSession() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;

      const stored = parseJson(localStorage.getItem(key));
      const current = stored?.currentSession || stored?.session || stored;
      if (current?.access_token && current?.user) return current;
    }

    return null;
  }

  function recoveryParams() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const search = new URLSearchParams(window.location.search);
    return {
      accessToken: hash.get('access_token') || '',
      type: hash.get('type') || search.get('type') || '',
      error: hash.get('error_description') || search.get('error_description') || '',
      requested: search.get('account') === 'recovery'
    };
  }

  function captureRecoveryState() {
    const params = recoveryParams();

    if (params.accessToken && params.type === 'recovery') {
      sessionStorage.setItem(RECOVERY_TOKEN_KEY, params.accessToken);
      sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
    }

    if (params.requested || params.type === 'recovery') {
      sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
    }

    return params;
  }

  function activeAccessToken() {
    return sessionStorage.getItem(RECOVERY_TOKEN_KEY) || storedSession()?.access_token || '';
  }

  function activeUser() {
    return storedSession()?.user || null;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]);
  }

  async function authRequest(path, options = {}) {
    const { token, headers: customHeaders, ...requestOptions } = options;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      ...requestOptions,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(customHeaders || {})
      }
    });

    const text = await response.text();
    const data = parseJson(text) ?? text;

    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || `Erro ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function recoveryUrl() {
    return RECOVERY_REDIRECT;
  }

  async function sendRecoveryEmail(email, button, status) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      statusMessage(status, 'Informe um e-mail válido.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Enviando...';
    statusMessage(status, '', '');

    try {
      const redirectTo = encodeURIComponent(recoveryUrl());
      await authRequest(`recover?redirect_to=${redirectTo}`, {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail })
      });
      statusMessage(status, 'E-mail enviado. Abra o link “Reset password” para definir a nova senha.', 'success');
      button.textContent = 'E-mail enviado';
    } catch (error) {
      statusMessage(status, `Não foi possível enviar o e-mail: ${error.message}`, 'error');
      button.textContent = 'Enviar link de redefinição';
    } finally {
      button.disabled = false;
    }
  }

  function validatePassword(password, confirmation) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (password !== confirmation) return 'As senhas não coincidem.';
    return '';
  }

  async function updatePassword(password, confirmation, button, status) {
    const validation = validatePassword(password, confirmation);
    if (validation) {
      statusMessage(status, validation, 'error');
      return;
    }

    const token = activeAccessToken();
    if (!token) {
      statusMessage(status, 'O link expirou ou a sessão não foi reconhecida. Solicite um novo e-mail.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Salvando...';
    statusMessage(status, '', '');

    try {
      await authRequest('user', {
        method: 'PUT',
        token,
        body: JSON.stringify({ password })
      });

      sessionStorage.removeItem(RECOVERY_TOKEN_KEY);
      sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      cleanRecoveryUrl();
      statusMessage(status, 'Senha atualizada com sucesso. Sua conta já pode ser usada normalmente.', 'success');
      button.textContent = 'Senha atualizada';
      button.closest('form')?.reset();
    } catch (error) {
      statusMessage(status, `Não foi possível alterar a senha: ${error.message}`, 'error');
      button.textContent = 'Salvar nova senha';
    } finally {
      button.disabled = false;
    }
  }

  function cleanRecoveryUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('account');
    url.searchParams.delete('type');
    url.searchParams.delete('error_description');
    url.hash = '';
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  }

  function statusMessage(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type || '';
    element.hidden = !message;
  }

  function passwordForm(title, description) {
    return `
      <form class="fidai-password-form">
        <div class="fidai-account-section-heading">
          <span>SEGURANÇA</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <label>
          <span>Nova senha</span>
          <div class="fidai-password-field">
            <input name="password" type="password" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" required placeholder="Mínimo de ${MIN_PASSWORD_LENGTH} caracteres">
            <button type="button" data-password-toggle>Mostrar</button>
          </div>
        </label>
        <label>
          <span>Confirmar nova senha</span>
          <div class="fidai-password-field">
            <input name="confirmation" type="password" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" required placeholder="Repita a nova senha">
            <button type="button" data-password-toggle>Mostrar</button>
          </div>
        </label>
        <div class="fidai-password-strength"><i></i><i></i><i></i><i></i><span>Use letras, números e símbolos.</span></div>
        <p class="fidai-account-status" hidden></p>
        <button class="fidai-account-primary" type="submit">Salvar nova senha</button>
      </form>
    `;
  }

  function bindPasswordForm(root) {
    const form = root.querySelector('.fidai-password-form');
    if (!form) return;

    const password = form.elements.password;
    const confirmation = form.elements.confirmation;
    const status = form.querySelector('.fidai-account-status');
    const submit = form.querySelector('.fidai-account-primary');

    form.querySelectorAll('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = button.parentElement.querySelector('input');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.textContent = showing ? 'Mostrar' : 'Ocultar';
      });
    });

    password.addEventListener('input', () => updateStrength(form, password.value));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      updatePassword(password.value, confirmation.value, submit, status);
    });
  }

  function updateStrength(form, password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

    form.querySelectorAll('.fidai-password-strength i').forEach((bar, index) => {
      bar.classList.toggle('active', index < score);
    });
  }

  function openAccountManager(options = {}) {
    if (managerOpening) return;
    managerOpening = true;

    document.querySelector('.fidai-account-overlay')?.remove();

    const user = activeUser();
    const recovery = Boolean(options.recovery);
    const email = user?.email || lastSessionEmail || '';
    const provider = user?.app_metadata?.provider || 'email';
    const overlay = document.createElement('div');
    overlay.className = 'fidai-account-overlay';
    overlay.innerHTML = `
      <section class="fidai-account-panel" role="dialog" aria-modal="true" aria-label="Gerenciador de conta">
        <header class="fidai-account-head">
          <div>
            <span>FIDAI / CONTA</span>
            <h2>${recovery ? 'Crie uma nova senha' : 'Gerenciador de conta'}</h2>
            <p>${recovery ? 'Você acessou a FIDAI pelo link seguro enviado por e-mail.' : 'Consulte sua conta e mantenha seus dados de acesso protegidos.'}</p>
          </div>
          <button type="button" data-account-close aria-label="Fechar">×</button>
        </header>
        <div class="fidai-account-body">
          ${recovery ? '' : `
            <section class="fidai-account-profile">
              <div class="fidai-account-avatar">${escapeHtml((email[0] || 'F').toUpperCase())}</div>
              <div><span>CONTA ATIVA</span><strong>${escapeHtml(email || 'Usuário FIDAI')}</strong><p>Acesso por ${escapeHtml(provider === 'google' ? 'Google' : 'e-mail e senha')}.</p></div>
            </section>
          `}
          ${passwordForm(
            recovery ? 'Defina sua nova senha' : 'Alterar senha',
            recovery ? 'Digite a nova senha duas vezes para concluir a recuperação.' : 'A nova senha será aplicada imediatamente à sua conta.'
          )}
          ${recovery ? '' : `
            <section class="fidai-recovery-email">
              <div class="fidai-account-section-heading"><span>RECUPERAÇÃO</span><h3>Receber link por e-mail</h3><p>Use esta opção quando preferir redefinir a senha pelo e-mail cadastrado.</p></div>
              <div class="fidai-recovery-row"><input type="email" value="${escapeHtml(email)}" readonly><button type="button">Enviar link de redefinição</button></div>
              <p class="fidai-account-status" hidden></p>
            </section>
          `}
        </div>
      </section>
    `;

    const close = () => {
      overlay.remove();
      managerOpening = false;
    };

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay && !recovery) close();
    });
    overlay.querySelector('[data-account-close]').addEventListener('click', close);
    document.body.appendChild(overlay);
    bindPasswordForm(overlay);

    if (!recovery) {
      const recoverySection = overlay.querySelector('.fidai-recovery-email');
      const button = recoverySection.querySelector('button');
      const status = recoverySection.querySelector('.fidai-account-status');
      button.addEventListener('click', () => sendRecoveryEmail(email, button, status));
    }

    managerOpening = false;
  }

  function findLoggedAccountPanel() {
    const session = storedSession();
    if (!session?.user?.email) return null;
    lastSessionEmail = session.user.email;

    const logout = [...document.querySelectorAll('button, a')]
      .find((element) => /^(sair|encerrar sess[aã]o|logout)$/i.test((element.textContent || '').trim()));

    if (logout) {
      let current = logout.parentElement;
      for (let level = 0; current && level < 6; level += 1, current = current.parentElement) {
        const text = current.textContent || '';
        if (text.includes(session.user.email) || /minha conta|conta|perfil/i.test(text)) return current;
      }
      return logout.parentElement;
    }

    const emailElement = [...document.querySelectorAll('p, span, strong, small')]
      .find((element) => (element.textContent || '').trim().toLowerCase() === session.user.email.toLowerCase());
    return emailElement?.parentElement || null;
  }

  function enhanceLoggedAccountPanel() {
    const panel = findLoggedAccountPanel();
    if (!panel || panel.querySelector('.fidai-account-manager-entry')) return;

    const logout = [...panel.querySelectorAll('button, a')]
      .find((element) => /^(sair|encerrar sess[aã]o|logout)$/i.test((element.textContent || '').trim()));

    const entry = document.createElement('section');
    entry.className = 'fidai-account-manager-entry';
    entry.innerHTML = `
      <div><span>MINHA CONTA</span><strong>Dados e segurança</strong></div>
      <button type="button"><span>Gerenciar conta</span><span aria-hidden="true">→</span></button>
    `;
    entry.querySelector('button').addEventListener('click', () => openAccountManager());

    if (logout) panel.insertBefore(entry, logout);
    else panel.appendChild(entry);
  }

  function handleRecoveryEntry() {
    const params = captureRecoveryState();
    const recoveryPending = sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1';

    if (params.error) {
      window.setTimeout(() => {
        alert(`O link de recuperação não pôde ser usado: ${params.error}`);
      }, 200);
      return;
    }

    if (!recoveryPending) return;

    let attempts = 0;
    const openWhenReady = () => {
      attempts += 1;
      if (activeAccessToken()) {
        openAccountManager({ recovery: true });
        return;
      }
      if (attempts < 40) window.setTimeout(openWhenReady, 250);
      else {
        sessionStorage.removeItem(RECOVERY_FLAG_KEY);
        alert('O link de recuperação expirou ou não foi reconhecido. Solicite um novo e-mail.');
      }
    };

    window.setTimeout(openWhenReady, 100);
  }

  const style = document.createElement('style');
  style.textContent = `
    .fidai-account-manager-entry{margin:12px 0;padding:13px 0;border-top:1px solid rgba(0,0,0,.14);border-bottom:1px solid rgba(0,0,0,.14);display:grid;gap:9px}.fidai-account-manager-entry>div{display:flex;justify-content:space-between;align-items:end;gap:12px}.fidai-account-manager-entry>div span{font-size:8px;letter-spacing:.15em;color:#777}.fidai-account-manager-entry>div strong{font-size:10px;font-weight:500}.fidai-account-manager-entry>button{width:100%;display:flex;justify-content:space-between;align-items:center;border:1px solid #111;background:#111;color:#fff;padding:12px 14px;font:600 9px Geist,sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.fidai-account-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.76);display:grid;place-items:center;padding:18px}.fidai-account-panel{width:min(680px,96vw);max-height:94vh;overflow:auto;background:#f7f7f3;color:#111;box-shadow:0 30px 90px rgba(0,0,0,.3)}.fidai-account-head{display:flex;justify-content:space-between;gap:20px;padding:24px 28px;border-bottom:1px solid #cfcfc9}.fidai-account-head>div>span,.fidai-account-section-heading>span,.fidai-account-profile span{font-size:8px;letter-spacing:.16em;color:#707069}.fidai-account-head h2{font-size:31px;line-height:1;margin:7px 0}.fidai-account-head p,.fidai-account-section-heading p{font-size:11px;line-height:1.55;color:#65655f}.fidai-account-head>button{border:0;background:none;font-size:31px;line-height:1;cursor:pointer}.fidai-account-body{display:grid;gap:0}.fidai-account-profile{display:flex;align-items:center;gap:14px;padding:20px 28px;border-bottom:1px solid #d3d3cd;background:#ecece7}.fidai-account-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#111;color:#fff;font-size:18px}.fidai-account-profile strong{display:block;margin:4px 0;font-size:13px}.fidai-account-profile p{font-size:10px;color:#6c6c66}.fidai-password-form,.fidai-recovery-email{display:grid;gap:14px;padding:24px 28px}.fidai-recovery-email{border-top:1px solid #d3d3cd;background:#ecece7}.fidai-account-section-heading h3{font-size:20px;margin:5px 0}.fidai-password-form label{display:grid;gap:6px}.fidai-password-form label>span{font-size:9px;letter-spacing:.1em;text-transform:uppercase}.fidai-password-field{display:grid;grid-template-columns:1fr auto;border:1px solid #aaa;background:#fff}.fidai-password-field input{min-width:0;border:0;background:transparent;padding:13px 12px;font:400 12px Geist,sans-serif;outline:none}.fidai-password-field button{border:0;border-left:1px solid #ccc;background:transparent;padding:0 12px;font:600 8px Geist,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.fidai-password-strength{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;align-items:center}.fidai-password-strength i{height:3px;background:#d1d1cb}.fidai-password-strength i.active{background:#111}.fidai-password-strength span{grid-column:1/-1;font-size:9px;color:#777}.fidai-account-primary{border:1px solid #111;background:#111;color:#fff;padding:14px;font:600 10px Geist,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.fidai-account-primary:disabled,.fidai-recovery-row button:disabled{opacity:.55;cursor:wait}.fidai-recovery-row{display:grid;grid-template-columns:1fr auto;gap:8px}.fidai-recovery-row input,.fidai-recovery-row button{min-width:0;border:1px solid #aaa;background:#fff;padding:12px;font:500 10px Geist,sans-serif}.fidai-recovery-row button{border-color:#111;background:#111;color:#fff;cursor:pointer;text-transform:uppercase;letter-spacing:.06em}.fidai-account-status{font-size:10px;line-height:1.5;padding:10px;border:1px solid #aaa;background:#fff}.fidai-account-status[data-type="success"]{border-color:#1b6e3d;background:#edf8f1;color:#174f30}.fidai-account-status[data-type="error"]{border-color:#a32d2d;background:#fff0f0;color:#7d1f1f}.fidai-account-status[hidden]{display:none}@media(max-width:560px){.fidai-account-overlay{padding:0}.fidai-account-panel{width:100vw;height:100vh;max-height:100vh}.fidai-account-head,.fidai-password-form,.fidai-recovery-email{padding:20px}.fidai-account-profile{padding:17px 20px}.fidai-recovery-row{grid-template-columns:1fr}.fidai-account-head h2{font-size:27px}}
  `;

  document.head.appendChild(style);
  captureRecoveryState();

  const observer = new MutationObserver(enhanceLoggedAccountPanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceLoggedAccountPanel();
  handleRecoveryEntry();
})();
