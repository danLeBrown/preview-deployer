# Agent handoff prompt

Copy the block below into a new Cursor agent (or chat) session so the agent uses the project’s standards, plan, and docs before implementing anything.

---

**Prompt to paste:**

```
You are working on the prvue project. Before implementing any new features or changes:

Install/config paths (e.g. `/opt/preview-deployer`, `~/.preview-deployer`) stay as preview-deployer for operator convenience; systemd service is `preview-orchestrator`.

1. Read these project artifacts in order:
   - README.md (project overview, structure, quick start)
   - docs/implementation-plan.md (canonical plan: architecture, implementation notes, port allocation, routing, nginx structure)
   - docs/architecture.md (components, data flow, security)
   - docs/configuration.md (config and env reference)
   - docs/quickstart.md and docs/troubleshooting.md as relevant

2. Follow the Cursor rules in .cursor/rules/ (especially preview-deployer-standards.mdc and typescript-and-build.mdc when editing TypeScript). They reflect the implementation plan and coding standards.

3. Conventions to respect:
   - pnpm monorepo (orchestrator + cli); TypeScript strict mode
   - Project slug from repo owner/name; deployment id {projectSlug}-{prNumber}; path-based routing /{projectSlug}/pr-{number}/
   - Port allocation: global pool (next free app port from 8000, db from 9000)
   - Nginx: preview configs are included inside a default server block, not at http level
   - After code changes: run `pnpm build` and confirm CLI/orchestrator still work

4. If the task touches Terraform, Ansible, nginx, or deployment tracking, re-check the plan and docs for the correct structure (e.g. nginx server block, Ansible orchestrator source, deployment tracker sync vs async I/O).

Do not skip reading the plan and rules; they define our standards. Then proceed with the requested task.
```

---

Use this when starting a new session so the agent is aware of the plan, rules, README, and docs before making changes.
