import type { Environment, Application } from '../db/schema';

export interface DeploymentInput {
  deploymentId: string;
  application: Application;
  environment: Environment;
  version: string;
  commitSha: string;
}

export interface DeploymentResult {
  success: boolean;
  error?: string;
}

/**
 * DeploymentProvider is the interface all deployment backends must implement.
 * Phase 1 provides MockDeploymentProvider and KubernetesDeploymentProvider.
 * Future phases can add more providers (e.g., ArgoCD, Helm) without changing
 * the API contract.
 */
export interface DeploymentProvider {
  deploy(input: DeploymentInput): Promise<DeploymentResult>;
}

export interface LogEmitter {
  emit(deploymentId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void>;
}
