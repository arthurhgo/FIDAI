(() => {
  'use strict';

  const SUPABASE_URL = 'https://wtuyxbmvmovdxkfvyhnl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_f97dIrOYA6-X6_tlNievGQ_Z0-HwoKp';
  const ADMIN_EMAILS = ['arthurhgregorio@gmail.com', 'engenhariapalmer@gmail.com'];
  const PRODUCTS = {
    1: { name: 'Essential Black', type: 'Camisa oversized', price: 129 },
    2: { name: 'Essential Off-White', type: 'Camisa oversized', price: 139 },
    3: { name: 'Essential Graphite', type: 'Camisa oversized', price: 149 },
    4: { name: 'Training Black', type: 'Regata training', price: 119 },
    5: { name: 'Training White', type: 'Regata training', price: 119 },
    6: { name: 'Training Graphite', type: 'Regata training', price: 129 },
    7: { name: 'Crewneck Black', type: 'Moletom crewneck', price: 239 },
    8: { name: 'Crewneck White', type: 'Moletom crewneck', price: 239 },
    9: { name: 'Crewneck Graphite', type: 'Moletom crewneck', price: 249 }
  };
  const STATUS = {
    payment_reported: 'Pagamento informado',
    payment_confirmed: 'Pagamento confirmado',
    preparing: 'Em produção',
    shipped: 'Enviado',
    completed: 'Concluído',
    cancelled: 'Cancelado'
  };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  let checkoutDraft = null;
  let orderSending = false;

  function session() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        const current = value?.currentSession || value;
        if (current?.access_token && current?.user) return current;
      } catch (_) {}
    }
    return null;
  }

  function headers(prefer) {
    const active = session();
    return {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${active?.access_token || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers(options.prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || data?.details || `Erro ${response.status}`);
    return data;
  }

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem('fidai-cart') || '[]');
      return cart.map((item) => {
        const product = PRODUCTS[item.productId];
        if (!product) return null;
        const quantity = Number(item.quantity) || 1;
        return {
          product_id: item.productId,
          product_name: product.name,
          product_type: product.type,
          size: item.size || 'M',
          print_id: item.printId || 'sem-estampa',
          print_name: item.printId === 'sem-estampa' ? 'Sem estampa' : String(item.printId || 'Estampa'),
          quantity,
          unit_price: product.price,
          line_total: product.price * quantity
        };
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function captureCheckout(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const button = form.querySelector('button[type="submit"]');
    if (!button || !/gerar pedido pix/i.test(button.textContent || '')) return;
    const inputs = [...form.querySelectorAll('input')];
    checkoutDraft = {
      customer_name: inputs.find((input) => /seu nome/i.test(input.placeholder || ''))?.value.trim() || '',
      customer_email: inputs.find((input) => input.type === 'email')?.value.trim().toLowerCase() || '',
      postal_code: inputs.find((input) => /00000-000/i.test(input.placeholder || ''))?.value.trim() || '',
      address: inputs.find((input) => /rua, número/i.test(input.placeholder || ''))?.value.trim() || ''
    };
  }

  async function reportPayment(button) {
    if (orderSending) return;
    const items = readCart();
    if (!checkoutDraft || !items.length) {
      alert('Não foi possível recuperar os dados do checkout. Volte ao carrinho e gere o pedido novamente.');
      return;
    }
    orderSending = true;
    button.disabled = true;
    button.textContent = 'Enviando pedido...';
    try {
      const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
      const active = session();
      const payload = {
        user_id: active?.user?.id || null,
        ...checkoutDraft,
        items,
        subtotal,
        humanitarian_amount: subtotal * 0.2,
        payment_method: 'pix',
        payment_status: 'reported',
        status: 'payment_reported',
        payment_reported_at: new Date().toISOString()
      };
      const rows = await request('orders?select=id,created_at', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify(payload)
      });
      const id = String(rows?.[0]?.id || '').slice(0, 8).toUpperCase();
      localStorage.removeItem('fidai-cart');
      button.outerHTML = `<div class="fidai-order-success"><span>PEDIDO ENVIADO</span><strong>#${id}</strong><p>O pagamento foi informado. A FIDAI fará a confirmação do PIX.</p></div>`;
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Já paguei — enviar pedido';
      alert(`Não foi possível enviar o pedido: ${error.message}`);
    } finally {
      orderSending = false;
    }
  }

  function enhancePixPanel() {
    const keyLabel = [...document.querySelectorAll('span')].find((el) => (el.textContent || '').trim() === 'Chave PIX');
    const panel = keyLabel?.closest('section, div[class*="checkout"], div[class*="cart"]');
    if (!panel || panel.querySelector('.fidai-pix-paid')) return;
    const copyButton = [...panel.querySelectorAll('button')].find((el) => /copiar chave pix/i.test(el.textContent || ''));
    if (!copyButton) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fidai-pix-paid';
    button.textContent = 'Já paguei — enviar pedido';
    button.addEventListener('click', () => reportPayment(button));
    copyButton.insertAdjacentElement('afterend', button);
  }

  function isAdmin() {
    const email = session()?.user?.email?.toLowerCase();
    return Boolean(email && ADMIN_EMAILS.includes(email));
  }

  function enhanceAccountPanel() {
    if (!isAdmin()) return;
    const catalogButton = [...document.querySelectorAll('button')].find((el) => /gerenciar estampas/i.test(el.textContent || ''));
    if (!catalogButton || catalogButton.parentElement?.querySelector('.fidai-orders-admin-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${catalogButton.className} fidai-orders-admin-button`;
    button.innerHTML = 'Gerenciar pedidos <span>→</span>';
    button.addEventListener('click', openOrders);
    catalogButton.insertAdjacentElement('beforebegin', button);
  }

  async function updateStatus(id, status, select) {
    select.disabled = true;
    const payload = { status, updated_at: new Date().toISOString() };
    if (status === 'payment_confirmed') {
      payload.payment_status = 'confirmed';
      payload.payment_confirmed_at = new Date().toISOString();
    }
    if (status === 'cancelled') payload.payment_status = 'rejected';
    try {
      await request(`orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(payload)
      });
      select.closest('.fidai-order-card').dataset.status = status;
    } catch (error) {
      alert(`Não foi possível atualizar o pedido: ${error.message}`);
      await loadOrders();
    } finally {
      select.disabled = false;
    }
  }

  function orderCard(order) {
    const card = document.createElement('article');
    card.className = 'fidai-order-card';
    card.dataset.status = order.status;
    const items = Array.isArray(order.items) ? order.items : [];
    card.innerHTML = `
      <header><div><span>PEDIDO #${String(order.id).slice(0, 8).toUpperCase()}</span><h3>${escapeHtml(order.customer_name)}</h3><small>${new Date(order.created_at).toLocaleString('pt-BR')}</small></div><b>${STATUS[order.status] || order.status}</b></header>
      <div class="fidai-order-grid"><div><span>CLIENTE</span><strong>${escapeHtml(order.customer_email)}</strong><p>${escapeHtml(order.postal_code)} · ${escapeHtml(order.address)}</p></div><div><span>PAGAMENTO</span><strong>${order.payment_status === 'confirmed' ? 'PIX confirmado' : 'PIX informado'}</strong><p>Total: ${money.format(Number(order.subtotal) || 0)}<br>Impacto: ${money.format(Number(order.humanitarian_amount) || 0)}</p></div></div>
      <div class="fidai-order-items">${items.map((item) => `<div><span>${item.quantity || 1}× ${escapeHtml(item.product_name || 'Produto')} · ${escapeHtml(item.size || '')}</span><small>${escapeHtml(item.print_name || 'Sem estampa')} · ${money.format(Number(item.line_total || item.unit_price) || 0)}</small></div>`).join('')}</div>
      <label>Atualizar andamento<select>${Object.entries(STATUS).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    card.querySelector('select').addEventListener('change', (event) => updateStatus(order.id, event.target.value, event.target));
    return card;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  async function loadOrders() {
    const list = document.querySelector('.fidai-orders-list');
    if (!list) return;
    list.innerHTML = '<p>Carregando pedidos...</p>';
    try {
      const orders = await request('orders?select=*&order=created_at.desc');
      list.innerHTML = '';
      if (!orders.length) list.innerHTML = '<p>Nenhum pedido recebido.</p>';
      orders.forEach((order) => list.appendChild(orderCard(order)));
    } catch (error) {
      list.innerHTML = `<p>Erro ao carregar pedidos: ${escapeHtml(error.message)}</p>`;
    }
  }

  function openOrders() {
    document.querySelector('.fidai-orders-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'fidai-orders-overlay';
    overlay.innerHTML = `<section class="fidai-orders-panel"><header class="fidai-orders-head"><div><span>FIDAI / PROPRIETÁRIOS</span><h2>Pedidos PIX</h2><p>Pedidos enviados após o cliente informar o pagamento.</p></div><button type="button" aria-label="Fechar">×</button></header><div class="fidai-orders-actions"><button type="button">Atualizar</button></div><div class="fidai-orders-list"></div></section>`;
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) overlay.remove(); });
    overlay.querySelector('.fidai-orders-head button').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.fidai-orders-actions button').addEventListener('click', loadOrders);
    document.body.appendChild(overlay);
    loadOrders();
  }

  const style = document.createElement('style');
  style.textContent = `
    .fidai-pix-paid{width:100%;margin-top:12px;padding:15px 18px;border:1px solid #111;background:#111;color:#fff;font:600 12px Geist,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.fidai-pix-paid:disabled{opacity:.6}.fidai-order-success{margin-top:14px;border:1px solid #111;padding:18px;background:#f3f3ef}.fidai-order-success span{display:block;font-size:10px;letter-spacing:.14em}.fidai-order-success strong{display:block;font-size:24px;margin:8px 0}.fidai-orders-admin-button{margin-bottom:10px}.fidai-orders-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:20px}.fidai-orders-panel{width:min(1180px,96vw);max-height:94vh;overflow:auto;background:#f7f7f3;color:#111}.fidai-orders-head{display:flex;justify-content:space-between;gap:20px;padding:25px 28px;border-bottom:1px solid #ccc}.fidai-orders-head span{font-size:10px;letter-spacing:.14em}.fidai-orders-head h2{font-size:32px;margin:5px 0}.fidai-orders-head p{font-size:13px}.fidai-orders-head button{border:0;background:none;font-size:32px;cursor:pointer}.fidai-orders-actions{padding:14px 28px;border-bottom:1px solid #ddd}.fidai-orders-actions button{border:1px solid #111;background:#111;color:#fff;padding:10px 15px;cursor:pointer}.fidai-orders-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:24px 28px}.fidai-order-card{border:1px solid #ccc;background:#fff;padding:20px;display:flex;flex-direction:column;gap:16px}.fidai-order-card>header{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #ddd;padding-bottom:14px}.fidai-order-card header span,.fidai-order-grid span{display:block;font-size:9px;letter-spacing:.13em}.fidai-order-card h3{margin:4px 0;font-size:20px}.fidai-order-card header b{font-size:10px;text-transform:uppercase;border:1px solid;padding:8px;height:max-content}.fidai-order-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fidai-order-grid>div{background:#f4f4f0;padding:12px;min-width:0}.fidai-order-grid strong{font-size:12px;overflow-wrap:anywhere}.fidai-order-grid p{font-size:11px;line-height:1.5;margin-top:6px}.fidai-order-items>div{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #ddd;font-size:12px}.fidai-order-card>label{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.fidai-order-card select{padding:10px;border:1px solid #111;background:#fff}@media(max-width:780px){.fidai-orders-list{grid-template-columns:1fr;padding:16px}.fidai-order-grid{grid-template-columns:1fr}.fidai-order-card>label{align-items:stretch;flex-direction:column}.fidai-order-card select{width:100%}}`;
  document.head.appendChild(style);
  document.addEventListener('submit', captureCheckout, true);
  const observer = new MutationObserver(() => { enhancePixPanel(); enhanceAccountPanel(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhancePixPanel();
  enhanceAccountPanel();
})();
