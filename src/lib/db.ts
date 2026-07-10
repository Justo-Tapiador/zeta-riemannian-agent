import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Reduce log noise — only log warn-level Prisma events.
// Errors are caught and handled by the application code (try/catch),
// so we don't need Prisma to also log them to stderr.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db