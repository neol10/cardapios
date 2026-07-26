// Supabase Edge Function: kiwify-webhook
// Recebe notificações POST da Kiwify quando uma venda é aprovada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@3.2.0";

const KIWIFY_SECRET = Deno.env.get("KIWIFY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? String(body.webhook_token ?? "");
  if (KIWIFY_SECRET && token !== KIWIFY_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const order = body as {
    order_id?: string;
    order_status?: string;
    Customer?: { email?: string; full_name?: string };
    Product?: { name?: string };
  };

  const kiwify_order_id = String(order.order_id ?? "");
  const raw_status = String(order.order_status ?? "").toLowerCase();
  const email = String(order?.Customer?.email ?? "").toLowerCase().trim();
  const nome_cliente = String(order?.Customer?.full_name ?? "").split(" ")[0] || "cliente";
  const produto_nome = String(order?.Product?.name ?? "").toLowerCase();

  if (!email || !kiwify_order_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  const status_map: Record<string, string> = {
    paid: "aprovado", approved: "aprovado",
    refunded: "reembolsado", chargedback: "reembolsado",
    cancelled: "cancelado",
  };
  const status = status_map[raw_status] ?? raw_status;
  const plano = produto_nome.includes("agendamento") ? "agendamento" : "catalogo";
  const plano_label = plano === "agendamento" ? "Agendamento de Serviços" : "Catálogo Digital";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (status === "aprovado") {
    // 1. Salva a venda
    const { error: dbError } = await supabase.from("vendas_kiwify").upsert(
      { email, plano, status: "aprovado", kiwify_order_id, loja_criada: false },
      { onConflict: "kiwify_order_id" }
    );
    if (dbError) {
      console.error("Erro ao salvar venda:", dbError);
      return new Response("Database error", { status: 500 });
    }

    // 2. Gera o link mágico de convite via Supabase Auth
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: "https://cardapios.newneo.com.br/login" }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.warn("Erro ao gerar link:", linkError?.message);
      return new Response(JSON.stringify({ ok: true, aviso: "Link não gerado" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const action_link = linkData.properties.action_link;

    // 3. Envia e-mail bonito via Resend
    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);
      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0d0b;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0d0b;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#1a1714;border-radius:16px;overflow:hidden;border:1px solid #2e2a26;">
        
        <!-- Header laranja -->
        <tr>
          <td style="background:linear-gradient(135deg,#ff7b00,#ff9900);padding:32px;text-align:center;">
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:2px;">NewNeo · Cardápios Digitais</p>
            <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;">🎉 Sua compra foi aprovada!</h1>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 16px;color:#e5e0da;font-size:16px;line-height:1.6;">
              Olá, <strong>${nome_cliente}</strong>! Seu acesso ao <strong>${plano_label}</strong> está liberado.
            </p>
            <p style="margin:0 0 28px;color:#a89f96;font-size:15px;line-height:1.6;">
              Clique no botão abaixo para <strong style="color:#ff9900;">definir sua senha</strong> e criar a sua loja digital em menos de 2 minutos.
            </p>

            <!-- Botão CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${action_link}"
                   style="background:linear-gradient(135deg,#ff7b00,#ff9900);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-weight:800;font-size:17px;display:inline-block;letter-spacing:0.3px;">
                  Definir minha senha →
                </a>
              </td></tr>
            </table>

            <!-- Box de aviso -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:#111009;border:1px solid #2e2a26;border-radius:10px;padding:16px 20px;">
                <p style="margin:0;color:#a89f96;font-size:13px;line-height:1.6;">
                  ⚠️ <strong style="color:#e5e0da;">O link expira em 24 horas.</strong><br>
                  Após definir sua senha, você poderá entrar a qualquer momento em<br>
                  <a href="https://cardapios.newneo.com.br/login" style="color:#ff9900;">cardapios.newneo.com.br/login</a>
                </p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e2a26;text-align:center;">
            <p style="margin:0;color:#55504b;font-size:12px;">
              Você recebeu este e-mail porque realizou uma compra na NewNeo.<br>
              Em caso de dúvidas, responda este e-mail.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const { error: emailError } = await resend.emails.send({
        from: "NewNeo <contato@newneo.com.br>",
        to: email,
        subject: `🎉 Sua loja digital está esperando por você, ${nome_cliente}!`,
        html
      });

      if (emailError) {
        console.error("Erro Resend:", emailError);
      } else {
        console.log(`✉️ E-mail bonito enviado para ${email}`);
      }
    }

    console.log(`✅ Venda processada: ${email} | ${plano}`);

  } else {
    // Atualiza status (reembolso/cancelamento)
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
