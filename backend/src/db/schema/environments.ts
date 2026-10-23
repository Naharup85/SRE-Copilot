import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { applications } from './applications';
import { deployments } from './deployments';

export const environments = pgTable('environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  clusterName: varchar('cluster_name', { length: 255 }).notNull(),
  namespace: varchar('namespace', { length: 255 }).notNull(),
  deploymentName: varchar('deployment_name', { length: 255 }).notNull(),
  containerName: varchar('container_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  application: one(applications, {
    fields: [environments.applicationId],
    references: [applications.id],
  }),
  deployments: many(deployments),
}));

export type Environment = typeof environments.$inferSelect;
export type NewEnvironment = typeof environments.$inferInsert;
