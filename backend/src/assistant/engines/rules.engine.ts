import { Injectable } from '@nestjs/common';
import { AssistantContext, AssistantDecision, AssistantEngine } from '../assistant.types';
import { ASSISTANT_NAME } from '../assistant.prompt';
import { INTENTS, has, normalize } from '../assistant-intents';
import { caseSummary } from '../assistant-guardrails';

/**
 * Motor de RESERVA, sem IA generativa: reconhece intenções por palavras-chave
 * e usa as mesmas ferramentas do LLM. Garante que a triagem funcione em
 * qualquer máquina (inclusive na banca e nos testes) mesmo sem o Ollama.
 */

/** Marcadores no texto da última resposta, para lembrar em que passo a conversa está. */
const ASKED_REBOOT = 'Posso reiniciar o seu modem remotamente?';
const ASKED_TEST = 'Pode testar e me dizer se melhorou?';
const ASKED_VISIT = 'Prefere manhã ou tarde?';
const NOT_UNDERSTOOD = 'Não consegui entender';

@Injectable()
export class RulesEngine implements AssistantEngine {
  readonly name = 'regras';
  readonly kind = 'RULES' as const;

  async isAvailable() {
    return true;
  }

  async respond(ctx: AssistantContext): Promise<AssistantDecision> {
    const reply = await this.decide(ctx);
    const isFirst = !ctx.history.some((t) => t.role === 'assistant');
    const intro = isFirst
      ? `Olá, ${ctx.customerFirstName}! Sou a ${ASSISTANT_NAME}, assistente virtual da Claro. Se preferir, é só pedir um atendente a qualquer momento.\n\n`
      : '';
    return { reply: intro + reply, engine: this.name, toolsUsed: [...ctx.toolbox.used] };
  }

