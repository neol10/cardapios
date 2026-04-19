import {
  assertSupabaseConfig,
  formatPriceBRL,
  onlyDigits,
  parseMoneyInput,
  slugify,
  supabase
} from "../shared/supabase.js";

const loginForm = document.querySelector("#login-form");
const authMessage = document.querySelector("#auth-message");

const state = {
  cardapios: [],
  selectedCardapioId: null,
  produtos: [],
  isEditingCardapio: false
};

function refreshColorPreviewForInput(input) {
  const row = input.closest(".color-row");
  if (!row) return;
  const swatch = row.querySelector(".color-swatch");
  const hex = row.querySelector(".color-hex");
  const value = String(input.value || "").trim();
  if (hex) hex.textContent = value ? value.toUpperCase() : "";
  if (swatch instanceof HTMLElement) {
    swatch.style.backgroundColor = value || "transparent";
  }
}

function refreshAllColorPreviews(root) {
  if (!root) return;
  root.querySelectorAll('input[type="color"]').forEach((input) => {
    if (input instanceof HTMLInputElement) refreshColorPreviewForInput(input);
  });
}

function setupColorPreviewListeners(root) {
  if (!root) return;
  root.querySelectorAll('input[type="color"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const handler = () => refreshColorPreviewForInput(input);
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });
  refreshAllColorPreviews(root);
}

function maskTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits.length) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function setMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.classList.remove("success", "error");
  if (type) element.classList.add(type);
}

function toast(text, type = "success") {
  const container = document.querySelector("#toast-container");
  if (!container) return;

  const toastEl = document.createElement("div");
  toastEl.className = `toast ${type === "error" ? "toast-error" : "toast-success"}`;
  toastEl.setAttribute("role", "status");
  toastEl.textContent = text;
  container.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.classList.add("is-visible");
  });

  window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
    window.setTimeout(() => toastEl.remove(), 180);
  }, 2600);
}

function getHiddenIdField(form) {
  return form?.querySelector('input[name="id"]') || null;
}

async function initLoginPage() {
  try {
    assertSupabaseConfig();
  } catch (error) {
    setMessage(authMessage, error.message, "error");
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = "./dashboard.html";
    return;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(authMessage, "Entrando...");

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(authMessage, error.message, "error");
      return;
    }

    setMessage(authMessage, "Login realizado com sucesso.", "success");
    window.location.href = "./dashboard.html";
  });
}

async function requireAuth() {
  try {
    assertSupabaseConfig();
  } catch (error) {
    toast(error.message, "error");
    window.location.href = "./index.html";
    return null;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "./index.html";
    return null;
  }

  return session;
}

function setSelectedCardapio(id) {
  state.selectedCardapioId = id;
  const info = document.querySelector("#produto-contexto");
  const selected = state.cardapios.find((item) => item.id === id);

  if (info) {
    info.textContent = selected
      ? `Gerenciando produtos de ${selected.nome}`
      : "Selecione um cardápio para gerenciar produtos.";
  }
}

function setEditingMode(isEditing) {
  state.isEditingCardapio = isEditing;
  const produtosPanel = document.querySelector("#produtos-panel");
  const pedidosPanel = document.querySelector("#pedidos-panel");
  if (produtosPanel) produtosPanel.classList.toggle("is-hidden", !isEditing);
  if (pedidosPanel) pedidosPanel.classList.toggle("is-hidden", !isEditing);
}

