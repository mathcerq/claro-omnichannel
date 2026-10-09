/**
 * Gera o documento da Challenge Sprint 4 (Word + PDF) com as melhorias ANTES/DEPOIS.
 *
 * Uso (na raiz):  npm run docs:sprint4
 *   VIDEO_URL="https://youtu.be/..." npm run docs:sprint4    → preenche o link do vídeo
 *
 * Saída: docs/sprint4/Sprint4-Claro-Omnichannel.docx e .pdf (PDF via Microsoft Word)
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

// ── Configuração (edite aqui) ────────────────────────────────────────────────
const VIDEO_URL = process.env.VIDEO_URL || '';
const EQUIPE = (process.env.EQUIPE || '[Nome completo] — RM [00000]').split(';').map((s) => s.trim());
const REPO_URL = 'https://github.com/mathcerq/claro-omnichannel';
const DATA = 'Outubro de 2026';
// ─────────────────────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(HERE, 'img');
const OUT_DOCX = path.join(HERE, 'Sprint4-Claro-Omnichannel.docx');
const OUT_PDF = path.join(HERE, 'Sprint4-Claro-Omnichannel.pdf');

const RED = 'E3000F';
const GREEN = '15803D';
const GRAY = '6B7280';
const CONTENT_PX = 640; // largura útil da página A4 com margens de 2 cm (~96 dpi)

// ── 1. Diagramas (HTML → PNG) ────────────────────────────────────────────────
async function renderDiagrams() {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(HERE, 'diagramas.html')).href);
  for (const id of ['arquitetura', 'fluxo-omnichannel', 'fluxo-ia']) {
    await page.locator(`#${id}`).screenshot({ path: path.join(IMG, `diagrama-${id}.png`) });
  }
  await browser.close();
}

// ── Utilitários de layout ────────────────────────────────────────────────────
function pngSize(file) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function image(name, maxWidth = CONTENT_PX, maxHeight = 520) {
  const file = path.join(IMG, name);
  const { width, height } = pngSize(file);
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return new ImageRun({
    type: 'png',
    data: readFileSync(file),
    transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
    altText: { title: name, description: name, name },
  });
}

const p = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts, children: Array.isArray(text) ? text : [new TextRun(text)] });
const t = (text, opts = {}) => new TextRun({ text, ...opts });
const bullet = (children) =>
  new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: Array.isArray(children) ? children : [t(children)] });

function label(kind) {
  const isBefore = kind === 'ANTES';
  return new Paragraph({
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [t(` ${kind} `, { bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: isBefore ? RED : GREEN, color: 'auto' } })],
  });
}

function figure(name, caption, maxWidth, maxHeight) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 40 }, children: [image(name, maxWidth, maxHeight)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [t(caption, { italics: true, size: 18, color: GRAY })] }),
  ];
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

/** Duas imagens lado a lado (ex.: ANTES | DEPOIS no celular). */
function sideBySide(left, right, maxWidth = 270, maxHeight = 520) {
  const col = 4819; // DXA (metade da largura útil de 9638)
  const cell = ({ name, caption, kind }) =>
    new TableCell({
      width: { size: col, type: WidthType.DXA },
      borders: noBorders,
      verticalAlign: VerticalAlign.TOP,
      children: [
        ...(kind ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [t(` ${kind} `, { bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: kind === 'ANTES' ? RED : GREEN, color: 'auto' } })] })] : []),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [image(name, maxWidth, maxHeight)] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120 }, children: [t(caption, { italics: true, size: 18, color: GRAY })] }),
      ],
    });
  return new Table({
    width: { size: col * 2, type: WidthType.DXA },
    columnWidths: [col, col],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ cantSplit: true, children: [cell(left), cell(right)] })],
  });
}

function infoTable(rows, widths = [2600, 7038]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: widths[0] + widths[1], type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      ([k, v], i) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: widths[0], type: WidthType.DXA },
              borders,
              shading: { type: ShadingType.CLEAR, fill: i === 0 ? 'FEE2E2' : 'F9FAFB', color: 'auto' },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [p([t(k, { bold: true })], { spacing: { after: 0 } })],
            }),
            new TableCell({
              width: { size: widths[1], type: WidthType.DXA },
              borders,
              shading: i === 0 ? { type: ShadingType.CLEAR, fill: 'FEE2E2', color: 'auto' } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [p(Array.isArray(v) ? v : [t(v, i === 0 ? { bold: true } : {})], { spacing: { after: 0 } })],
            }),
          ],
        }),
    ),
  });
}

