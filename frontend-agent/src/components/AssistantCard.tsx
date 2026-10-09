import { Bot, ArrowRightLeft, CheckCircle2, UserCheck } from 'lucide-react';
import { Protocol } from '../store/protocols.store';

const statusInfo: Record<string, { label: string; color: string; Icon: any }> = {
  ACTIVE: { label: 'A IA está atendendo', color: 'text-indigo-300', Icon: Bot },
  HANDED_OFF: { label: 'Transferido pela IA', color: 'text-amber-300', Icon: ArrowRightLeft },
  RESOLVED: { label: 'Resolvido pela IA', color: 'text-emerald-300', Icon: CheckCircle2 },
  HUMAN: { label: 'Atendimento humano', color: 'text-gray-300', Icon: UserCheck },
};

interface Props {
  protocol: Protocol;
  onTakeOver: () => void;
}

/** Situação da assistente virtual no protocolo + resumo deixado para o atendente. */
export default function AssistantCard({ protocol: p, onTakeOver }: Props) {
  if (!p.aiStatus || p.aiStatus === 'OFF') return null;
  const info = statusInfo[p.aiStatus] ?? statusInfo.HUMAN;
  const canTakeOver = p.status !== 'CLOSED' && !p.agent && (p.aiStatus === 'ACTIVE' || p.aiStatus === 'HANDED_OFF');

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
        <Bot size={12} />
        Assistente virtual (IA)
      </h3>
      <div className={`card p-3 text-xs space-y-2 ${p.aiStatus === 'HANDED_OFF' ? 'border-amber-700' : ''}`}>
        <p className={`flex items-center gap-1.5 font-medium ${info.color}`}>
          <info.Icon size={14} /> {info.label}
        </p>

        {p.aiHandoffReason && (
          <p className="text-gray-400">
            <span className="text-gray-500">Motivo:</span> {p.aiHandoffReason}
          </p>
        )}
        {p.aiSummary && (
          <div className="bg-gray-800/70 rounded-lg p-2 text-gray-300 leading-relaxed">
            <p className="text-gray-500 mb-0.5">Resumo da IA para o atendente</p>
            {p.aiSummary}
          </div>
        )}
        {p.aiStatus === 'ACTIVE' && (
          <p className="text-gray-500">Ao assumir ou enviar uma mensagem, a IA para de responder neste protocolo.</p>
        )}
        {canTakeOver && (
          <button
            onClick={onTakeOver}
            className="w-full flex items-center justify-center gap-1.5 bg-claro-red hover:bg-claro-red-dark text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserCheck size={12} /> Assumir atendimento
          </button>
        )}
      </div>
    </div>
  );
}
