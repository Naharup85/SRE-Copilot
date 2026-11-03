import type { Environment } from '../db/schema';
import type { LoggingProvider, ContainerLogEntry } from './logging-provider.interface';

export class MockLoggingProvider implements LoggingProvider {
  async getContainerLogs(_environment: Environment, lines = 100): Promise<ContainerLogEntry[]> {
    const entries: ContainerLogEntry[] = [
      {
        timestamp: new Date(Date.now() - 30000).toISOString(),
        stream: 'stdout',
        message: 'Server starting on port 8080...',
      },
      {
        timestamp: new Date(Date.now() - 25000).toISOString(),
        stream: 'stdout',
        message: 'Application initialized and ready for connections.',
      },
      {
        timestamp: new Date(Date.now() - 5000).toISOString(),
        stream: 'stdout',
        message: 'GET /healthz HTTP/1.1 200 OK - 2ms',
      },
    ];

    return entries.slice(-lines);
  }
}

