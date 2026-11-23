import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', datasource: { url: process.env.DATABASE_URL ?? 'postgresql://kodems:kodems_dev@localhost:5432/kodems' } });
