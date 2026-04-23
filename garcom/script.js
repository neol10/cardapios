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
const mesaSearchInput = document.querySelector("#mesa-search");
const resetMesasBtn = document.querySelector("#reset-mesas-btn");
const totalMesasAbertasEl = document.querySelector("#total-mesas-abertas");
const totalPedidosEl = document.querySelector("#total-pedidos-abertos");
const totalValorEl = document.querySelector("#total-aberto-valor");
const fullscreenBtn = document.querySelector("#fullscreen-btn");

let activeCardapio = null;
let activeProdutos = [];
let mesasAbertas = new Map(); // numero_mesa -> { pedidos: [], criado_em: Date }
let mesaAtual = null;
let mesaSearchTerm = "";
let backupInterval = null;

// Persistência de dados
function salvarMesasLocalStorage() {
  try {
    const data = {
      mesas: Array.from(mesasAbertas.entries()).map(([numero, mesa]) => ({
        numero,
        pedidos: mesa.pedidos,
        criado_em: mesa.criado_em.toISOString()
      })),
      mesaAtual,
      timestamp: Date.now()
    };
    localStorage.setItem(`garcom-${getSlugFromUrl()}`, JSON.stringify(data));
  } catch (error) {
    console.warn("Erro ao salvar mesas:", error);
  }
}

function carregarMesasLocalStorage() {
  try {
    const slug = getSlugFromUrl();
    const data = JSON.parse(localStorage.getItem(`garcom-${slug}`));
    if (!data || !data.mesas) return;

    // Verificar se os dados são recentes (últimas 24h)
    const idade = Date.now() - (data.timestamp || 0);
    if (idade > 24 * 60 * 60 * 1000) return;

    mesasAbertas.clear();
    for (const mesaData of data.mesas) {
      mesasAbertas.set(mesaData.numero, {
        pedidos: mesaData.pedidos,
        criado_em: new Date(mesaData.criado_em)
      });
    }

    if (data.mesaAtual && mesasAbertas.has(data.mesaAtual)) {
      mesaAtual = data.mesaAtual;
    }

    atualizarListaMesas();
    if (mesaAtual) {
      numeroMesaInput.value = mesaAtual;
      mesaAtualEl.textContent = mesaAtual;
      document.body.classList.add("mesa-selecionada");
      renderPedidosMesa();
    }
  } catch (error) {
    console.warn("Erro ao carregar mesas:", error);
  }
}

function iniciarBackupAutomatico() {
  if (backupInterval) clearInterval(backupInterval);
  backupInterval = setInterval(salvarMesasLocalStorage, 30000); // A cada 30 segundos
}

function pararBackupAutomatico() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn("Erro ao entrar em tela cheia:", err);
    });
  } else {
    document.exitFullscreen().catch(err => {
      console.warn("Erro ao sair da tela cheia:", err);
    });
  }
}

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
      quantidade: 1,
      comentario: ""
    });
  }

  renderPedidosMesa();
  atualizarListaMesas();
  salvarMesasLocalStorage();
  
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

function resetTodasMesas() {
  if (mesasAbertas.size === 0) {
    alert("Não há mesas abertas para resetar.");
    return;
  }

  const confirmar = confirm(
    "Resetar todas as mesas? Esta ação apagará todas as mesas abertas e seus pedidos."
  );

  if (!confirmar) return;

  mesasAbertas.clear();
  mesaAtual = null;
  numeroMesaInput.value = "";
  mesaAtualEl.textContent = "-";
  document.body.classList.remove("mesa-selecionada");
  renderPedidosMesa();
  atualizarListaMesas();
}

