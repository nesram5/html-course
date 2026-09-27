-- CreateTable
CREATE TABLE "SpaceBan" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceBan_pkey" PRIMARY KEY ("spaceId","userId")
);

-- CreateIndex
CREATE INDEX "SpaceBan_userId_idx" ON "SpaceBan"("userId");

-- AddForeignKey
ALTER TABLE "SpaceBan" ADD CONSTRAINT "SpaceBan_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceBan" ADD CONSTRAINT "SpaceBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
