-- Execute este script no SQL Editor do Supabase.
-- Cria tabelas, chaves, polÃƒÂ­ticas de acesso e bucket de imagens.

create extension if not exists pgcrypto with schema extensions;

-- Allowlist de admins (melhora seguranÃƒÂ§a: nÃƒÂ£o basta estar autenticado)
-- Para liberar o seu usuÃƒÂ¡rio como admin, rode no SQL Editor:
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
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.admins where user_id = p_user_id
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

-- PIN extra do admin (2a etapa apÃƒÂ³s e-mail/senha)
-- MantÃƒÂ©m somente o HASH no banco. Para trocar o PIN depois:
--   update public.admin_settings
--   set admin_pin_hash = crypt('NOVO_PIN', gen_salt('bf')), updated_at = now()
--   where id = 1;

create table if not exists public.admin_settings (
  id integer primary key check (id = 1),
  admin_pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

-- NinguÃƒÂ©m deve ler/editar diretamente pelo cliente.
revoke all on table public.admin_settings from anon, authenticated;

-- Cria um hash inicial aleatÃƒÂ³rio (ninguÃƒÂ©m sabe o PIN ainda).
-- Depois, defina o seu PIN diretamente no Supabase (SQL Editor), por exemplo:
--   update public.admin_settings
--   set admin_pin_hash = crypt('1664800', gen_salt('bf')), updated_at = now()
--   where id = 1;
insert into public.admin_settings (id, admin_pin_hash)
values (1, crypt(gen_random_uuid()::text, gen_salt('bf')))
on conflict (id) do nothing;

create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  saved_hash text;
begin
  if not public.is_admin(auth.uid()) then
    return false;
  end if;

  select admin_pin_hash
  into saved_hash
  from public.admin_settings
  where id = 1;

  if saved_hash is null then
    return false;
  end if;

  return crypt(p_pin, saved_hash) = saved_hash;
end;
$$;

revoke all on function public.verify_admin_pin(text) from public;
grant execute on function public.verify_admin_pin(text) to authenticated;

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
  modo text not null default 'pedido' check (modo in ('pedido','catalogo','marmita')),
  modo_garcom_enabled boolean not null default false,
  modo_marmita_enabled boolean not null default false,
  marmita_agendamento_enabled boolean not null default false,
  marmita_horarios_retirada text,
  owner_edit_enabled boolean not null default false,
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
  templates jsonb,
  formas_pagamento text,
  created_at timestamptz not null default now()
);

-- Se vocÃƒÂª jÃƒÂ¡ executou este schema antes, rode tambÃƒÂ©m este patch (nÃƒÂ£o quebra se jÃƒÂ¡ existir).
alter table public.cardapios add column if not exists cor_secundaria text;
alter table public.cardapios add column if not exists fonte_key text;
alter table public.cardapios add column if not exists fonte_peso_texto integer;
alter table public.cardapios add column if not exists fonte_peso_titulo integer;
alter table public.cardapios add column if not exists abre_em time;
alter table public.cardapios add column if not exists fecha_em time;
alter table public.cardapios add column if not exists modo text;
alter table public.cardapios alter column modo set default 'pedido';
alter table public.cardapios add column if not exists modo_garcom_enabled boolean;
alter table public.cardapios alter column modo_garcom_enabled set default false;
alter table public.cardapios add column if not exists owner_edit_enabled boolean;
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
update public.cardapios set modo = 'pedido' where modo is null;
update public.cardapios set modo_garcom_enabled = false where modo_garcom_enabled is null;
update public.cardapios set layout_produtos = 'grid' where layout_produtos is null;
update public.cardapios set densidade = 'confortavel' where densidade is null;
update public.cardapios set whatsapp_botao = 'flutuante' where whatsapp_botao is null;
update public.cardapios set fundo_estilo = 'padrao' where fundo_estilo is null;
update public.cardapios set fundo_angulo = 135 where fundo_angulo is null;
update public.cardapios set fonte_key = 'sora' where fonte_key is null;
update public.cardapios set fonte_peso_texto = 400 where fonte_peso_texto is null;
update public.cardapios set fonte_peso_titulo = 800 where fonte_peso_titulo is null;
update public.cardapios set owner_edit_enabled = false where owner_edit_enabled is null;

-- Modo Marmita: empresas de marmita/refeiÃƒÂ§ÃƒÂµes
alter table public.cardapios add column if not exists modo_marmita_enabled boolean;
alter table public.cardapios add column if not exists marmita_agendamento_enabled boolean;
alter table public.cardapios add column if not exists marmita_horarios_retirada text;
alter table public.cardapios add column if not exists marmita_dias_semana text;
alter table public.cardapios add column if not exists marmita_instrucoes text;

update public.cardapios set modo_marmita_enabled = false where modo_marmita_enabled is null;
update public.cardapios set marmita_agendamento_enabled = false where marmita_agendamento_enabled is null;
update public.cardapios set marmita_dias_semana = '1,2,3,4,5' where marmita_dias_semana is null;

