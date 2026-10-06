-- AlterTable
ALTER TABLE "Message" ADD COLUMN "deliveryStatus" TEXT;
ALTER TABLE "Message" ADD COLUMN "externalId" TEXT;

-- CreateTable
CREATE TABLE "ChannelIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeProtocolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelLinkCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ChannelLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIdentity_channel_externalId_key" ON "ChannelIdentity"("channel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIdentity_channel_userId_key" ON "ChannelIdentity"("channel", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLinkCode_codeHash_key" ON "ChannelLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "ChannelLinkCode_userId_idx" ON "ChannelLinkCode"("userId");

-- CreateIndex
CREATE INDEX "Message_protocolId_createdAt_idx" ON "Message"("protocolId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_externalId_key" ON "Message"("channel", "externalId");

