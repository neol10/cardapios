import {
  assertSupabaseConfig,
  formatPriceBRL,
  onlyDigits,
  supabase
} from "../shared/supabase.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const cart = [];
let activeCardapio = null;
let activeProdutos = [];

const produtosContainer = document.querySelector("#produtos");
const cartItemsContainer = document.querySelector("#cart-items");
const cartTotal = document.querySelector("#cart-total");
const cartSubtotal = document.querySelector("#cart-subtotal");
const cartTaxa = document.querySelector("#cart-taxa");
const cartMinimo = document.querySelector("#cart-minimo");
const checkoutForm = document.querySelector("#checkout-form");
const checkoutMessage = document.querySelector("#checkout-message");
const telefoneInput = document.querySelector("#telefone");
const cardapioFoto = document.querySelector("#cardapio-foto");
const cartBox = document.querySelector(".cart-box");

const cardapioSubtitle = document.querySelector("#cardapio-subtitle");
const cardapioInfo = document.querySelector("#cardapio-info");
const cardapioStatus = document.querySelector("#cardapio-status");
const cardapioHorario = document.querySelector("#cardapio-horario");
const cardapioEndereco = document.querySelector("#cardapio-endereco");
const cardapioPagamentos = document.querySelector("#cardapio-pagamentos");
const cardapioInstagram = document.querySelector("#cardapio-instagram");
const cardapioMaps = document.querySelector("#cardapio-maps");
const cardapioWhatsappTop = document.querySelector("#cardapio-whatsapp-top");
const whatsappFab = document.querySelector("#whatsapp-fab");

const tipoPedidoWrap = document.querySelector("#tipo-pedido-wrap");
const tipoPedidoSelect = document.querySelector("#tipo_pedido");
const enderecoWrap = document.querySelector("#endereco-wrap");
const pagamentoWrap = document.querySelector("#pagamento-wrap");
const pagamentoSelect = document.querySelector("#pagamento");

const cardapioNomeEl = document.querySelector("#cardapio-nome");

function setHeaderState(title, subtitle) {
  if (cardapioNomeEl) cardapioNomeEl.textContent = title;
  if (typeof subtitle === "string" && cardapioSubtitle) cardapioSubtitle.textContent = subtitle;
}

function getSlugFromUrl() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const cardapioIndex = segments.findIndex((segment) => segment === "cardapio");
  const slugSegment = cardapioIndex >= 0 ? segments[cardapioIndex + 1] : "";

  if (slugSegment && slugSegment !== "index.html") return slugSegment;

  const querySlug = new URLSearchParams(window.location.search).get("slug");
  return querySlug || "";
}

function setThemeColor(color) {
  const root = document.documentElement;
  root.style.setProperty("--theme", color || "#ff6a00");
}

function setSecondaryColor(color) {
  const root = document.documentElement;
  root.style.setProperty("--theme2", color || "#c8945b");
}

const FONT_STACKS = {
  sora: '"Sora", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  inter: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  poppins: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  montserrat: '"Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  nunito: '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  rubik: '"Rubik", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  outfit: '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  dm_sans: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  work_sans: '"Work Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  lora: '"Lora", Georgia, "Times New Roman", Times, serif',
  merriweather: '"Merriweather", Georgia, "Times New Roman", Times, serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
};

function toFontWeight(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 200 || n > 900) return fallback;
  return n;
}

function applyFontSettings(cardapio) {
  const key = safeText(cardapio?.fonte_key) || "sora";
  const stack = FONT_STACKS[key] || FONT_STACKS.sora;
  document.documentElement.style.setProperty("--font", stack);

  const pesoTexto = toFontWeight(cardapio?.fonte_peso_texto, 400);
  const pesoTitulo = toFontWeight(cardapio?.fonte_peso_titulo, 800);
  document.documentElement.style.setProperty("--font-weight", String(pesoTexto));
  document.documentElement.style.setProperty("--heading-weight", String(pesoTitulo));
}

function setOptionalVar(name, value) {
  const v = safeText(value);
  if (!v) return;
  document.documentElement.style.setProperty(name, v);
}

