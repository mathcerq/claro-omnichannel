import { Prisma } from '@prisma/client';

/** Formato público de um protocolo (API REST e eventos WebSocket). */
export const protocolSelect = {
  id: true,
  protocolNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  currentChannel: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  client: {
    select: { id: true, name: true, email: true, phone: true },
  },
  agent: {
    select: { id: true, name: true, email: true },
  },
  _count: {
    select: { messages: true },
  },
} satisfies Prisma.ProtocolSelect;
