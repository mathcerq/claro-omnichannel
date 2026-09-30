import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Claro@2024', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@claro.com.br' },
    update: {},
    create: {
      name: 'Administrador Claro',
      email: 'admin@claro.com.br',
      passwordHash,
      role: 'ADMIN',
      phone: '(11) 99999-0001',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@claro.com.br' },
    update: {},
    create: {
      name: 'Ana Supervisora',
      email: 'supervisor@claro.com.br',
      passwordHash,
      role: 'SUPERVISOR',
      phone: '(11) 99999-0002',
    },
  });

  const agent1 = await prisma.user.upsert({
    where: { email: 'joao.atendente@claro.com.br' },
    update: {},
    create: {
      name: 'João Atendente',
      email: 'joao.atendente@claro.com.br',
      passwordHash,
      role: 'AGENT',
      phone: '(11) 99999-0003',
    },
  });

  const agent2 = await prisma.user.upsert({
    where: { email: 'maria.atendente@claro.com.br' },
    update: {},
    create: {
      name: 'Maria Atendente',
      email: 'maria.atendente@claro.com.br',
      passwordHash,
      role: 'AGENT',
      phone: '(11) 99999-0004',
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: 'carlos.cliente@email.com' },
    update: {},
    create: {
      name: 'Carlos Silva',
      email: 'carlos.cliente@email.com',
      passwordHash,
      role: 'CLIENT',
      phone: '(11) 98888-1001',
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: 'fernanda.cliente@email.com' },
    update: {},
    create: {
      name: 'Fernanda Santos',
      email: 'fernanda.cliente@email.com',
      passwordHash,
      role: 'CLIENT',
      phone: '(11) 98888-1002',
    },
  });

  const client3 = await prisma.user.upsert({
    where: { email: 'roberto.cliente@email.com' },
    update: {},
    create: {
      name: 'Roberto Oliveira',
      email: 'roberto.cliente@email.com',
      passwordHash,
      role: 'CLIENT',
      phone: '(11) 98888-1003',
    },
  });

  const proto1 = await prisma.protocol.upsert({
    where: { protocolNumber: 'CLR-2024-001' },
    update: {},
    create: {
      protocolNumber: 'CLR-2024-001',
      title: 'Problemas com internet banda larga',
      description: 'Internet caindo frequentemente nas últimas 72h',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      currentChannel: 'WEBCHAT',
      clientId: client1.id,
      agentId: agent1.id,
    },
  });

  const proto2 = await prisma.protocol.upsert({
    where: { protocolNumber: 'CLR-2024-002' },
    update: {},
    create: {
      protocolNumber: 'CLR-2024-002',
      title: 'Solicitação de portabilidade de número',
      description: 'Desejo portar meu número 11-97777-2020 para a Claro',
      status: 'OPEN',
      priority: 'MEDIUM',
      currentChannel: 'WHATSAPP',
      clientId: client2.id,
    },
  });

  const proto3 = await prisma.protocol.upsert({
    where: { protocolNumber: 'CLR-2024-003' },
    update: {},
    create: {
      protocolNumber: 'CLR-2024-003',
      title: 'Cobrança indevida na fatura',
      description: 'Fatura de dezembro com valor incorreto',
      status: 'WAITING',
      priority: 'URGENT',
      currentChannel: 'PHONE',
      clientId: client3.id,
      agentId: agent2.id,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Olá! Minha internet está caindo muito. Preciso de ajuda.',
        channel: 'WHATSAPP',
        senderRole: 'CLIENT',
        protocolId: proto1.id,
        senderId: client1.id,
        isRead: true,
      },
      {
        content: 'Bom dia! Sou o João do suporte técnico. Pode me informar o número do contrato?',
        channel: 'WHATSAPP',
        senderRole: 'AGENT',
        protocolId: proto1.id,
        senderId: agent1.id,
        isRead: true,
      },
      {
        content: 'O contrato é 9988776. Tenho internet de 300Mb mas está muito lenta.',
        channel: 'WHATSAPP',
        senderRole: 'CLIENT',
        protocolId: proto1.id,
        senderId: client1.id,
        isRead: true,
      },
      {
        content: 'Vou transferir para atendimento via central telefônica para análise técnica mais detalhada.',
        channel: 'WHATSAPP',
        senderRole: 'AGENT',
        protocolId: proto1.id,
        senderId: agent1.id,
        isRead: true,
      },
      {
        content: '[Chamada recebida] Atendimento continuado do protocolo CLR-2024-001. Cliente verificou modem e confirmou problema na linha.',
        channel: 'PHONE',
        senderRole: 'AGENT',
        protocolId: proto1.id,
        senderId: agent1.id,
        isRead: true,
      },
      {
        content: 'Conforme acordado por telefone, vou abrir ordem de serviço para visita técnica amanhã entre 14h-18h.',
        channel: 'WEBCHAT',
        senderRole: 'AGENT',
        protocolId: proto1.id,
        senderId: agent1.id,
        isRead: false,
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        content: 'Boa tarde! Quero fazer portabilidade do número (11)97777-2020.',
        channel: 'WHATSAPP',
        senderRole: 'CLIENT',
        protocolId: proto2.id,
        senderId: client2.id,
        isRead: true,
      },
      {
        content: 'Olá Fernanda! Tudo bem? Vou te ajudar com a portabilidade. Qual operadora atual?',
        channel: 'WHATSAPP',
        senderRole: 'AGENT',
        protocolId: proto2.id,
        senderId: agent1.id,
        isRead: true,
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        content: '[Chamada recebida] Cliente relata cobrança de R$289,90 em vez de R$149,90 acordado no plano.',
        channel: 'PHONE',
        senderRole: 'AGENT',
        protocolId: proto3.id,
        senderId: agent2.id,
        isRead: true,
      },
      {
        content: 'Estou verificando sua fatura. Identificamos cobrança duplicada. Preciso de aprovação do supervisor para emitir crédito.',
        channel: 'PHONE',
        senderRole: 'AGENT',
        protocolId: proto3.id,
        senderId: agent2.id,
        isRead: true,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        action: 'SEED_CREATED',
        resource: 'DATABASE',
        details: 'Initial seed data created',
        userId: admin.id,
      },
    ],
  });

  console.log('✅ Seed completed successfully!');
  console.log('\n📋 Test credentials (all passwords: Claro@2024):');
  console.log('  ADMIN:      admin@claro.com.br');
  console.log('  SUPERVISOR: supervisor@claro.com.br');
  console.log('  AGENT:      joao.atendente@claro.com.br');
  console.log('  AGENT:      maria.atendente@claro.com.br');
  console.log('  CLIENT:     carlos.cliente@email.com');
  console.log('  CLIENT:     fernanda.cliente@email.com');
  console.log('  CLIENT:     roberto.cliente@email.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