function imprimirPedidoMesa() {
  if (!mesaAtual || !mesasAbertas.has(mesaAtual)) return;

  const mesa = mesasAbertas.get(mesaAtual);
  if (!mesa.pedidos.length) return;

  const subtotal = calcularTotalMesa(mesa);
  const dataHora = new Date().toLocaleString('pt-BR');

  let conteudo = `
    <html>
    <head>
      <title>Pedido Mesa ${mesaAtual}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 20px; }
        .pedido { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; }
        .comentario { font-style: italic; color: #666; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Pedido - Mesa ${mesaAtual}</h1>
        <p>${activeCardapio?.nome || 'Cardápio'}</p>
        <p>Data/Hora: ${dataHora}</p>
      </div>
  `;

  mesa.pedidos.forEach((pedido, index) => {
    conteudo += `
      <div class="pedido">
        <strong>${index + 1}. ${escapeHtml(pedido.nome)}</strong><br>
        Quantidade: ${pedido.quantidade} x ${formatPriceBRL(pedido.preco)} = ${formatPriceBRL(pedido.preco * pedido.quantidade)}
        ${pedido.comentario ? `<div class="comentario">Obs: ${escapeHtml(pedido.comentario)}</div>` : ''}
      </div>
    `;
  });

  conteudo += `
      <div class="total">
        Total: ${formatPriceBRL(subtotal)}
      </div>
    </body>
    </html>
  `;

  const janela = window.open('', '_blank');
  janela.document.write(conteudo);
  janela.document.close();
  janela.print();
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
      <button class="btn btn-secondary btn-print" type="button">🖨️ Imprimir</button>
    </div>
  `;

  // Lista de pedidos
  const pedidosHtml = mesa.pedidos
    .map((pedido) => `
      <div class="pedido-item" data-id="${pedido.id}">
        <div class="pedido-info">
          <div class="pedido-nome">${escapeHtml(pedido.nome)}</div>
          <div class="pedido-quantidade">${pedido.quantidade}x ${formatPriceBRL(pedido.preco)}</div>
          <input type="text" class="pedido-comentario" placeholder="Observações..." value="${escapeHtml(pedido.comentario || "")}" />
        </div>
        <div class="pedido-preco">${formatPriceBRL(pedido.preco * pedido.quantidade)}</div>
        <button class="remover-pedido" data-id="${pedido.id}">Remover</button>
      </div>
    `)
    .join("");

  pedidosMesaContainer.innerHTML = resumoHtml + pedidosHtml;
}

function getMesasFiltradas() {
  const termo = String(mesaSearchTerm || "").trim().toLowerCase();
  const mesas = Array.from(mesasAbertas.entries()).sort((a, b) => a[0] - b[0]);
  if (!termo) return mesas;

  return mesas.filter(([numero, mesa]) => {
    if (String(numero).includes(termo)) return true;
    return mesa.pedidos.some((pedido) => String(pedido.nome || "").toLowerCase().includes(termo));
  });
}

function atualizarResumoMesas() {
  const totalMesas = mesasAbertas.size;
  const totalItens = Array.from(mesasAbertas.values()).reduce(
    (sum, mesa) => sum + mesa.pedidos.reduce((count, pedido) => count + pedido.quantidade, 0),
    0
  );
  const totalValor = Array.from(mesasAbertas.values()).reduce(
    (sum, mesa) => sum + calcularTotalMesa(mesa),
    0
  );

  if (totalMesasAbertasEl) totalMesasAbertasEl.textContent = totalMesas;
  if (totalPedidosEl) totalPedidosEl.textContent = totalItens;
  if (totalValorEl) totalValorEl.textContent = formatPriceBRL(totalValor);
}

function atualizarListaMesas() {
  atualizarResumoMesas();

  if (countMesasEl) countMesasEl.textContent = String(mesasAbertas.size);
  const mesasFiltradas = getMesasFiltradas();

  if (mesasFiltradas.length === 0) {
    const message = mesasAbertas.size === 0
      ? 'Nenhuma mesa aberta.'
      : 'Nenhuma mesa encontrada para a busca.';
    listaMesasEl.innerHTML = `<p class="muted">${message}</p>`;
    return;
  }

  const mesasHtml = mesasFiltradas
    .map(([numero, mesa]) => {
      const total = calcularTotalMesa(mesa);
      const itens = mesa.pedidos.reduce((total, p) => total + p.quantidade, 0);
      const isAtual = numero === mesaAtual;

      return `
        <div class="mesa-item ${isAtual ? 'mesa-atual' : ''}" data-mesa="${numero}">
          <div>
            <div class="mesa-numero">Mesa ${numero}</div>
            <div class="mesa-pedidos">${itens} itens</div>
          </div>
          <div class="mesa-info">
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

  // Resetar todas as mesas
  resetMesasBtn?.addEventListener("click", resetTodasMesas);

  // Tela cheia
  fullscreenBtn?.addEventListener("click", toggleFullscreen);

  // Buscar mesas / pedidos
  mesaSearchInput?.addEventListener("input", () => {
    mesaSearchTerm = String(mesaSearchInput.value || "").trim();
    atualizarListaMesas();
  });

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

    if (target.classList.contains("btn-print")) {
      imprimirPedidoMesa();
    }

    if (target.classList.contains("mesa-item") || target.closest(".mesa-item")) {
      const mesaEl = target.classList.contains("mesa-item") ? target : target.closest(".mesa-item");
      const numero = parseInt(mesaEl.dataset.mesa);
      if (numero) {
        selecionarMesa(numero);
      }
    }
  });

  // Atualizar comentários
  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.classList.contains("pedido-comentario")) {
      const pedidoItem = target.closest(".pedido-item");
      if (!pedidoItem || !mesaAtual) return;

      const produtoId = pedidoItem.dataset.id;
      const mesa = mesasAbertas.get(mesaAtual);
      if (!mesa) return;

      const pedido = mesa.pedidos.find(p => p.id === produtoId);
      if (pedido) {
        pedido.comentario = target.value.trim();
        salvarMesasLocalStorage();
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
    
    // Carregar dados salvos
    carregarMesasLocalStorage();
    
    await loadCardapio();
    
    // Iniciar backup automático
    iniciarBackupAutomatico();
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