function improvement({ n, title, before, after, why, validation }) {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [t(`Melhoria ${n} — ${title}`)] }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t('Como estava (antes)')] }),
    ...before.map((x) => bullet(x)),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t('O que foi feito (depois)')] }),
    ...after.map((x) => bullet(x)),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t('Justificativa')] }),
    ...why.map((x) => p(x)),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t('Evidências')] }),
  ].concat(validation ? [] : []);
}

// ── 2. Conteúdo ──────────────────────────────────────────────────────────────
function buildDocument() {
  const videoLine = VIDEO_URL
    ? new ExternalHyperlink({ link: VIDEO_URL, children: [t(VIDEO_URL, { style: 'Hyperlink' })] })
    : t('[COLE AQUI O LINK PÚBLICO DO VÍDEO]', { bold: true, highlight: 'yellow' });

  const cover = [
    new Paragraph({ spacing: { before: 2400, after: 120 }, children: [t('FIAP × CLARO', { bold: true, color: RED, size: 28 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [t('Challenge Sprint 4', { bold: true, size: 56 })] }),
    new Paragraph({ spacing: { after: 480 }, children: [t('Claro Omnichannel — melhorias implementadas na solução', { size: 32, color: '374151' })] }),
    p([t('Vídeo de demonstração: ', { bold: true }), videoLine]),
    p([t('Repositório: ', { bold: true }), new ExternalHyperlink({ link: REPO_URL, children: [t(REPO_URL, { style: 'Hyperlink' })] })]),
    p([t('Equipe:', { bold: true })], { spacing: { before: 240, after: 60 } }),
    ...EQUIPE.map((m) => bullet(m)),
    p([t(DATA, { color: GRAY })], { spacing: { before: 480 } }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const intro = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t('1. A solução')] }),
    p('O desafio da Claro é a fragmentação do atendimento: quando o cliente abre um chamado em um canal e é transferido para outro, o histórico se perde e ele precisa repetir tudo. O Claro Omnichannel resolve isso com um único protocolo (CLR-AAAA-NNNNN) e uma única linha do tempo, compartilhada por todos os canais e visível em tempo real para o cliente e para o atendente.'),
    p('A solução tem três partes: o app do cliente (React PWA, com WebChat), o painel do atendente (React) e o backend (NestJS, Prisma, WebSocket), que integra os canais WebChat e Telegram (reais) e telefone (simulado de propósito), além de uma assistente virtual com IA local. A arquitetura completa está no Anexo A.'),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t('2. Como as melhorias foram definidas')] }),
    p('As melhorias partiram de três referências: a orientação do professor de que o ideal é uma solução totalmente funcional, aceitando simulação apenas quando necessário; os critérios de avaliação da Challenge (protótipo 100% funcional, requisitos funcionais e não funcionais, tecnologias adequadas, maturidade técnica, alinhamento com a Claro, criatividade e inovação); e o objetivo do desafio da Claro de manter o histórico ao trocar de canal.'),
    p('Com essas referências, a equipe revisou a versão anterior do sistema funcionalidade por funcionalidade, inclusive com testes automatizados e verificações diretas na API, e priorizou os cinco pontos abaixo. As imagens de "antes" foram capturadas executando a versão anterior do código (commit 9996156 do repositório) e as de "depois", a versão atual.'),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t('Resumo das cinco melhorias')] }),
    summaryTable(),
  ];

  const blocks = [
    // ── Melhoria 1
    ...improvement({
      n: 1,
      title: 'Canal real: integração com o Telegram',
      before: [
        'WhatsApp e telefone eram apenas simulados: uma rota técnica (/simulate) inseria na conversa um texto com o prefixo "[WHATSAPP Simulado]". Nenhum canal externo funcionava de verdade.',
        'O app do cliente oferecia canais que não existiam (WhatsApp, Telefone, E-mail) ao abrir um chamado pelo próprio WebChat.',
      ],
      after: [
        'Bot real do Telegram (@claro_omnichannel_mathcerq_bot) integrado pela Telegram Bot API, com long polling (funciona sem expor o servidor à internet).',
        'Vínculo seguro: o cliente, logado no app, gera um código de uso único (válido por 10 minutos, com deep link e QR Code). Isso impede que alguém se passe por outro cliente.',
        'Pelo Telegram, o cliente abre chamados (/novo ou texto livre), acompanha protocolos, vê o histórico de todos os canais (/historico) e recebe as respostas do atendente, com confirmação de entrega no painel.',
        'O telefone continua simulado, mas de forma explícita (rótulo "mock" no painel e no código). Os canais são plugáveis: um novo canal, como o WhatsApp Business, entra sem mudar o núcleo do sistema.',
        'O formulário de novo chamado não oferece mais canais fictícios.',
      ],
      why: [
        'Atende diretamente à orientação do professor ("o ideal é tudo funcional, mock só quando necessário") e ao critério de protótipo totalmente funcional. O problema da Claro é justamente a troca de canal; demonstrá-la com um canal externo real torna a solução verificável.',
        'O Telegram foi escolhido porque a API do WhatsApp Business exige conta comercial verificada pela Meta, o que não é viável para o projeto. A arquitetura de canais plugáveis deixa o WhatsApp pronto para ser adicionado.',
      ],
    }),
    sideBySide(
      { name: 'antes-1-novo-chamado-canais-ficticios.png', caption: 'Novo chamado com canais que não existiam', kind: 'ANTES' },
      { name: 'depois-1-novo-chamado.png', caption: 'Novo chamado sem canais fictícios', kind: 'DEPOIS' },
      250,
      440,
    ),
    label('ANTES'),
    ...figure('antes-1-painel-whatsapp-simulado.png', 'Painel: o "WhatsApp" era um texto inserido pela API com o prefixo "[WHATSAPP Simulado]"', CONTENT_PX, 330),
    label('DEPOIS'),
    sideBySide(
      { name: 'depois-1-telegram-real.png', caption: 'Telegram real: chamado aberto pelo bot e resposta do atendente entregue' },
      { name: 'depois-1-telegram-historico.png', caption: '/historico: Telegram, WebChat e telefone no mesmo protocolo' },
      300,
      360,
    ),

    // ── Melhoria 2
    ...improvement({
      n: 2,
      title: 'Atualização em tempo real',
      before: [
        'O servidor WebSocket existia, mas nenhum evento era disparado: uma mensagem nova do cliente só aparecia para o atendente depois de recarregar a página (e vice-versa).',
        'A sessão expirava a cada 15 minutos sem renovação: o atendente era desconectado no meio do atendimento.',
      ],
      after: [
        'O núcleo publica eventos (mensagem criada, protocolo alterado) e o WebSocket os entrega às salas certas: o atendente vê a mensagem do cliente na hora, em qualquer canal.',
        'Status de entrega por mensagem ("entregue no Telegram") e indicador "digitando…" da assistente.',
        'Recuperação automática: se a conexão cai (servidor reiniciando, Wi-Fi oscilando), a tela busca o que mudou ao reconectar.',
        'Renovação automática do login com refresh token: a sessão não cai mais a cada 15 minutos.',
      ],
      why: [
        'Atendimento omnichannel depende de o atendente enxergar o cliente no momento em que ele escreve; sem isso, o tempo médio de atendimento aumenta e o cliente fica sem resposta. É também um requisito não funcional de usabilidade e confiabilidade, um dos critérios de avaliação.',
      ],
    }),
    label('ANTES'),
    ...figure('antes-2-painel-sem-tempo-real.png', 'O cliente enviou "Alguém aí? Já faz 10 minutos…", mas o painel não mostra nada…', CONTENT_PX, 300),
    ...figure('antes-2-painel-apos-recarregar.png', '…a mensagem só aparece depois de recarregar a página.', CONTENT_PX, 300),
    label('DEPOIS'),
    ...figure('depois-2-painel-tempo-real.png', 'A mesma mensagem aparece sozinha no painel, sem recarregar', CONTENT_PX, 300),
    ...figure('depois-2-painel-entregue-telegram.png', 'Timeline com badge por canal e "✓ entregue no Telegram" na resposta do atendente', CONTENT_PX, 300),

    // ── Melhoria 3
    ...improvement({
      n: 3,
      title: 'Assistente virtual com IA (atendimento nível 1)',
      before: [
        'Todo chamado ia direto para a fila dos atendentes humanos; o cliente escrevia e ficava esperando.',
        'Não havia nenhuma automação nem indicador de quanto do atendimento poderia ser resolvido sem um humano.',
      ],
      after: [
        'A Clara, assistente virtual, atende primeiro no WebChat e no Telegram, na mesma timeline do protocolo.',
        'Usa IA generativa rodando localmente (modelo aberto Qwen3 4B via Ollama), sem custo e sem enviar dados para terceiros.',
        'Resolve sozinha os casos de nível 1 chamando ferramentas: fatura e 2ª via, verificação de instabilidade na região, diagnóstico e reinício remoto do modem, agendamento de visita técnica. Os sistemas internos da Claro são simulados.',
        'Transfere para um humano quando necessário (pedido de atendente, cancelamento, contestação, Procon), deixando motivo e resumo do caso no painel: o atendente não precisa perguntar tudo de novo.',
        'Decisões críticas são regras no código, não do modelo. Se a IA ficar indisponível, um motor de regras assume automaticamente.',
        'Painel com selos "IA atendendo / Transferido pela IA / Resolvido pela IA" e métricas, incluindo a taxa de resolução sem humano.',
      ],
      why: [
        'Alinha a solução ao objetivo da Claro de reduzir filas e tempo médio de atendimento e de liberar os atendentes para os casos complexos. Atende ao critério de criatividade e inovação com uma abordagem responsável: a IA roda localmente (LGPD), é sempre identificada como IA, e o cliente pode pedir um humano a qualquer momento.',
        'Foram comparados três modelos em cenários reais (fatura, internet, pedido de humano e contestação). O escolhido acertou 4 de 4; um modelo mais rápido acertou 0 de 4 por prometer ações sem executá-las.',
      ],
    }),
    label('ANTES'),
    sideBySide(
      { name: 'antes-3-cliente-sem-resposta.png', caption: 'O cliente escreve e ninguém responde até um atendente pegar o chamado' },
      { name: 'antes-3-dashboard.png', caption: 'Dashboard sem automação nem métricas de IA' },
      270,
      440,
    ),
    label('DEPOIS'),
    sideBySide(
      { name: 'depois-3-cliente-clara-webchat.png', caption: 'WebChat: a Clara diagnostica o sinal fraco e agenda a visita técnica' },
      { name: 'depois-3-telegram-clara.png', caption: 'Telegram: a Clara diagnostica e transfere para o atendente' },
      270,
      440,
    ),
    ...figure('depois-3-painel-transferencia-ia.png', 'Painel: transferência feita pela IA, com motivo e resumo do caso para o atendente', CONTENT_PX, 330),
    ...figure('depois-3-dashboard-metricas-ia.png', 'Dashboard: canais reais/mock, métricas da IA e selo "Transferido pela IA"', CONTENT_PX, 330),

    // ── Melhoria 4
    ...improvement({
      n: 4,
      title: 'Segurança e LGPD',
      before: [
        'O cadastro público aceitava o campo de perfil: qualquer pessoa criava uma conta de ADMINISTRADOR (resposta 201).',
        'Qualquer atendente abria qualquer protocolo pelo identificador, inclusive os de clientes de outros atendentes (resposta 200).',
        'As salas do WebSocket não verificavam permissão e eventos eram enviados a todos os conectados.',
        'O mesmo código do 2FA podia ser usado mais de uma vez, e segredos tinham valores padrão escritos no código.',
      ],
      after: [
        'Cadastro público cria sempre CLIENT (o campo de perfil é rejeitado: 400).',
        'Menor privilégio: o atendente acessa só a fila e os protocolos atribuídos a ele (403 nos demais); a mesma regra vale no WebSocket.',
        '2FA com anti-replay (cada código vale uma vez: 401 no reuso) e API que não sobe sem os segredos configurados.',
        'LGPD: trilha de auditoria (logins, transferências, alterações), exportação dos dados do titular pelo app, vínculo do Telegram revogável e, do Telegram, apenas o identificador da conversa é guardado.',
      ],
      why: [
        'Uma operadora lida com dados pessoais de milhões de clientes. As correções atendem à LGPD (art. 6º, III, necessidade; art. 46, segurança; art. 18, direitos do titular) e aos critérios de requisitos não funcionais e maturidade técnica. As falhas foram confirmadas com chamadas reais à API da versão anterior.',
      ],
    }),
    label('ANTES'),
    ...figure('antes-4-seguranca-api.png', 'Versão anterior: cadastro como ADMIN aceito e atendente abrindo protocolo de outro atendente', CONTENT_PX, 320),
    label('DEPOIS'),
    ...figure('depois-4-seguranca-api.png', 'Versão atual: as mesmas chamadas são recusadas (400, 403) e o 2FA não aceita código reutilizado (401)', CONTENT_PX, 280),

    // ── Melhoria 5
    ...improvement({
      n: 5,
      title: 'Interface do usuário',
      before: [
        'Ao configurar o 2FA obrigatório, a tela do atendente ficava em branco: o QR Code nunca aparecia e o primeiro acesso pela interface era impossível.',
        'Atualizar a página (F5) ou abrir um link direto para um protocolo levava de volta à tela inicial.',
        'Não havia indicação de quais canais eram reais e quais eram simulados, nem tela para conectar canais externos.',
      ],
      after: [
        'QR Code do 2FA funcionando no painel e no app (a tela codificava a imagem inteira em vez do link do autenticador).',
        'A sessão é restaurada no primeiro carregamento: F5 e links diretos mantêm a página.',
        'Tela "Conectar Telegram" no app (código, botão "Abrir no Telegram", QR Code e desvínculo).',
        'Painel com indicadores de canal real/mock, card "Canais do cliente", card da assistente e "digitando…".',
        'Mensagens identificadas por canal ("via Telegram", "via WebChat", "via Telefone") nos dois apps.',
      ],
      why: [
        'A Sprint 4 pede explicitamente melhorias de interface. Os dois primeiros itens eram defeitos que impediam o uso, um deles bloqueando o primeiro acesso do atendente. Os demais deixam visível para o cliente, para o atendente e para a banca o que é real, o que é simulado e o que a IA está fazendo.',
      ],
    }),
    label('ANTES'),
    ...figure('antes-5-2fa-tela-em-branco.png', 'Configurar o 2FA: a tela ficava completamente em branco', CONTENT_PX, 260),
    label('DEPOIS'),
    ...figure('depois-5-2fa-qr-code.png', 'Configurar o 2FA: QR Code e chave manual exibidos', CONTENT_PX, 330),
    label('ANTES'),
    ...figure('antes-5-link-direto-volta-inicio.png', 'Link direto para um protocolo: o sistema voltava para a tela inicial', CONTENT_PX, 300),
    label('DEPOIS'),
    ...figure('depois-5-link-direto-mantem-pagina.png', 'Link direto / F5: a página do protocolo é mantida', CONTENT_PX, 300),
    ...figure('depois-5-cliente-telegram-conectado.png', 'Nova tela do app: Telegram conectado, com opção de desvincular (LGPD)', 270, 460),
  ];

  const validation = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [t('3. Como as melhorias foram validadas')] }),
    p('Todas as melhorias foram testadas, e os testes automatizados ficam no repositório (npm test):'),
    bullet([t('Testes unitários (Jest): ', { bold: true }), t('regras do bot, canais, regra de acesso, motores e travas da assistente.')]),
    bullet([t('E2E do Telegram: ', { bold: true }), t('29 verificações com o backend real e uma Bot API simulada: vínculo, protocolo, troca de canal, entrega, idempotência, segurança e LGPD.')]),
    bullet([t('E2E da assistente: ', { bold: true }), t('12 verificações: resposta no Telegram e no WebChat, transferência com resumo, saída da IA quando o humano assume, métricas.')]),
    bullet([t('E2E de interface (Playwright): ', { bold: true }), t('16 verificações no navegador, incluindo a configuração do 2FA pela tela e a recuperação após o servidor reiniciar.')]),
    bullet([t('Avaliação da IA real: ', { bold: true }), t('cenários de conversa executados contra o modelo local (4 de 4 com o desfecho esperado).')]),
    bullet([t('Teste manual com o bot real: ', { bold: true }), t('jornada Telegram → atendente → WebChat → telefone executada ponta a ponta (telas reais neste documento).')]),
    p('Algumas correções foram feitas com um teste que falhava antes e passava depois (por exemplo, a tela em branco do 2FA e a recuperação após queda de conexão).', { spacing: { before: 120 } }),
  ];

  const annex = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [t('Anexo A — Arquitetura da solução')] }),
    ...figure('diagrama-arquitetura.png', 'Componentes: frontends, canais, backend modular e IA local', CONTENT_PX, 330),
    ...figure('diagrama-fluxo-omnichannel.png', 'Fluxo omnichannel: o mesmo protocolo e a mesma timeline em todos os canais', CONTENT_PX, 330),
    ...figure('diagrama-fluxo-ia.png', 'Fluxo da assistente virtual: IA com travas determinísticas', CONTENT_PX, 200),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t('Anexo B — Tecnologias')] }),
    infoTable([
      ['Camada', 'Tecnologias'],
      ['Backend', 'NestJS (TypeScript), Prisma ORM, SQLite, Socket.io, @nestjs/event-emitter'],
      ['Frontends', 'React 18, Vite, Tailwind CSS, Zustand, Axios, PWA'],
      ['Canais', 'Telegram Bot API (long polling); WebChat (REST + WebSocket); telefone simulado'],
      ['IA', 'Ollama com o modelo aberto Qwen3 4B (local, GPU), function calling; motor de regras de reserva'],
      ['Segurança', 'JWT + refresh token, 2FA TOTP com anti-replay, bcrypt, Helmet, rate limit, RBAC com menor privilégio'],
      ['Qualidade', 'Jest, testes E2E com Playwright, Bot API simulada para testes'],
    ]),
  ];

  return new Document({
    creator: 'Equipe Claro Omnichannel',
    title: 'Challenge Sprint 4 — Claro Omnichannel',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: RED }, paragraph: { keepNext: true, spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '1F2937' }, paragraph: { keepNext: true, spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('Claro Omnichannel — Sprint 4 · página ', { size: 16, color: GRAY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY })] })],
          }),
        },
        children: [...cover, ...intro, ...blocks, ...validation, ...annex],
      },
    ],
  });
}

