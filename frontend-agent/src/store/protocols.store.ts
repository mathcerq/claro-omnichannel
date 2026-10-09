import { create } from 'zustand';

export interface Protocol {
  id: string;
  protocolNumber: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  currentChannel: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  client: { id: string; name: string; email: string; phone?: string };
  agent?: { id: string; name: string; email: string } | null;
  _count?: { messages: number };
  messages?: Message[];
  /** Canais pelos quais o atendente consegue responder a este cliente */
  availableChannels?: string[];
  /** Assistente virtual: ACTIVE | HANDED_OFF | RESOLVED | HUMAN | OFF */
  aiStatus?: string;
  aiSummary?: string | null;
  aiHandoffReason?: string | null;
}

export interface Message {
  id: string;
  content: string;
  channel: string;
  senderRole: string;
  isRead: boolean;
  createdAt: string;
  /** Entrega em canal externo: SENT | FAILED | SIMULATED */
  deliveryStatus?: string | null;
  protocolId?: string;
  sender: { id: string; name: string; role: string };
}

interface ProtocolsState {
  protocols: Protocol[];
  selectedProtocol: Protocol | null;
  stats: any;
  setProtocols: (protocols: Protocol[]) => void;
  setSelectedProtocol: (protocol: Protocol | null) => void;
  setStats: (stats: any) => void;
  addMessage: (protocolId: string, message: Message) => void;
  updateMessage: (protocolId: string, messageId: string, updates: Partial<Message>) => void;
  updateProtocol: (protocolId: string, updates: Partial<Protocol>) => void;
}

export const useProtocolsStore = create<ProtocolsState>((set) => ({
  protocols: [],
  selectedProtocol: null,
  stats: null,

  setProtocols: (protocols) => set({ protocols }),
  setSelectedProtocol: (protocol) => set({ selectedProtocol: protocol }),
  setStats: (stats) => set({ stats }),

  // A mesma mensagem chega pela resposta REST e pelo WebSocket: deduplica por id
  addMessage: (protocolId, message) =>
    set((state) => {
      const current = state.selectedProtocol;
      if (current?.id !== protocolId) return {};
      const messages = current.messages || [];
      if (messages.some((m) => m.id === message.id)) return {};
      return { selectedProtocol: { ...current, messages: [...messages, message] } };
    }),

  updateMessage: (protocolId, messageId, updates) =>
    set((state) => {
      const current = state.selectedProtocol;
      if (current?.id !== protocolId) return {};
      return {
        selectedProtocol: {
          ...current,
          messages: (current.messages || []).map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
        },
      };
    }),

  updateProtocol: (protocolId, updates) =>
    set((state) => ({
      protocols: state.protocols.map((p) =>
        p.id === protocolId ? { ...p, ...updates } : p,
      ),
      selectedProtocol:
        state.selectedProtocol?.id === protocolId
          ? { ...state.selectedProtocol, ...updates }
          : state.selectedProtocol,
    })),
}));
