# FIDAI — Gerenciador de conta e redefinição de senha

## O que foi implementado

- Botão **Gerenciar conta** dentro da área do usuário logado.
- Exibição do e-mail e do método de acesso da conta.
- Alteração direta de senha para uma sessão autenticada.
- Botão **Enviar link de redefinição** para o e-mail cadastrado.
- Tratamento do link **Reset password** enviado pelo Supabase.
- Tela automática para cadastrar e confirmar a nova senha.
- Indicador visual de força da senha.
- Validação de senha mínima e confirmação.
- Layout responsivo seguindo a interface minimalista da FIDAI.

## Configuração obrigatória no Supabase

Acesse:

`Authentication → URL Configuration`

Configure:

### Site URL

`https://arthurhgo.github.io/FIDAI/`

### Redirect URLs

Adicione exatamente:

- `https://arthurhgo.github.io/FIDAI/`
- `https://arthurhgo.github.io/FIDAI/?account=recovery`
- `https://arthurhgo.github.io/FIDAI/**`

O endereço exato com `?account=recovery` é o retorno usado pelo e-mail de redefinição.

## Template do e-mail

Acesse:

`Authentication → Email Templates → Reset Password`

O link ou botão principal do template precisa usar a variável padrão de confirmação do Supabase:

```html
<a href="{{ .ConfirmationURL }}">Reset password</a>
```

Você pode traduzir o texto para **Redefinir senha**, mas não substitua `{{ .ConfirmationURL }}` por um endereço fixo.

## Segurança de senha

Acesse as configurações de segurança de senha do Supabase e mantenha no mínimo:

- 8 caracteres;
- recomendação de letras maiúsculas e minúsculas;
- números;
- símbolos.

O site exige pelo menos 8 caracteres. Regras mais fortes configuradas no Supabase também serão respeitadas e o erro será mostrado ao usuário.

## Teste manual completo

1. Faça o merge do PR #2.
2. Espere a publicação do GitHub Pages.
3. Entre no site com uma conta de e-mail e senha.
4. Abra a área da conta.
5. Clique em **Gerenciar conta**.
6. Teste uma alteração direta de senha.
7. Saia e entre novamente usando a senha nova.
8. Abra novamente o gerenciador.
9. Clique em **Enviar link de redefinição**.
10. Abra o e-mail do Supabase.
11. Clique em **Reset password**.
12. Confirme que o site abre a tela **Crie uma nova senha**.
13. Cadastre uma nova senha e confirme.
14. Saia e faça login novamente.

## Arquivos relacionados

- `assets/fidai-account.js`
- `.github/workflows/ensure-account-module.yml`
- `index.html`
