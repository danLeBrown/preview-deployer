import { toDeploymentId, toProjectSlug } from './project-slug-util';

describe('project-slug', () => {
  describe('toProjectSlug', () => {
    it('should lowercase owner and repo and replace non-alphanumeric with single hyphen', () => {
      expect(toProjectSlug('MyOrg', 'MyApp')).toBe('myorg-myapp');
    });

    it('should collapse multiple separators into one hyphen', () => {
      expect(toProjectSlug('org', 'repo_name')).toBe('org-repo-name');
    });

    it('should strip leading and trailing separators', () => {
      expect(toProjectSlug('org', 'repo')).toBe('org-repo');
    });

    it('should handle single-segment names', () => {
      expect(toProjectSlug('owner', 'repo')).toBe('owner-repo');
    });

    it('should produce URL-safe slug from owner/name', () => {
      expect(toProjectSlug('Acme-Corp', 'backend_api')).toBe('acme-corp-backend-api');
    });
  });

  describe('toDeploymentId', () => {
    it('should combine projectSlug and prNumber with hyphen', () => {
      expect(toDeploymentId('myorg-myapp', 12)).toBe('myorg-myapp-12');
    });

    it('should handle PR number 1', () => {
      expect(toDeploymentId('org-repo', 1)).toBe('org-repo-1');
    });
  });
});