-- Acesso do proprietÃƒÂ¡rio por cardÃƒÂ¡pio (PIN separado do admin)
create table if not exists public.cardapio_owner_access (
  cardapio_id uuid primary key references public.cardapios(id) on delete cascade,
  enabled boolean not null default false,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.cardapio_owner_access enable row level security;

revoke all on table public.cardapio_owner_access from anon, authenticated;

create or replace function public.admin_set_owner_access(
  p_cardapio_id uuid,
  p_enabled boolean,
  p_new_pin text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  next_hash text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  if p_new_pin is not null and length(trim(p_new_pin)) > 0 then
    next_hash := crypt(trim(p_new_pin), gen_salt('bf'));
  end if;

  insert into public.cardapio_owner_access (cardapio_id, enabled, pin_hash, updated_at)
  values (
    p_cardapio_id,
    coalesce(p_enabled, false),
    coalesce(next_hash, crypt(gen_random_uuid()::text, gen_salt('bf'))),
    now()
  )
  on conflict (cardapio_id) do update set
    enabled = excluded.enabled,
    pin_hash = coalesce(next_hash, public.cardapio_owner_access.pin_hash),
    updated_at = now();

  update public.cardapios
  set owner_edit_enabled = coalesce(p_enabled, false)
  where id = p_cardapio_id;
end;
$$;

revoke all on function public.admin_set_owner_access(uuid, boolean, text) from public;
grant execute on function public.admin_set_owner_access(uuid, boolean, text) to authenticated;

create or replace function public.owner_verify_pin(p_slug text, p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c_id uuid;
  saved_hash text;
  is_enabled boolean;
begin
  select id, owner_edit_enabled into c_id, is_enabled
  from public.cardapios
  where slug = lower(trim(p_slug))
  limit 1;

  if c_id is null or is_enabled is not true then
    return false;
  end if;

  select pin_hash
  into saved_hash
  from public.cardapio_owner_access
  where cardapio_id = c_id;

  if saved_hash is null then
    return false;
  end if;

  return crypt(trim(p_pin), saved_hash) = saved_hash;
end;
$$;

revoke all on function public.owner_verify_pin(text, text) from public;
grant execute on function public.owner_verify_pin(text, text) to anon, authenticated;

create or replace function public.owner_update_cardapio(
  p_slug text,
  p_pin text,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_id uuid;
  ok boolean;
begin
  ok := public.owner_verify_pin(p_slug, p_pin);
  if ok is not true then
    return false;
  end if;

  select id into c_id
  from public.cardapios
  where slug = lower(trim(p_slug))
  limit 1;

  if c_id is null then
    return false;
  end if;

  update public.cardapios
  set
    nome = coalesce(nullif(trim(p_patch->>'nome'), ''), nome),
    whatsapp = coalesce(nullif(trim(p_patch->>'whatsapp'), ''), whatsapp),
    slogan = coalesce(nullif(trim(p_patch->>'slogan'), ''), slogan),
    modo = coalesce(nullif(trim(p_patch->>'modo'), ''), modo),
    modo_garcom_enabled = case
      when lower(coalesce(trim(p_patch->>'modo_garcom_enabled'), '')) in ('true', 't', '1', 'yes', 'on') then true
      when lower(coalesce(trim(p_patch->>'modo_garcom_enabled'), '')) in ('false', 'f', '0', 'no', 'off') then false
      else modo_garcom_enabled
    end,
    modo_marmita_enabled = case
      when lower(coalesce(trim(p_patch->>'modo_marmita_enabled'), '')) in ('true', 't', '1', 'yes', 'on') then true
      when lower(coalesce(trim(p_patch->>'modo_marmita_enabled'), '')) in ('false', 'f', '0', 'no', 'off') then false
      else modo_marmita_enabled
    end,
    marmita_agendamento_enabled = case
      when lower(coalesce(trim(p_patch->>'marmita_agendamento_enabled'), '')) in ('true', 't', '1', 'yes', 'on') then true
      when lower(coalesce(trim(p_patch->>'marmita_agendamento_enabled'), '')) in ('false', 'f', '0', 'no', 'off') then false
      else marmita_agendamento_enabled
    end,
    marmita_horarios_retirada = coalesce(nullif(trim(p_patch->>'marmita_horarios_retirada'), ''), marmita_horarios_retirada),
    marmita_dias_semana = coalesce(nullif(trim(p_patch->>'marmita_dias_semana'), ''), marmita_dias_semana),
    marmita_instrucoes = coalesce(nullif(trim(p_patch->>'marmita_instrucoes'), ''), marmita_instrucoes),
    horario_funcionamento = coalesce(nullif(trim(p_patch->>'horario_funcionamento'), ''), horario_funcionamento),
    abre_em = case
      when nullif(trim(p_patch->>'abre_em'), '') is not null then (trim(p_patch->>'abre_em'))::time
      else abre_em
    end,
    fecha_em = case
      when nullif(trim(p_patch->>'fecha_em'), '') is not null then (trim(p_patch->>'fecha_em'))::time
      else fecha_em
    end,
    endereco = coalesce(nullif(trim(p_patch->>'endereco'), ''), endereco),
    instagram_url = coalesce(nullif(trim(p_patch->>'instagram_url'), ''), instagram_url),
    foto_url = coalesce(nullif(trim(p_patch->>'foto_url'), ''), foto_url),
    banner_url = coalesce(nullif(trim(p_patch->>'banner_url'), ''), banner_url),
    templates = coalesce(p_patch->'templates', templates)
  where id = c_id;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.owner_update_cardapio(text, text, jsonb) from public;
grant execute on function public.owner_update_cardapio(text, text, jsonb) to anon, authenticated;

create or replace function public.owner_upsert_produto(
  p_slug text,
  p_pin text,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_id uuid;
  produto_id uuid;
  v_nome text;
  v_categoria text;
  v_descricao text;
  v_imagem_url text;
  v_preco numeric(10,2);
begin
  if public.owner_verify_pin(p_slug, p_pin) is not true then
    return false;
  end if;

  select id into c_id
  from public.cardapios
  where slug = lower(trim(p_slug))
  limit 1;

  if c_id is null then
    return false;
  end if;

  v_nome := nullif(trim(p_patch->>'nome'), '');
  if v_nome is null then
    return false;
  end if;

  v_categoria := nullif(trim(p_patch->>'categoria'), '');
  v_descricao := nullif(trim(p_patch->>'descricao'), '');
  v_imagem_url := nullif(trim(p_patch->>'imagem_url'), '');

  begin
    v_preco := (trim(coalesce(p_patch->>'preco', '')))::numeric(10,2);
  exception
    when others then
      return false;
  end;

  if v_preco is null or v_preco < 0 then
    return false;
  end if;

  begin
    if nullif(trim(p_patch->>'id'), '') is not null then
      produto_id := (trim(p_patch->>'id'))::uuid;
    end if;
  exception
    when others then
      return false;
  end;

  if produto_id is null then
    insert into public.produtos (cardapio_id, nome, categoria, descricao, preco, imagem_url, precos, opcoes, estoque_diario)
    values (c_id, v_nome, v_categoria, v_descricao, v_preco, v_imagem_url, p_patch->'precos', p_patch->'opcoes', (p_patch->>'estoque_diario')::integer);
    return true;
  end if;

  update public.produtos
  set
    nome = v_nome,
    categoria = v_categoria,
    descricao = v_descricao,
    preco = v_preco,
    imagem_url = v_imagem_url,
    precos = p_patch->'precos',
    opcoes = p_patch->'opcoes',
    estoque_diario = (p_patch->>'estoque_diario')::integer
  where id = produto_id
    and cardapio_id = c_id;

  if not found then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.owner_upsert_produto(text, text, jsonb) from public;
grant execute on function public.owner_upsert_produto(text, text, jsonb) to anon, authenticated;

create or replace function public.owner_delete_produto(
  p_slug text,
  p_pin text,
  p_produto_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c_id uuid;
begin
  if public.owner_verify_pin(p_slug, p_pin) is not true then
    return false;
  end if;

  select id into c_id
  from public.cardapios
  where slug = lower(trim(p_slug))
  limit 1;

  if c_id is null then
    return false;
  end if;

  delete from public.produtos
  where id = p_produto_id
    and cardapio_id = c_id;

  if not found then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.owner_delete_produto(text, text, uuid) from public;
grant execute on function public.owner_delete_produto(text, text, uuid) to anon, authenticated;

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

 / * 
     P A T C H   P A R A   N O V A S   F U N C I O N A L I D A D E S   ( M A R M I T A   E   T A M A N H O S ) : 
     
     - -   1 .   A d i c i o n a r   c o l u n a   d e   p r e Ã§ o s   J S O N B   n o s   p r o d u t o s   ( p a r a   t a m a n h o s   P ,   M ,   G ) 
     A L T E R   T A B L E   p u b l i c . p r o d u t o s   A D D   C O L U M N   I F   N O T   E X I S T S   p r e c o s   j s o n b ; 
 
     - -   2 .   A d i c i o n a r   c o l u n a   d e   t e m p l a t e s   J S O N B   n o s   c a r d Ã¡ p i o s 
     A L T E R   T A B L E   p u b l i c . c a r d a p i o s   A D D   C O L U M N   I F   N O T   E X I S T S   t e m p l a t e s   j s o n b ; 
 
     - -   3 .   R o d a r   a s   f u n Ã§ Ãµ e s   a t u a l i z a d a s   ( o w n e r _ u p s e r t _ p r o d u t o ,   e t c )   q u e   e s t Ã£ o   n e s t e   a r q u i v o . 
 * / 
 
 