function applyBackgroundStyle(cardapio) {
  const estilo = safeText(cardapio?.fundo_estilo) || "padrao";
  document.body.classList.remove("bg-solid", "bg-linear", "bg-radial");

  if (estilo === "solido") {
    document.body.classList.add("bg-solid");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    return;
  }

  if (estilo === "degrade_linear") {
    document.body.classList.add("bg-linear");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    setOptionalVar("--bg1", cardapio?.fundo_cor_1 || cardapio?.cor_tema);
    setOptionalVar("--bg2", cardapio?.fundo_cor_2);
    const angle = Number(cardapio?.fundo_angulo ?? 135);
    document.documentElement.style.setProperty("--bg-angle", String(Number.isFinite(angle) ? angle : 135));
    return;
  }

  if (estilo === "degrade_radial") {
    document.body.classList.add("bg-radial");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    setOptionalVar("--bg1", cardapio?.fundo_cor_1 || cardapio?.cor_tema);
    setOptionalVar("--bg2", cardapio?.fundo_cor_2);
    return;
  }
}

function hexToRgb(hex) {
  const raw = safeText(hex);
  if (!raw.startsWith("#")) return null;
  const h = raw.slice(1);
  if (h.length === 3) {
    const r = Number.parseInt(h[0] + h[0], 16);
    const g = Number.parseInt(h[1] + h[1], 16);
    const b = Number.parseInt(h[2] + h[2], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  return null;
}

function relativeLuminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function applyAutoContrastClass() {
  const root = document.documentElement;
  const styles = window.getComputedStyle(root);
  const surface = hexToRgb(styles.getPropertyValue("--surface").trim());
  const bg = hexToRgb(styles.getPropertyValue("--bg").trim());

  const surfaceLum = surface ? relativeLuminance(surface) : 1;
  const bgLum = bg ? relativeLuminance(bg) : 1;
  const isDark = Math.min(surfaceLum, bgLum) < 0.22;
  document.body.classList.toggle("theme-dark", isDark);
}

function setTotalLineValue(el, label, valueText) {
  if (!el) return;
  const labelEl = el.querySelector("[data-label]");
  const valueEl = el.querySelector("[data-value]");
  if (labelEl) labelEl.textContent = label;
  if (valueEl) valueEl.textContent = valueText;
  if (!labelEl || !valueEl) el.textContent = `${label}: ${valueText}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parsePayments(text) {
  return safeText(text)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTipoPedido() {
  const value = String(tipoPedidoSelect?.value || "entrega");
  return value === "retirada" ? "retirada" : "entrega";
}

function getTaxaEntregaAtual() {
  if (!activeCardapio) return 0;
  const tipo = getTipoPedido();
  if (tipo === "retirada") return 0;
  const taxa = Number(activeCardapio.taxa_entrega || 0);
  return Number.isFinite(taxa) ? taxa : 0;
}

function maskTelefone(value) {
  // Máscara simples: aceita 10 ou 11 dígitos sem travar.
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits.length) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const CLOSED_MESSAGE = "A loja está fechada no momento.";

function parseTimeToMinutes(hhmm) {
  const raw = safeText(hhmm);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isOpenNow(cardapio, date = new Date()) {
  const start = parseTimeToMinutes(cardapio?.abre_em);
  const end = parseTimeToMinutes(cardapio?.fecha_em);

  // Se não configurou horários, considera aberto (não bloqueia pedidos)
  if (start == null || end == null) return true;

  const minutesNow = date.getHours() * 60 + date.getMinutes();

  // Mesmo horário -> trata como sempre fechado (evita ambiguidade)
  if (start === end) return false;

  // Normal: 09:00 -> 18:00
  if (start < end) return minutesNow >= start && minutesNow < end;

  // Virando a meia-noite: 18:00 -> 02:00
  return minutesNow >= start || minutesNow < end;
}

function setCheckoutEnabled(enabled, reasonText = "") {
  const btn = checkoutForm?.querySelector('button[type="submit"]');
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = !enabled;

    if (!btn.dataset.originalText) {
      btn.dataset.originalText = btn.textContent || "";
    }

    if (!enabled && reasonText === CLOSED_MESSAGE) {
      btn.textContent = "Fechado no momento";
    } else if (enabled) {
      btn.textContent = btn.dataset.originalText || "Finalizar pedido";
    }
  }
  if (!enabled && reasonText) setCheckoutMessage(reasonText, true);
  if (enabled && checkoutMessage?.textContent === CLOSED_MESSAGE) setCheckoutMessage("");
}

function isNomeCompleto(nome) {
  const parts = nome
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length >= 2;
}

function setCheckoutMessage(text, isError = false) {
  checkoutMessage.textContent = text;
  checkoutMessage.style.color = isError ? "#cc3a2d" : "#1f8f5f";
}

function pulseCart() {
  if (!cartBox) return;
  cartBox.classList.remove("cart-pulse");
  // Força reflow pra reiniciar a animação
  void cartBox.offsetHeight;
  cartBox.classList.add("cart-pulse");
  window.setTimeout(() => cartBox.classList.remove("cart-pulse"), 320);
}

function updateOpenClosedUI() {
  if (!activeCardapio) return;
  const abertoAgora = isOpenNow(activeCardapio);

  if (cardapioStatus) {
    cardapioStatus.classList.remove("is-hidden", "is-open", "is-closed");
    cardapioStatus.classList.add(abertoAgora ? "is-open" : "is-closed");
    cardapioStatus.textContent = abertoAgora ? "Aberto agora" : "Fechado agora";
  }

  setCheckoutEnabled(abertoAgora, CLOSED_MESSAGE);

  const whatsappNumber = onlyDigits(activeCardapio?.whatsapp);
  const waBaseLink = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
  const botao = safeText(activeCardapio?.whatsapp_botao) || "flutuante";
  if (whatsappFab) {
    whatsappFab.classList.toggle("is-hidden", !(waBaseLink && botao === "flutuante" && abertoAgora));
  }
}

function renderProdutos() {
  if (!activeProdutos.length) {
    produtosContainer.innerHTML = '<p class="muted">Nenhum produto disponível neste cardápio.</p>';
    return;
  }

  produtosContainer.innerHTML = activeProdutos
    .map(
      (produto) => {
        const nome = escapeHtml(produto.nome);
        const imageUrl = safeHttpUrl(produto.imagem_url) ||
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
        return `
      <article class="produto-card">
        <div class="produto-media">
          <img src="${imageUrl}" alt="${nome}" loading="lazy" />
        </div>
        <div class="produto-body">
          <h3>${nome}</h3>
          <p class="price">${formatPriceBRL(produto.preco)}</p>
          <button class="btn btn-primary add-to-cart" data-id="${produto.id}">Adicionar ao pedido</button>
        </div>
      </article>
    `;
      }
    )
    .join("");
}

function calculateTotal() {
  const subtotal = cart.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  return subtotal + getTaxaEntregaAtual();
}

function calculateSubtotal() {
  return cart.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
}

function renderCart() {
  if (!cart.length) {
    cartItemsContainer.innerHTML = '<p class="muted">Seu carrinho está vazio.</p>';
    setTotalLineValue(cartSubtotal, "Subtotal", "R$ 0,00");
    if (cartTaxa) cartTaxa.classList.add("is-hidden");
    if (cartMinimo) cartMinimo.classList.add("is-hidden");
    setTotalLineValue(cartTotal, "Total", "R$ 0,00");
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <div class="cart-item-main">
          <div class="cart-item-title">
            <span class="cart-qty">${item.quantidade}x</span>
            <span class="cart-name">${escapeHtml(item.nome)}</span>
          </div>
          <div class="cart-item-sub">
            <span class="cart-price">${formatPriceBRL(item.preco * item.quantidade)}</span>
          </div>
        </div>
        <button class="btn btn-ghost remove-item" data-id="${item.id}" aria-label="Remover ${escapeHtml(item.nome)}">Remover</button>
      </div>
    `
    )
    .join("");

  const subtotal = calculateSubtotal();
  const taxa = getTaxaEntregaAtual();
  setTotalLineValue(cartSubtotal, "Subtotal", formatPriceBRL(subtotal));

  if (cartTaxa) {
    if (taxa > 0) {
      setTotalLineValue(cartTaxa, "Taxa de entrega", formatPriceBRL(taxa));
      cartTaxa.classList.remove("is-hidden");
    } else {
      cartTaxa.classList.add("is-hidden");
    }
  }

  if (cartMinimo && activeCardapio) {
    const minimo = Number(activeCardapio.pedido_minimo || 0);
    if (minimo > 0) {
      cartMinimo.textContent = `Pedido mínimo: ${formatPriceBRL(minimo)}`;
      cartMinimo.classList.remove("is-hidden");
    } else {
      cartMinimo.classList.add("is-hidden");
    }
  }

  setTotalLineValue(cartTotal, "Total", formatPriceBRL(calculateTotal()));
}

function addToCart(produtoId, buttonElement) {
  const selected = activeProdutos.find((item) => item.id === produtoId);
  if (!selected) return;

  const existing = cart.find((item) => item.id === produtoId);
  if (existing) {
    existing.quantidade += 1;
  } else {
    cart.push({
      id: selected.id,
      nome: selected.nome,
      preco: Number(selected.preco),
      quantidade: 1
    });
  }

  renderCart();
  pulseCart();

  if (buttonElement) {
    buttonElement.classList.add("flash");
    setTimeout(() => buttonElement.classList.remove("flash"), 300);
  }
}

function removeFromCart(produtoId) {
  const index = cart.findIndex((item) => item.id === produtoId);
  if (index < 0) return;

  if (cart[index].quantidade > 1) {
    cart[index].quantidade -= 1;
  } else {
    cart.splice(index, 1);
  }

  renderCart();
  pulseCart();
}

function buildWhatsappMessage({ nome, telefone, endereco }) {
  const subtotal = calculateSubtotal();
  const taxaEntrega = getTaxaEntregaAtual();
  const total = subtotal + taxaEntrega;
  const tipoPedido = getTipoPedido();
  const tipoPedidoLabel = tipoPedido === "retirada" ? "Retirada" : "Entrega";
  const pagamento = String(pagamentoSelect?.value || "").trim();

  const itensTexto = cart
    .map((item) => {
      const totalItem = item.preco * item.quantidade;
      const unit = formatPriceBRL(item.preco);
      const totalLine = formatPriceBRL(totalItem);
      return `- ${item.quantidade}x ${item.nome} (${unit}) = ${totalLine}`;
    })
    .join("\n");

  const template = safeText(activeCardapio?.mensagem_whatsapp_template);
  const templateCorrompido = template.includes("\uFFFD") || template.includes("�");
  if (template && !templateCorrompido) {
    const resolvedEndereco = tipoPedido === "retirada" ? "Retirada no balcão" : endereco;
    const vars = {
      LOJA: activeCardapio.nome,
      ITENS: itensTexto,
      SUBTOTAL: formatPriceBRL(subtotal),
      TAXA_ENTREGA: formatPriceBRL(taxaEntrega),
      TOTAL: formatPriceBRL(total),
      NOME: nome,
      TELEFONE: telefone,
      ENDERECO: resolvedEndereco || "Não informado",
      TIPO_PEDIDO: tipoPedidoLabel,
      PAGAMENTO: pagamento || "Não informado"
    };

    const replaceVars = (input) =>
      String(input)
        .replaceAll("\\n", "\n")
        .replaceAll("\r\n", "\n")
        .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}|\{\s*([a-z0-9_]+)\s*\}/gi, (match, p1, p2) => {
          const rawKey = String(p1 || p2 || "");
          const key = rawKey.trim().toUpperCase();
          if (!key) return match;
          if (!(key in vars)) return match;
          return String(vars[key]);
        });

    return replaceVars(template);
  }

  const enderecoLinha = tipoPedido === "retirada" ? "Retirada no balcão" : endereco;

  const defaultTemplate = [
    `*✔ Novo pedido — ${activeCardapio.nome}*`,
    "-------------------------",
    "*RESUMO*",
    `▶ Tipo: ${tipoPedidoLabel}`,
    `▶ Pagamento: ${pagamento || "Não informado"}`,
    "",
    "*CLIENTE*",
    `Nome: ${nome}`,
    `Tel: ${telefone}`,
    "",
    "*ENDEREÇO*",
    `${enderecoLinha || "Não informado"}`,
    "",
    "*ITENS*",
    itensTexto,
    "",
    "*VALORES*",
    `Subtotal: ${formatPriceBRL(subtotal)}`,
    `Taxa de entrega: ${formatPriceBRL(taxaEntrega)}`,
    `*TOTAL: ${formatPriceBRL(total)}*`
  ];

  return defaultTemplate.join("\n");

  // (template padrão acima já retorna)
}

