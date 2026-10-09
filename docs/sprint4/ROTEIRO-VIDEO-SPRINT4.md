# Roteiro do vídeo — Challenge Sprint 4 (4 a 5 min)

> **Para gravar, abra `docs/sprint4/guia-gravacao.html` no navegador.** Ele tem os mesmos passos e falas deste arquivo, abre os prints em tela cheia com um clique e marca as cenas já gravadas.
>
> `docs/ROTEIRO-APRESENTACAO.md` é outro roteiro: serve para a **apresentação ao vivo para a banca** (10 min), não para o vídeo.

## O que mostrar em cada melhoria

1. **ANTES = print.** A versão antiga não roda mais, então mostre a imagem `img/antes-*.png` em tela cheia por 5 a 10 s.
2. **DEPOIS = ao vivo.** Mostre o sistema rodando de verdade (Telegram, painel e app).

A exceção é a **Melhoria 4 (segurança)**, em que antes e depois são prints: são respostas da API e não há tela para clicar.

A ordem das cenas ao vivo importa. A Melhoria 1 assume o protocolo do Telegram, então a IA sai daquela conversa. Por isso, a Melhoria 3 abre um chamado novo pelo app.

## Antes de gravar

- Ollama aberto, `npm run dev` e `npm run demo:check` (tudo ✅).
- Abas abertas: painel (:5173, João logado) e app (:5174, Carlos logado), além do Telegram na conversa com o bot. A senha de todos é `Claro@2024`.
- OBS Studio com a tela e a **webcam no canto** (câmera aberta é regra da entrega), em 1080p.
- Grave **uma cena por vez** e junte na edição. A IA leva de 15 a 50 s por resposta: **corte ou acelere a espera**.

## Cenas

| Tempo | Cena | Na tela | Fala |
|---|---|---|---|
| 0:00–0:25 | Abertura | Webcam + dashboard | "Olá, sou [nome]. Nosso projeto é o Claro Omnichannel: um único protocolo e uma única linha do tempo, para o cliente não repetir o problema ao trocar de canal. Vou mostrar as cinco melhorias desta sprint, comparando o antes e o depois." |
| 0:25–1:15 | **1. Telegram** | **Print:** `antes-1-*`. **Ao vivo:** Telegram `/novo Internet caindo à noite` → protocolo aparece no painel → **Assumir atendimento** → responder com o canal Telegram → resposta chega no Telegram e o painel mostra "✓ entregue no Telegram". | "Antes, o WhatsApp era só um texto simulado e o app oferecia canais que não existiam. Agora integramos um canal real, o Telegram: o cliente abre o chamado pelo bot, o atendente responde pelo painel e a resposta chega no Telegram, com confirmação de entrega." |
| 1:15–1:55 | **2. Tempo real** | **Print:** `antes-2-painel-sem-tempo-real` e `antes-2-painel-apos-recarregar`. **Ao vivo:** app e painel lado a lado, no mesmo protocolo → escrever no app e a mensagem aparece no painel na hora → **Simular ligação recebida** → Telegram `/historico` mostra os três canais. | "Antes, o atendente só via uma mensagem nova recarregando a página, e a sessão caía a cada 15 minutos. Agora tudo chega ao vivo e, se a conexão cair, a tela recupera o que mudou. O cliente passou por Telegram, site e telefone, e a linha do tempo é uma só." |
| 1:55–2:55 | **3. IA** | **Print:** `antes-3-*`. **Ao vivo:** app → **Novo chamado** "Internet caindo toda noite" → a Clara diagnostica (espera cortada) → escrever `quero falar com um atendente` → painel com o selo **Transferido pela IA** e o card de resumo (**não clicar em Assumir**) → dashboard com as métricas da IA. | "Antes, todo chamado ia para a fila e o cliente esperava. Agora a Clara, nossa assistente com IA rodando localmente, sem custo e sem enviar dados para fora, resolve o básico consultando rede e modem. Quando o cliente pede um humano, ela transfere na hora e deixa o resumo do caso para o atendente." |
| 2:55–3:35 | **4. Segurança** | **Só prints:** `antes-4-seguranca-api` e `depois-4-seguranca-api`. | "Encontramos falhas graves: qualquer pessoa se cadastrava como administrador, e um atendente via protocolos de outros. As mesmas chamadas agora são recusadas. Também incluímos 2FA sem reutilização de código, auditoria e exportação de dados do titular, pela LGPD." |
| 3:35–4:15 | **5. Interface** | **Print:** `antes-5-*`. **Ao vivo:** janela anônima → login da `maria.atendente@claro.com.br` → **Configurar 2FA agora** → QR Code (**não concluir**, para poder regravar) → F5 num protocolo do painel (a página continua) → tela **Conectar Telegram** no app. | "Na interface, a configuração do 2FA deixava a tela em branco e o F5 voltava ao início. Corrigimos e criamos telas novas: conexão do Telegram, indicadores de canal real ou simulado e o acompanhamento da IA." |
| 4:15–4:30 | Fechamento | Webcam | "Todas as melhorias estão cobertas por testes automatizados e documentadas com antes e depois no documento da entrega. Obrigado!" |

Se a equipe tiver duas pessoas, divida as cenas (por exemplo, A faz 1, 2 e 5; B faz 3 e 4) e apareçam juntas na abertura e no fechamento.

## Depois de gravar

1. Publique no YouTube como **Não listado** (ou Público) e teste o link numa aba anônima.
2. Feche o documento no Word e gere o documento final e o .zip (PowerShell, na raiz):

   ```powershell
   $env:VIDEO_URL="https://youtu.be/SEU-LINK"; $env:EQUIPE="Nome Completo — RM 00000"; npm run docs:sprint4
   ```

   Para mais de uma pessoa, separe os nomes com `;` dentro de `EQUIPE`.
3. Envie no portal `docs/sprint4/Entrega-Sprint4-Claro-Omnichannel.zip` (Word + PDF).
