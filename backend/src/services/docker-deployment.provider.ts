import Docker from 'dockerode';
import http from 'http';
import type { DeploymentProvider, DeploymentInput, DeploymentResult } from './deployment-provider.interface';
import { DatabaseLogEmitter } from './log-emitter';
import { logger } from '../config/logger';

export class DockerDeploymentProvider implements DeploymentProvider {
  private readonly docker: Docker;
  private readonly logEmitter = new DatabaseLogEmitter();

  constructor(options?: Docker.DockerOptions) {
    // Restricted strictly to local Unix socket or trusted dev socket
    this.docker = new Docker(
      options || {
        socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
      },
    );
  }

  async deploy(input: DeploymentInput): Promise<DeploymentResult> {
    const { deploymentId, application, environment, version } = input;
    const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string) =>
      this.logEmitter.emit(deploymentId, level, message);

    const cfg = (environment.targetConfig as any) || {};
    const containerName =
      cfg.containerName ||
      environment.containerName ||
      `${application.name}-${environment.name}`;
    const network = cfg.network || 'bridge';
    const portBindings: Array<{ hostPort: number; containerPort: number }> =
      cfg.portBindings || [];
    const secretRefs: Record<string, string> = cfg.secretRefs || {};
    const rawEnvVars: Record<string, string> = cfg.envVars || {};
    const healthCheckConfig = cfg.healthCheck;

    const imageTag = version.includes('/') || version.includes(':')
      ? version
      : `ghcr.io/${application.repositoryOwner}/${application.repositoryName}:${version}`;

    logger.info(
      { deploymentId, containerName, imageTag, network },
      'Starting Docker deployment',
    );

    await log('INFO', `Initializing Docker deployment for container '${containerName}'`);
    await log('INFO', `Target container image: ${imageTag}`);

    // Step 1: Pull image
    try {
      await log('INFO', `Pulling container image: ${imageTag}...`);
      await this.pullImage(imageTag, log);
      await log('INFO', `Successfully pulled image: ${imageTag}`);
    } catch (pullErr: any) {
      const msg = `Failed to pull image '${imageTag}': ${pullErr.message}`;
      await log('ERROR', msg);
      return { success: false, error: msg };
    }

    // Step 2: Resolve secure secret references (never log plaintext secrets)
    const envList: string[] = [];
    for (const [k, v] of Object.entries(rawEnvVars)) {
      envList.push(`${k}=${v}`);
    }
    for (const [envVarName, secretKeyRef] of Object.entries(secretRefs)) {
      const resolvedVal = process.env[secretKeyRef] || '';
      if (!resolvedVal) {
        await log('WARN', `Secret reference '${secretKeyRef}' for '${envVarName}' was not found in environment`);
      } else {
        await log('INFO', `Injected secret reference '${secretKeyRef}' into container environment variable '${envVarName}'`);
      }
      envList.push(`${envVarName}=${resolvedVal}`);
    }

    // Step 3: Check for existing container and preserve it for rollback
    let previousContainer: Docker.Container | null = null;
    let previousImage: string | null = null;
    const prevBackupName = `${containerName}-prev-${deploymentId.slice(0, 8)}`;

    try {
      const containers = await this.docker.listContainers({ all: true });
      const existing = containers.find((c) =>
        c.Names.some((n) => n === `/${containerName}` || n === containerName),
      );

      if (existing) {
        previousContainer = this.docker.getContainer(existing.Id);
        previousImage = existing.Image;
        await log(
          'INFO',
          `Found previous container (${existing.Id.slice(0, 12)}) running image: ${previousImage}`,
        );

        // Rename previous container to backup name so replacement can bind to standard name
        try {
          await previousContainer.rename({ name: prevBackupName });
          await log('INFO', `Renamed previous container to '${prevBackupName}' for safe rollback preservation`);
        } catch (renameErr: any) {
          await log('WARN', `Could not rename previous container: ${renameErr.message}`);
        }

        // Gracefully stop previous container to free host port bindings
        await log('INFO', 'Gracefully stopping previous container...');
        await previousContainer.stop({ t: 10 }).catch(() => {});
      }
    } catch (checkErr: any) {
      await log('WARN', `Could not inspect previous containers: ${checkErr.message}`);
    }

