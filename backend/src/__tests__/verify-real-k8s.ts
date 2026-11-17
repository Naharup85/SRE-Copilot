import { KubernetesMonitoringProvider } from '../services/kubernetes-monitoring.provider';
import type { Environment } from '../db/schema';
import * as k8s from '@kubernetes/client-node';

async function main() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  kc.setCurrentContext('kind-sre-copilot');

  const provider = new KubernetesMonitoringProvider(kc);
  const env: Environment = {
    id: 'real-k8s-test',
    applicationId: 'app-k8s-test',
    name: 'real-k8s',
    sreProfile: 'standard',
    provider: 'kubernetes',
    clusterName: 'kind-sre-copilot',
    namespace: 'sre-demo',
    deploymentName: 'demo-api',
    containerName: 'api',
    targetConfig: {
      clusterName: 'kind-sre-copilot',
      namespace: 'sre-demo',
      deploymentName: 'demo-api',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  console.log('--- 1. Querying Real Kubernetes Deployment Metrics ---');
  const metrics = await provider.getMetrics(env);
  console.log(JSON.stringify(metrics, null, 2));

  // Assertions
  if (metrics.status !== 'running') throw new Error(`Expected status to be running, got: ${metrics.status}`);
  if (metrics.healthStatus !== 'healthy') throw new Error(`Expected healthStatus to be healthy, got: ${metrics.healthStatus}`);
  if (!metrics.kubernetes) throw new Error('Expected kubernetes workload metrics');
  if (metrics.kubernetes.desiredReplicas !== 2) throw new Error(`Expected 2 desired replicas, got: ${metrics.kubernetes.desiredReplicas}`);
  if (metrics.kubernetes.readyReplicas !== 2) throw new Error(`Expected 2 ready replicas, got: ${metrics.kubernetes.readyReplicas}`);
  if (metrics.kubernetes.availableReplicas !== 2) throw new Error(`Expected 2 available replicas, got: ${metrics.kubernetes.availableReplicas}`);
  if (metrics.kubernetes.pods.length !== 2) throw new Error(`Expected 2 pods, got: ${metrics.kubernetes.pods.length}`);
  if (metrics.restartCount < 2) throw new Error(`Expected at least 2 restarts recorded across pods, got: ${metrics.restartCount}`);

  console.log('--- 2. Checking Metrics Server Availability ---');
  console.log('Metrics Server availability:', metrics.availability.metricsServer);
  if (metrics.availability.metricsServer === 'unavailable') {
    console.log('Notice logged message:', metrics.message);
    if (!metrics.message?.includes('Metrics Server')) {
      throw new Error('Expected explanation message about Metrics Server');
    }
  }

  console.log('✅ Real Kubernetes workload metrics verified successfully against kind cluster!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
