import axios from 'axios';
import { instrumentExternalCall } from '../metrics';

async function main() {
  const baseURL = 'http://localhost:3001';
  const client = axios.create({ baseURL });

  console.log('--- 1. Authenticating as demo user ---');
  const loginRes = await client.post('/api/v1/auth/login', {
    email: 'demo@example.com',
    password: 'Demo1234!',
  });
  const token = loginRes.data.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  console.log('--- 2. Fetching demo application ---');
  const appsRes = await client.get('/api/v1/applications', { headers: authHeaders });
  const demoApp = appsRes.data.data[0];
  if (!demoApp) throw new Error('Demo application not found');
  const appId = demoApp.id;
  console.log(`Demo App: ${demoApp.name} (${appId})`);

  console.log('--- 3. Generating Attributed HTTP Workload Traffic ---');
  // Send 10 successful requests with attribution
  for (let i = 0; i < 10; i++) {
    await client.get('/health', {
      headers: { 'x-application-id': appId },
    });
  }

  // Send 2 error requests with attribution
  for (let i = 0; i < 2; i++) {
    try {
      await client.get('/api/v1/nonexistent-test-route', {
        headers: { 'x-application-id': appId },
      });
    } catch {
      // expected 404
    }
  }

  console.log('--- 4. Recording External Dependency Calls ---');
  await instrumentExternalCall(
    'kubernetes_api',
    'GET',
    async () => ({ ok: true, cluster: 'kind-sre-copilot' }),
    appId,
  );

  console.log('--- 5. Verifying /metrics Exposition ---');
  const metricsScrape = await client.get('/metrics');
  if (!metricsScrape.data.includes(`app_id="${appId}"`)) {
    throw new Error('Expected /metrics to include application attribution label');
  }
  if (!metricsScrape.data.includes('sre_copilot_db_queries_total')) {
    throw new Error('Expected /metrics to include database query telemetry');
  }
  if (!metricsScrape.data.includes('sre_copilot_external_requests_total')) {
    throw new Error('Expected /metrics to include external dependency telemetry');
  }
  console.log('✅ Prometheus /metrics exposition contains valid attributed telemetry!');

  // Allow Prometheus a moment to scrape if running
  await new Promise((r) => setTimeout(r, 1000));

  console.log('--- 6. Calling Live APM Endpoints ---');

  // Overview
  const apmOverview = await client.get(`/api/v1/applications/${appId}/apm`, {
    headers: authHeaders,
  });
  console.log('APM Overview Status:', apmOverview.data.data.status);
  console.log('APM Overview Data:', JSON.stringify(apmOverview.data.data, null, 2));

  // Endpoints
  const apmEndpoints = await client.get(`/api/v1/applications/${appId}/apm/endpoints`, {
    headers: authHeaders,
  });
  console.log(`APM Endpoints count: ${apmEndpoints.data.data.endpoints.length}`);
  console.log('APM Endpoints Data:', JSON.stringify(apmEndpoints.data.data, null, 2));

  // Database
  const apmDb = await client.get(`/api/v1/applications/${appId}/apm/database`, {
    headers: authHeaders,
  });
  console.log('APM Database Status:', apmDb.data.data.status);
  console.log('APM Database Operations:', JSON.stringify(apmDb.data.data, null, 2));

  // Dependencies
  const apmDeps = await client.get(`/api/v1/applications/${appId}/apm/dependencies`, {
    headers: authHeaders,
  });
  console.log(`APM Dependencies count: ${apmDeps.data.data.dependencies.length}`);
  console.log('APM Dependencies Data:', JSON.stringify(apmDeps.data.data, null, 2));

  // History
  const apmHistory = await client.get(`/api/v1/applications/${appId}/apm/history?step=15s`, {
    headers: authHeaders,
  });
  console.log('APM History Status:', apmHistory.data.data.status);
  console.log('APM History Series:', JSON.stringify(apmHistory.data.data.series.map((s: any) => ({ metric: s.metric, pointsCount: s.points.length })), null, 2));

  console.log('--- 7. Verifying Uninstrumented Application Attribution ---');
  // Create a dummy uninstrumented application
  const newAppRes = await client.post(
    '/api/v1/applications',
    {
      name: 'uninstrumented-app',
      repositoryUrl: 'https://github.com/example/uninstrumented-app',
      repositoryOwner: 'example',
      repositoryName: 'uninstrumented-app',
      defaultBranch: 'main',
    },
    { headers: authHeaders },
  );
  const uninstrumentedId = newAppRes.data.data.id;

  const uninstrumentedApm = await client.get(`/api/v1/applications/${uninstrumentedId}/apm`, {
    headers: authHeaders,
  });
  console.log('Uninstrumented App APM Status:', uninstrumentedApm.data.data.status);
  if (uninstrumentedApm.data.data.status !== 'unavailable') {
    throw new Error('Expected uninstrumented application to report status "unavailable"');
  }
  if (uninstrumentedApm.data.data.requestRate !== null || uninstrumentedApm.data.data.totalRequests !== null) {
    throw new Error('Expected uninstrumented metrics to be null, not fabricated zeroes');
  }
  console.log('✅ Uninstrumented application safely reported "unavailable" with null metrics!');

  // Cleanup uninstrumented app
  await client.delete(`/api/v1/applications/${uninstrumentedId}`, { headers: authHeaders });

  console.log('\n🎉 ALL REAL APM INTEGRATION CHECKS VERIFIED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('APM verification failed:', err.response?.data || err.message);
  process.exit(1);
});
