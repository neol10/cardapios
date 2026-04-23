const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const LOCK_PATH = path.join(__dirname, ".keepalive.lock");

const RESTART_DELAY_MS = 1500;
let stopping = false;

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLockOrExit() {
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(LOCK_PATH, "utf8");
      const parsed = JSON.parse(raw);
      const pid = Number(parsed?.pid);
      if (isProcessAlive(pid)) {
        console.error("[keepalive] Já existe um keepalive rodando (PID " + pid + ").");
        console.error("[keepalive] Feche o outro terminal antes de iniciar novamente.");
        process.exit(0);
      }
    } catch {
      // lock inválido/stale -> vamos sobrescrever
    }
  }

  fs.writeFileSync(
    LOCK_PATH,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}

function now() {
  return new Date().toLocaleString("pt-BR");
}

function startOnce() {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: false
  });

  let combinedOutput = "";

  function forward(chunk, stream) {
    const text = chunk.toString();
    combinedOutput += text;
    if (combinedOutput.length > 20000) combinedOutput = combinedOutput.slice(-20000);
    stream.write(chunk);
  }

  child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
  child.stderr.on("data", (chunk) => forward(chunk, process.stderr));

  child.on("exit", (code, signal) => {
    if (stopping) return;

    const hadPortInUse = /EADDRINUSE/i.test(combinedOutput);

    if (hadPortInUse) {
      console.error("\n[keepalive] Porta 5500 já está em uso.\n");
      console.error("[keepalive] Isso significa que já existe um servidor rodando nessa porta.");
      console.error("[keepalive] Feche o outro servidor ou mude a porta no server.js.");
      process.exit(1);
      return;
    }

    console.error(`\n[keepalive] Servidor caiu (${now()}). code=${code} signal=${signal}`);
    console.error(`[keepalive] Reiniciando em ${RESTART_DELAY_MS}ms...`);

    setTimeout(() => {
      if (!stopping) startOnce();
    }, RESTART_DELAY_MS);
  });

  return child;
}

acquireLockOrExit();

let child = startOnce();

function shutdown() {
  stopping = true;
  if (child && !child.killed) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  releaseLock();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("exit", () => {
  releaseLock();
});