    // Step 4: Construct container specifications
    const exposedPorts: Record<string, {}> = {};
    const dockerPortBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const pb of portBindings) {
      const portKey = `${pb.containerPort}/tcp`;
      exposedPorts[portKey] = {};
      dockerPortBindings[portKey] = [{ HostPort: `${pb.hostPort}` }];
      await log('INFO', `Configured port binding: 0.0.0.0:${pb.hostPort} -> ${pb.containerPort}/tcp`);
    }

    const createOptions: Docker.ContainerCreateOptions = {
      name: containerName,
      Image: imageTag,
      Env: envList,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: dockerPortBindings,
        NetworkMode: network,
        RestartPolicy: { Name: 'unless-stopped' },
      },
    };

    if (healthCheckConfig?.test && Array.isArray(healthCheckConfig.test)) {
      createOptions.Healthcheck = {
        Test: healthCheckConfig.test,
        Interval: (healthCheckConfig.intervalSeconds || 5) * 1e9,
        Timeout: (healthCheckConfig.timeoutSeconds || 3) * 1e9,
        Retries: healthCheckConfig.retries || 3,
      };
    }

    // Step 5: Create and start replacement container
    let newContainer: Docker.Container;
    try {
      await log('INFO', `Creating container '${containerName}'...`);
      newContainer = await this.docker.createContainer(createOptions);
      await log('INFO', `Starting container '${containerName}' (${newContainer.id.slice(0, 12)})...`);
      await newContainer.start();
    } catch (createErr: any) {
      const msg = `Failed to create/start container: ${createErr.message}`;
      await log('ERROR', msg);

      // Rollback to previous container if available
      if (previousContainer) {
        await this.rollback(previousContainer, containerName, previousImage, log);
      }
      return { success: false, error: msg };
    }

    // Step 6: Verify container health and readiness
    await log('INFO', 'Verifying container readiness and health status...');
    const healthResult = await this.verifyReadiness(
      newContainer,
      healthCheckConfig,
      portBindings,
      log,
    );

    if (!healthResult.success) {
      await log('ERROR', `Readiness verification failed: ${healthResult.error}`);

      // Stop and remove failed replacement container
      try {
        await log('INFO', 'Stopping failed replacement container...');
        await newContainer.stop({ t: 5 }).catch(() => {});
        await newContainer.remove({ force: true }).catch(() => {});
      } catch {
        // cleanup best effort
      }

      // Rollback to previous container
      if (previousContainer) {
        await this.rollback(previousContainer, containerName, previousImage, log);
      }

      return {
        success: false,
        error: `Docker deployment failed: ${healthResult.error}`,
      };
    }

    // Step 7: Deployment succeeded - clean up previous backup container
    if (previousContainer) {
      try {
        await log('INFO', `Rollout verified. Cleaning up prior container '${prevBackupName}'...`);
        await previousContainer.remove({ force: true }).catch(() => {});
      } catch (rmErr: any) {
        logger.warn({ error: rmErr.message }, 'Could not remove backup container');
      }
    }

    await log('INFO', 'Docker deployment completed successfully. Container is healthy and active.');
    return { success: true };
  }

  private async rollback(
    previousContainer: Docker.Container,
    containerName: string,
    previousImage: string | null,
    log: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>,
  ): Promise<void> {
    await log('WARN', `Initiating automatic rollback to previous container (image: ${previousImage})...`);
    try {
      await previousContainer.rename({ name: containerName }).catch(() => {});
      await previousContainer.start();
      await log('WARN', `Automatic rollback complete. Previous container '${containerName}' restored and running.`);
    } catch (rbErr: any) {
      await log('ERROR', `CRITICAL: Failed to rollback previous container: ${rbErr.message}`);
    }
  }

  private async verifyReadiness(
    container: Docker.Container,
    healthCheckConfig: any,
    portBindings: Array<{ hostPort: number; containerPort: number }>,
    log: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>,
    timeoutMs = 25000,
    pollIntervalMs = 2000,
  ): Promise<{ success: boolean; error?: string }> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      let inspect: Docker.ContainerInspectInfo;
      try {
        inspect = await container.inspect();
      } catch (err: any) {
        await log('WARN', `Could not inspect container: ${err.message}`);
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }

      const status = inspect.State.Status;
      const running = inspect.State.Running;
      const exitCode = inspect.State.ExitCode;

      if (!running || status === 'exited' || status === 'dead') {
        const errorMsg = `Container terminated unexpectedly with exit code ${exitCode}`;
        await log('ERROR', errorMsg);
        return { success: false, error: errorMsg };
      }

      // If Docker-native health check is configured, check health status
      if (inspect.State.Health) {
        const healthStatus = inspect.State.Health.Status;
        await log('INFO', `Docker native health status: ${healthStatus}`);
        if (healthStatus === 'healthy') {
          return { success: true };
        }
        if (healthStatus === 'unhealthy') {
          return { success: false, error: 'Docker native health check reported unhealthy' };
        }
      } else if (healthCheckConfig?.path) {
        // Custom HTTP probe check against host port
        const targetHostPort = healthCheckConfig.port || portBindings[0]?.hostPort;
        if (targetHostPort) {
          const probeOk = await this.httpProbe(
            '127.0.0.1',
            targetHostPort,
            healthCheckConfig.path,
          );
          if (probeOk) {
            await log('INFO', `HTTP health probe '${healthCheckConfig.path}' succeeded on port ${targetHostPort}`);
            return { success: true };
          }
          await log('INFO', `HTTP probe waiting for '${healthCheckConfig.path}' to respond...`);
        }
      } else {
        // If container has run continuously for at least 3 seconds without healthcheck, consider healthy
        if (Date.now() - new Date(inspect.State.StartedAt).getTime() > 3000) {
          return { success: true };
        }
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { success: false, error: `Container readiness timeout exceeded (${Math.round(timeoutMs / 1000)}s)` };
  }

  private httpProbe(host: string, port: number, path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({ host, port, path, timeout: 2000 }, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private pullImage(
    imageTag: string,
    _log: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageTag, (err: any, stream: any) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(
          stream,
          (finishErr: any) => {
            if (finishErr) return reject(finishErr);
            resolve();
          },
          (event: any) => {
            if (event.status && event.id) {
              // Detailed layer progress (optional log throttling)
            }
          },
        );
      });
    });
  }
}
