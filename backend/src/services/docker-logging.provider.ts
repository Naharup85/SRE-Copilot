import Docker from 'dockerode';
import type { Environment } from '../db/schema';
import type { LoggingProvider, ContainerLogEntry } from './logging-provider.interface';
import { logger } from '../config/logger';

export class DockerLoggingProvider implements LoggingProvider {
  private readonly docker: Docker;

  constructor(options?: Docker.DockerOptions) {
    this.docker = new Docker(
      options || {
        socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
      },
    );
  }

  async getContainerLogs(environment: Environment, lines = 100): Promise<ContainerLogEntry[]> {
    const cfg = (environment.targetConfig as any) || {};
    const containerName =
      cfg.containerName ||
      environment.containerName ||
      environment.name;

    try {
      const container = this.docker.getContainer(containerName);
      const rawLogs = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines,
        timestamps: true,
      });

      return this.parseDockerLogs(rawLogs);
    } catch (err: any) {
      logger.warn({ containerName, error: err.message }, 'Failed to get Docker container logs');
      return [];
    }
  }

  private parseDockerLogs(bufferOrString: Buffer | string): ContainerLogEntry[] {
    const entries: ContainerLogEntry[] = [];
    if (!bufferOrString) return entries;

    if (Buffer.isBuffer(bufferOrString)) {
      let offset = 0;
      while (offset + 8 <= bufferOrString.length) {
        const streamType = bufferOrString.readUInt8(offset);
        const stream: 'stdout' | 'stderr' = streamType === 2 ? 'stderr' : 'stdout';
        const frameLength = bufferOrString.readUInt32BE(offset + 4);
        offset += 8;

        if (offset + frameLength > bufferOrString.length) {
          const raw = bufferOrString.subarray(offset).toString('utf-8');
          this.parseLine(raw, stream, entries);
          break;
        }

        const payload = bufferOrString.subarray(offset, offset + frameLength).toString('utf-8');
        offset += frameLength;
        this.parseLine(payload, stream, entries);
      }

      // If parsing headers yielded nothing (e.g. TTY mode without 8-byte header), fall back to line parsing
      if (entries.length === 0 && bufferOrString.length > 0) {
        const raw = bufferOrString.toString('utf-8');
        for (const line of raw.split('\n')) {
          if (line.trim()) this.parseLine(line, 'stdout', entries);
        }
      }
    } else {
      for (const line of bufferOrString.split('\n')) {
        if (line.trim()) this.parseLine(line, 'stdout', entries);
      }
    }

    return entries;
  }

  private parseLine(raw: string, stream: 'stdout' | 'stderr', entries: ContainerLogEntry[]) {
    const lines = raw.split(/\r?\n/);
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed) continue;

      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx > 19) {
        const possibleTs = trimmed.slice(0, spaceIdx);
        if (!isNaN(Date.parse(possibleTs))) {
          entries.push({
            timestamp: possibleTs,
            stream,
            message: trimmed.slice(spaceIdx + 1),
          });
          continue;
        }
      }

      entries.push({
        timestamp: new Date().toISOString(),
        stream,
        message: trimmed,
      });
    }
  }
}

