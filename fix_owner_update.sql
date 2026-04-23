-- SQL para corrigir a função owner_update_cardapio
-- Execute este script no SQL Editor do Supabase

-- Atualizar a função owner_update_cardapio para incluir os campos modo e modo_garcom_enabled
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

-- Garantir permissões corretas
REVOKE ALL ON FUNCTION public.owner_update_cardapio(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.owner_update_cardapio(text, text, jsonb) TO anon, authenticated;
