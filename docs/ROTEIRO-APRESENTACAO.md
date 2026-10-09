# Roteiro da apresentação — Claro Omnichannel

Demonstração ao vivo de cerca de **10 minutos**. Os tempos de resposta da IA foram medidos em ensaio nesta máquina (RTX 2060, Qwen3 4B local).

---

## 30 minutos antes

1. Abra o app **Ollama** (ícone na bandeja). Se não abrir: `ollama serve` num terminal.
2. Na pasta do projeto: `npm run dev` e espere aparecer no log:
   - `Bot @claro_omnichannel_mathcerq_bot conectado — long polling iniciado.`
   - `Modelo de IA carregado na memória em …s`
3. Rode `npm run demo:check`. Tudo precisa estar ✅.
4. Deixe aberto e já logado:
   - **Aba 1, painel** (http://localhost:5173): `joao.atendente@claro.com.br`, com o celular do autenticador em mãos;
   - **Aba 2, app do cliente** (http://localhost:5174): `carlos.cliente@email.com`;
   - **Telegram** (desktop ou celular espelhado) na conversa com o bot.
5. Feche notificações e deixe a fonte do navegador grande o bastante para a banca ler (Ctrl + `+`).
6. **Não edite código durante a apresentação**: o servidor reinicia sozinho a cada mudança.

---

## Roteiro (cerca de 10 min)

| # | Tempo | O que fazer | O que falar |
|---|---|---|---|
| 1 | 0:00 | (slide ou README) | "Hoje, quem abre um chamado no WhatsApp e é transferido para o telefone precisa repetir tudo. Nossa proposta é **um único protocolo** com **uma única linha do tempo**, não importa o canal." |
| 2 | 1:00 | Painel: dashboard | "Temos 3 canais: **WebChat e Telegram reais**, e o **telefone simulado de propósito**. Está sinalizado como mock no próprio painel. E temos a **Clara**, uma assistente virtual com **IA rodando localmente**." |
| 3 | 2:00 | Telegram: `/novo Internet caindo à noite` | "Sou o cliente Carlos, abrindo um chamado pelo Telegram. O protocolo já nasce com número único." |
| 4 | 2:30 | Telegram: `minha internet cai toda noite` | Enquanto aparece **"digitando…"** (~20 s), fale: "A Clara não inventa resposta: ela **chama ferramentas** que consultam a rede da região e o modem do cliente. Os sistemas internos da Claro são simulados, mas a IA é real e roda **neste computador**, então nenhum dado sai daqui (LGPD)." |
| 5 | 3:00 | (Clara responde: sinal fraco, propõe visita) | "Ela diagnosticou sinal fraco e já propôs a solução." |
| 6 | 3:30 | Telegram: `quero falar com um atendente` | (resposta em ~2 s) "Pedido de humano, cancelamento e contestação **nunca dependem da IA**: o código transfere na hora." |
| 7 | 4:00 | Painel: protocolo com selo **Transferido pela IA** → abrir | "No painel, o card mostra o **motivo e o resumo**: o que o cliente disse e o que a IA já apurou. O atendente **não precisa perguntar de novo**." |
| 8 | 4:45 | Painel: **Assumir atendimento** → responder com canal **Telegram** | "Quando eu assumo, a IA sai de cena. Respondo pelo Telegram do cliente…" → mostrar no Telegram → "…e o painel confirma **entregue no Telegram**." |
| 9 | 5:45 | App do cliente: abrir o mesmo protocolo e escrever | "Agora o cliente muda de canal e vai para o site. **Mesmo protocolo, mesma timeline**: cada mensagem mostra por onde veio, e chega ao vivo no painel." |
| 10 | 6:30 | Painel: **Simular ligação recebida** | "O telefone é mock: a ligação tem dados inventados, mas entra **no mesmo histórico**." |
| 11 | 7:00 | Telegram: `/historico` | "Do Telegram, o cliente vê o histórico dos **três canais**. É o problema do desafio resolvido." |
| 12 | 7:30 | Painel: **Encerrar** | "Ao encerrar, o cliente é avisado no Telegram." |
| 13 | 8:00 | App: novo chamado "Dúvida na fatura" | (~20 s) "Um caso simples, a IA resolve sozinha: valor, vencimento…" → escrever `Era só isso, obrigado!` → "…e encerra sem envolver ninguém." |
| 14 | 9:00 | Painel: dashboard (F5) | "Aqui estão as métricas da IA: resolvidos, transferidos e a **taxa de resolução sem humano**, o indicador de economia para a operação." |
| 15 | 9:30 | (encerramento) | "Segurança: 2FA obrigatório para atendentes, cada atendente só vê o que é dele, auditoria, exportação de dados do titular. Tudo coberto por **testes automatizados**." |

### O que falar durante a espera da IA (15–25 s)

- "Esse tempo é porque o modelo roda num PC comum, sem servidor. Em produção ele roda em servidor com GPU, ou trocamos por uma API comercial: o motor é **plugável**, sem mudar o resto."
- "Enquanto ela pensa, ela está consultando ferramentas: rede da região, diagnóstico do modem."
- "Repare no 'digitando…': o cliente sabe que está sendo atendido."

---

## Perguntas prováveis da banca

| Pergunta | Resposta curta |
|---|---|
| Por que Telegram e não WhatsApp? | A API do WhatsApp Business exige conta comercial verificada pela Meta. A arquitetura aceita o WhatsApp como um novo *adapter*, sem mudar o núcleo. |
| Por que o telefone é simulado? | Integração com telefonia (URA/PABX) está fora do escopo de uma PoC. O mock prova o que importa: o histórico unificado. |
| A IA pode inventar coisas? | Ela é instruída a usar só dados das ferramentas, e as decisões críticas (transferir, encerrar, se identificar como IA) são **regras no código**, não do modelo. |
| E a LGPD com IA? | A IA roda localmente (nada vai para terceiros), recebe só o primeiro nome, sempre se identifica e o cliente pode pedir um humano. Tudo fica auditado. |
| Por que não uma IA paga (ChatGPT, Claude)? | Custo zero e dados locais para a PoC. O motor é plugável: trocar é configuração. |
| E se o Ollama cair? | A Clara passa automaticamente para o **motor de regras** (palavras-chave + as mesmas ferramentas). O atendimento não para. |
| Como escala? | Hoje é um servidor só (SQLite, long polling). Para produção: PostgreSQL, webhook do Telegram e Socket.io com Redis. Está no README. |
| Como vocês testaram? | Testes unitários, e2e com Bot API simulada, e2e de navegador com Playwright e avaliação da IA real em cenários (`assistant-scenarios.ts`). |

---

## Plano B

| Problema | O que fazer |
|---|---|
| IA lenta demais ou travada | Em `backend/.env`, `ASSISTANT_ENGINE=rules` e reiniciar o `npm run dev`. Respostas instantâneas pelo motor de regras. |
| Sem internet (Telegram não funciona) | Fazer o roteiro pelo **app do cliente (WebChat)**: IA, transferência, painel e timeline funcionam sem internet. Mostrar os prints reais do Telegram no README. |
| Celular sem bateria (2FA do João) | Usar os prints do painel no README. Se precisar de outro atendente, `npm run db:reset` e configurar o 2FA de novo (o vínculo do Telegram precisa ser refeito). |
| Servidor caiu | `npm run dev` de novo e F5 nas abas: as telas recuperam o estado sozinhas. |
| Algo inesperado | `HEADED=1 npm run test:e2e:ui` mostra a jornada inteira rodando sozinha no navegador, em cerca de 1 minuto. |
