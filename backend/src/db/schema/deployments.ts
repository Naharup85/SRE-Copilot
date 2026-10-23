import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { applications } from './applications';
import { environments } from './environments';
import { deploymentLogs } from './deployment-logs';

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
]);

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  environmentId: uuid('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 255 }).notNull(),
  commitSha: varchar('commit_sha', { length: 40 }).notNull(),
  status: deploymentStatusEnum('status').notNull().default('PENDING'),
  triggeredBy: uuid('triggered_by')
    .notNull()
    .references(() => users.id),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  application: one(applications, {
    fields: [deployments.applicationId],
    references: [applications.id],
  }),
  environment: one(environments, {
    fields: [deployments.environmentId],
    references: [environments.id],
  }),
  triggeredByUser: one(users, {
    fields: [deployments.triggeredBy],
    references: [users.id],
  }),
  logs: many(deploymentLogs),
}));

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
export type DeploymentStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
