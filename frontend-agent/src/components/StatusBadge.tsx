const config: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'bg-emerald-900 text-emerald-300' },
  IN_PROGRESS: { label: 'Em Atendimento', color: 'bg-blue-900 text-blue-300' },
  WAITING: { label: 'Aguardando', color: 'bg-amber-900 text-amber-300' },
  CLOSED: { label: 'Encerrado', color: 'bg-gray-700 text-gray-400' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Baixa', color: 'bg-gray-700 text-gray-400' },
  MEDIUM: { label: 'Média', color: 'bg-blue-900 text-blue-300' },
  HIGH: { label: 'Alta', color: 'bg-orange-900 text-orange-300' },
  URGENT: { label: 'URGENTE', color: 'bg-red-900 text-red-300' },
};

export function StatusBadge({ status }: { status: string }) {
  const c = config[status] || config.OPEN;
  return <span className={`badge ${c.color}`}>{c.label}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const c = priorityConfig[priority] || priorityConfig.MEDIUM;
  return <span className={`badge ${c.color}`}>{c.label}</span>;
}
