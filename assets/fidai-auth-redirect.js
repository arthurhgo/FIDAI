(() => {
  'use strict';

  const SUPABASE_URL = 'https://wtuyxbmvmovdxkfvyhnl.supabase.co';
  const APP_URL = 'https://arthurhgo.github.io/FIDAI/';

  function isGoogleLoginControl(element) {
    if (!element) return false;
    const text = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title')
    ].filter(Boolean).join(' ').toLowerCase();

    return /google/.test(text) && /(entrar|continuar|login|acessar|conectar|cadastrar|criar conta|sign in|sign up)/i.test(text);
  }

  function startGoogleLogin() {
    const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authorizeUrl.searchParams.set('provider', 'google');
    authorizeUrl.searchParams.set('redirect_to', APP_URL);
    window.location.assign(authorizeUrl.toString());
  }

  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, a, [role="button"]');
    if (!isGoogleLoginControl(control)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    startGoogleLogin();
  }, true);

  // Mantém o caminho correto depois de callbacks de autenticação ou recuperação.
  if (window.location.hostname === 'arthurhgo.github.io'
      && window.location.pathname !== '/FIDAI/'
      && (window.location.hash.includes('access_token=')
          || window.location.hash.includes('type=recovery')
          || window.location.search.includes('code='))) {
    window.location.replace(`${APP_URL}${window.location.search}${window.location.hash}`);
  }
})();
