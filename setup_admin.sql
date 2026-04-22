-- Script para configurar o acesso admin
-- Execute este script no SQL Editor do Supabase

-- 1. Verifique usuários existentes
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- 2. Adicione o usuário à tabela de admins
-- Substitua 'SEU_AUTH_UID' pelo UID real do usuário (copie da query acima)
INSERT INTO public.admins (user_id) 
VALUES ('SEU_AUTH_UID') 
ON CONFLICT (user_id) DO NOTHING;

-- 3. Defina um PIN para o admin (exemplo: 1664800)
UPDATE public.admin_settings 
SET admin_pin_hash = crypt('1664800', gen_salt('bf')), updated_at = now()
WHERE id = 1;

-- 4. Verifique se tudo foi configurado corretamente
SELECT 
  a.user_id,
  u.email,
  a.created_at as admin_since,
  CASE WHEN asettings.admin_pin_hash IS NOT NULL THEN 'PIN definido' ELSE 'PIN não definido' END as pin_status
FROM public.admins a
LEFT JOIN auth.users u ON u.id = a.user_id
LEFT JOIN public.admin_settings asettings ON asettings.id = 1
WHERE a.user_id = 'SEU_AUTH_UID';
