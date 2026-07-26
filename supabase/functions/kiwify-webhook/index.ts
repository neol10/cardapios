// Supabase Edge Function: kiwify-webhook
// Recebe notificações POST da Kiwify quando uma venda é aprovada, cancelada ou reembolsada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KIWIFY_SECRET = Deno.env.get("KIWIFY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  // Validação do token
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? String(body.webhook_token ?? "");
  if (KIWIFY_SECRET && token !== KIWIFY_SECRET) {
    console.error("Webhook token inválido:", token);
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
  const produto_nome = String(order?.Product?.name ?? "").toLowerCase();

  if (!email || !kiwify_order_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  const status_map: Record<string, string> = {
    paid: "aprovado",
    approved: "aprovado",
    refunded: "reembolsado",
    chargedback: "reembolsado",
    cancelled: "cancelado",
  };
  const status = status_map[raw_status] ?? raw_status;
  const plano = produto_nome.includes("agendamento") ? "agendamento" : "catalogo";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (status === "aprovado") {
    // Salva a venda no banco
    const { error } = await supabase.from("vendas_kiwify").upsert(
      { email, plano, status: "aprovado", kiwify_order_id, loja_criada: false },
      { onConflict: "kiwify_order_id" }
    );

    if (error) {
      console.error("Erro ao salvar venda:", error);
      return new Response("Database error", { status: 500 });
    }

    console.log(`✅ Venda aprovada salva: ${email} | plano: ${plano}`);

    // Envia convite via Supabase Auth para o cliente definir a senha
    // O e-mail de convite terá um link para cardapios.newneo.com.br/login
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://cardapios.newneo.com.br/login",
      data: { plano }
    });

    if (inviteError) {
      // Se o usuário já existe, apenas loga (não é erro crítico)
      console.warn(`⚠️ Convite não enviado para ${email}: ${inviteError.message}`);
    } else {
      console.log(`✉️ Convite de acesso enviado para ${email}`);
    }

  } else {
    // Atualiza o status (reembolso/cancelamento)
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
