import { DockerMonitoringProvider } from '../services/docker-monitoring.provider';
import type { Environment } from '../db/schema';
import http from 'http';
import { execSync } from 'child_process';

async function main() {
  const provider = new DockerMonitoringProvider();
  const env: Environment = {
    id: 'real-docker-test',
    applicationId: 'app-test',
    name: 'real-docker',
    sreProfile: 'basic',
    provider: 'docker',
    containerName: 'sre-copilot-metrics-test-container',
    targetConfig: { containerName: 'sre-copilot-metrics-test-container' },
    clusterName: null,
    namespace: null,
    deploymentName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate traffic
  for (let i = 0; i < 5; i++) {
    await new Promise((res) => {
      http.get('http://127.0.0.1:8099', (r) => {
        r.resume();
        res(null);
      }).on('error', () => res(null));
    });
  }

  console.log('--- 1. Live Running Container Metrics ---');
  const runningMetrics = await provider.getMetrics(env);
  console.log(JSON.stringify(runningMetrics, null, 2));

  if (runningMetrics.status !== 'running') throw new Error('Expected status to be running');
  if (runningMetrics.availability.cpu !== 'available') throw new Error('Expected cpu to be available');
  if (runningMetrics.availability.memory !== 'available') throw new Error('Expected memory to be available');
  if (runningMetrics.cpuPercent === null || runningMetrics.cpuPercent === undefined) throw new Error('Expected cpuPercent');
  if (runningMetrics.memoryUsageBytes === null || runningMetrics.memoryUsageBytes === undefined) throw new Error('Expected memoryUsageBytes');
  if (!runningMetrics.network || runningMetrics.network.receivedBytes === null) throw new Error('Expected network stats');

  console.log('--- 2. Stopping Container ---');
  execSync('docker stop sre-copilot-metrics-test-container', { stdio: 'inherit' });

  console.log('--- 3. Stopped Container Metrics ---');
  const stoppedMetrics = await provider.getMetrics(env);
  console.log(JSON.stringify(stoppedMetrics, null, 2));

  if (stoppedMetrics.status !== 'stopped') throw new Error('Expected status to be stopped');
  if (stoppedMetrics.cpuPercent !== null) throw new Error('Expected cpuPercent to be null for stopped container');
  if (stoppedMetrics.memoryUsageBytes !== null) throw new Error('Expected memoryUsageBytes to be null for stopped container');
  if (stoppedMetrics.availability.cpu !== 'unavailable') throw new Error('Expected cpu availability to be unavailable');
  if (stoppedMetrics.availability.memory !== 'unavailable') throw new Error('Expected memory availability to be unavailable');

  console.log('--- 4. Cleaning Up Container ---');
  execSync('docker rm sre-copilot-metrics-test-container', { stdio: 'inherit' });

  console.log('✅ Real Docker container lifecycle & metrics verified successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
