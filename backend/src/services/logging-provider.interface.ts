import type { Environment } from '../db/schema';

export interface ContainerLogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  message: string;
}

export interface LoggingProvider {
  getContainerLogs(environment: Environment, lines?: number): Promise<ContainerLogEntry[]>;
}

