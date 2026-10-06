const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'TOTP_ENCRYPTION_KEY'] as const;

/**
 * Validação das variáveis de ambiente no boot.
 * Sem fallbacks inseguros: se faltar segredo, a API não sobe.
 */
export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key] || String(config[key]).trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}. ` +
        'Copie backend/.env.example para backend/.env e preencha os valores.',
    );
  }
  if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
  }
  return config;
}