function renderCardapios() {
  const container = document.querySelector("#cardapios-list");
  if (!container) return;

  if (!state.cardapios.length) {
    container.innerHTML = '<p class="muted">Nenhum cardápio cadastrado.</p>';
    return;
  }

  container.innerHTML = state.cardapios
    .map(
      (item) => `
      <article class="list-item" data-id="${item.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          ${item.foto_url ? `<img src="${item.foto_url}" alt="${item.nome}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:1px solid var(--border);" />` : ""}
          <h3 style="margin:0;">${item.nome}</h3>
        </div>
        <p class="muted">Slug: /cardapio/${item.slug}</p>
        <p class="muted">WhatsApp: ${item.whatsapp}</p>
        <div class="list-actions">
          <a class="btn" href="/cardapio/${item.slug}" target="_blank" rel="noopener">Abrir cardápio</a>
          <button class="btn js-manage-cardapio" data-id="${item.id}">Gerenciar</button>
          <button class="btn js-edit-cardapio" data-id="${item.id}">Editar dados</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderProdutos() {
  const container = document.querySelector("#produtos-list");
  if (!container) return;

  if (!state.selectedCardapioId) {
    container.innerHTML = '<p class="muted">Selecione um cardápio acima.</p>';
    return;
  }

  if (!state.produtos.length) {
    container.innerHTML = '<p class="muted">Nenhum produto cadastrado.</p>';
    return;
  }

  container.innerHTML = state.produtos
    .map(
      (item) => `
      <article class="list-item" data-id="${item.id}">
        <h3>${item.nome}</h3>
        <p>${formatPriceBRL(item.preco)}</p>
        ${item.imagem_url ? `<img src="${item.imagem_url}" alt="${item.nome}" style="width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px;" />` : ""}
        <div class="list-actions">
          <button class="btn js-edit-produto" data-id="${item.id}">Editar</button>
          <button class="btn js-delete-produto" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderPedidos(pedidos) {
  const container = document.querySelector("#pedidos-list");
  if (!container) return;

  if (!pedidos.length) {
    container.innerHTML = '<p class="muted">Nenhum pedido recebido.</p>';
    return;
  }

  container.innerHTML = pedidos
    .map((pedido) => {
      const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
      const itensText = itens
        .map((item) => `${item.quantidade}x ${item.nome} (${formatPriceBRL(item.preco_unitario)})`)
        .join(" | ");

      return `
      <article class="list-item">
        <h3>${pedido.nome_cliente}</h3>
        <p><strong>Telefone:</strong> ${pedido.telefone}</p>
        <p><strong>Endereço:</strong> ${pedido.endereco}</p>
        <p><strong>Itens:</strong> ${itensText || "Sem itens"}</p>
        <p class="muted"><strong>Data:</strong> ${new Date(pedido.created_at).toLocaleString("pt-BR")}</p>
      </article>
    `;
    })
    .join("");
}

async function loadCardapios() {
  const { data, error } = await supabase
    .from("cardapios")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    toast(`Erro ao carregar cardápios: ${error.message}`, "error");
    return;
  }

  state.cardapios = data || [];
  renderCardapios();
}

async function loadProdutos() {
  if (!state.selectedCardapioId) {
    state.produtos = [];
    renderProdutos();
    return;
  }

  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("cardapio_id", state.selectedCardapioId)
    .order("nome");

  if (error) {
    toast(`Erro ao carregar produtos: ${error.message}`, "error");
    return;
  }

  state.produtos = data || [];
  renderProdutos();
}

async function loadPedidos() {
  let query = supabase.from("pedidos").select("*").order("created_at", { ascending: false });

  if (state.selectedCardapioId) {
    query = query.eq("cardapio_id", state.selectedCardapioId);
  }

  const { data, error } = await query;

  if (error) {
    toast(`Erro ao carregar pedidos: ${error.message}`, "error");
    return;
  }

  renderPedidos(data || []);
}

function fillCardapioForm(item) {
  const form = document.querySelector("#cardapio-form");
  if (!form || !item) return;
  const idField = getHiddenIdField(form);
  if (idField) idField.value = item.id;
  form.nome.value = item.nome;
  form.slug.value = item.slug;
  form.whatsapp.value = maskTelefone(item.whatsapp || "");
  form.cor_tema.value = item.cor_tema || "#ff6a00";
  form.foto_url.value = item.foto_url || "";

  if (form.cor_secundaria) form.cor_secundaria.value = item.cor_secundaria || "#c8945b";
  if (form.fundo_estilo) form.fundo_estilo.value = item.fundo_estilo || "padrao";
  if (form.cor_fundo) form.cor_fundo.value = item.cor_fundo || "#fffaf3";
  if (form.fundo_cor_1) form.fundo_cor_1.value = item.fundo_cor_1 || (item.cor_tema || "#ff6a00");
  if (form.fundo_cor_2) form.fundo_cor_2.value = item.fundo_cor_2 || "#ffe6ce";
  if (form.fundo_angulo) form.fundo_angulo.value = String(item.fundo_angulo ?? 135);
  if (form.cor_surface) form.cor_surface.value = item.cor_surface || "#ffffff";
  if (form.cor_texto) form.cor_texto.value = item.cor_texto || "#2a211d";
  if (form.cor_muted) form.cor_muted.value = item.cor_muted || "#756960";
  if (form.cor_borda) form.cor_borda.value = item.cor_borda || "#f0dfd1";
  if (form.slogan) form.slogan.value = item.slogan || "";
  if (form.fonte_key) form.fonte_key.value = item.fonte_key || "sora";
  if (form.fonte_peso_texto) form.fonte_peso_texto.value = String(item.fonte_peso_texto ?? 400);
  if (form.fonte_peso_titulo) form.fonte_peso_titulo.value = String(item.fonte_peso_titulo ?? 800);
  if (form.horario_funcionamento) form.horario_funcionamento.value = item.horario_funcionamento || "";
  if (form.abre_em) form.abre_em.value = item.abre_em ? String(item.abre_em).slice(0, 5) : "";
  if (form.fecha_em) form.fecha_em.value = item.fecha_em ? String(item.fecha_em).slice(0, 5) : "";
  if (form.endereco) form.endereco.value = item.endereco || "";
  if (form.instagram_url) form.instagram_url.value = item.instagram_url || "";
  if (form.taxa_entrega) {
    const value = typeof item.taxa_entrega === "number" ? item.taxa_entrega : Number(item.taxa_entrega || 0);
    form.taxa_entrega.value = String(value || 0).replace(".", ",");
  }
  if (form.pedido_minimo) {
    const value = typeof item.pedido_minimo === "number" ? item.pedido_minimo : Number(item.pedido_minimo || 0);
    form.pedido_minimo.value = String(value || 0).replace(".", ",");
  }
  if (form.formas_pagamento) form.formas_pagamento.value = item.formas_pagamento || "";
  if (form.aceita_entrega) form.aceita_entrega.value = String(item.aceita_entrega ?? true);
  if (form.aceita_retirada) form.aceita_retirada.value = String(item.aceita_retirada ?? true);
  if (form.layout_produtos) form.layout_produtos.value = item.layout_produtos || "grid";
  if (form.densidade) form.densidade.value = item.densidade || "confortavel";
  if (form.whatsapp_botao) form.whatsapp_botao.value = item.whatsapp_botao || "flutuante";
  if (form.mensagem_whatsapp_template) {
    form.mensagem_whatsapp_template.value = item.mensagem_whatsapp_template || "";
  }

  refreshAllColorPreviews(form);
}

function fillProdutoForm(item) {
  const form = document.querySelector("#produto-form");
  if (!form || !item) return;
  const idField = getHiddenIdField(form);
  if (idField) idField.value = item.id;
  form.nome.value = item.nome;
  form.preco.value = String(item.preco).replace(".", ",");
  form.imagem_url.value = item.imagem_url || "";
}

function resetForms() {
  const cardapioForm = document.querySelector("#cardapio-form");
  const produtoForm = document.querySelector("#produto-form");
  cardapioForm?.reset();
  produtoForm?.reset();
  const cardapioIdField = getHiddenIdField(cardapioForm);
  const produtoIdField = getHiddenIdField(produtoForm);
  if (cardapioIdField) cardapioIdField.value = "";
  if (produtoIdField) produtoIdField.value = "";

  refreshAllColorPreviews(cardapioForm);
}

async function uploadProductImage(cardapioId, file) {
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const filePath = `${cardapioId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("produtos")
    .upload(filePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("produtos").getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadCardapioImage(cardapioId, file) {
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const filePath = `${cardapioId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("cardapios")
    .upload(filePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("cardapios").getPublicUrl(filePath);
  return data.publicUrl;
}

async function setupDashboardPage() {
  const session = await requireAuth();
  if (!session) return;

  const emailEl = document.querySelector("#session-email");
  if (emailEl) emailEl.textContent = session.user.email || "Admin";

  const logoutBtn = document.querySelector("#logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  await loadCardapios();
  setEditingMode(false);

  const cardapioForm = document.querySelector("#cardapio-form");

  setupColorPreviewListeners(cardapioForm);

  const whatsappInput = cardapioForm?.querySelector('input[name="whatsapp"]');
  whatsappInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    target.value = maskTelefone(target.value);
  });

  cardapioForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(cardapioForm);
    const id = String(formData.get("id") || "").trim();
    const nome = String(formData.get("nome") || "").trim();
    const rawSlug = String(formData.get("slug") || "").trim();
    const slug = slugify(rawSlug || nome);
    const whatsapp = onlyDigits(formData.get("whatsapp"));
    const cor_tema = String(formData.get("cor_tema") || "#ff6a00");

    const cor_secundaria = String(formData.get("cor_secundaria") || "").trim();
    const fundo_estilo = String(formData.get("fundo_estilo") || "padrao");
    const cor_fundo = String(formData.get("cor_fundo") || "").trim();
    const fundo_cor_1 = String(formData.get("fundo_cor_1") || "").trim();
    const fundo_cor_2 = String(formData.get("fundo_cor_2") || "").trim();
    const fundo_angulo_raw = String(formData.get("fundo_angulo") || "135").trim();
    const fundo_angulo = Math.max(0, Math.min(360, Number.parseInt(fundo_angulo_raw || "135", 10) || 135));
    const cor_surface = String(formData.get("cor_surface") || "").trim();
    const cor_texto = String(formData.get("cor_texto") || "").trim();
    const cor_muted = String(formData.get("cor_muted") || "").trim();
    const cor_borda = String(formData.get("cor_borda") || "").trim();
    const slogan = String(formData.get("slogan") || "").trim();
    const fonte_key = String(formData.get("fonte_key") || "sora").trim() || "sora";
    const fonte_peso_texto_raw = String(formData.get("fonte_peso_texto") || "400").trim();
    const fonte_peso_titulo_raw = String(formData.get("fonte_peso_titulo") || "800").trim();
    const fonte_peso_texto = Number.parseInt(fonte_peso_texto_raw || "400", 10) || 400;
    const fonte_peso_titulo = Number.parseInt(fonte_peso_titulo_raw || "800", 10) || 800;
    const horario_funcionamento = String(formData.get("horario_funcionamento") || "").trim();
    const abre_em = String(formData.get("abre_em") || "").trim();
    const fecha_em = String(formData.get("fecha_em") || "").trim();
    const endereco = String(formData.get("endereco") || "").trim();
    const instagram_url = String(formData.get("instagram_url") || "").trim();
    const taxa_entrega = parseMoneyInput(String(formData.get("taxa_entrega") || "0"));
    const pedido_minimo = parseMoneyInput(String(formData.get("pedido_minimo") || "0"));
    const formas_pagamento = String(formData.get("formas_pagamento") || "").trim();
    const aceita_entrega = String(formData.get("aceita_entrega") || "true") === "true";
    const aceita_retirada = String(formData.get("aceita_retirada") || "true") === "true";
    const layout_produtos = String(formData.get("layout_produtos") || "grid");
    const densidade = String(formData.get("densidade") || "confortavel");
    const whatsapp_botao = String(formData.get("whatsapp_botao") || "flutuante");
    const mensagem_whatsapp_template = String(formData.get("mensagem_whatsapp_template") || "").trim();

    const fotoFile = formData.get("foto");
    let foto_url = String(formData.get("foto_url") || "").trim();

    if (!nome || !slug || !whatsapp) {
      toast("Preencha nome, slug e WhatsApp.", "error");
      return;
    }

    const basePayload = {
      nome,
      slug,
      whatsapp,
      cor_tema,
      cor_secundaria: cor_secundaria || null,
      fundo_estilo,
      cor_fundo: cor_fundo || null,
      fundo_cor_1: fundo_cor_1 || null,
      fundo_cor_2: fundo_cor_2 || null,
      fundo_angulo,
      cor_surface: cor_surface || null,
      cor_texto: cor_texto || null,
      cor_muted: cor_muted || null,
      cor_borda: cor_borda || null,
      slogan: slogan || null,
      fonte_key,
      fonte_peso_texto,
      fonte_peso_titulo,
      horario_funcionamento: horario_funcionamento || null,
      abre_em: abre_em || null,
      fecha_em: fecha_em || null,
      endereco: endereco || null,
      instagram_url: instagram_url || null,
      taxa_entrega: Number.isFinite(taxa_entrega) ? taxa_entrega : 0,
      pedido_minimo: Number.isFinite(pedido_minimo) ? pedido_minimo : 0,
      formas_pagamento: formas_pagamento || null,
      aceita_entrega,
      aceita_retirada,
      layout_produtos,
      densidade,
      whatsapp_botao,
      mensagem_whatsapp_template: mensagem_whatsapp_template || null,
      foto_url: foto_url || null
    };

    if (id) {
      if (fotoFile instanceof File && fotoFile.size > 0) {
        try {
          foto_url = await uploadCardapioImage(id, fotoFile);
          basePayload.foto_url = foto_url;
        } catch (error) {
          toast(`Erro no upload da foto do cardápio: ${error.message}`, "error");
          return;
        }
      }

      const { error } = await supabase.from("cardapios").update(basePayload).eq("id", id);

      if (error) {
        toast(`Erro ao salvar cardápio: ${error.message}`, "error");
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("cardapios")
        .insert(basePayload)
        .select("id")
        .single();

      if (insertError || !inserted) {
        toast(`Erro ao salvar cardápio: ${insertError?.message || "Sem retorno"}`, "error");
        return;
      }

      if (fotoFile instanceof File && fotoFile.size > 0) {
        try {
          foto_url = await uploadCardapioImage(inserted.id, fotoFile);
          const { error: updateError } = await supabase
            .from("cardapios")
            .update({ foto_url })
            .eq("id", inserted.id);

          if (updateError) {
            toast(`Erro ao salvar foto do cardápio: ${updateError.message}`, "error");
            return;
          }
        } catch (error) {
          toast(`Erro no upload da foto do cardápio: ${error.message}`, "error");
          return;
        }
      }
    }

    resetForms();
    await loadCardapios();
    toast("Concluído.", "success");
  });

  const cancelCardapioEdit = document.querySelector("#cancel-cardapio-edit");
  cancelCardapioEdit?.addEventListener("click", () => {
    const form = document.querySelector("#cardapio-form");
    form?.reset();
    const idField = getHiddenIdField(form);
    if (idField) idField.value = "";
    refreshAllColorPreviews(form);
    setSelectedCardapio(null);
    setEditingMode(false);
  });

  const produtoForm = document.querySelector("#produto-form");
  produtoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.selectedCardapioId) {
      toast("Selecione um cardápio antes de salvar produto.", "error");
      return;
    }

    const formData = new FormData(produtoForm);
    const id = String(formData.get("id") || "").trim();
    const nome = String(formData.get("nome") || "").trim();
    const preco = parseMoneyInput(String(formData.get("preco") || ""));
    const imagemFile = formData.get("imagem");
    let imagem_url = String(formData.get("imagem_url") || "").trim();

    if (!nome || !preco) {
      toast("Preencha nome e preço válido.", "error");
      return;
    }

    if (imagemFile instanceof File && imagemFile.size > 0) {
      try {
        imagem_url = await uploadProductImage(state.selectedCardapioId, imagemFile);
      } catch (error) {
        toast(`Erro no upload da imagem: ${error.message}`, "error");
        return;
      }
    }

    const payload = {
      cardapio_id: state.selectedCardapioId,
      nome,
      preco,
      imagem_url: imagem_url || null
    };

    let query;
    if (id) {
      query = supabase.from("produtos").update(payload).eq("id", id);
    } else {
      query = supabase.from("produtos").insert(payload);
    }

    const { error } = await query;

    if (error) {
      toast(`Erro ao salvar produto: ${error.message}`, "error");
      return;
    }

    produtoForm.reset();
    const idField = getHiddenIdField(produtoForm);
    if (idField) idField.value = "";
    await loadProdutos();
    toast("Concluído.", "success");
  });

  const cancelProdutoEdit = document.querySelector("#cancel-produto-edit");
  cancelProdutoEdit?.addEventListener("click", () => {
    const form = document.querySelector("#produto-form");
    form?.reset();
    const idField = getHiddenIdField(form);
    if (idField) idField.value = "";
  });

  document.body.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const cardapioId = target.dataset.id;

    if (target.classList.contains("js-manage-cardapio") && cardapioId) {
      const item = state.cardapios.find((cardapio) => cardapio.id === cardapioId);
      fillCardapioForm(item);
      setSelectedCardapio(cardapioId);
      setEditingMode(true);
      await loadProdutos();
      await loadPedidos();
    }

    if (target.classList.contains("js-edit-cardapio") && cardapioId) {
      const item = state.cardapios.find((cardapio) => cardapio.id === cardapioId);
      fillCardapioForm(item);
      setSelectedCardapio(cardapioId);
      setEditingMode(true);
      await loadProdutos();
      await loadPedidos();
    }

    if (target.classList.contains("js-edit-produto") && cardapioId) {
      const item = state.produtos.find((produto) => produto.id === cardapioId);
      fillProdutoForm(item);
    }

    if (target.classList.contains("js-delete-produto") && cardapioId) {
      const confirmDelete = confirm("Deseja realmente excluir este produto?");
      if (!confirmDelete) return;

      const { error } = await supabase.from("produtos").delete().eq("id", cardapioId);
      if (error) {
        toast(`Erro ao excluir: ${error.message}`, "error");
        return;
      }

      await loadProdutos();
      toast("Concluído.", "success");
    }
  });
}

if (loginForm) {
  initLoginPage();
}

if (document.querySelector("#cardapio-form")) {
  setupDashboardPage();
}
