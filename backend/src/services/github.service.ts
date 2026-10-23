import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { GitProvider, RepositoryInfo, CommitInfo } from './git-provider.interface';

/**
 * GitHubService provides GitHub API integration.
 * Credentials are always kept server-side; never exposed to frontend.
 */
export class GitHubService implements GitProvider {
  private readonly baseUrl = 'https://api.github.com';
  private readonly headers: Record<string, string>;

  constructor() {
    this.headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'sre-copilot/1.0',
    };

    if (env.GITHUB_TOKEN) {
      this.headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }
  }

  async getRepository(owner: string, repo: string): Promise<RepositoryInfo> {
    try {
      const response = await axios.get<{
        full_name: string;
        name: string;
        html_url: string;
        default_branch: string;
      }>(`${this.baseUrl}/repos/${owner}/${repo}`, { headers: this.headers });

      return {
        owner,
        name: response.data.name,
        url: response.data.html_url,
        defaultBranch: response.data.default_branch,
      };
    } catch (error) {
      logger.warn({ owner, repo, error }, 'Failed to fetch GitHub repository info');
      // Return a fallback when GitHub is unreachable
      return { owner, name: repo, url: `https://github.com/${owner}/${repo}`, defaultBranch: 'main' };
    }
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<CommitInfo> {
    try {
      const response = await axios.get<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>(`${this.baseUrl}/repos/${owner}/${repo}/commits/${sha}`, { headers: this.headers });

      return {
        sha: response.data.sha,
        message: response.data.commit.message,
        author: response.data.commit.author.name,
        timestamp: response.data.commit.author.date,
      };
    } catch (error) {
      logger.warn({ owner, repo, sha, error }, 'Failed to fetch commit info from GitHub');
      return { sha, message: 'Unknown commit', author: 'Unknown', timestamp: new Date().toISOString() };
    }
  }
}

export const gitHubService = new GitHubService();
