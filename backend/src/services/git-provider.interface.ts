export interface RepositoryInfo {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

/**
 * GitProvider is the interface for all Git hosting integrations.
 * Phase 1 implements a basic GitHub provider.
 * Future phases can add GitLab, Bitbucket support without changing the contract.
 */
export interface GitProvider {
  getRepository(owner: string, repo: string): Promise<RepositoryInfo>;
  getCommit(owner: string, repo: string, sha: string): Promise<CommitInfo>;
}
