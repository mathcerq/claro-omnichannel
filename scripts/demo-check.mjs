/**
 * Checagem pré-apresentação: confere em segundos se tudo o que a demo precisa
 * está no ar (API, bot do Telegram, IA local aquecida, painel, app e dados).
 *
 * Uso (com `npm run dev` rodando): npm run demo:check
 * Não altera dados — só lê, e aquece o modelo de IA se ele não estiver carregado.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:3000';
let failures = 0;
let warnings = 0;

const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg) => (warnings++, console.log(`  ⚠️  ${msg}`));
const fail = (msg) => (failures++, console.log(`  ❌ ${msg}`));

async function http(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout ?? 5000) });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function readEnv() {
  const file = path.join(ROOT, 'backend', '.env');
  if (!existsSync(file)) return null;
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => /^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

async function main() {
  console.log('\n🎬 Checagem pré-apresentação — Claro Omnichannel\n');

  console.log('[Configuração]');
  const env = readEnv();
  if (!env) fail('backend/.env não encontrado (copie de backend/.env.example)');
  else {
    ok('backend/.env presente');
    env.TELEGRAM_BOT_TOKEN ? ok('Token do Telegram configurado') : fail('TELEGRAM_BOT_TOKEN vazio');
    const engine = env.ASSISTANT_ENGINE || 'ollama';
    engine === 'ollama' ? ok('Assistente configurada para IA local (Ollama)') : warn(`Assistente em modo "${engine}" (sem IA generativa)`);
  }

  console.log('\n[Serviços]');
  const api = await http(`${API}/channels`);
  if (api.status !== 401) {
    fail('API (:3000) fora do ar — rode `npm run dev`');
  } else ok('API no ar (:3000)');
  for (const [name, port] of [['Painel do atendente', 5173], ['App do cliente', 5174]]) {
    const res = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    res?.ok ? ok(`${name} no ar (:${port})`) : fail(`${name} fora do ar (:${port})`);
  }

  if (api.status === 401) {
    console.log('\n[Canais e dados]');
    const login = await http(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'carlos.cliente@email.com', password: 'Claro@2024' }),
    });
    const token = login.body?.accessToken;
    if (!token) fail('Login do cliente demo (carlos.cliente@email.com) falhou — rode `npm run db:reset`?');
    else {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const { body: channels } = await http(`${API}/channels`, auth);
      const telegram = channels?.find((c) => c.code === 'TELEGRAM');
      telegram?.enabled
        ? ok(`Bot do Telegram conectado (@${telegram.botUsername})`)
        : fail('Bot do Telegram desligado — veja o log da API (token? outra instância usando o bot?)');
      channels?.find((c) => c.code === 'PHONE')?.kind === 'MOCK' && ok('Telefone sinalizado como mock');
      const { body: link } = await http(`${API}/channels/telegram`, auth);
      link?.linked ? ok('Telegram do Carlos vinculado') : warn('Telegram do Carlos NÃO vinculado (faça o vínculo antes ou mostre-o ao vivo)');
      const { body: protocols } = await http(`${API}/protocols`, auth);
      Array.isArray(protocols) && protocols.length
        ? ok(`${protocols.length} protocolo(s) do Carlos para mostrar`)
        : warn('Carlos não tem protocolos — rode `npm run db:reset` para recriar os dados de demonstração');
    }
  }

  if (!env || (env.ASSISTANT_ENGINE || 'ollama') === 'ollama') {
    console.log('\n[IA local]');
    const ollama = env?.OLLAMA_URL || 'http://localhost:11434';
    const model = env?.OLLAMA_MODEL || 'qwen3:4b';
    const tags = await http(`${ollama}/api/tags`);
    if (tags.status !== 200) {
      fail('Ollama fora do ar — abra o app Ollama (ou rode `ollama serve`). Sem ele, a Clara usa o motor de regras.');
    } else if (!tags.body.models.some((m) => m.name === model)) {
      fail(`Modelo ${model} não baixado — rode: ollama pull ${model}`);
    } else {
      ok(`Ollama no ar com o modelo ${model}`);
      const ps = await http(`${ollama}/api/ps`);
      const loaded = ps.body?.models?.find((m) => m.name === model);
      if (loaded) {
        const gpu = loaded.size_vram >= loaded.size ? '100% GPU' : 'parte na CPU (mais lento)';
        ok(`Modelo já carregado na memória (${gpu}) — a 1ª resposta não terá atraso de carga`);
      } else {
        process.stdout.write('  ⏳ Modelo não está carregado; aquecendo agora... ');
        const started = Date.now();
        const warm = await http(`${ollama}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, keep_alive: env?.OLLAMA_KEEP_ALIVE || '4h', options: { num_ctx: 8192 } }),
          timeout: 180000,
        });
        warm.status === 200 ? console.log(`pronto em ${((Date.now() - started) / 1000).toFixed(0)}s ✅`) : (failures++, console.log('falhou ❌'));
      }
    }
  }

  console.log('\n[Lembretes]');
  console.log('  • Celular com o app autenticador (2FA do joao.atendente@claro.com.br)');
  console.log('  • Telegram aberto na conversa com o bot; abas: painel (:5173) e app (:5174)');
  console.log('  • A Clara leva ~15–50 s por resposta: fale enquanto o "digitando…" aparece');
  console.log('  • Não edite código durante a demo (o servidor reinicia sozinho)');

  console.log(
    failures
      ? `\n❌ ${failures} problema(s) para resolver antes de apresentar.\n`
      : `\n✅ Tudo pronto para a apresentação${warnings ? ` (${warnings} aviso(s))` : ''}.\n`,
  );
  process.exit(failures ? 1 : 0);
}

main();