function summaryTable() {
  const widths = [500, 2700, 3219, 3219];
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const rows = [
    ['#', 'Melhoria', 'Antes', 'Depois'],
    ['1', 'Canal real (Telegram)', 'WhatsApp e telefone simulados por uma rota técnica', 'Bot real do Telegram com vínculo seguro e a mesma timeline; telefone mock explícito'],
    ['2', 'Tempo real', 'Mensagens só apareciam recarregando a página; sessão caía a cada 15 min', 'Mensagens ao vivo, entrega confirmada, recuperação ao reconectar, sessão renovada'],
    ['3', 'Assistente virtual (IA)', 'Todo chamado ia para a fila humana', 'IA local resolve o nível 1 e transfere com resumo; métricas de resolução'],
    ['4', 'Segurança e LGPD', 'Cadastro como ADMIN, atendente via tudo, 2FA reutilizável', 'Menor privilégio, anti-replay, auditoria, exportação de dados'],
    ['5', 'Interface do usuário', '2FA em tela branca, F5 voltava ao início, canais fictícios', 'QR do 2FA, sessão mantida, telas de Telegram/IA, indicadores real/mock'],
  ];
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (cells, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: cells.map(
            (text, c) =>
              new TableCell({
                width: { size: widths[c], type: WidthType.DXA },
                borders,
                shading: i === 0 ? { type: ShadingType.CLEAR, fill: RED, color: 'auto' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: [t(text, { size: 19, bold: i === 0 || c === 1, color: i === 0 ? 'FFFFFF' : undefined })] })],
              }),
          ),
        }),
    ),
  });
}

// ── 3. Word → PDF (pelo próprio Microsoft Word, via COM) ─────────────────────
function exportPdf() {
  if (existsSync(OUT_PDF)) rmSync(OUT_PDF);
  const ps = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open('${OUT_DOCX.replace(/'/g, "''")}', $false, $true)
  $doc.SaveAs([ref]'${OUT_PDF.replace(/'/g, "''")}', [ref]17)
  $doc.Close([ref]0)
} finally { $word.Quit() }`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
}

await renderDiagrams();
writeFileSync(OUT_DOCX, await Packer.toBuffer(buildDocument()));
console.log('Word gerado:', path.relative(process.cwd(), OUT_DOCX));
if (process.env.SKIP_PDF !== '1') {
  exportPdf();
  console.log('PDF gerado: ', path.relative(process.cwd(), OUT_PDF));
}
