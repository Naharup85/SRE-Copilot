import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './connection';
import { logger } from '../config/logger';

async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
