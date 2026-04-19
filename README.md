# Cardápio Digital com Supabase + WhatsApp

Projeto completo com:

- Área pública de cardápio com slug dinâmico
- Carrinho e checkout com validação
- Salvamento de pedido no Supabase antes do redirecionamento
- Integração direta com WhatsApp (`wa.me`)
- Área admin com login (Supabase Auth), CRUD de cardápios/produtos e lista de pedidos
- Upload de imagem para Supabase Storage

## Estrutura

```txt
/admin
  index.html
  dashboard.html
  script.js
  style.css
/cardapio
  index.html
  script.js
  style.css
/shared
  supabase.js
/supabase
  schema.sql
```

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. Execute o script de [supabase/schema.sql](supabase/schema.sql) no SQL Editor.
3. Em Authentication > Users, crie o usuário admin (único usuário).
4. Pegue a URL e chave Anon do projeto.

## 2) Configuração no Front-end

No navegador, rode no console (uma vez por domínio):

```js
localStorage.setItem(
  "supabase.config",
  JSON.stringify({
    url: "https://SEU-PROJETO.supabase.co",
    anonKey: "SUA_CHAVE_ANON_PUBLICA"
  })
);
```

Alternativa: definir `globalThis.__SUPABASE_CONFIG__` antes dos scripts em cada página.

## 3) Fluxo de uso

- Acesse `/admin/index.html` e faça login.
- Crie um cardápio com slug e WhatsApp.
- Selecione o cardápio e cadastre produtos (com upload de imagem, se quiser).
- Acesse `/cardapio/{slug}` (ou `/cardapio/index.html?slug={slug}` quando sem rewrite no servidor).
- Cliente finaliza pedido, pedido é salvo na tabela `pedidos`, e o WhatsApp abre com mensagem pronta.

## Observações

- Para URL bonita `/cardapio/seu-slug`, configure rewrite no seu host.
- O projeto é todo em HTML/CSS/JS puro no front-end.

## Deploy na Vercel

Este repositório já inclui [vercel.json](vercel.json) com rotas para:

- `/cardapio/{slug}` (rewrite para `/cardapio/index.html` sem quebrar `style.css`/`script.js`)
- `/admin` (abre `admin/index.html`)
- `/admin/dashboard` (abre `admin/dashboard.html`)

Passo a passo:

1. Suba o projeto para o GitHub (este repositório).
2. Na Vercel: **New Project** → **Import Git Repository**.
3. Framework Preset: **Other**.
4. Build Command: vazio (ou `None`). Output: padrão.
5. Deploy.

Depois do deploy:

- Admin: `https://SEU-DOMINIO/admin`
- Cardápio: `https://SEU-DOMINIO/cardapio/seu-slug`
