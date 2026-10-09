/** Textos e formatação das mensagens do bot (pt-BR, texto puro). */

export const CHANNEL_EMOJI: Record<string, string> = {
  WEBCHAT: '🌐',
  TELEGRAM: '✈️',
  PHONE: '📞',
  WHATSAPP: '💬',
  EMAIL: '✉️',
};

export const CHANNEL_LABEL: Record<string, string> = {
  WEBCHAT: 'WebChat',
  TELEGRAM: 'Telegram',
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
};

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  WAITING: 'Aguardando você',
  CLOSED: 'Encerrado',
};

export const BOT_COMMANDS = [
  { command: 'novo', description: 'Abrir um novo chamado: /novo assunto' },
  { command: 'protocolos', description: 'Listar seus protocolos em aberto' },
  { command: 'usar', description: 'Continuar um protocolo: /usar CLR-AAAA-NNNNN' },
  { command: 'historico', description: 'Ver o histórico do protocolo atual (todos os canais)' },
  { command: 'status', description: 'Status do protocolo atual' },
  { command: 'vincular', description: 'Vincular sua conta: /vincular CÓDIGO' },
  { command: 'desvincular', description: 'Remover o vínculo deste Telegram com sua conta' },
  { command: 'ajuda', description: 'Como usar o atendimento pelo Telegram' },
];

export interface ParsedCommand {
  name: string;
  args: string;
}

/** "/usar@meu_bot CLR-2026-12345" → { name: 'usar', args: 'CLR-2026-12345' } */
export function parseCommand(text: string, botUsername?: string): ParsedCommand | null {
  const match = /^\/([a-zA-Z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const [, name, mention, args = ''] = match;
  if (mention && botUsername && mention.toLowerCase() !== botUsername.toLowerCase()) return null;
  return { name: name.toLowerCase(), args: args.trim() };
}

/** Título do protocolo a partir da primeira mensagem do cliente. */
export function deriveTitle(text: string, max = 60): string {
  const firstLine = text.split('\n')[0].replace(/\s+/g, ' ').trim();
  if (firstLine.length < 5) return 'Atendimento via Telegram';
  if (firstLine.length <= max) return firstLine;
  const cut = firstLine.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function formatDateTime(date: Date) {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export const texts = {
  welcomeUnlinked: (clientAppUrl: string) =>
    [
      '👋 Olá! Este é o atendimento digital da Claro (PoC acadêmica FIAP).',
      '',
      'Para falar com a gente por aqui, vincule sua conta:',
      `1. Entre na Central do Cliente: ${clientAppUrl}`,
      '2. Toque em "Conectar Telegram" e gere um código',
      '3. Toque em "Abrir no Telegram" ou envie aqui: /vincular CÓDIGO',
      '',
      'Seus protocolos e o histórico são os mesmos do WebChat — nada se perde ao trocar de canal.',
    ].join('\n'),

  linked: (name: string) =>
    [
      `✅ Pronto, ${name.split(' ')[0]}! Seu Telegram está vinculado à sua conta Claro.`,
      '',
      'É só escrever sua mensagem: ela entra no seu protocolo em aberto (ou abrimos um novo).',
      'O atendente responde por aqui mesmo, e você pode continuar pelo WebChat quando quiser.',
      '',
      'Comandos: /novo assunto · /protocolos · /usar número · /historico · /ajuda',
    ].join('\n'),

  linkFailed: {
    INVALID: '❌ Código inválido ou já utilizado. Gere um novo código na Central do Cliente.',
    EXPIRED: '⌛ Este código expirou (validade de 10 minutos). Gere um novo na Central do Cliente.',
    TOO_MANY_ATTEMPTS: '🚫 Muitas tentativas inválidas. Aguarde 15 minutos e tente novamente.',
  } as Record<string, string>,

  linkUsage: 'Envie o código gerado na Central do Cliente, por exemplo: /vincular K7QM3XPA',

  help: [
    'ℹ️ Como funciona:',
    '• Escreva normalmente: a mensagem vai para o seu protocolo atual.',
    '• Sem protocolo aberto? Abrimos um automaticamente.',
    '',
    '/novo assunto — abre um novo chamado',
    '/protocolos — lista seus protocolos em aberto',
    '/usar CLR-AAAA-NNNNN — continua um protocolo específico',
    '/historico — últimas mensagens do protocolo (de todos os canais)',
    '/status — situação do protocolo atual',
    '/desvincular — remove o vínculo deste Telegram (LGPD)',
  ].join('\n'),

  onlyPrivate: '🔒 Por segurança, o atendimento só acontece em conversa privada com o bot.',
  onlyText: 'Por enquanto só consigo receber mensagens de texto. 🙂',
  inactiveAccount: 'Sua conta está inativa. Procure a Central de Atendimento.',
  tooFast: '⏳ Você enviou muitas mensagens em pouco tempo. Aguarde um minuto.',
  unknownCommand: 'Não conheço esse comando. Envie /ajuda para ver as opções.',
  newUsage: 'Envie o assunto junto com o comando, por exemplo:\n/novo Internet caindo à noite',
  newTitleTooShort: 'O assunto precisa ter pelo menos 5 caracteres.',
  noOpenProtocols: 'Você não tem protocolos em aberto. Escreva sua mensagem ou use /novo assunto.',
  noActiveProtocol: 'Nenhum protocolo selecionado. Use /protocolos ou escreva sua mensagem para abrir um.',
  useUsage: 'Informe o número do protocolo, por exemplo: /usar CLR-2026-12345',
  protocolNotFound: 'Protocolo não encontrado na sua conta.',
  protocolClosed: 'Este protocolo já foi encerrado. Escreva uma mensagem para abrir um novo.',
  unlinked:
    '🔓 Telegram desvinculado. Removemos o identificador deste chat da nossa base.\nSeus protocolos continuam disponíveis no WebChat.',
  notLinked: 'Este Telegram não está vinculado a nenhuma conta.',
  genericError: '⚠️ Não consegui registrar sua mensagem agora. Tente novamente em instantes.',

  protocolCreated: (number: string, title: string) =>
    [
      `📋 Abrimos o protocolo ${number}`,
      `Assunto: ${title}`,
      '',
      'Um atendente vai responder por aqui. Este número vale em todos os canais (WebChat, telefone e Telegram).',
    ].join('\n'),

  protocolCreatedByCommand: (number: string, title: string) =>
    [`📋 Protocolo ${number} aberto.`, `Assunto: ${title}`, '', 'Agora descreva o problema com suas palavras.'].join('\n'),

  protocolSwitched: (number: string, title: string) =>
    `📌 Mensagem registrada no protocolo ${number} — ${title}.\nPara outro assunto: /novo assunto`,

  protocolSelected: (number: string, title: string) =>
    `📌 Protocolo ${number} selecionado — ${title}.\nSuas próximas mensagens entram nele.`,

  assistantReply: (name: string, content: string) => `🤖 ${name} (assistente virtual):
${content}`,

  agentReply: (agentName: string, content: string, protocolNumber: string) =>
    `💬 ${agentName} (Claro):\n${content}\n\n📋 ${protocolNumber}`,

  protocolClosedNotice: (number: string, title: string) =>
    `✅ Seu protocolo ${number} (${title}) foi encerrado.\nSe precisar de algo, é só mandar uma nova mensagem.`,

  agentAssignedNotice: (agentName: string, number: string) =>
    `👩‍💼 ${agentName} assumiu o atendimento do protocolo ${number}.`,
};
