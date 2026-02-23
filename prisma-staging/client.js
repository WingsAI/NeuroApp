// Prisma client for the staging database
// Usage: const { prismaStaging } = require('./prisma-staging/client');

const { PrismaClient } = require('.prisma/client-staging');

const prismaStaging = new PrismaClient({
  datasources: {
    db: {
      url: process.env.STAGING_DATABASE_URL,
    },
  },
});

module.exports = { prismaStaging };
