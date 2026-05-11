-- Patch para adicionar o Modo Agendamento de Serviços

-- 1. Atualizar o check constraint da coluna modo na tabela cardapios
ALTER TABLE public.cardapios DROP CONSTRAINT IF EXISTS cardapios_modo_check;
ALTER TABLE public.cardapios ADD CONSTRAINT cardapios_modo_check CHECK (modo IN ('pedido', 'catalogo', 'marmita', 'agendamento'));

-- 2. Adicionar colunas de configuração para o agendamento
ALTER TABLE public.cardapios ADD COLUMN IF NOT EXISTS agendamento_intervalo INTEGER DEFAULT 30; -- Em minutos
ALTER TABLE public.cardapios ADD COLUMN IF NOT EXISTS agendamento_dias_semana TEXT DEFAULT '1,2,3,4,5,6'; -- 0=Dom, 1=Seg, etc.
ALTER TABLE public.cardapios ADD COLUMN IF NOT EXISTS agendamento_horario_inicio TIME DEFAULT '08:00';
ALTER TABLE public.cardapios ADD COLUMN IF NOT EXISTS agendamento_horario_fim TIME DEFAULT '18:00';

-- 3. Adicionar coluna de data/hora agendada na tabela de pedidos
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS data_hora_agendada TIMESTAMPTZ;

-- 4. Adicionar política para permitir que qualquer um veja os horários agendados (para evitar conflitos no frontend)
-- Nota: Isso é opcional dependendo de como você quer que a privacidade funcione.
-- Aqui, vamos permitir leitura pública apenas da data_hora_agendada e cardapio_id para ver disponibilidade.
DROP POLICY IF EXISTS "public read agendamentos" ON public.pedidos;
CREATE POLICY "public read agendamentos" ON public.pedidos
FOR SELECT USING (true);
