(() => {
  'use strict';

  const SUPABASE_URL = 'https://wtuyxbmvmovdxkfvyhnl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_f97dIrOYA6-X6_tlNievGQ_Z0-HwoKp';
  const ADMIN_EMAILS = ['arthurhgregorio@gmail.com', 'engenhariapalmer@gmail.com'];
  const CHECKOUT_DRAFT_KEY = 'fidai-checkout-draft';
  const CART_KEY = 'fidai-cart';

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

  const STATUS_GROUPS = {
    waiting: ['payment_reported'],
    active: ['payment_confirmed', 'preparing'],
    shipped: ['shipped'],
    finished: ['completed', 'cancelled']
  };

  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let orderSending = false;
  let allOrders = [];

  function createUuid() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.random() * 16 | 0;
      const value = character === 'x' ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function session() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;

      try {
        const stored = JSON.parse(localStorage.getItem(key));
        const current = stored?.currentSession || stored?.session || stored;
        if (current?.access_token && current?.user) return current;
      } catch (_) {
        // Ignora chaves que não pertençam à sessão do Supabase.
      }
    }

    return null;
  }

  function isAdmin() {
    const email = session()?.user?.email?.trim().toLowerCase();
    return Boolean(email && ADMIN_EMAILS.includes(email));
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

  async function supabaseRequest(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...headers(options.prefer),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }

    if (!response.ok) {
      const message = data?.message || data?.details || data?.hint || `Erro ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function normalizedText(value, maximum = 300) {
    return String(value ?? '').trim().slice(0, maximum);
  }

  function readCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(raw)) return [];

      return raw.map((item) => {
        const productId = Number(item.productId ?? item.product_id ?? item.id);
        const product = PRODUCTS[productId];
        if (!product) return null;

        const quantity = Math.min(20, Math.max(1, Number(item.quantity) || 1));
        const printId = item.printId ?? item.print_id ?? item.print?.id ?? 'sem-estampa';
        const printName = item.printName ?? item.print_name ?? item.print?.name
          ?? (String(printId) === 'sem-estampa' ? 'Sem estampa' : 'Estampa selecionada');

        return {
          product_id: productId,
          product_name: product.name,
          product_type: product.type,
          size: normalizedText(item.size || 'M', 12),
          print_id: normalizedText(printId, 120),
          print_name: normalizedText(printName, 160),
          quantity,
          unit_price: product.price,
          line_total: product.price * quantity
        };
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function readInput(form, matchers, fallback) {
    const inputs = [...form.querySelectorAll('input, textarea')];

    const matched = inputs.find((input) => {
      const label = input.labels?.[0]?.textContent || '';
      const source = [input.name, input.id, input.placeholder, input.autocomplete, label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchers.some((matcher) => matcher.test(source));
    });

    return normalizedText(matched?.value ?? fallback?.(inputs)?.value ?? '', 300);
  }

  function captureCheckout(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const submitButton = event.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
    const submitText = submitButton?.textContent || submitButton?.value || '';
    const formText = `${submitText} ${form.textContent || ''}`;

    if (!/(gerar|finalizar|continuar).{0,30}(pix|pagamento)|(pix|pagamento).{0,30}(gerar|finalizar)/i.test(formText)) {
      return;
    }

    const inputs = [...form.querySelectorAll('input, textarea')];
    const emailFallback = (items) => items.find((input) => input.type === 'email');
    const textInputs = inputs.filter((input) => input.type !== 'email' && input.type !== 'hidden');

    const draft = {
      client_reference: createUuid(),
      customer_name: readInput(form, [/nome/, /name/], () => textInputs[0]),
      customer_email: readInput(form, [/e-?mail/, /email/], emailFallback).toLowerCase(),
      postal_code: readInput(form, [/cep/, /postal/, /00000-000/], () => textInputs.find((input) => /\d{5}/.test(input.value))),
      address: readInput(form, [/endere/, /address/, /rua/, /número/, /numero/], () => textInputs.at(-1)),
      captured_at: new Date().toISOString()
    };

    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
  }

  function checkoutDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null');
      if (!draft) return null;
      if (!draft.client_reference) draft.client_reference = createUuid();
      return draft;
    } catch (_) {
      return null;
    }
  }

  function validateDraft(draft, items) {
    if (!draft) return 'Os dados do checkout não foram encontrados. Gere o pagamento PIX novamente.';
    if (draft.customer_name.length < 2) return 'Informe o nome do cliente.';
    if (!/^\S+@\S+\.\S+$/.test(draft.customer_email)) return 'Informe um e-mail válido.';
    if (draft.postal_code.replace(/\D/g, '').length !== 8) return 'Informe um CEP válido.';
    if (draft.address.length < 5) return 'Informe o endereço completo.';
    if (!items.length) return 'O carrinho está vazio.';
    return null;
  }

  async function reportPayment(button) {
    if (orderSending) return;

    const draft = checkoutDraft();
    const items = readCart();
    const validationError = validateDraft(draft, items);

    if (validationError) {
      alert(validationError);
      return;
    }

    orderSending = true;
    button.disabled = true;
    button.textContent = 'Enviando pedido...';

    try {
      const rows = await supabaseRequest('rpc/report_fidai_pix_order', {
        method: 'POST',
        body: JSON.stringify({
          p_client_reference: draft.client_reference,
          p_customer_name: draft.customer_name,
          p_customer_email: draft.customer_email,
          p_postal_code: draft.postal_code,
          p_address: draft.address,
          p_items: items
        })
      });

      const order = Array.isArray(rows) ? rows[0] : rows;
      const orderNumber = String(order?.id || '').slice(0, 8).toUpperCase();

      localStorage.removeItem(CART_KEY);
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY, newValue: '[]' }));

      const success = document.createElement('div');
      success.className = 'fidai-order-success';
      success.innerHTML = `
        <span>PEDIDO RECEBIDO</span>
        <strong>#${escapeHtml(orderNumber)}</strong>
        <p>O pagamento foi informado. A equipe FIDAI confirmará o PIX antes de iniciar a produção.</p>
      `;
      button.replaceWith(success);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Já fiz o PIX — enviar pedido';
      alert(`Não foi possível enviar o pedido: ${error.message}`);
    } finally {
      orderSending = false;
    }
  }

  function findPixPanel() {
    const labels = [...document.querySelectorAll('span, p, strong, small, h2, h3')]
      .filter((element) => /chave\s*pix/i.test(element.textContent || ''));

    for (const label of labels) {
      let current = label.parentElement;
      for (let level = 0; current && level < 7; level += 1, current = current.parentElement) {
        const buttons = [...current.querySelectorAll('button')];
        if (buttons.some((button) => /copiar.{0,20}pix|copiar chave/i.test(button.textContent || ''))) {
          return current;
        }
      }
    }

    return null;
  }

  function enhancePixPanel() {
    const panel = findPixPanel();
    if (!panel || panel.querySelector('.fidai-payment-confirmation')) return;

    const copyButton = [...panel.querySelectorAll('button')]
      .find((button) => /copiar.{0,20}pix|copiar chave/i.test(button.textContent || ''));
    if (!copyButton) return;

    const block = document.createElement('div');
    block.className = 'fidai-payment-confirmation';
    block.innerHTML = `
      <div class="fidai-payment-divider"><span>APÓS O PAGAMENTO</span></div>
      <button class="fidai-pix-paid" type="button">Já fiz o PIX — enviar pedido</button>
      <p>O pedido ficará como <strong>Pagamento informado</strong> até a conferência bancária feita por um administrador.</p>
    `;

    block.querySelector('.fidai-pix-paid').addEventListener('click', (event) => {
      reportPayment(event.currentTarget);
    });

    copyButton.insertAdjacentElement('afterend', block);
  }

  function adminCatalogButton() {
    return [...document.querySelectorAll('button, a')]
      .find((element) => /gerenciar\s+estampas/i.test(element.textContent || ''));
  }

  function enhanceAccountPanel() {
    if (!isAdmin()) return;

    const catalogButton = adminCatalogButton();
    if (!catalogButton) return;

    const existingGroup = catalogButton.closest('.fidai-admin-tools');
    if (existingGroup) return;

    const parent = catalogButton.parentElement;
    if (!parent) return;

    const tools = document.createElement('section');
    tools.className = 'fidai-admin-tools';
    tools.innerHTML = `
      <div class="fidai-admin-tools-heading">
        <span>FIDAI / ADMINISTRAÇÃO</span>
        <strong>Gestão da loja</strong>
      </div>
      <div class="fidai-admin-tools-actions"></div>
    `;

    parent.insertBefore(tools, catalogButton);
    tools.querySelector('.fidai-admin-tools-actions').appendChild(catalogButton);

    const ordersButton = document.createElement('button');
    ordersButton.type = 'button';
    ordersButton.className = `${catalogButton.className || ''} fidai-orders-admin-button`.trim();
    ordersButton.innerHTML = '<span class="fidai-admin-button-label">Visualizar pedidos</span><span aria-hidden="true">→</span>';
    ordersButton.addEventListener('click', openOrders);
    tools.querySelector('.fidai-admin-tools-actions').appendChild(ordersButton);
  }

  function statusLabel(value) {
    return STATUS[value] || value || 'Sem status';
  }

  function orderNumber(order) {
    return String(order.id || '').slice(0, 8).toUpperCase();
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

  function statusOptions(current) {
    return Object.entries(STATUS).map(([value, label]) => (
      `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`
    )).join('');
  }

  function orderItems(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item) => `
      <div class="fidai-order-item">
        <span>${Number(item.quantity) || 1}× ${escapeHtml(item.product_name || 'Produto')} · ${escapeHtml(item.size || '')}</span>
        <small>${escapeHtml(item.print_name || 'Sem estampa')} · ${money.format(Number(item.line_total || item.unit_price) || 0)}</small>
      </div>
    `).join('');
  }

  function orderCard(order) {
    const card = document.createElement('article');
    card.className = 'fidai-order-card';
    card.dataset.status = order.status;
    card.dataset.search = `${orderNumber(order)} ${order.customer_name} ${order.customer_email} ${order.postal_code} ${order.address}`.toLowerCase();

    card.innerHTML = `
      <header class="fidai-order-card-head">
        <div>
          <span>PEDIDO #${escapeHtml(orderNumber(order))}</span>
          <h3>${escapeHtml(order.customer_name)}</h3>
          <small>${new Date(order.created_at).toLocaleString('pt-BR')}</small>
        </div>
        <b>${escapeHtml(statusLabel(order.status))}</b>
      </header>

      <div class="fidai-order-grid">
        <div>
          <span>CLIENTE</span>
          <strong>${escapeHtml(order.customer_email)}</strong>
          <p>${escapeHtml(order.postal_code)}<br>${escapeHtml(order.address)}</p>
        </div>
        <div>
          <span>PAGAMENTO</span>
          <strong>${order.payment_status === 'confirmed' ? 'PIX confirmado' : 'PIX informado'}</strong>
          <p>Total: ${money.format(Number(order.subtotal) || 0)}<br>Impacto humanitário: ${money.format(Number(order.humanitarian_amount) || 0)}</p>
        </div>
      </div>

      <div class="fidai-order-items">${orderItems(order)}</div>

      <div class="fidai-order-management">
        <label>
          <span>Andamento</span>
          <select data-field="status">${statusOptions(order.status)}</select>
        </label>
        <label>
          <span>Código de rastreio</span>
          <input data-field="tracking_code" type="text" maxlength="120" value="${escapeHtml(order.tracking_code || '')}" placeholder="Ex.: BR123456789BR">
        </label>
        <label class="fidai-order-notes">
          <span>Observações internas</span>
          <textarea data-field="admin_notes" maxlength="1000" placeholder="Informações visíveis somente para administradores">${escapeHtml(order.admin_notes || '')}</textarea>
        </label>
        <button class="fidai-order-save" type="button">Salvar alterações</button>
      </div>
    `;

    card.querySelector('.fidai-order-save').addEventListener('click', () => saveOrder(card, order));
    return card;
  }

  async function saveOrder(card, order) {
    const saveButton = card.querySelector('.fidai-order-save');
    const status = card.querySelector('[data-field="status"]').value;
    const trackingCode = normalizedText(card.querySelector('[data-field="tracking_code"]').value, 120) || null;
    const adminNotes = normalizedText(card.querySelector('[data-field="admin_notes"]').value, 1000) || null;

    const payload = {
      status,
      tracking_code: trackingCode,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString()
    };

    if (['payment_confirmed', 'preparing', 'shipped', 'completed'].includes(status)) {
      payload.payment_status = 'confirmed';
      payload.payment_confirmed_at = order.payment_confirmed_at || new Date().toISOString();
    } else if (status === 'payment_reported') {
      payload.payment_status = 'reported';
      payload.payment_confirmed_at = null;
    } else if (status === 'cancelled' && order.payment_status !== 'confirmed') {
      payload.payment_status = 'rejected';
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';

    try {
      await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(payload)
      });

      Object.assign(order, payload);
      card.dataset.status = status;
      card.querySelector('.fidai-order-card-head b').textContent = statusLabel(status);
      saveButton.textContent = 'Alterações salvas';
      setTimeout(() => { saveButton.textContent = 'Salvar alterações'; }, 1600);
      updateDashboard();
    } catch (error) {
      saveButton.textContent = 'Salvar alterações';
      alert(`Não foi possível atualizar o pedido: ${error.message}`);
    } finally {
      saveButton.disabled = false;
    }
  }

  function summaryCount(group) {
    return allOrders.filter((order) => STATUS_GROUPS[group].includes(order.status)).length;
  }

  function updateDashboard() {
    const overlay = document.querySelector('.fidai-orders-overlay');
    if (!overlay) return;

    const values = {
      total: allOrders.length,
      waiting: summaryCount('waiting'),
      active: summaryCount('active'),
      shipped: summaryCount('shipped')
    };

    Object.entries(values).forEach(([key, value]) => {
      const target = overlay.querySelector(`[data-summary="${key}"]`);
      if (target) target.textContent = String(value);
    });

    filterOrders();
  }

  function filterOrders() {
    const overlay = document.querySelector('.fidai-orders-overlay');
    if (!overlay) return;

    const query = (overlay.querySelector('.fidai-orders-search')?.value || '').trim().toLowerCase();
    const filter = overlay.querySelector('.fidai-orders-filter')?.value || 'all';
    let visible = 0;

    overlay.querySelectorAll('.fidai-order-card').forEach((card) => {
      const matchesQuery = !query || card.dataset.search.includes(query);
      const matchesStatus = filter === 'all'
        || (STATUS_GROUPS[filter] || [filter]).includes(card.dataset.status);
      const show = matchesQuery && matchesStatus;
      card.hidden = !show;
      if (show) visible += 1;
    });

    const empty = overlay.querySelector('.fidai-orders-empty');
    if (empty) empty.hidden = visible !== 0 || allOrders.length === 0;
  }

  async function loadOrders() {
    const list = document.querySelector('.fidai-orders-list');
    if (!list) return;

    list.innerHTML = '<p class="fidai-orders-loading">Carregando pedidos...</p>';

    try {
      const orders = await supabaseRequest('orders?select=*&order=created_at.desc');
      allOrders = Array.isArray(orders) ? orders : [];
      list.innerHTML = '';

      if (!allOrders.length) {
        list.innerHTML = '<p class="fidai-orders-loading">Nenhum pedido recebido.</p>';
      } else {
        allOrders.forEach((order) => list.appendChild(orderCard(order)));
        const empty = document.createElement('p');
        empty.className = 'fidai-orders-loading fidai-orders-empty';
        empty.textContent = 'Nenhum pedido corresponde aos filtros.';
        empty.hidden = true;
        list.appendChild(empty);
      }

      updateDashboard();
    } catch (error) {
      list.innerHTML = `<p class="fidai-orders-loading">Erro ao carregar pedidos: ${escapeHtml(error.message)}</p>`;
    }
  }

  function exportOrdersCsv() {
    if (!allOrders.length) {
      alert('Não há pedidos para exportar.');
      return;
    }

    const rows = [
      ['Pedido', 'Data', 'Cliente', 'E-mail', 'CEP', 'Endereço', 'Total', 'Impacto humanitário', 'Pagamento', 'Status', 'Rastreio']
    ];

    allOrders.forEach((order) => {
      rows.push([
        orderNumber(order),
        new Date(order.created_at).toLocaleString('pt-BR'),
        order.customer_name,
        order.customer_email,
        order.postal_code,
        order.address,
        Number(order.subtotal || 0).toFixed(2),
        Number(order.humanitarian_amount || 0).toFixed(2),
        order.payment_status,
        statusLabel(order.status),
        order.tracking_code || ''
      ]);
    });

    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fidai-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openOrders() {
    if (!isAdmin()) {
      alert('Esta área é restrita aos administradores da FIDAI.');
      return;
    }

    document.querySelector('.fidai-orders-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'fidai-orders-overlay';
    overlay.innerHTML = `
      <section class="fidai-orders-panel" role="dialog" aria-modal="true" aria-label="Pedidos PIX">
        <header class="fidai-orders-head">
          <div>
            <span>FIDAI / PROPRIETÁRIOS</span>
            <h2>Pedidos PIX</h2>
            <p>Confirme pagamentos, acompanhe a produção e registre o envio.</p>
          </div>
          <button type="button" aria-label="Fechar painel">×</button>
        </header>

        <div class="fidai-orders-summary">
          <article><span>TOTAL</span><strong data-summary="total">0</strong></article>
          <article><span>AGUARDANDO PIX</span><strong data-summary="waiting">0</strong></article>
          <article><span>PAGO / PRODUÇÃO</span><strong data-summary="active">0</strong></article>
          <article><span>ENVIADOS</span><strong data-summary="shipped">0</strong></article>
        </div>

        <div class="fidai-orders-toolbar">
          <input class="fidai-orders-search" type="search" placeholder="Buscar pedido, cliente ou e-mail">
          <select class="fidai-orders-filter" aria-label="Filtrar pedidos">
            <option value="all">Todos os pedidos</option>
            <option value="waiting">Aguardando confirmação</option>
            <option value="active">Pago / em produção</option>
            <option value="shipped">Enviados</option>
            <option value="finished">Concluídos / cancelados</option>
          </select>
          <button class="fidai-orders-refresh" type="button">Atualizar</button>
          <button class="fidai-orders-export" type="button">Exportar CSV</button>
        </div>

        <div class="fidai-orders-list"></div>
      </section>
    `;

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    overlay.querySelector('.fidai-orders-head button').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.fidai-orders-refresh').addEventListener('click', loadOrders);
    overlay.querySelector('.fidai-orders-export').addEventListener('click', exportOrdersCsv);
    overlay.querySelector('.fidai-orders-search').addEventListener('input', filterOrders);
    overlay.querySelector('.fidai-orders-filter').addEventListener('change', filterOrders);

    document.body.appendChild(overlay);
    loadOrders();
  }

  const style = document.createElement('style');
  style.textContent = `
    .fidai-payment-confirmation{margin-top:14px}.fidai-payment-divider{display:flex;align-items:center;gap:10px;margin:14px 0 10px;color:#6f6f69;font-size:9px;letter-spacing:.16em}.fidai-payment-divider:before,.fidai-payment-divider:after{content:"";height:1px;background:#d3d3cd;flex:1}.fidai-pix-paid{width:100%;padding:15px 18px;border:1px solid #111;background:#111;color:#fff;font:600 11px Geist,sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.fidai-pix-paid:hover{background:#2c2c2c}.fidai-pix-paid:disabled{opacity:.55;cursor:wait}.fidai-payment-confirmation>p{margin:10px 0 0;font-size:10px;line-height:1.5;color:#5f5f59}.fidai-order-success{margin-top:14px;border:1px solid #111;padding:18px;background:#f3f3ef}.fidai-order-success span{display:block;font-size:9px;letter-spacing:.16em}.fidai-order-success strong{display:block;font-size:25px;margin:7px 0}.fidai-order-success p{font-size:11px;line-height:1.5}.fidai-admin-tools{width:100%;margin:14px 0;border-top:1px solid rgba(0,0,0,.15);padding-top:14px}.fidai-admin-tools-heading{display:flex;justify-content:space-between;align-items:end;gap:15px;margin-bottom:9px}.fidai-admin-tools-heading span{font-size:8px;letter-spacing:.15em;color:#777}.fidai-admin-tools-heading strong{font-size:11px;font-weight:500}.fidai-admin-tools-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fidai-admin-tools-actions>button,.fidai-admin-tools-actions>a{width:100%!important;margin:0!important;display:flex!important;justify-content:space-between!important;align-items:center!important;min-width:0}.fidai-orders-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.76);display:grid;place-items:center;padding:18px}.fidai-orders-panel{width:min(1240px,97vw);max-height:95vh;overflow:auto;background:#f7f7f3;color:#111;box-shadow:0 30px 90px rgba(0,0,0,.3)}.fidai-orders-head{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:20px;padding:23px 28px;border-bottom:1px solid #ccc;background:#f7f7f3}.fidai-orders-head span{font-size:9px;letter-spacing:.15em}.fidai-orders-head h2{font-size:32px;line-height:1;margin:6px 0}.fidai-orders-head p{font-size:12px;color:#65655f}.fidai-orders-head button{border:0;background:none;font-size:32px;line-height:1;cursor:pointer}.fidai-orders-summary{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #ccc}.fidai-orders-summary article{padding:17px 22px;border-right:1px solid #ccc}.fidai-orders-summary article:last-child{border-right:0}.fidai-orders-summary span{display:block;font-size:8px;letter-spacing:.14em;color:#707069}.fidai-orders-summary strong{display:block;margin-top:5px;font-size:27px;font-weight:500}.fidai-orders-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 190px auto auto;gap:9px;padding:14px 28px;border-bottom:1px solid #d5d5cf;background:#ecece7}.fidai-orders-toolbar input,.fidai-orders-toolbar select,.fidai-orders-toolbar button{min-height:40px;border:1px solid #aaa;background:#fff;padding:0 12px;font:500 10px Geist,sans-serif;letter-spacing:.04em}.fidai-orders-toolbar button{background:#111;color:#fff;border-color:#111;cursor:pointer;text-transform:uppercase}.fidai-orders-export{background:transparent!important;color:#111!important}.fidai-orders-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:22px 28px 30px}.fidai-orders-loading{grid-column:1/-1;padding:30px;text-align:center;font-size:12px}.fidai-order-card{border:1px solid #c9c9c3;background:#fff;padding:19px;display:flex;flex-direction:column;gap:15px}.fidai-order-card[hidden]{display:none}.fidai-order-card-head{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #ddd;padding-bottom:13px}.fidai-order-card-head span,.fidai-order-grid span,.fidai-order-management label>span{display:block;font-size:8px;letter-spacing:.13em;color:#696963}.fidai-order-card h3{margin:4px 0;font-size:19px}.fidai-order-card-head small{font-size:10px;color:#777}.fidai-order-card-head b{font-size:9px;text-transform:uppercase;border:1px solid;padding:7px;height:max-content;white-space:nowrap}.fidai-order-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fidai-order-grid>div{background:#f3f3ef;padding:11px;min-width:0}.fidai-order-grid strong{font-size:11px;overflow-wrap:anywhere}.fidai-order-grid p{font-size:10px;line-height:1.5;margin-top:6px}.fidai-order-item{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid #ddd;font-size:11px}.fidai-order-item small{text-align:right;color:#666}.fidai-order-management{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:3px}.fidai-order-management label{display:flex;flex-direction:column;gap:6px}.fidai-order-management select,.fidai-order-management input,.fidai-order-management textarea{width:100%;border:1px solid #aaa;background:#fff;padding:9px;font:400 11px Geist,sans-serif}.fidai-order-management textarea{min-height:72px;resize:vertical}.fidai-order-notes{grid-column:1/-1}.fidai-order-save{grid-column:1/-1;border:1px solid #111;background:#111;color:#fff;padding:11px;font:600 9px Geist,sans-serif;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.fidai-order-save:disabled{opacity:.55}.fidai-orders-empty[hidden]{display:none}@media(max-width:850px){.fidai-orders-summary{grid-template-columns:1fr 1fr}.fidai-orders-summary article:nth-child(2){border-right:0}.fidai-orders-toolbar{grid-template-columns:1fr 1fr}.fidai-orders-list{grid-template-columns:1fr}.fidai-admin-tools-actions{grid-template-columns:1fr}}@media(max-width:560px){.fidai-orders-overlay{padding:0}.fidai-orders-panel{width:100vw;max-height:100vh;height:100vh}.fidai-orders-head{padding:18px}.fidai-orders-summary{grid-template-columns:1fr 1fr}.fidai-orders-summary article{padding:13px}.fidai-orders-toolbar{grid-template-columns:1fr;padding:12px 16px}.fidai-orders-list{padding:15px}.fidai-order-grid,.fidai-order-management{grid-template-columns:1fr}.fidai-order-notes,.fidai-order-save{grid-column:auto}.fidai-order-item{flex-direction:column}.fidai-order-item small{text-align:left}}
  `;

  document.head.appendChild(style);
  document.addEventListener('submit', captureCheckout, true);

  const observer = new MutationObserver(() => {
    enhancePixPanel();
    enhanceAccountPanel();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhancePixPanel();
  enhanceAccountPanel();
})();
