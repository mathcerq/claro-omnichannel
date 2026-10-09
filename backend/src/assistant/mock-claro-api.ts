import { createHash, randomInt } from 'crypto';

/**
 * ⚠️ MOCK ASSUMIDO — sistemas internos da Claro SIMULADOS.
 *
 * A assistente virtual precisa consultar fatura, rede e modem para resolver
 * casos de verdade, mas esta PoC não tem acesso aos sistemas da operadora.
 * Os dados abaixo são INVENTADOS e determinísticos por cliente (o mesmo
 * cliente sempre vê os mesmos valores), para a demonstração ser coerente.
 *
 * Em produção, cada função vira uma chamada às APIs internas (billing, NOC,
 * gerência de CPE, agendamento de campo) — a assistente não muda.
 */

/** Número pseudoaleatório estável por cliente + chave (0..n-1). */
function seeded(clientId: string, key: string, n: number) {
  const hash = createHash('sha256').update(`${clientId}:${key}`).digest();
  return hash.readUInt32BE(0) % n;
}

const PLANS = [
  { nome: 'Claro Internet 300 Mega', valor: 99.9 },
  { nome: 'Claro Internet 500 Mega + TV', valor: 149.9 },
  { nome: 'Claro Internet 1 Giga', valor: 199.9 },
];

const BAIRROS = ['Vila Mariana', 'Pinheiros', 'Mooca', 'Santana', 'Tatuapé', 'Butantã'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function addBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  while (days > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days--;
  }
  return d;
}

export function getPlan(clientId: string) {
  return PLANS[seeded(clientId, 'plano', PLANS.length)];
}

export function getInvoices(clientId: string, now = new Date()) {
  const plan = getPlan(clientId);
  // Um em cada três clientes tem uma cobrança acima do plano no mês atual
  const overcharge = seeded(clientId, 'cobranca', 3) === 0;
  return [2, 1, 0].map((monthsAgo) => {
    const ref = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 10);
    const isCurrent = monthsAgo === 0;
    const valor = isCurrent && overcharge ? plan.valor + 89.9 : plan.valor;
    return {
      referencia: `${MESES[ref.getMonth()]}/${ref.getFullYear()}`,
      vencimento: ref.toLocaleDateString('pt-BR'),
      valor: brl(valor),
      status: isCurrent ? 'EM ABERTO' : 'PAGA',
      ...(isCurrent && overcharge
        ? { observacao: `Valor acima do plano (${brl(plan.valor)}): inclui "Serviço adicional de streaming" de R$ 89,90` }
        : {}),
    };
  });
}

export function getDuplicateInvoice(clientId: string, now = new Date()) {
  const current = getInvoices(clientId, now)[2];
  const digits = createHash('sha256').update(`${clientId}:boleto:${current.referencia}`).digest('hex').replace(/\D/g, '');
  const line = digits.padEnd(47, '7').slice(0, 47);
  return {
    referencia: current.referencia,
    valor: current.valor,
    vencimento: current.vencimento,
    linhaDigitavel: `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ${line.slice(21, 26)}.${line.slice(26, 32)} ${line.slice(32, 33)} ${line.slice(33)}`,
    enviadaPara: 'e-mail cadastrado e app Minha Claro',
  };
}

export function getNetworkStatus(clientId: string, now = new Date()) {
  const bairro = BAIRROS[seeded(clientId, 'bairro', BAIRROS.length)];
  const instavel = seeded(clientId, 'rede', 3) === 0;
  const previsao = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return instavel
    ? {
        regiao: `${bairro}, São Paulo/SP`,
        status: 'INSTABILIDADE',
        detalhe: 'Manutenção emergencial em equipamento da rede óptica da região',
        previsaoNormalizacao: previsao.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }
    : { regiao: `${bairro}, São Paulo/SP`, status: 'NORMAL', detalhe: 'Nenhuma falha registrada na região nas últimas 24h' };
}

export function getModemDiagnostics(clientId: string) {
  const quedas = 2 + seeded(clientId, 'quedas', 9);
  const sinalFraco = seeded(clientId, 'sinal', 2) === 0;
  return {
    modem: 'Claro Wi-Fi 6 (simulado)',
    status: 'ONLINE',
    quedasUltimas24h: quedas,
    potenciaSinalOptico: sinalFraco ? '-27,8 dBm (fraco)' : '-19,2 dBm (bom)',
    sinalFraco,
    recomendacao: sinalFraco
      ? 'Sinal óptico fraco: provável problema no cabo/conector. Reinício pode não resolver; visita técnica recomendada.'
      : 'Sinal bom. Quedas compatíveis com travamento do modem: reinício remoto costuma resolver.',
  };
}

export function rebootModem() {
  return {
    comando: 'REINICIO_REMOTO',
    resultado: 'Enviado com sucesso. O modem volta em cerca de 3 minutos.',
  };
}

export function scheduleTechnicalVisit(periodo: 'manha' | 'tarde', now = new Date()) {
  const dia = addBusinessDays(now, 1);
  return {
    codigoVisita: `VT-${randomInt(100000, 999999)}`,
    data: dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }),
    janela: periodo === 'manha' ? '8h às 12h' : '13h às 18h',
    orientacao: 'Um adulto precisa estar no local. O técnico estará identificado com crachá da Claro.',
  };
}
