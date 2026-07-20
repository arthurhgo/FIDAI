# Segurança antes da publicação

## Supabase

O build recuperado contém:

- URL pública do projeto Supabase.
- Chave `sb_publishable_*`, destinada ao uso no navegador.
- Lista de e-mails reconhecidos pela interface como administradores.

A lista de e-mails no JavaScript controla apenas a interface. Ela não substitui autorização no banco.

Antes de publicar o repositório como público, confirme no Supabase:

1. RLS habilitado na tabela `prints` e demais tabelas da loja.
2. Leitura pública limitada somente aos registros permitidos.
3. Inserção, alteração e exclusão permitidas apenas a usuários administrativos autenticados.
4. Nenhuma chave `service_role`, senha ou chave secreta presente no front-end.
5. Storage com políticas específicas para upload e exclusão.

## Repositório

Para a primeira validação, prefira um repositório privado. Depois das políticas revisadas, ele pode ser publicado ou conectado à Vercel/Netlify.

## HAR original

O arquivo HAR usado na recuperação não foi incluído neste pacote. HARs podem registrar cabeçalhos, respostas e dados de sessão e não devem ser enviados ao repositório.