  private async decide(ctx: AssistantContext): Promise<string> {
    const { toolbox } = ctx;
    const lastUser = [...ctx.history].reverse().find((t) => t.role === 'user')?.content ?? ctx.protocolTitle;
    const lastBot = [...ctx.history].reverse().find((t) => t.role === 'assistant')?.content ?? '';
    const text = normalize(lastUser);

    // 1. Pedido de humano ou assunto que exige atendente
    if (has(text, ...INTENTS.human) || has(text, ...INTENTS.escalate)) {
      const reason = has(text, ...INTENTS.human) ? 'Cliente pediu atendimento humano' : 'Assunto exige atendente (contestação/cancelamento/reclamação)';
      await toolbox.execute('transferir_para_atendente', {
        motivo: reason,
        resumo: caseSummary(ctx),
        prioridade: has(text, 'procon', 'anatel', 'processo') ? 'URGENT' : has(text, ...INTENTS.escalate) ? 'HIGH' : 'MEDIUM',
      });
      return 'Entendi. Vou transferir você para um atendente, que vai continuar neste mesmo protocolo com todo o histórico — você não precisa repetir nada. 😊';
    }

    // 2. Continuação de um passo anterior
    if (lastBot.includes(ASKED_VISIT) && (has(text, ...INTENTS.morning) || has(text, ...INTENTS.afternoon))) {
      const visit: any = await toolbox.execute('agendar_visita_tecnica', { periodo: has(text, ...INTENTS.morning) ? 'manha' : 'tarde' });
      return `Pronto! Visita técnica agendada para ${visit.data}, das ${visit.janela} (código ${visit.codigoVisita}). ${visit.orientacao} Posso ajudar em mais alguma coisa?`;
    }
    if (lastBot.includes(ASKED_REBOOT) && has(text, ...INTENTS.yes) && !has(text, 'nao')) {
      const reboot: any = await toolbox.execute('reiniciar_modem', {});
      return `${reboot.resultado} ${ASKED_TEST}`;
    }
    if (lastBot.includes(ASKED_TEST)) {
      if (has(text, ...INTENTS.thanks) || (has(text, 'sim', 'melhorou') && !has(text, 'nao'))) {
        await toolbox.execute('concluir_atendimento', { resumo: 'Instabilidade resolvida com reinício remoto do modem.' });
        return 'Que ótimo! Vou encerrar este protocolo como resolvido. Obrigada pelo contato! 👋';
      }
      if (has(text, ...INTENTS.no)) {
        return `Sinto muito. Nesse caso, o melhor é uma visita técnica no próximo dia útil. ${ASKED_VISIT}`;
      }
    }
    if (has(text, ...INTENTS.thanks) && lastBot) {
      await toolbox.execute('concluir_atendimento', { resumo: 'Cliente confirmou que a dúvida foi resolvida.' });
      return 'Fico feliz em ajudar! Vou encerrar este protocolo como resolvido. Até mais! 👋';
    }

    // 3. Novas intenções
    if (has(text, ...INTENTS.secondCopy)) {
      const copy: any = await toolbox.execute('enviar_segunda_via', {});
      return `Enviei a 2ª via da fatura de ${copy.referencia} (${copy.valor}, vencimento ${copy.vencimento}) para o seu ${copy.enviadaPara}. Linha digitável: ${copy.linhaDigitavel}. Posso ajudar em algo mais?`;
    }
    if (has(text, ...INTENTS.invoice)) {
      const data: any = await toolbox.execute('consultar_faturas', {});
      const current = data.faturas[data.faturas.length - 1];
      const note = current.observacao ? ` Observação: ${current.observacao}. Se quiser contestar, eu transfiro para um atendente.` : '';
      return `Seu plano é ${data.plano.nome}. A fatura de ${current.referencia} é de ${current.valor}, com vencimento em ${current.vencimento} (${current.status.toLowerCase()}).${note} Quer a 2ª via?`;
    }
    if (has(text, ...INTENTS.visit)) {
      return `Posso agendar uma visita técnica para o próximo dia útil. ${ASKED_VISIT}`;
    }
    if (has(text, ...INTENTS.connection)) {
      const network: any = await toolbox.execute('verificar_instabilidade_regiao', {});
      if (network.status === 'INSTABILIDADE') {
        return `Identifiquei uma instabilidade na sua região (${network.regiao}): ${network.detalhe.toLowerCase()}. A previsão de normalização é ${network.previsaoNormalizacao}. Não precisa fazer nada — se não normalizar até lá, é só me chamar.`;
      }
      const modem: any = await toolbox.execute('diagnosticar_modem', {});
      if (modem.sinalFraco) {
        return `A rede da sua região está normal, mas o diagnóstico mostrou sinal fraco no seu modem (${modem.potenciaSinalOptico}) e ${modem.quedasUltimas24h} quedas nas últimas 24h. Isso precisa de visita técnica. ${ASKED_VISIT}`;
      }
      return `A rede da sua região está normal e o sinal do seu modem está bom, mas ele registrou ${modem.quedasUltimas24h} quedas nas últimas 24h, o que costuma ser travamento. ${ASKED_REBOOT}`;
    }
    if (has(text, ...INTENTS.status)) {
      return `Seu protocolo ${ctx.protocolNumber} (${ctx.protocolTitle}) está com status "${ctx.protocolStatus}". Em que posso ajudar?`;
    }

    // 4. Não entendeu: na segunda vez seguida, transfere
    const misunderstandings = ctx.history.filter((t) => t.role === 'assistant' && t.content.includes(NOT_UNDERSTOOD)).length;
    if (misunderstandings >= 1 && lastBot.includes(NOT_UNDERSTOOD)) {
      await toolbox.execute('transferir_para_atendente', {
        motivo: 'Assistente não conseguiu identificar a solicitação',
        resumo: caseSummary(ctx),
      });
      return 'Para não te fazer perder tempo, vou transferir para um atendente, que vai continuar neste mesmo protocolo. 😊';
    }
    return `${NOT_UNDERSTOOD} direito. Posso ajudar com fatura e 2ª via, internet lenta ou caindo, visita técnica ou status do protocolo — ou chamar um atendente.`;
  }
}
