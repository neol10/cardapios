-- Execute este script no SQL Editor do Supabase.
-- Cria tabelas, chaves, políticas de acesso e bucket de imagens.

create extension if not exists pgcrypto;

-- Allowlist de admins (melhora segurança: não basta estar autenticado)
-- Para liberar o seu usuário como admin, rode no SQL Editor:
--   insert into public.admins (user_id) values ('<SEU_AUTH_UID>');
-- Dica: pegue o UID em Authentication > Users.

create table if not exists public.admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Helper para checar admin sem causar recursao infinita de RLS.
-- (Policies que fazem subquery em public.admins dentro de public.admins geram
--  "infinite recursion detected in policy for relation 'admins'")
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = p_user_id
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

drop policy if exists "admin read own row" on public.admins;
create policy "admin read own row"
on public.admins
for select
using (auth.uid() = user_id);

drop policy if exists "admin manage admins" on public.admins;

drop policy if exists "admin insert admins" on public.admins;
create policy "admin insert admins"
on public.admins
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "admin update admins" on public.admins;
create policy "admin update admins"
on public.admins
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin delete admins" on public.admins;
create policy "admin delete admins"
on public.admins
for delete
using (public.is_admin(auth.uid()));

create table if not exists public.cardapios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  whatsapp text not null,
  cor_tema text not null default '#ff6a00',
  cor_secundaria text,
  fonte_key text,
  fonte_peso_texto integer,
  fonte_peso_titulo integer,
  abre_em time,
  fecha_em time,
  fundo_estilo text not null default 'padrao' check (fundo_estilo in ('padrao','solido','degrade_linear','degrade_radial')),
  fundo_cor_1 text,
  fundo_cor_2 text,
  fundo_angulo integer not null default 135 check (fundo_angulo >= 0 and fundo_angulo <= 360),
  cor_fundo text,
  cor_surface text,
  cor_texto text,
  cor_muted text,
  cor_borda text,
  foto_url text,
  banner_url text,
  galeria_urls jsonb,
  slogan text,
  horario_funcionamento text,
  endereco text,
  instagram_url text,
  taxa_entrega numeric(10,2) not null default 0 check (taxa_entrega >= 0),
  pedido_minimo numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  aceita_entrega boolean not null default true,
  aceita_retirada boolean not null default true,
  layout_produtos text not null default 'grid' check (layout_produtos in ('grid','lista')),
  densidade text not null default 'confortavel' check (densidade in ('compacta','confortavel')),
  whatsapp_botao text not null default 'flutuante' check (whatsapp_botao in ('nenhum','topo','flutuante')),
  mensagem_whatsapp_template text,
  formas_pagamento text,
  created_at timestamptz not null default now()
);

-- Se você já executou este schema antes, rode também este patch (não quebra se já existir).
alter table public.cardapios add column if not exists cor_secundaria text;
alter table public.cardapios add column if not exists fonte_key text;
alter table public.cardapios add column if not exists fonte_peso_texto integer;
alter table public.cardapios add column if not exists fonte_peso_titulo integer;
alter table public.cardapios add column if not exists abre_em time;
alter table public.cardapios add column if not exists fecha_em time;
alter table public.cardapios add column if not exists fundo_estilo text;
alter table public.cardapios add column if not exists fundo_cor_1 text;
alter table public.cardapios add column if not exists fundo_cor_2 text;
alter table public.cardapios add column if not exists fundo_angulo integer;
alter table public.cardapios add column if not exists cor_fundo text;
alter table public.cardapios add column if not exists cor_surface text;
alter table public.cardapios add column if not exists cor_texto text;
alter table public.cardapios add column if not exists cor_muted text;
alter table public.cardapios add column if not exists cor_borda text;
alter table public.cardapios add column if not exists slogan text;
alter table public.cardapios add column if not exists horario_funcionamento text;
alter table public.cardapios add column if not exists endereco text;
alter table public.cardapios add column if not exists instagram_url text;
alter table public.cardapios add column if not exists banner_url text;
alter table public.cardapios add column if not exists galeria_urls jsonb;
alter table public.cardapios add column if not exists taxa_entrega numeric(10,2);
alter table public.cardapios add column if not exists pedido_minimo numeric(10,2);
alter table public.cardapios add column if not exists aceita_entrega boolean;
alter table public.cardapios add column if not exists aceita_retirada boolean;
alter table public.cardapios add column if not exists layout_produtos text;
alter table public.cardapios add column if not exists densidade text;
alter table public.cardapios add column if not exists whatsapp_botao text;
alter table public.cardapios add column if not exists mensagem_whatsapp_template text;
alter table public.cardapios add column if not exists formas_pagamento text;

