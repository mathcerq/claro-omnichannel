# Roteiro do vídeo — Challenge Sprint 4 (3 a 5 min)

Foco: **5 melhorias, mostrando como estava (ANTES) e como ficou (DEPOIS)**. Para o ANTES, mostre em tela cheia as imagens do documento (`docs/sprint4/img/antes-*.png`). Para o DEPOIS, mostre o sistema funcionando ao vivo.

**Regras da entrega:** todos com **câmera aberta** (webcam em um canto da tela) e vídeo **público** (YouTube "Público" ou "Não listado", testando o link em aba anônima). O link vai no documento: `VIDEO_URL="https://..." npm run docs:sprint4`.

## Antes de gravar
- `npm run dev` e depois `npm run demo:check` (tudo ✅). Abas abertas: painel (:5173, João logado), app (:5174, Carlos logado) e Telegram na conversa com o bot.
- Gravação: OBS Studio (grátis) com a tela e a webcam no canto, em 1080p.
- A IA leva cerca de 20 s por resposta. **Corte ou acelere a espera na edição**, com uma legenda do tipo "IA local respondendo (~20 s)".
- Grave em trechos (um por melhoria) e junte na edição. Fica mais fácil refazer só o que errar.

---

## Versão 1 — uma pessoa (≈ 4 min 30 s)

| Tempo | Tela | Fala |
|---|---|---|
| 0:00–0:25 | Webcam + dashboard | "Olá, sou [nome]. Nosso projeto é o Claro Omnichannel: um único protocolo e uma única linha do tempo para o cliente não repetir o problema ao trocar de canal. Vou mostrar as cinco melhorias que implementamos, comparando o antes e o depois." |
| 0:25–1:15 | **Melhoria 1 — Telegram.** ANTES: imagens `antes-1-*` (5 s cada). DEPOIS: no Telegram, `/novo Internet caindo à noite`; o protocolo aparece no painel; responder pelo painel com o canal Telegram; mostrar a mensagem chegando e o `/historico`. | "Antes, o WhatsApp era só um texto simulado e o app oferecia canais que não existiam. Agora integramos um canal real, o Telegram: o cliente abre o chamado pelo bot, o atendente responde pelo painel e a resposta chega no Telegram. E o histórico mostra todos os canais no mesmo protocolo." |
| 1:15–1:55 | **Melhoria 2 — Tempo real.** ANTES: `antes-2-sem-tempo-real` e depois `antes-2-apos-recarregar`. DEPOIS: app e painel lado a lado; escrever no WebChat e mostrar a mensagem aparecendo no painel na hora, com "✓ entregue no Telegram" nas respostas. | "Antes, o atendente só via uma mensagem nova recarregando a página, e a sessão caía a cada 15 minutos. Agora tudo chega ao vivo, com confirmação de entrega, e se a conexão cair a tela recupera o que mudou." |
| 1:55–2:55 | **Melhoria 3 — IA.** ANTES: `antes-3-cliente-sem-resposta`. DEPOIS: no Telegram, "minha internet cai toda noite" → a Clara diagnostica (espera cortada) → "quero falar com um atendente" → transferência na hora → painel com o card de **resumo** → dashboard com a taxa de resolução da IA. | "Antes, todo chamado ia para a fila e o cliente esperava. Agora a Clara, nossa assistente com IA rodando localmente, sem custo e sem enviar dados para fora, resolve o básico consultando rede e modem. Quando o cliente pede um humano, ela transfere na hora e deixa o resumo do caso para o atendente." |
| 2:55–3:35 | **Melhoria 4 — Segurança.** `antes-4-seguranca-api` e depois `depois-4-seguranca-api` (tela cheia). | "Encontramos falhas graves: qualquer pessoa conseguia se cadastrar como administrador, e um atendente via protocolos de outros. As mesmas chamadas agora são recusadas. Também incluímos 2FA sem reutilização de código, auditoria e exportação de dados do titular, pela LGPD." |
| 3:35–4:15 | **Melhoria 5 — Interface.** ANTES: `antes-5-2fa-tela-em-branco`. DEPOIS: login da `maria.atendente@claro.com.br` → "Configurar 2FA agora" → QR Code aparece. Dar F5 num protocolo (a página continua). Mostrar a tela "Conectar Telegram" no app. | "Na interface, a configuração do 2FA deixava a tela em branco e o F5 voltava ao início. Corrigimos e criamos novas telas: conexão do Telegram, indicadores de canal real ou simulado e o acompanhamento da IA." |
| 4:15–4:30 | Webcam | "Todas as melhorias estão cobertas por testes automatizados e documentadas com antes e depois no documento da entrega. Obrigado!" |

---

## Versão 2 — duas pessoas (≈ 4 min 30 s)

Mesmas telas e tempos da versão 1, com as falas divididas. **As duas pessoas aparecem juntas na abertura e no fechamento** (gravação lado a lado, por exemplo numa chamada do Meet gravada, ou duas webcams no OBS), e cada uma com sua webcam no canto durante a própria parte.

| Tempo | Quem fala | Parte |
|---|---|---|
| 0:00–0:25 | **Pessoa A** (com B na tela) | Abertura: "Somos [A] e [B]. Nosso projeto é o Claro Omnichannel… vamos mostrar cinco melhorias, antes e depois." |
| 0:25–1:15 | **Pessoa A** | Melhoria 1: Telegram real |
| 1:15–1:55 | **Pessoa A** | Melhoria 2: tempo real |
| 1:55–2:55 | **Pessoa B** | Melhoria 3: assistente com IA |
| 2:55–3:35 | **Pessoa B** | Melhoria 4: segurança e LGPD |
| 3:35–4:15 | **Pessoa A** | Melhoria 5: interface |
| 4:15–4:30 | **Pessoa B** (com A na tela) | Fechamento: "Tudo coberto por testes automatizados e documentado com antes e depois. Obrigado!" |

As falas de cada parte são as mesmas da versão 1. Cada pessoa pode adaptá-las com as próprias palavras, desde que mantenha o "antes", o "depois" e o porquê.