async function savePedido({ nome, telefone, endereco }) {
  const payload = {
    cardapio_id: activeCardapio.id,
    nome_cliente: nome,
    telefone,
    endereco,
    itens: cart.map((item) => ({
      produto_id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco
    }))
  };

  const { error } = await supabase.from("pedidos").insert(payload);
  if (error) throw error;
}

async function loadCardapio() {
  let slug = getSlugFromUrl();
  slug = slug.trim().toLowerCase();

  if (!slug) {
    setHeaderState("Cardápio inválido", "Acesse este cardápio por /cardapio/seu-slug.");
    produtosContainer.innerHTML = '<p class="muted">Acesse este cardápio por /cardapio/seu-slug</p>';
    return;
  }

  if (!supabase) {
    setHeaderState("Falha ao carregar", "Não foi possível iniciar o Supabase neste navegador.");
    produtosContainer.innerHTML = '<p class="muted">Falha ao carregar a biblioteca do Supabase. Verifique sua conexão e bloqueadores (adblock/firewall) e recarregue.</p>';
    return;
  }

  const { data, error } = await supabase
    .from("cardapios")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    setHeaderState("Cardápio não encontrado", "Verifique o link e tente novamente.");
    produtosContainer.innerHTML = '<p class="muted">Cardápio não encontrado para o slug informado.</p>';
    return;
  }

  activeCardapio = data;

  document.querySelector("#cardapio-nome").textContent = data.nome;
  setThemeColor(data.cor_tema);
  setSecondaryColor(data.cor_secundaria);
  applyFontSettings(data);

  // Overrides de cores (opcional)
  setOptionalVar("--bg", data.cor_fundo);
  setOptionalVar("--surface", data.cor_surface);
  setOptionalVar("--text", data.cor_texto);
  setOptionalVar("--muted", data.cor_muted);
  setOptionalVar("--border", data.cor_borda);
  applyBackgroundStyle(data);
  applyAutoContrastClass();

  if (cardapioSubtitle) {
    const slogan = safeText(data.slogan);
    cardapioSubtitle.textContent = slogan || "Escolha seus itens e finalize em poucos passos.";
  }

  const horario = safeText(data.horario_funcionamento);
  const abre = safeText(data.abre_em);
  const fecha = safeText(data.fecha_em);
  const endereco = safeText(data.endereco);
  const instagram = safeText(data.instagram_url);
  const pagamentos = parsePayments(data.formas_pagamento);

  if (cardapioHorario) {
    const horarioTexto = horario || (abre && fecha ? `Horário: ${abre} às ${fecha}` : "");
    cardapioHorario.textContent = horarioTexto;
    cardapioHorario.classList.toggle("is-hidden", !horarioTexto);
  }

  updateOpenClosedUI();

  if (cardapioEndereco) {
    cardapioEndereco.textContent = endereco ? `Endereço: ${endereco}` : "";
    cardapioEndereco.classList.toggle("is-hidden", !endereco);
  }

  if (cardapioPagamentos) {
    cardapioPagamentos.textContent = pagamentos.length ? `Pagamento: ${pagamentos.join(", ")}` : "";
    cardapioPagamentos.classList.toggle("is-hidden", !pagamentos.length);
  }

  if (cardapioInstagram) {
    cardapioInstagram.href = instagram || "#";
    cardapioInstagram.classList.toggle("is-hidden", !instagram);
  }

  if (cardapioMaps) {
    const mapsUrl = endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : "";
    cardapioMaps.href = mapsUrl || "#";
    cardapioMaps.classList.toggle("is-hidden", !mapsUrl);
  }

  const whatsappNumber = onlyDigits(data.whatsapp);
  const waBaseLink = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
  if (cardapioWhatsappTop) {
    cardapioWhatsappTop.href = waBaseLink || "#";
  }
  if (whatsappFab) {
    whatsappFab.href = waBaseLink || "#";
  }

  const botao = safeText(data.whatsapp_botao) || "flutuante";
  if (cardapioWhatsappTop) cardapioWhatsappTop.classList.toggle("is-hidden", !(waBaseLink && botao === "topo"));
  if (whatsappFab) whatsappFab.classList.toggle("is-hidden", !(waBaseLink && botao === "flutuante"));

  // Garante que a regra de horário prevaleça (ex.: esconder o FAB quando fechado)
  updateOpenClosedUI();

  if (cardapioInfo) {
    const showInfo = Boolean(
      (cardapioStatus && !cardapioStatus.classList.contains("is-hidden")) ||
        horario ||
        abre ||
        fecha ||
        endereco ||
        instagram ||
        pagamentos.length ||
        (waBaseLink && botao === "topo")
    );
    cardapioInfo.classList.toggle("is-hidden", !showInfo);
  }

  document.body.classList.toggle("layout-lista", (data.layout_produtos || "grid") === "lista");
  document.body.classList.toggle("densidade-compacta", (data.densidade || "confortavel") === "compacta");

  if (tipoPedidoWrap && tipoPedidoSelect) {
    const aceitaEntrega = Boolean(data.aceita_entrega ?? true);
    const aceitaRetirada = Boolean(data.aceita_retirada ?? true);

    tipoPedidoWrap.classList.toggle("is-hidden", !(aceitaEntrega && aceitaRetirada));

    if (!aceitaEntrega && aceitaRetirada) tipoPedidoSelect.value = "retirada";
    if (aceitaEntrega && !aceitaRetirada) tipoPedidoSelect.value = "entrega";
  }

  // Aplica estado inicial do endereço conforme tipo
  if (enderecoWrap) enderecoWrap.classList.toggle("is-hidden", getTipoPedido() === "retirada");
  const enderecoTextarea = checkoutForm?.querySelector('textarea[name="endereco"]');
  if (enderecoTextarea instanceof HTMLTextAreaElement) {
    enderecoTextarea.required = getTipoPedido() !== "retirada";
  }

  if (pagamentoWrap && pagamentoSelect) {
    const items = pagamentos;
    if (items.length) {
      pagamentoSelect.innerHTML = items.map((p) => `<option value="${p}">${p}</option>`).join("");
      pagamentoWrap.classList.remove("is-hidden");
    } else {
      pagamentoWrap.classList.add("is-hidden");
    }
  }

  renderCart();

  updateOpenClosedUI();

  if (!window.__OPEN_STATUS_TIMER__) {
    window.__OPEN_STATUS_TIMER__ = window.setInterval(() => {
      updateOpenClosedUI();
    }, 60_000);
  }

  if (cardapioFoto) {
    if (data.foto_url) {
      cardapioFoto.src = data.foto_url;
      cardapioFoto.alt = `Foto do ${data.nome}`;
      cardapioFoto.classList.remove("is-hidden");
    } else {
      cardapioFoto.classList.add("is-hidden");
    }
  }

  const bannerUrl = safeText(data.banner_url);
  if (bannerUrl) {
    document.documentElement.style.setProperty("--hero-banner", `url(\"${bannerUrl}\")`);
    document.documentElement.style.setProperty("--hero-banner-opacity", "0.22");
  } else {
    document.documentElement.style.setProperty("--hero-banner", "none");
  }

  const { data: produtos, error: produtosError } = await supabase
    .from("produtos")
    .select("*")
    .eq("cardapio_id", data.id)
    .order("nome");

  if (produtosError) {
    setHeaderState(data.nome, "Não foi possível carregar os produtos.");
    produtosContainer.innerHTML = `<p class="muted">Erro ao carregar produtos: ${produtosError.message}</p>`;
    return;
  }

  activeProdutos = produtos || [];
  renderProdutos();
  renderCart();
}

