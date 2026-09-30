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
}

export interface Message {
  id: string;
  content: string;
  channel: string;
  senderRole: string;
  isRead: boolean;
  createdAt: string;
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
  updateProtocol: (protocolId: string, updates: Partial<Protocol>) => void;
}

export const useProtocolsStore = create<ProtocolsState>((set) => ({
  protocols: [],
  selectedProtocol: null,
  stats: null,

  setProtocols: (protocols) => set({ protocols }),
  setSelectedProtocol: (protocol) => set({ selectedProtocol: protocol }),
  setStats: (stats) => set({ stats }),

  addMessage: (protocolId, message) =>
    set((state) => ({
      selectedProtocol:
        state.selectedProtocol?.id === protocolId
          ? {
              ...state.selectedProtocol,
              messages: [...(state.selectedProtocol.messages || []), message],
            }
          : state.selectedProtocol,
    })),

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
