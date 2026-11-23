process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://kodems:kodems_dev@localhost:5432/kodems_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-secret-0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.APP_ENV = 'test';
process.env.JOBS_INLINE = process.env.JOBS_INLINE ?? 'true';