alter table public.produtos add column if not exists categoria text;
alter table public.produtos add column if not exists descricao text;

alter table public.pedidos add column if not exists status text;

update public.pedidos set status = 'novo' where status is null;

update public.cardapios set taxa_entrega = 0 where taxa_entrega is null;
update public.cardapios set pedido_minimo = 0 where pedido_minimo is null;
update public.cardapios set aceita_entrega = true where aceita_entrega is null;
update public.cardapios set aceita_retirada = true where aceita_retirada is null;
update public.cardapios set layout_produtos = 'grid' where layout_produtos is null;
update public.cardapios set densidade = 'confortavel' where densidade is null;
update public.cardapios set whatsapp_botao = 'flutuante' where whatsapp_botao is null;
update public.cardapios set fundo_estilo = 'padrao' where fundo_estilo is null;
update public.cardapios set fundo_angulo = 135 where fundo_angulo is null;
update public.cardapios set fonte_key = 'sora' where fonte_key is null;
update public.cardapios set fonte_peso_texto = 400 where fonte_peso_texto is null;
update public.cardapios set fonte_peso_titulo = 800 where fonte_peso_titulo is null;

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  cardapio_id uuid not null references public.cardapios(id) on delete cascade,
  nome text not null,
  categoria text,
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  imagem_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cardapio_id uuid not null references public.cardapios(id) on delete cascade,
  nome_cliente text not null,
  telefone text not null,
  endereco text not null,
  itens jsonb not null,
  status text not null default 'novo' check (status in ('novo','confirmado','entregue')),
  created_at timestamptz not null default now()
);

alter table public.cardapios enable row level security;
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;

-- Publico pode ler cardapios e produtos.
drop policy if exists "public read cardapios" on public.cardapios;
create policy "public read cardapios"
on public.cardapios
for select
using (true);

drop policy if exists "public read produtos" on public.produtos;
create policy "public read produtos"
on public.produtos
for select
using (true);

-- Publico pode inserir pedidos (checkout).
drop policy if exists "public insert pedidos" on public.pedidos;
create policy "public insert pedidos"
on public.pedidos
for insert
with check (true);

-- Admin autenticado pode gerenciar cardapios, produtos e ver pedidos.
drop policy if exists "auth manage cardapios" on public.cardapios;
create policy "auth manage cardapios"
on public.cardapios
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "auth manage produtos" on public.produtos;
create policy "auth manage produtos"
on public.produtos
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "auth read pedidos" on public.pedidos;
create policy "auth read pedidos"
on public.pedidos
for select
using (public.is_admin(auth.uid()));

drop policy if exists "auth update pedidos" on public.pedidos;
create policy "auth update pedidos"
on public.pedidos
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Storage para imagens de produtos.
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

-- Storage para imagens de cardapios.
insert into storage.buckets (id, name, public)
values ('cardapios', 'cardapios', true)
on conflict (id) do nothing;

-- Leitura publica das imagens.
drop policy if exists "public read produtos bucket" on storage.objects;
create policy "public read produtos bucket"
on storage.objects
for select
using (bucket_id = 'produtos');

drop policy if exists "public read cardapios bucket" on storage.objects;
create policy "public read cardapios bucket"
on storage.objects
for select
using (bucket_id = 'cardapios');

-- Admin autenticado pode enviar/editar/remover imagens.
drop policy if exists "auth insert produtos bucket" on storage.objects;
create policy "auth insert produtos bucket"
on storage.objects
for insert
with check (
  bucket_id = 'produtos'
  and public.is_admin(auth.uid())
);

drop policy if exists "auth insert cardapios bucket" on storage.objects;
create policy "auth insert cardapios bucket"
on storage.objects
for insert
with check (
  bucket_id = 'cardapios'
  and public.is_admin(auth.uid())
);

drop policy if exists "auth update produtos bucket" on storage.objects;
create policy "auth update produtos bucket"
on storage.objects
for update
using (
  bucket_id = 'produtos'
  and public.is_admin(auth.uid())
);

drop policy if exists "auth update cardapios bucket" on storage.objects;
create policy "auth update cardapios bucket"
on storage.objects
for update
using (
  bucket_id = 'cardapios'
  and public.is_admin(auth.uid())
);

drop policy if exists "auth delete produtos bucket" on storage.objects;
create policy "auth delete produtos bucket"
on storage.objects
for delete
using (
  bucket_id = 'produtos'
  and public.is_admin(auth.uid())
);

drop policy if exists "auth delete cardapios bucket" on storage.objects;
create policy "auth delete cardapios bucket"
on storage.objects
for delete
using (
  bucket_id = 'cardapios'
  and public.is_admin(auth.uid())
);
