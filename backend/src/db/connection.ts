import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';
import {
  dbQueriesTotal,
  dbQueryDurationSeconds,
  dbSlowQueriesTotal,
  dbQueryErrorsTotal,
  extractSqlOperation,
} from '../metrics';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Instrument pool.query for Database Performance Monitoring (APM)
const originalQuery = pool.query.bind(pool);

(pool as any).query = function (queryTextOrConfig: any, valuesOrCallback?: any, callback?: any) {
  let queryText = '';
  if (typeof queryTextOrConfig === 'string') {
    queryText = queryTextOrConfig;
  } else if (queryTextOrConfig && typeof queryTextOrConfig.text === 'string') {
    queryText = queryTextOrConfig.text;
  }

  const operation = extractSqlOperation(queryText);
  const start = process.hrtime.bigint();
  const slowThresholdMs = env.DB_SLOW_QUERY_THRESHOLD_MS;

  // Handle callback signature
  if (typeof valuesOrCallback === 'function') {
    const cb = valuesOrCallback;
    return originalQuery(queryTextOrConfig, (err: any, res: any) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const durationMs = durationSeconds * 1000;
      if (err) {
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'error' });
        dbQueryErrorsTotal.inc({ app_id: 'sre-copilot-backend', operation, error_type: err.code || 'QUERY_ERROR' });
      } else {
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'success' });
        dbQueryDurationSeconds.observe({ app_id: 'sre-copilot-backend', operation }, durationSeconds);
        if (durationMs > slowThresholdMs) {
          dbSlowQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation });
        }
      }
      cb(err, res);
    });
  }

  if (typeof callback === 'function') {
    const cb = callback;
    return originalQuery(queryTextOrConfig, valuesOrCallback, (err: any, res: any) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const durationMs = durationSeconds * 1000;
      if (err) {
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'error' });
        dbQueryErrorsTotal.inc({ app_id: 'sre-copilot-backend', operation, error_type: err.code || 'QUERY_ERROR' });
      } else {
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'success' });
        dbQueryDurationSeconds.observe({ app_id: 'sre-copilot-backend', operation }, durationSeconds);
        if (durationMs > slowThresholdMs) {
          dbSlowQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation });
        }
      }
      cb(err, res);
    });
  }

  // Handle Promise signature
  const queryPromise = originalQuery(queryTextOrConfig, valuesOrCallback);
  if (queryPromise && typeof queryPromise.then === 'function') {
    return queryPromise
      .then((res: any) => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        const durationMs = durationSeconds * 1000;
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'success' });
        dbQueryDurationSeconds.observe({ app_id: 'sre-copilot-backend', operation }, durationSeconds);
        if (durationMs > slowThresholdMs) {
          dbSlowQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation });
        }
        return res;
      })
      .catch((err: any) => {
        dbQueriesTotal.inc({ app_id: 'sre-copilot-backend', operation, status: 'error' });
        dbQueryErrorsTotal.inc({ app_id: 'sre-copilot-backend', operation, error_type: err.code || 'QUERY_ERROR' });
        throw err;
      });
  }

  return queryPromise;
};

export const db = drizzle(pool, { schema });

export { pool };
