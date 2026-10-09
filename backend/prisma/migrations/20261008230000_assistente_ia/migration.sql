-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Protocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "currentChannel" TEXT NOT NULL DEFAULT 'WEBCHAT',
    "clientId" TEXT NOT NULL,
    "agentId" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "aiSummary" TEXT,
    "aiHandoffReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    CONSTRAINT "Protocol_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Protocol_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Protocol" ("agentId", "clientId", "closedAt", "createdAt", "currentChannel", "description", "id", "priority", "protocolNumber", "status", "title", "updatedAt") SELECT "agentId", "clientId", "closedAt", "createdAt", "currentChannel", "description", "id", "priority", "protocolNumber", "status", "title", "updatedAt" FROM "Protocol";
DROP TABLE "Protocol";
ALTER TABLE "new_Protocol" RENAME TO "Protocol";
CREATE UNIQUE INDEX "Protocol_protocolNumber_key" ON "Protocol"("protocolNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Protocolos que já existiam antes da IA ficam com atendimento humano
UPDATE "Protocol" SET "aiStatus" = 'HUMAN';
