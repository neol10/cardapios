-- Migration: Kiwify Onboarding Automation
-- Execute este script no SQL Editor do Supabase (uma única vez).

-- Tabela para registrar compras aprovadas via Kiwify Webhook
create table if not exists public.vendas_kiwify (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plano text not null default 'catalogo', -- 'catalogo' ou 'agendamento'
  status text not null default 'aprovado', -- 'aprovado', 'cancelado', 'reembolsado'
  kiwify_order_id text unique,             -- ID único do pedido na Kiwify (evita duplicatas)
  loja_criada boolean not null default false,
  loja_slug text,                          -- slug da loja criada pelo cliente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendas_kiwify enable row level security;

-- Apenas o serviço (service_role) pode ler/escrever via Edge Functions.
-- O frontend (anon) não tem acesso direto — segurança total.
revoke all on table public.vendas_kiwify from anon, authenticated;

-- Função pública (segura) para o frontend verificar se um e-mail tem crédito de compra.
-- Retorna apenas um booleano — não expõe nenhum dado sensível.
create or replace function public.kiwify_email_tem_credito(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendas_kiwify
    where lower(email) = lower(trim(p_email))
      and status = 'aprovado'
      and loja_criada = false
  );
$$;

grant execute on function public.kiwify_email_tem_credito(text) to anon;

-- Função pública (segura) para o frontend criar a loja do cliente.
-- Cria a loja no banco e marca o crédito como usado em uma única transação atômica.
create or replace function public.kiwify_criar_loja_cliente(
  p_email text,
  p_nome text,
  p_slug text,
  p_whatsapp text,
  p_pin_hash text,
  p_modo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_venda_id uuid;
  v_cardapio_id uuid;
begin
  -- Valida o modo
  if p_modo not in ('catalogo', 'agendamento') then
    return jsonb_build_object('sucesso', false, 'erro', 'Modo inválido.');
  end if;

  -- Verifica e trava o crédito em uma única operação (evita corrida entre requisições)
  update public.vendas_kiwify
  set loja_criada = true,
      loja_slug = p_slug,
      updated_at = now()
  where lower(email) = lower(trim(p_email))
    and status = 'aprovado'
    and loja_criada = false
  returning id into v_venda_id;

  -- Se não achou crédito, rejeita
  if v_venda_id is null then
    return jsonb_build_object('sucesso', false, 'erro', 'Nenhum crédito disponível para este e-mail.');
  end if;

  -- Tenta criar a loja. Se o slug já existir, desfaz e informa.
  begin
    insert into public.cardapios (
      nome,
      slug,
      whatsapp,
      modo,
      owner_edit_enabled,
      owner_pin_hash
    ) values (
      trim(p_nome),
      lower(trim(p_slug)),
      trim(p_whatsapp),
      p_modo,
      true,
      p_pin_hash
    )
    returning id into v_cardapio_id;
  exception when unique_violation then
    -- Desfaz o bloqueio do crédito para não perder a compra do cliente
    update public.vendas_kiwify
    set loja_criada = false,
        loja_slug = null,
        updated_at = now()
    where id = v_venda_id;

    return jsonb_build_object('sucesso', false, 'erro', 'Este link (slug) já está em uso. Escolha outro.');
  end;

  return jsonb_build_object('sucesso', true, 'slug', lower(trim(p_slug)));
end;
$$;

grant execute on function public.kiwify_criar_loja_cliente(text, text, text, text, text, text) to anon;

-- Adiciona a coluna owner_pin_hash na tabela cardapios (caso não exista)
alter table public.cardapios add column if not exists owner_pin_hash text;

comment on table public.vendas_kiwify is 'Registra compras aprovadas via Webhook da Kiwify para o onboarding automático.';
