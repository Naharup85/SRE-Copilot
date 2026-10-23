import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { deployments } from './deployments';

export const logLevelEnum = pgEnum('log_level', ['INFO', 'WARN', 'ERROR']);

export const deploymentLogs = pgTable('deployment_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  level: logLevelEnum('level').notNull().default('INFO'),
  message: text('message').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const deploymentLogsRelations = relations(deploymentLogs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentLogs.deploymentId],
    references: [deployments.id],
  }),
}));

export type DeploymentLog = typeof deploymentLogs.$inferSelect;
export type NewDeploymentLog = typeof deploymentLogs.$inferInsert;
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
