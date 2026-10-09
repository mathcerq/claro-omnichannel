/** Intenções reconhecidas por palavras-chave (motor de regras e travas da IA). */

export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export const INTENTS = {
  human: ['atendente', 'humano', 'pessoa', 'falar com alguem', 'operador'],
  escalate: ['cancelar', 'cancelamento', 'portabilidade', 'contestar', 'contestacao', 'reembolso', 'estorno', 'procon', 'anatel', 'processo', 'absurdo', 'mudar de plano', 'mudanca de endereco'],
  invoice: ['fatura', 'boleto', 'conta', 'cobranca', 'cobrado', 'valor', 'pagar', 'pagamento', 'vencimento', 'segunda via', '2a via', '2 via'],
  secondCopy: ['segunda via', '2a via', '2 via', 'boleto', 'linha digitavel', 'codigo de barras'],
  connection: ['internet', 'conexao', 'caindo', 'cai ', 'caiu', 'lenta', 'lento', 'wifi', 'wi-fi', 'sinal', 'sem rede', 'nao funciona', 'modem', 'roteador', 'tv'],
  visit: ['visita', 'tecnico'],
  status: ['status', 'andamento', 'situacao', 'protocolo'],
  yes: ['sim', 'pode', 'quero', 'ok', 'claro', 'isso', 'por favor', 'manda', 'faz'],
  no: ['nao', 'ainda', 'continua', 'nada', 'piorou', 'mesmo problema'],
  thanks: ['obrigad', 'resolvido', 'resolveu', 'funcionou', 'voltou', 'deu certo', 'valeu'],
  morning: ['manha', 'cedo'],
  afternoon: ['tarde'],
};
