# PRD - Sistema de Cardápio Digital com WhatsApp & Supabase

## 1. Visão Geral
Sistema de cardápio digital onde clientes visualizam produtos, montam um carrinho e finalizam o pedido via WhatsApp. Proprietários gerenciam cardápios, produtos e visualizam pedidos em uma área administrativa protegida.

## 2. Arquitetura Técnica
- **Frontend:** HTML5, CSS3 (Moderno/Responsivo), JavaScript Puro (ES6+).
- **Backend:** Supabase (Auth, Database, Storage).
- **Integração:** WhatsApp via Link (`wa.me`).

## 3. Modelo de Dados (Supabase)

### Tabela: `cardapios`
- `id` (uuid, PK)
- `nome` (text)
- `slug` (text, unique) - Ex: `pizzaria-do-joao`
- `whatsapp` (text) - Número puro para o link.
- `cor_tema` (text) - Hexadecimal.
- `created_at` (timestamp)

### Tabela: `produtos`
- `id` (uuid, PK)
- `cardapio_id` (uuid, FK -> cardapios.id)
- `nome` (text)
- `preco` (numeric)
- `imagem_url` (text)
- `created_at` (timestamp)

### Tabela: `pedidos`
- `id` (uuid, PK)
- `cardapio_id` (uuid, FK -> cardapios.id)
- `nome_cliente` (text)
- `telefone` (text)
- `endereco` (text)
- `itens` (jsonb) - Array de objetos `{nome, preco, qtd}`
- `created_at` (timestamp)

## 4. Fluxos Principais

### Fluxo do Cliente
1. Acessa `/cardapio?slug=...`
2. Carrega tema e produtos dinamicamente.
3. Adiciona itens ao carrinho (em memória).
4. Preenche formulário de entrega (Nome, Tel, Endereço).
5. O sistema salva o pedido no Supabase.
6. Redireciona para o WhatsApp com a mensagem formatada.

### Fluxo do Admin
1. Login via Supabase Auth.
2. Dashboard: Lista cardápios.
3. Gerenciar Cardápio: Editar dados, gerenciar produtos (CRUD) com upload de imagem.
4. Pedidos: Lista histórica de pedidos recebidos.

## 5. Estrutura de Arquivos Proposta
- `/index.html`: Landing/Redirecionamento.
- `/cardapio/index.html`: Visualização do cliente.
- `/admin/login.html`: Acesso restrito.
- `/admin/dashboard.html`: Gestão geral.
- `/shared/supabase-config.js`: Inicialização do SDK.
