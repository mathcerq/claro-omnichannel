import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Dados de demonstração (todos FICTÍCIOS). Idempotente: pode rodar várias
 * vezes sem duplicar usuários, protocolos ou mensagens.
 *
 * Canais: TELEGRAM e WEBCHAT são canais reais da PoC; PHONE é mock — as
 * "ligações" abaixo são inventadas, para ilustrar a continuidade do histórico.
 */
async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Claro@2024', 12);

  const upsertUser = (email: string, name: string, role: string, phone: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, passwordHash, role, phone },
    });

  const admin = await upsertUser('admin@claro.com.br', 'Administrador Claro', 'ADMIN', '(11) 99999-0001');
  await upsertUser('supervisor@claro.com.br', 'Ana Supervisora', 'SUPERVISOR', '(11) 99999-0002');
  const agent1 = await upsertUser('joao.atendente@claro.com.br', 'João Atendente', 'AGENT', '(11) 99999-0003');
  const agent2 = await upsertUser('maria.atendente@claro.com.br', 'Maria Atendente', 'AGENT', '(11) 99999-0004');
  const client1 = await upsertUser('carlos.cliente@email.com', 'Carlos Silva', 'CLIENT', '(11) 98888-1001');
  const client2 = await upsertUser('fernanda.cliente@email.com', 'Fernanda Santos', 'CLIENT', '(11) 98888-1002');
  const client3 = await upsertUser('roberto.cliente@email.com', 'Roberto Oliveira', 'CLIENT', '(11) 98888-1003');

  const proto1 = await prisma.protocol.upsert({
    where: { protocolNumber: 'CLR-2026-10001' },
    update: {},
    create: {
      protocolNumber: 'CLR-2026-10001',
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
    where: { protocolNumber: 'CLR-2026-10002' },
    update: {},
    create: {
      protocolNumber: 'CLR-2026-10002',
      title: 'Solicitação de portabilidade de número',
      description: 'Desejo portar meu número 11-97777-2020 para a Claro',
      status: 'OPEN',
      priority: 'MEDIUM',
      currentChannel: 'TELEGRAM',
      clientId: client2.id,
    },
  });

  const proto3 = await prisma.protocol.upsert({
    where: { protocolNumber: 'CLR-2026-10003' },
    update: {},
    create: {
      protocolNumber: 'CLR-2026-10003',
      title: 'Cobrança indevida na fatura',
      description: 'Fatura de dezembro com valor incorreto',
      status: 'WAITING',
      priority: 'URGENT',
      currentChannel: 'PHONE',
      clientId: client3.id,
      agentId: agent2.id,
    },
  });

  type SeedMessage = { content: string; channel: string; senderRole: string; senderId: string; isRead?: boolean };

  /** Cria a timeline só se o protocolo ainda não tiver mensagens (idempotência). */
  async function seedTimeline(protocolId: string, messages: SeedMessage[]) {
    if ((await prisma.message.count({ where: { protocolId } })) > 0) return;
    const base = Date.now() - messages.length * 15 * 60 * 1000;
    for (const [i, m] of messages.entries()) {
      await prisma.message.create({
        data: {
          ...m,
          isRead: m.isRead ?? true,
          protocolId,
          createdAt: new Date(base + i * 15 * 60 * 1000), // ordem cronológica estável
          deliveryStatus: m.senderRole !== 'CLIENT' && m.channel === 'PHONE' ? 'SIMULATED' : null,
        },
      });
    }
  }

  // Jornada completa: Telegram → Telefone (mock) → WebChat, no MESMO protocolo
  await seedTimeline(proto1.id, [
    { content: 'Olá! Minha internet está caindo muito. Preciso de ajuda.', channel: 'TELEGRAM', senderRole: 'CLIENT', senderId: client1.id },
    { content: 'Bom dia! Sou o João do suporte técnico. Pode me informar o número do contrato?', channel: 'TELEGRAM', senderRole: 'AGENT', senderId: agent1.id },
    { content: 'O contrato é 9988776. Tenho internet de 300Mb mas está muito lenta.', channel: 'TELEGRAM', senderRole: 'CLIENT', senderId: client1.id },
    { content: 'Vou transferir para atendimento via central telefônica para análise técnica mais detalhada.', channel: 'TELEGRAM', senderRole: 'AGENT', senderId: agent1.id },
    { content: '📞 [Ligação simulada] Atendimento continuado do protocolo CLR-2026-10001. Cliente verificou modem e confirmou problema na linha.', channel: 'PHONE', senderRole: 'AGENT', senderId: agent1.id },
    { content: 'Conforme acordado por telefone, vou abrir ordem de serviço para visita técnica amanhã entre 14h-18h.', channel: 'WEBCHAT', senderRole: 'AGENT', senderId: agent1.id, isRead: false },
  ]);

  await seedTimeline(proto2.id, [
    { content: 'Boa tarde! Quero fazer portabilidade do número (11)97777-2020.', channel: 'TELEGRAM', senderRole: 'CLIENT', senderId: client2.id },
    { content: 'Olá Fernanda! Tudo bem? Vou te ajudar com a portabilidade. Qual operadora atual?', channel: 'TELEGRAM', senderRole: 'AGENT', senderId: agent1.id },
  ]);

  await seedTimeline(proto3.id, [
    { content: '📞 [Ligação simulada] Cliente relata cobrança de R$289,90 em vez de R$149,90 acordado no plano.', channel: 'PHONE', senderRole: 'AGENT', senderId: agent2.id },
    { content: 'Estou verificando sua fatura. Identificamos cobrança duplicada. Preciso de aprovação do supervisor para emitir crédito.', channel: 'PHONE', senderRole: 'AGENT', senderId: agent2.id },
  ]);

  if ((await prisma.auditLog.count({ where: { action: 'SEED_CREATED' } })) === 0) {
    await prisma.auditLog.create({
      data: { action: 'SEED_CREATED', resource: 'DATABASE', details: 'Initial seed data created', userId: admin.id },
    });
  }

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
