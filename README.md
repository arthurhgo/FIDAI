# FIDAI Store

Versão estática recuperada da publicação original da FIDAI e preparada para GitHub.

## Conteúdo recuperado

- Página completa renderizada.
- CSS original compilado.
- JavaScript compilado e interações do site.
- Logos oficiais da FIDAI sem alteração.
- Imagens das campanhas e mockups dos produtos.
- Fontes usadas pela interface.
- Integração pública existente com Supabase.

## Executar localmente

Na pasta do projeto:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`.

> Não abra o `index.html` diretamente pelo Explorador de Arquivos. Módulos JavaScript funcionam corretamente quando servidos por HTTP.

## Publicar no GitHub Pages

1. Crie um repositório vazio, preferencialmente chamado `fidai-store`.
2. Envie todos os arquivos desta pasta para a branch `main`.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **GitHub Actions**.
5. O workflow `Deploy FIDAI Store to GitHub Pages` fará a publicação.

O endereço esperado será:

```text
https://arthurhgo.github.io/fidai-store/
```

## Estrutura

- `index.html`: página principal e payload inicial.
- `assets/`: CSS, JavaScript compilado e fontes.
- `brand/`: logos oficiais da FIDAI, preservados sem alterações.
- `campaigns/`: imagens das campanhas da hero.
- `products/`: mockups e bases dos produtos.
- `.github/workflows/`: publicação automática no GitHub Pages.

## Limitação

Esta é uma recuperação do build entregue ao navegador, não o código-fonte React original. Alterações simples podem ser feitas no HTML e CSS. Alterações estruturais profundas ficam mais seguras após reconstruir o front-end em código-fonte organizado.

## Supabase

A versão compilada mantém a conexão pública já usada pelo site original. Não publique chaves privadas, `service_role` ou credenciais administrativas no repositório.
