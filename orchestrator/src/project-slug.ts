/**
 * Derives a filesystem- and URL-safe project slug from repo owner and name.
 * Used to avoid collisions when multiple repos (e.g. org/api and org/web) have the same PR number.
 */
export function toProjectSlug(owner: string, repoName: string): string {
  const combined = `${owner}/${repoName}`.toLowerCase();
  return combined.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Deployment id: projectSlug-prNumber. Unique per repo+PR.
 */
export function toDeploymentId(projectSlug: string, prNumber: number): string {
  return `${projectSlug}-${prNumber}`;
}
