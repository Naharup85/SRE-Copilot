import { db, pool } from '../db/connection';
import { applications, environments, deployments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authService } from '../modules/auth/auth.service';
import { deploymentsService } from '../modules/deployments/deployments.service';
import { deploymentProvider } from '../services/deployment-provider.factory';
import * as k8s from '@kubernetes/client-node';
import { env } from '../config/env';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploymentTerminalStatus(deploymentId: string, maxWaitMs = 60000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const [dep] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
    if (dep && (dep.status === 'SUCCESS' || dep.status === 'FAILED')) {
      return dep;
    }
    await sleep(1500);
  }
  const [dep] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  return dep;
}

async function runScenarioTests() {
  console.log('====================================================');
  console.log('🚀 REAL KUBERNETES INTEGRATION VERIFICATION');
  console.log('Provider:', deploymentProvider.constructor.name);
  console.log('Context:', env.KUBERNETES_CONTEXT);
  console.log('Namespace:', env.KUBERNETES_NAMESPACE);
  console.log('====================================================\n');

  if (deploymentProvider.constructor.name !== 'KubernetesDeploymentProvider') {
    throw new Error('DEPLOYMENT_PROVIDER must be set to "kubernetes"');
  }

  // 1. Authenticate demo user
  const auth = await authService.login({
    email: 'demo@example.com',
    password: 'Demo1234!',
  });
  const userId = auth.user.id;
  console.log(`[AUTH] Logged in as demo user: ${auth.user.email} (${userId})`);

  // 2. Fetch demo app and environment
  const [app] = await db.select().from(applications).where(eq(applications.createdBy, userId)).limit(1);
  if (!app) throw new Error('Demo application not found in database');
  console.log(`[APP] Using application: ${app.name} (${app.id})`);

  const [devEnv] = await db.select().from(environments).where(eq(environments.applicationId, app.id)).limit(1);
  if (!devEnv) throw new Error('Demo environment not found in database');
  console.log(`[ENV] Using environment: ${devEnv.name} (${devEnv.id}) targetting k8s namespace: ${devEnv.namespace}, deployment: ${devEnv.deploymentName}`);

  // Setup k8s admin client using patch options to avoid resourceVersion conflicts
  const adminKc = new k8s.KubeConfig();
  adminKc.loadFromDefault();
  adminKc.setCurrentContext('kind-sre-copilot');
  const adminAppsApi = adminKc.makeApiClient(k8s.AppsV1Api);
  const patchOptions = { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } };

  const results: Array<{ scenario: string; passed: boolean; details: string }> = [];

  // Reset deployment to a clean baseline state before tests
  const baselinePatch = {
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: devEnv.containerName,
              image: 'ghcr.io/example/demo-api:v1.0.0',
              command: null,
              readinessProbe: {
                httpGet: { path: '/', port: 80 },
                initialDelaySeconds: 1,
                periodSeconds: 2,
              },
            },
          ],
        },
      },
    },
  };
  await adminAppsApi.patchNamespacedDeployment(devEnv.deploymentName, devEnv.namespace, baselinePatch, undefined, undefined, undefined, undefined, undefined, patchOptions);
  await sleep(4000);

  // --------------------------------------------------------------------------
  // SCENARIO 1: Successful Deployment with Image v1.0.0
  // --------------------------------------------------------------------------
  console.log('\n--- [SCENARIO 1] Successful Deployment (v1.0.0) ---');
  try {
    const depRecord = await deploymentsService.create(userId, devEnv.id, {
      version: 'v1.0.0',
      commitSha: '1111111111111111111111111111111111111111',
    });
    console.log(`Created deployment: ${depRecord.id}, initial status: ${depRecord.status}`);

    const finished = await waitForDeploymentTerminalStatus(depRecord.id, 45000);
    console.log(`Final deployment status: ${finished.status}`);

    const logs = await deploymentsService.getLogs(userId, depRecord.id);
    console.log(`Captured ${logs.length} deployment logs:`);
    logs.slice(0, 3).forEach((l) => console.log(`  [${l.level}] ${l.message}`));
    if (logs.length > 3) console.log(`  ... (${logs.length - 3} more logs)`);
    console.log(`  [${logs[logs.length - 1]?.level}] ${logs[logs.length - 1]?.message}`);

    const passed = finished.status === 'SUCCESS' && logs.length >= 3;
    results.push({
      scenario: '1. Successful deployment (v1.0.0)',
      passed,
      details: `Status: ${finished.status}, Logs count: ${logs.length}`,
    });
  } catch (err: any) {
    console.error('Scenario 1 failed:', err);
    results.push({ scenario: '1. Successful deployment (v1.0.0)', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // SCENARIO 2: Invalid Image / ImagePullBackOff
  // --------------------------------------------------------------------------
  console.log('\n--- [SCENARIO 2] Invalid Image / ImagePullBackOff (v999.invalid) ---');
  try {
    const depRecord = await deploymentsService.create(userId, devEnv.id, {
      version: 'v999.invalid',
      commitSha: '2222222222222222222222222222222222222222',
    });
    console.log(`Created deployment: ${depRecord.id}, initial status: ${depRecord.status}`);

    const finished = await waitForDeploymentTerminalStatus(depRecord.id, 45000);
    console.log(`Final deployment status: ${finished.status}`);

    const logs = await deploymentsService.getLogs(userId, depRecord.id);
    console.log(`Captured ${logs.length} deployment logs:`);
    const errorLogs = logs.filter((l) => l.level === 'ERROR' || l.message.includes('image pull'));
    errorLogs.forEach((l) => console.log(`  [${l.level}] ${l.message}`));

    const hasImagePullError = logs.some((l) => l.message.includes('ImagePullBackOff') || l.message.includes('image pull error') || l.message.includes('ErrImagePull'));
    const passed = finished.status === 'FAILED' && hasImagePullError;
    results.push({
      scenario: '2. ImagePullBackOff failure detection',
      passed,
      details: `Status: ${finished.status}, Detected ImagePullBackOff: ${hasImagePullError}`,
    });
  } catch (err: any) {
    console.error('Scenario 2 failed:', err);
    results.push({ scenario: '2. ImagePullBackOff failure detection', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // SCENARIO 3: Pod CrashLoopBackOff
  // --------------------------------------------------------------------------
  console.log('\n--- [SCENARIO 3] Pod CrashLoopBackOff ---');
  try {
    // Reset image to valid image but with crashing command
    const crashPatch = {
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: devEnv.containerName,
                image: 'ghcr.io/example/demo-api:v1.0.0',
                command: ['/bin/sh', '-c', 'exit 1'],
              },
            ],
          },
        },
      },
    };
    await adminAppsApi.patchNamespacedDeployment(devEnv.deploymentName, devEnv.namespace, crashPatch, undefined, undefined, undefined, undefined, undefined, patchOptions);
    console.log('Injected failing command `sh -c exit 1` into deployment spec');
    await sleep(3000);

    const depRecord = await deploymentsService.create(userId, devEnv.id, {
      version: 'v1.0.0',
      commitSha: '3333333333333333333333333333333333333333',
    });
    console.log(`Created deployment: ${depRecord.id}`);

    const finished = await waitForDeploymentTerminalStatus(depRecord.id, 45000);
    console.log(`Final deployment status: ${finished.status}`);

    const logs = await deploymentsService.getLogs(userId, depRecord.id);
    console.log(`Captured ${logs.length} deployment logs:`);
    const errorLogs = logs.filter((l) => l.level === 'ERROR' || l.message.includes('crashed') || l.message.includes('CrashLoopBackOff'));
    errorLogs.forEach((l) => console.log(`  [${l.level}] ${l.message}`));

    const hasCrashLoop = logs.some((l) => l.message.includes('CrashLoopBackOff') || l.message.includes('crashed') || l.message.includes('exit code 1'));
    const passed = finished.status === 'FAILED' && hasCrashLoop;
    results.push({
      scenario: '3. Pod CrashLoopBackOff detection',
      passed,
      details: `Status: ${finished.status}, Detected CrashLoopBackOff: ${hasCrashLoop}`,
    });
  } catch (err: any) {
    console.error('Scenario 3 failed:', err);
    results.push({ scenario: '3. Pod CrashLoopBackOff detection', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // SCENARIO 4 & 5: Readiness Probe Failure & Deployment Timeout
  // --------------------------------------------------------------------------
  console.log('\n--- [SCENARIO 4 & 5] Readiness Probe Failure & Timeout ---');
  try {
    // Restore normal command but set a failing readiness probe
    const probeFailPatch = {
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: devEnv.containerName,
                image: 'ghcr.io/example/demo-api:v1.0.0',
                command: null,
                readinessProbe: {
                  httpGet: {
                    path: '/failing-health-check-404',
                    port: 80,
                  },
                  initialDelaySeconds: 1,
                  periodSeconds: 2,
                  failureThreshold: 2,
                },
              },
            ],
          },
        },
      },
    };
    await adminAppsApi.patchNamespacedDeployment(devEnv.deploymentName, devEnv.namespace, probeFailPatch, undefined, undefined, undefined, undefined, undefined, patchOptions);
    console.log('Configured failing readinessProbe `httpGet: /failing-health-check-404`');
    await sleep(3000);

    const depRecord = await deploymentsService.create(userId, devEnv.id, {
      version: 'v1.0.0',
      commitSha: '4444444444444444444444444444444444444444',
    });
    console.log(`Created deployment: ${depRecord.id}`);

    const finished = await waitForDeploymentTerminalStatus(depRecord.id, 45000);
    console.log(`Final deployment status: ${finished.status}`);

    const logs = await deploymentsService.getLogs(userId, depRecord.id);
    console.log(`Captured ${logs.length} deployment logs:`);
    logs.slice(-4).forEach((l) => console.log(`  [${l.level}] ${l.message}`));

    const hasTimeoutOrUnready = logs.some((l) => l.message.includes('timeout') || l.message.includes('not ready') || l.message.includes('health check'));
    const passed = finished.status === 'FAILED' && hasTimeoutOrUnready;
    results.push({
      scenario: '4 & 5. Readiness probe failure & timeout',
      passed,
      details: `Status: ${finished.status}, Timeout/Unready logged: ${hasTimeoutOrUnready}`,
    });
  } catch (err: any) {
    console.error('Scenario 4 & 5 failed:', err);
    results.push({ scenario: '4 & 5. Readiness probe failure & timeout', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // SCENARIO 6: Successful Redeployment with New Image (v2.0.0)
  // --------------------------------------------------------------------------
  console.log('\n--- [SCENARIO 6] Successful Redeployment with New Image (v2.0.0) ---');
  try {
    // Restore healthy readiness probe
    const restoreProbePatch = {
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: devEnv.containerName,
                command: null,
                readinessProbe: {
                  httpGet: {
                    path: '/',
                    port: 80,
                  },
                  initialDelaySeconds: 1,
                  periodSeconds: 2,
                },
              },
            ],
          },
        },
      },
    };
    await adminAppsApi.patchNamespacedDeployment(devEnv.deploymentName, devEnv.namespace, restoreProbePatch, undefined, undefined, undefined, undefined, undefined, patchOptions);
    console.log('Restored healthy readinessProbe `httpGet: /`');
    await sleep(2000);

    const depRecord = await deploymentsService.create(userId, devEnv.id, {
      version: 'v2.0.0',
      commitSha: '5555555555555555555555555555555555555555',
    });
    console.log(`Created redeployment: ${depRecord.id} with version: v2.0.0`);

    const finished = await waitForDeploymentTerminalStatus(depRecord.id, 45000);
    console.log(`Final deployment status: ${finished.status}`);

    const logs = await deploymentsService.getLogs(userId, depRecord.id);
    console.log(`Captured ${logs.length} deployment logs:`);
    logs.slice(-3).forEach((l) => console.log(`  [${l.level}] ${l.message}`));

    // Verify in actual Kubernetes cluster
    const verifiedK8sDep = await adminAppsApi.readNamespacedDeployment(devEnv.deploymentName, devEnv.namespace);
    const actualImage = verifiedK8sDep.body.spec?.template.spec?.containers[0].image;
    console.log(`Actual Kubernetes container image in cluster: ${actualImage}`);

    const passed = finished.status === 'SUCCESS' && actualImage === 'ghcr.io/example/demo-api:v2.0.0';
    results.push({
      scenario: '6. Successful redeployment with v2.0.0',
      passed,
      details: `Status: ${finished.status}, Verified k8s image: ${actualImage}`,
    });
  } catch (err: any) {
    console.error('Scenario 6 failed:', err);
    results.push({ scenario: '6. Successful redeployment with v2.0.0', passed: false, details: err.message });
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 TEST SCENARIOS SUMMARY');
  console.log('====================================================');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    if (!r.passed) allPassed = false;
    console.log(`${icon} | ${r.scenario.padEnd(45)} | ${r.details}`);
  }
  console.log('====================================================\n');

  // Verify dashboard stats
  const stats = await deploymentsService.getDashboardStats(userId);
  console.log('Dashboard Stats:');
  console.log(' - Total Applications:', stats.totalApplications);
  console.log(' - Successful Deployments:', stats.successfulDeployments);
  console.log(' - Failed Deployments:', stats.failedDeployments);
  console.log(' - Recent Deployments Count:', stats.recentDeployments.length);

  await pool.end();

  if (!allPassed) {
    process.exit(1);
  }
}

runScenarioTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
