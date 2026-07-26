// Supabase Edge Function: kiwify-webhook
// Recebe notificações POST da Kiwify quando uma venda é aprovada, cancelada ou reembolsada.
// URL para configurar no Kiwify: https://<seu-projeto>.supabase.co/functions/v1/kiwify-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@3.2.0";

const KIWIFY_SECRET = Deno.env.get("KIWIFY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  // Apenas aceita POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validação de assinatura da Kiwify (segurança)
  // A Kiwify envia o token no campo "webhook_token" ou via query param
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? String(body.webhook_token ?? "");

  if (KIWIFY_SECRET && token !== KIWIFY_SECRET) {
    console.error("Webhook token inválido:", token);
    return new Response("Unauthorized", { status: 401 });
  }

  // Extrai os dados relevantes do payload da Kiwify
  const order = body as {
    order_id?: string;
    order_status?: string;
    Customer?: { email?: string };
    Product?: { name?: string };
  };

  const kiwify_order_id = String(order.order_id ?? "");
  const raw_status = String(order.order_status ?? "").toLowerCase();
  const email = String(order?.Customer?.email ?? "").toLowerCase().trim();
  const produto_nome = String(order?.Product?.name ?? "").toLowerCase();

  if (!email || !kiwify_order_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Mapeia o status da Kiwify para o nosso formato
  const status_map: Record<string, string> = {
    paid: "aprovado",
    approved: "aprovado",
    refunded: "reembolsado",
    chargedback: "reembolsado",
    cancelled: "cancelado",
  };
  const status = status_map[raw_status] ?? raw_status;

  // Detecta o plano pelo nome do produto
  const plano = produto_nome.includes("agendamento") ? "agendamento" : "catalogo";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (status === "aprovado") {
    // Insere nova compra (ignora duplicatas pelo kiwify_order_id)
    const { error } = await supabase.from("vendas_kiwify").upsert(
      {
        email,
        plano,
        status: "aprovado",
        kiwify_order_id,
        loja_criada: false,
      },
      { onConflict: "kiwify_order_id" }
    );

    if (error) {
      console.error("Erro ao salvar venda:", error);
      return new Response("Database error", { status: 500 });
    }

    console.log(`✅ Venda aprovada salva: ${email} | plano: ${plano}`);

    // Dispara o e-mail de acesso usando o Resend
    if (RESEND_API_KEY) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="background-color: #ff7b00; padding: 24px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Acesso Liberado! 🎉</h1>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Olá,</p>
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Seu pagamento foi confirmado com sucesso. O seu acesso para configurar o seu <strong>${plano === 'agendamento' ? 'Agendamento de Serviços' : 'Catálogo Digital'}</strong> está pronto!</p>
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 32px;">Clique no botão abaixo e informe exatamente este e-mail da compra (<strong>${email}</strong>) para criar sua loja e definir o seu PIN de acesso.</p>
            
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="https://cardapios.newneo.com.br/admin/owner" style="background: linear-gradient(135deg, #ff7b00, #ff9900); color: #fff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">Criar Minha Loja Agora</a>
            </div>
            
            <p style="font-size: 14px; color: #666; text-align: center; margin-top: 24px; padding-top: 24px; border-top: 1px solid #eee;">
              Se tiver alguma dúvida, basta responder este e-mail.
            </p>
          </div>
        </div>
      `;

      const { error: emailError } = await resend.emails.send({
        from: 'NewNeo <contato@newneo.com.br>',
        to: email,
        subject: 'SEU ACESSO: Crie sua loja digital (NewNeo)',
        html: emailHtml
      });

      if (emailError) {
        console.error("Erro ao enviar email:", emailError);
      } else {
        console.log(`✉️ Email enviado com sucesso para ${email}`);
      }
    } else {
      console.warn("⚠️ RESEND_API_KEY não configurada. Email não enviado.");
    }
  } else {
    // Atualiza o status de compras existentes (reembolso/cancelamento)
    const { error } = await supabase
      .from("vendas_kiwify")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("kiwify_order_id", kiwify_order_id);

    if (error) {
      console.error("Erro ao atualizar status:", error);
      return new Response("Database error", { status: 500 });
    }

    console.log(`🔄 Status atualizado: ${kiwify_order_id} → ${status}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