function attachEvents() {
  telefoneInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    target.value = maskTelefone(target.value);
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("add-to-cart")) {
      addToCart(target.dataset.id, target);
    }

    if (target.classList.contains("remove-item")) {
      removeFromCart(target.dataset.id);
    }
  });

  tipoPedidoSelect?.addEventListener("change", () => {
    const tipo = getTipoPedido();
    const enderecoTextarea = checkoutForm?.querySelector('textarea[name="endereco"]');
    if (enderecoWrap) enderecoWrap.classList.toggle("is-hidden", tipo === "retirada");
    if (enderecoTextarea instanceof HTMLTextAreaElement) {
      enderecoTextarea.required = tipo !== "retirada";
      if (tipo === "retirada") enderecoTextarea.value = "";
    }
    renderCart();
  });

  checkoutForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setCheckoutMessage("");

    if (!activeCardapio) {
      setCheckoutMessage("Cardápio inválido.", true);
      return;
    }

    if (!isOpenNow(activeCardapio)) {
      setCheckoutMessage(CLOSED_MESSAGE, true);
      return;
    }

    if (!cart.length) {
      setCheckoutMessage("Adicione ao menos um item no pedido.", true);
      return;
    }

    const formData = new FormData(checkoutForm);
    const nome = String(formData.get("nome") || "").trim();
    const telefone = String(formData.get("telefone") || "").trim();
    const endereco = String(formData.get("endereco") || "").trim();

    const tipoPedido = getTipoPedido();
    const subtotal = calculateSubtotal();
    const minimo = Number(activeCardapio?.pedido_minimo || 0);

    if (minimo > 0 && subtotal < minimo) {
      setCheckoutMessage(`Pedido mínimo é ${formatPriceBRL(minimo)}.`, true);
      return;
    }

    if (!isNomeCompleto(nome)) {
      setCheckoutMessage("Informe nome completo com pelo menos 2 palavras.", true);
      return;
    }

    if (onlyDigits(telefone).length < 10) {
      setCheckoutMessage("Informe um telefone válido no formato brasileiro.", true);
      return;
    }

    if (tipoPedido !== "retirada") {
      if (endereco.length < 8) {
        setCheckoutMessage("Informe um endereço completo.", true);
        return;
      }
    }

    try {
      await savePedido({ nome, telefone, endereco });
    } catch (error) {
      setCheckoutMessage(`Erro ao salvar pedido: ${error.message}`, true);
      return;
    }

    const whatsappNumber = onlyDigits(activeCardapio.whatsapp);
    if (!whatsappNumber) {
      setCheckoutMessage("WhatsApp do cardápio não configurado.", true);
      return;
    }

    const message = buildWhatsappMessage({ nome, telefone, endereco });
    const waLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    setCheckoutMessage("Pedido salvo. Abrindo WhatsApp...");
    window.open(waLink, "_blank");

    cart.length = 0;
    checkoutForm.reset();
    renderCart();
  });
}

async function init() {
  try {
    try {
      assertSupabaseConfig();
    } catch (error) {
      setHeaderState("Falha ao carregar", "Verifique a configuração e tente novamente.");
      produtosContainer.innerHTML = `<p class="muted">${error.message}</p>`;
      return;
    }

    attachEvents();

    try {
      await loadCardapio();
    } catch (error) {
      setHeaderState("Erro ao carregar", "Tente recarregar a página.");
      const msg = error?.message ? String(error.message) : "Erro desconhecido";
      produtosContainer.innerHTML = `<p class="muted">Erro ao carregar cardápio: ${msg}</p>`;
    }
  } finally {
    document.body.classList.remove("is-loading");
  }
}

init();
