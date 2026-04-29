-- SQL para adicionar o campo modo_garcom_enabled na tabela cardapios
-- Execute este script no SQL Editor do Supabase

-- 1. Adicionar a coluna na tabela cardapios (se ainda não existir)
ALTER TABLE public.cardapios 
ADD COLUMN IF NOT EXISTS modo_garcom_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Atualizar a função owner_update_cardapio para incluir o novo campo
CREATE OR REPLACE FUNCTION public.owner_update_cardapio(
  p_slug text,
  p_pin text,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  c_id uuid;
  ok boolean;
BEGIN
  ok := public.owner_verify_pin(p_slug, p_pin);
  IF ok IS NOT TRUE THEN
    RETURN false;
  END IF;

  SELECT id INTO c_id
  FROM public.cardapios
  WHERE slug = lower(trim(p_slug))
  LIMIT 1;

  IF c_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.cardapios
  SET
    nome = coalesce(nullif(trim(p_patch->>'nome'), ''), nome),
    whatsapp = coalesce(nullif(trim(p_patch->>'whatsapp'), ''), whatsapp),
    slogan = coalesce(nullif(trim(p_patch->>'slogan'), ''), slogan),
    modo = coalesce(nullif(trim(p_patch->>'modo'), ''), modo),
    modo_garcom_enabled = coalesce(p_patch->>'modo_garcom_enabled', modo_garcom_enabled),
    modo_marmita_enabled = coalesce(p_patch->>'modo_marmita_enabled', modo_marmita_enabled),
    marmita_agendamento_enabled = coalesce(p_patch->>'marmita_agendamento_enabled', marmita_agendamento_enabled),
    marmita_horarios_retirada = coalesce(nullif(trim(p_patch->>'marmita_horarios_retirada'), ''), marmita_horarios_retirada),
    marmita_dias_semana = coalesce(nullif(trim(p_patch->>'marmita_dias_semana'), ''), marmita_dias_semana),
    marmita_instrucoes = coalesce(nullif(trim(p_patch->>'marmita_instrucoes'), ''), marmita_instrucoes),
    horario_funcionamento = coalesce(nullif(trim(p_patch->>'horario_funcionamento'), ''), horario_funcionamento),
    abre_em = CASE
      WHEN nullif(trim(p_patch->>'abre_em'), '') IS NOT NULL THEN (trim(p_patch->>'abre_em'))::time
      ELSE abre_em
    END,
    fecha_em = CASE
      WHEN nullif(trim(p_patch->>'fecha_em'), '') IS NOT NULL THEN (trim(p_patch->>'fecha_em'))::time
      ELSE fecha_em
    END,
    endereco = coalesce(nullif(trim(p_patch->>'endereco'), ''), endereco),
    instagram_url = coalesce(nullif(trim(p_patch->>'instagram_url'), ''), instagram_url),
    foto_url = coalesce(nullif(trim(p_patch->>'foto_url'), ''), foto_url),
    banner_url = coalesce(nullif(trim(p_patch->>'banner_url'), ''), banner_url)
  WHERE id = c_id;

  RETURN true;
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$$;

-- 3. Garantir permissões corretas
REVOKE ALL ON FUNCTION public.owner_update_cardapio(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.owner_update_cardapio(text, text, jsonb) TO anon, authenticated;

-- 4. Verificar se a coluna foi adicionada corretamente
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'cardapios' 
AND column_name = 'modo_garcom_enabled';
