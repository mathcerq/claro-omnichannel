import * as dotenv from 'dotenv';

/**
 * Carrega o backend/.env ANTES de qualquer módulo ser importado. Necessário
 * porque decorators (ex.: CORS do @WebSocketGateway) leem process.env no
 * momento da importação, antes do ConfigModule. Variáveis já definidas no
 * ambiente têm prioridade (não são sobrescritas).
 */
dotenv.config();
