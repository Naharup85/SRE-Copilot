import type { DeploymentStatus } from '../../types';

interface StatusBadgeProps {
  status: DeploymentStatus;
}

const labels: Record<DeploymentStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const classes: Record<DeploymentStatus, string> = {
  PENDING: 'badge badge-pending',
  RUNNING: 'badge badge-running',
  SUCCESS: 'badge badge-success',
  FAILED: 'badge badge-failed',
  CANCELLED: 'badge badge-cancelled',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={classes[status]}>
      <span className="badge-dot" />
      {labels[status]}
    </span>
  );
}
