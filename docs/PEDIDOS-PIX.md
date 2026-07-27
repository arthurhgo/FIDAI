# FIDAI — ativação dos pedidos PIX

## Objetivo

O cliente gera o pagamento PIX e, depois de pagar, clica em **Já fiz o PIX — enviar pedido**. O pedido é registrado como **Pagamento informado**. Um administrador confere o extrato bancário e atualiza o pedido para **Pagamento confirmado**.

## 1. Executar o SQL

1. Abra o projeto da FIDAI no Supabase.
2. Entre em **SQL Editor**.
3. Clique em **New query**.
4. Copie todo o conteúdo de `supabase/fidai_orders.sql`.
5. Clique em **Run**.

O script cria ou atualiza:

- tabela `public.orders`;
- função segura `report_fidai_pix_order`;
- políticas RLS;
- acesso dos administradores;
- campos de rastreio e observações internas.

## 2. Conferir os administradores

Os administradores configurados no código e no SQL são:

- `arthurhgregorio@gmail.com`
- `engenhariapalmer@gmail.com`

Esses e-mails precisam existir como usuários em **Authentication → Users**. O acesso administrativo depende do e-mail presente no token de autenticação.

## 3. Configurar URLs de autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** `https://arthurhgo.github.io/FIDAI/`
- Adicione em **Redirect URLs:**
  - `https://arthurhgo.github.io/FIDAI/`
  - `https://arthurhgo.github.io/FIDAI/**`

No provedor Google, mantenha o callback do Supabase configurado conforme exibido em **Authentication → Providers → Google**.

## 4. Teste completo

1. Abra o site em uma janela anônima.
2. Adicione uma peça ao carrinho.
3. Preencha nome, e-mail, CEP e endereço.
4. Clique em **Gerar pagamento PIX**.
5. Clique em **Já fiz o PIX — enviar pedido**.
6. Confirme que um número de pedido aparece.
7. Entre no site com um dos e-mails administrativos.
8. Abra a conta.
9. Em **Gestão da loja**, clique em **Visualizar pedidos**.
10. Confirme o pagamento, adicione observação ou rastreio e salve.

## 5. Limite atual do PIX

O sistema registra que o cliente informou o pagamento, mas não consulta automaticamente o banco. A confirmação do PIX deve ser feita manualmente pelo administrador antes de mudar o status para **Pagamento confirmado**.

Para confirmação automática será necessário integrar um gateway com webhook, como Mercado Pago, Efí/Gerencianet, Pagar.me ou banco compatível.
