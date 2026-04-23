const SUPABASE_IMPORT_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2"
];

async function importSupabaseModule() {
  let lastError;
  for (const url of SUPABASE_IMPORT_URLS) {
    try {
      return await import(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Falha ao importar @supabase/supabase-js");
}

let createClientFn = null;
let supabaseImportError = null;

try {
  const mod = await importSupabaseModule();
  createClientFn = mod?.createClient || null;
  if (!createClientFn) throw new Error("createClient não encontrado no módulo do Supabase");
} catch (error) {
  supabaseImportError = error;
}

const PLACEHOLDER_URL = "https://SEU-PROJETO.supabase.co";
const PLACEHOLDER_ANON_KEY = "SUA_CHAVE_ANON_PUBLICA";

function getSavedConfig() {
  try {
    const raw = localStorage.getItem("supabase.config");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Falha ao ler configuração local do Supabase:", error);
    return null;
  }
}

function resolveSupabaseConfig() {
  const saved = getSavedConfig();
  const globalConfig = globalThis.__SUPABASE_CONFIG__ || {};

  const url =
    globalConfig.url ||
    saved?.url ||
    PLACEHOLDER_URL;

  const anonKey =
    globalConfig.anonKey ||
    saved?.anonKey ||
    PLACEHOLDER_ANON_KEY;

  return { url, anonKey };
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseConfig();

export const supabase = createClientFn
  ? createClientFn(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function assertSupabaseConfig() {
  if (supabaseImportError || !createClientFn) {
    throw new Error(
      "Falha ao carregar a biblioteca do Supabase. Verifique sua conexão ou bloqueadores (adblock/firewall) e tente novamente."
    );
  }
  if (
    supabaseUrl === PLACEHOLDER_URL ||
    supabaseAnonKey === PLACEHOLDER_ANON_KEY
  ) {
    throw new Error(
      "Configuração do Supabase não definida. Configure globalThis.__SUPABASE_CONFIG__ ou localStorage['supabase.config']."
    );
  }
}

export function slugify(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function formatPriceBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function parseMoneyInput(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  return Number(normalized || 0);
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
