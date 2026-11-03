CREATE TYPE "public"."deployment_provider_type" AS ENUM('docker', 'kubernetes');--> statement-breakpoint
CREATE TYPE "public"."sre_profile" AS ENUM('basic', 'standard');--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "cluster_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "namespace" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "deployment_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "container_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "sre_profile" "sre_profile" DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "provider" "deployment_provider_type" DEFAULT 'kubernetes' NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "target_config" jsonb;--> statement-breakpoint
UPDATE "environments" SET "target_config" = jsonb_build_object('clusterName', cluster_name, 'namespace', namespace, 'deploymentName', deployment_name, 'containerName', container_name) WHERE "target_config" IS NULL;