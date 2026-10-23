import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { environments } from './environments';
import { deployments } from './deployments';

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  repositoryUrl: varchar('repository_url', { length: 2048 }).notNull(),
  repositoryOwner: varchar('repository_owner', { length: 255 }).notNull(),
  repositoryName: varchar('repository_name', { length: 255 }).notNull(),
  defaultBranch: varchar('default_branch', { length: 255 }).notNull().default('main'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  creator: one(users, {
    fields: [applications.createdBy],
    references: [users.id],
  }),
  environments: many(environments),
  deployments: many(deployments),
}));

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
