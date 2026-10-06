import { deriveTitle, parseCommand, truncate } from './telegram.texts';
import { normalizeLinkCode } from './telegram-link.service';

describe('parseCommand', () => {
  it('separa comando e argumentos', () => {
    expect(parseCommand('/novo Internet caindo')).toEqual({ name: 'novo', args: 'Internet caindo' });
  });

  it('aceita comando sem argumentos e normaliza para minúsculas', () => {
    expect(parseCommand('/AJUDA')).toEqual({ name: 'ajuda', args: '' });
  });

  it('aceita menção ao próprio bot (/cmd@bot)', () => {
    expect(parseCommand('/usar@claro_bot CLR-2026-12345', 'claro_bot')).toEqual({
      name: 'usar',
      args: 'CLR-2026-12345',
    });
  });

  it('ignora comando endereçado a outro bot', () => {
    expect(parseCommand('/usar@outro_bot CLR-2026-12345', 'claro_bot')).toBeNull();
  });

  it('texto comum não é comando', () => {
    expect(parseCommand('minha internet caiu')).toBeNull();
  });

  it('preserva quebras de linha nos argumentos', () => {
    expect(parseCommand('/novo Assunto\ndetalhes')?.args).toBe('Assunto\ndetalhes');
  });
});

describe('deriveTitle', () => {
  it('usa a primeira linha da mensagem', () => {
    expect(deriveTitle('Internet lenta\nDesde ontem à noite')).toBe('Internet lenta');
  });

  it('corta textos longos em limite de palavra', () => {
    const title = deriveTitle('A conexão da minha casa cai várias vezes por dia e o atendimento não resolve nada', 40);
    expect(title.length).toBeLessThanOrEqual(41);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it('usa título padrão para mensagens muito curtas', () => {
    expect(deriveTitle('oi')).toBe('Atendimento via Telegram');
  });
});

describe('truncate', () => {
  it('mantém textos curtos', () => expect(truncate('abc', 5)).toBe('abc'));
  it('corta e sinaliza textos longos', () => expect(truncate('abcdef', 4)).toBe('abc…'));
});

describe('normalizeLinkCode', () => {
  it('aceita minúsculas, espaços e hífens', () => {
    expect(normalizeLinkCode(' k7qm-3xpa ')).toBe('K7QM3XPA');
  });
});
