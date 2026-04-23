import {
  assertSupabaseConfig,
  formatPriceBRL,
  onlyDigits,
  supabase
} from "../shared/supabase.js";

const produtosContainer = document.querySelector("#produtos");
const pedidosMesaContainer = document.querySelector("#pedidos-mesa");
const numeroMesaInput = document.querySelector("#numero-mesa");
const novaMesaBtn = document.querySelector("#nova-mesa-btn");
const limparMesaBtn = document.querySelector("#limpar-mesa-btn");
const finalizarMesaBtn = document.querySelector("#finalizar-mesa-btn");
const cardapioNomeEl = document.querySelector("#cardapio-nome");
const cardapioSubtitle = document.querySelector("#cardapio-subtitle");
const cardapioFoto = document.querySelector("#cardapio-foto");
const mesaAtualEl = document.querySelector("#mesa-atual");
const countMesasEl = document.querySelector("#count-mesas");
const listaMesasEl = document.querySelector("#lista-mesas");

let activeCardapio = null;
let activeProdutos = [];
let mesasAbertas = new Map(); // numero_mesa -> { pedidos: [], criado_em: Date }
let mesaAtual = null;

// Funções utilitárias
function safeText(value) {
  return String(value || "").trim();
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

function safeImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  return safeHttpUrl(raw);
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

function getSlugFromUrl() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const garcomIndex = segments.findIndex((segment) => segment === "garcom");
  const slugSegment = garcomIndex >= 0 ? segments[garcomIndex + 1] : "";

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

// Gerenciamento de mesas
function criarMesa(numero) {
  if (mesasAbertas.has(numero)) {
    selecionarMesa(numero);
    return;
  }

  mesasAbertas.set(numero, {
    pedidos: [],
    criado_em: new Date()
  });

  selecionarMesa(numero);
  atualizarListaMesas();
}

function selecionarMesa(numero) {
  if (!mesasAbertas.has(numero)) return;

  mesaAtual = numero;
  numeroMesaInput.value = numero;
  mesaAtualEl.textContent = numero;
  
  document.body.classList.add("mesa-selecionada");
  
  renderPedidosMesa();
  atualizarListaMesas();
}

function adicionarPedidoMesa(produto, triggerEl = null) {
  if (!mesaAtual) {
    alert("Selecione uma mesa primeiro!");
    return;
  }

  const mesa = mesasAbertas.get(mesaAtual);
  if (!mesa) return;

  // Verificar se o produto já está na mesa
  const pedidoExistente = mesa.pedidos.find(p => p.id === produto.id);
  if (pedidoExistente) {
    pedidoExistente.quantidade += 1;
  } else {
    mesa.pedidos.push({
      id: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      quantidade: 1
    });
  }

  renderPedidosMesa();
  atualizarListaMesas();
  
  // Animação de feedback
  if (triggerEl instanceof HTMLElement) {
    triggerEl.classList.add("pulse");
    setTimeout(() => triggerEl.classList.remove("pulse"), 300);
  }
}

function removerPedidoMesa(produtoId) {
  if (!mesaAtual) return;

  const mesa = mesasAbertas.get(mesaAtual);
  if (!mesa) return;

  const index = mesa.pedidos.findIndex(p => p.id === produtoId);
  if (index < 0) return;

  if (mesa.pedidos[index].quantidade > 1) {
    mesa.pedidos[index].quantidade -= 1;
  } else {
    mesa.pedidos.splice(index, 1);
  }

  renderPedidosMesa();
  atualizarListaMesas();
}

function limparMesa() {
  if (!mesaAtual) return;

  if (confirm(`Limpar todos os pedidos da mesa ${mesaAtual}?`)) {
    const mesa = mesasAbertas.get(mesaAtual);
    if (mesa) {
      mesa.pedidos = [];
      renderPedidosMesa();
      atualizarListaMesas();
    }
  }
}

function finalizarMesa() {
  if (!mesaAtual) return;

  const mesa = mesasAbertas.get(mesaAtual);
  if (!mesa || mesa.pedidos.length === 0) {
    alert("A mesa não tem pedidos para finalizar!");
    return;
  }

  const total = calcularTotalMesa(mesa);
  const confirmar = confirm(`Finalizar mesa ${mesaAtual}?\n\nTotal: ${formatPriceBRL(total)}\n\nA mesa será removida da lista de mesas abertas.`);
  
  if (confirmar) {
    mesasAbertas.delete(mesaAtual);
    mesaAtual = null;
    numeroMesaInput.value = "";
    mesaAtualEl.textContent = "-";
    
    document.body.classList.remove("mesa-selecionada");
    
    renderPedidosMesa();
    atualizarListaMesas();
  }
}

function calcularTotalMesa(mesa) {
  return mesa.pedidos.reduce((total, pedido) => {
    return total + (pedido.preco * pedido.quantidade);
  }, 0);
}

// Renderização
function renderProdutos() {
  if (!activeProdutos.length) {
    produtosContainer.innerHTML = '<p class="muted">Nenhum produto disponível neste cardápio.</p>';
    return;
  }

  produtosContainer.innerHTML = activeProdutos
    .map((produto) => {
      const nome = escapeHtml(produto.nome);
      const categoria = escapeHtml(produto.categoria || "");
      const descricao = escapeHtml(produto.descricao || "");
      const imageUrl = safeImageUrl(produto.imagem_url) ||
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
      
      return `
      <article class="produto-card">
        <div class="produto-media">
          <img src="${imageUrl}" alt="${nome}" loading="lazy" decoding="async" />
        </div>
        <div class="produto-body">
          <h3>${nome}</h3>
          ${categoria ? `<p class="muted"><strong>${categoria}</strong></p>` : ""}
          ${descricao ? `<p class="muted">${descricao}</p>` : ""}
          <p class="price">${formatPriceBRL(produto.preco)}</p>
          <button type="button" class="add-to-cart" data-id="${produto.id}">Adicionar à Mesa</button>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderPedidosMesa() {
  if (!mesaAtual || !mesasAbertas.has(mesaAtual)) {
    pedidosMesaContainer.innerHTML = '<p class="muted">Selecione uma mesa ou adicione produtos.</p>';
    return;
  }

  const mesa = mesasAbertas.get(mesaAtual);
  
  if (!mesa.pedidos.length) {
    pedidosMesaContainer.innerHTML = '<p class="muted">Nenhum pedido nesta mesa ainda.</p>';
    return;
  }

  // Resumo da mesa
  const subtotal = calcularTotalMesa(mesa);
  const resumoHtml = `
    <div class="mesa-resumo">
      <div class="resumo-item">
        <span>Itens:</span>
        <span>${mesa.pedidos.reduce((total, p) => total + p.quantidade, 0)}</span>
      </div>
      <div class="resumo-item resumo-total">
        <span>Total:</span>
        <span>${formatPriceBRL(subtotal)}</span>
      </div>
    </div>
  `;

  // Lista de pedidos
  const pedidosHtml = mesa.pedidos
    .map((pedido) => `
      <div class="pedido-item">
        <div class="pedido-info">
          <div class="pedido-nome">${escapeHtml(pedido.nome)}</div>
          <div class="pedido-quantidade">${pedido.quantidade}x ${formatPriceBRL(pedido.preco)}</div>
        </div>
        <div class="pedido-preco">${formatPriceBRL(pedido.preco * pedido.quantidade)}</div>
        <button class="remover-pedido" data-id="${pedido.id}">Remover</button>
      </div>
    `)
    .join("");

  pedidosMesaContainer.innerHTML = resumoHtml + pedidosHtml;
}

function atualizarListaMesas() {
  countMesasEl.textContent = mesasAbertas.size;

  if (mesasAbertas.size === 0) {
    listaMesasEl.innerHTML = '<p class="muted">Nenhuma mesa aberta.</p>';
    return;
  }

  const mesasHtml = Array.from(mesasAbertas.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([numero, mesa]) => {
      const total = calcularTotalMesa(mesa);
      const itens = mesa.pedidos.reduce((total, p) => total + p.quantidade, 0);
      const isAtual = numero === mesaAtual;
      
      return `
        <div class="mesa-item ${isAtual ? 'mesa-atual' : ''}" data-mesa="${numero}">
          <div class="mesa-numero">Mesa ${numero}</div>
          <div class="mesa-info">
            <div class="mesa-pedidos">${itens} itens</div>
            <div class="mesa-total">${formatPriceBRL(total)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  listaMesasEl.innerHTML = mesasHtml;
}

// Carregamento do cardápio
async function loadCardapio() {
  const slug = getSlugFromUrl();
  
  if (!slug) {
    cardapioNomeEl.textContent = "Acesso inválido";
    cardapioSubtitle.textContent = "Acesse pelo /garcom/seu-slug";
    produtosContainer.innerHTML = '<p class="muted">Acesso inválido</p>';
    return;
  }

  if (!supabase) {
    cardapioNomeEl.textContent = "Falha ao carregar";
    cardapioSubtitle.textContent = "Verifique sua conexão";
    produtosContainer.innerHTML = '<p class="muted">Falha no Supabase</p>';
    return;
  }

  // Verificar se o modo garçom está habilitado
  const { data: cardapioData, error: cardapioError } = await supabase
    .from("cardapios")
    .select("*")
    .eq("slug", slug)
    .single();

  if (cardapioError || !cardapioData) {
    cardapioNomeEl.textContent = "Cardápio não encontrado";
    cardapioSubtitle.textContent = "Verifique o link";
    produtosContainer.innerHTML = '<p class="muted">Cardápio não encontrado</p>';
    return;
  }

  const isGarcomEnabled = Boolean(cardapioData.modo_garcom_enabled);
  
  if (!isGarcomEnabled) {
    cardapioNomeEl.textContent = "Modo garçom desabilitado";
    cardapioSubtitle.textContent = "Este cardápio não está com modo garçom ativo.";
    produtosContainer.innerHTML = '<p class="muted">O modo garçom está desabilitado para este cardápio.</p>';
    return;
  }

  activeCardapio = cardapioData;
  
  // Aplicar tema
  setThemeColor(cardapioData.cor_tema);
  setSecondaryColor(cardapioData.cor_secundaria);
  
  // Atualizar header
  cardapioNomeEl.textContent = cardapioData.nome;
  cardapioSubtitle.textContent = "Anote pedidos rapidamente por mesa.";
  
  if (cardapioFoto && cardapioData.foto_url) {
    cardapioFoto.src = cardapioData.foto_url;
    cardapioFoto.alt = `Foto do ${cardapioData.nome}`;
    cardapioFoto.classList.remove("is-hidden");
  }

  // Carregar produtos
  const { data: produtos, error: produtosError } = await supabase
    .from("produtos")
    .select("*")
    .eq("cardapio_id", cardapioData.id)
    .order("nome");

  if (produtosError) {
    produtosContainer.innerHTML = `<p class="muted">Erro ao carregar produtos: ${produtosError.message}</p>`;
    return;
  }

  activeProdutos = produtos || [];
  renderProdutos();
}

// Event listeners
function attachEvents() {
  // Nova mesa
  novaMesaBtn.addEventListener("click", () => {
    const numero = parseInt(numeroMesaInput.value);
    if (numero && numero > 0 && numero <= 999) {
      criarMesa(numero);
    } else {
      alert("Digite um número de mesa válido (1-999)");
    }
  });

  // Mudar mesa
  numeroMesaInput.addEventListener("change", () => {
    const numero = parseInt(numeroMesaInput.value);
    if (numero && numero > 0 && numero <= 999 && mesasAbertas.has(numero)) {
      selecionarMesa(numero);
    }
  });

  // Limpar mesa
  limparMesaBtn.addEventListener("click", limparMesa);

  // Finalizar mesa
  finalizarMesaBtn.addEventListener("click", finalizarMesa);

  // Adicionar produto
  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("add-to-cart")) {
      const produtoId = target.dataset.id;
      const produto = activeProdutos.find(p => p.id === produtoId);
      if (produto) {
        adicionarPedidoMesa(produto, target);
      }
    }

    if (target.classList.contains("remover-pedido")) {
      const produtoId = target.dataset.id;
      removerPedidoMesa(produtoId);
    }

    if (target.classList.contains("mesa-item") || target.closest(".mesa-item")) {
      const mesaEl = target.classList.contains("mesa-item") ? target : target.closest(".mesa-item");
      const numero = parseInt(mesaEl.dataset.mesa);
      if (numero) {
        selecionarMesa(numero);
      }
    }
  });

  // Atalhos de teclado
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey) return;

    const numero = parseInt(event.key);
    if (numero >= 1 && numero <= 9) {
      event.preventDefault();
      const mesaNumero = parseInt(numeroMesaInput.value + numero);
      if (mesaNumero <= 999) {
        numeroMesaInput.value = mesaNumero;
      }
    }

    if (event.key === "Enter" && numeroMesaInput.value) {
      novaMesaBtn.click();
    }

    if (event.key === "Escape" && mesaAtual) {
      finalizarMesa();
    }
  });
}

// Inicialização
async function init() {
  try {
    assertSupabaseConfig();
    attachEvents();
    await loadCardapio();
  } catch (error) {
    console.error("Erro ao inicializar:", error);
    cardapioNomeEl.textContent = "Erro ao carregar";
    cardapioSubtitle.textContent = "Tente recarregar a página";
    produtosContainer.innerHTML = `<p class="muted">Erro: ${error.message}</p>`;
  } finally {
    document.body.classList.remove("is-loading");
  }
}

init();
