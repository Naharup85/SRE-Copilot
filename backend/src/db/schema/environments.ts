import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { applications } from './applications';
import { deployments } from './deployments';

export const sreProfileEnum = pgEnum('sre_profile', ['basic', 'standard']);
export const deploymentProviderEnum = pgEnum('deployment_provider_type', ['docker', 'kubernetes']);

export const environments = pgTable('environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sreProfile: sreProfileEnum('sre_profile').notNull().default('basic'),
  provider: deploymentProviderEnum('provider').notNull().default('kubernetes'),
  targetConfig: jsonb('target_config').$type<Record<string, any>>(),
  // Legacy / convenience columns preserved for backward compatibility
  clusterName: varchar('cluster_name', { length: 255 }),
  namespace: varchar('namespace', { length: 255 }),
  deploymentName: varchar('deployment_name', { length: 255 }),
  containerName: varchar('container_name', { length: 255 }),
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
export type SreProfile = 'basic' | 'standard';
export type DeploymentProviderType = 'docker' | 'kubernetes';
