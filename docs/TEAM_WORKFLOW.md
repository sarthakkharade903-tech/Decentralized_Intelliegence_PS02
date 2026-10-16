# Team Collaboration & Git Workflow Policy

This document defines the development workflow, branching strategy, and merge-conflict prevention rules for **Sarthak, Ayaz, and Samir** on **NeuroScope-3D**.

---

## 1. Branching Strategy

```text
       feature/sarthak-inference ─────────────┐
      /                                        ▼ (PR + Review)
main ──────────────────────────────────────────*───────────────────► (Stable Demo)
      \                                        ▲ (PR + Review)
       feature/ayaz-niivue-viewer ─────────────┘
```

- **`main`**: The protected, production/demo-ready branch.
  - Always compilable and runnable.
  - **No direct commits** to `main` during feature development.
  - **Never force-push (`--force`)** to `main`.
- **Feature Branches (`feature/<developer>-<task-name>`)**:
  - Example: `feature/sarthak-inference-pipeline`
  - Example: `feature/ayaz-niivue-viewer`
  - Example: `feature/samir-report-export`
- **Bugfix Branches (`fix/<developer>-<issue-name>`)**:
  - Example: `fix/sarthak-affine-inversion`

---

## 2. Nine Golden Rules to Prevent Merge Conflicts

1. **Pull Latest Main Daily & Before Starting**:
   Always run `git checkout main && git pull origin main` before creating your feature branch.
2. **Keep Branches Small and Single-Purpose**:
   Do not mix backend inference refactors with frontend UI tweaks in the same branch.
3. **Declare File Ownership Before Working**:
   Before modifying shared files (e.g. `package.json`, `requirements.txt`, central routers, or design tokens), send a quick message in team chat.
4. **Avoid Concurrent Edits on Identical Components**:
   No two developers should edit the same React page or backend service file simultaneously.
5. **Keep Shared API Contracts Immutable**:
   Follow `docs/ARCHITECTURE.md`. If an API field name or type must change, announce it and agree before writing the code.
6. **Rebase or Merge Main Frequently**:
   If `main` moves forward while your feature branch is in progress, rebase or merge `main` into your feature branch locally and verify tests before opening a PR.
7. **Inspect Diffs Before Committing**:
   Always run `git diff` or `git status` to ensure you are not staging unwanted files, temporary debug scripts, or unintended formatting sweeps.
8. **Require Peer Review on Integrations**:
   Open a GitHub Pull Request with a clear summary of changes, screenshots/test outputs, and request at least one teammate review before merging into `main`.
9. **Never Use Force Push as a Routine Fix**:
   If merge conflicts occur, resolve them deliberately by inspecting each conflicting block. Never overwrite a teammate's changes with `--force`.

---

## 3. Commit Message Standards

Use semantic commit prefixes:
- `feat: add NiiVue multi-planar canvas component`
- `fix: resolve coordinate indexing mismatch in coronal slice`
- `perf: enable mixed precision AMP for sliding window inference`
- `docs: update API contract for volume calculation`
- `chore: update requirements.txt with nibabel version pin`

---

## 4. Pull Request Checklist

Before merging into `main`, verify:
- [ ] Code runs locally without errors.
- [ ] No MRI files (`.nii`, `.nii.gz`), model binaries (`.pth`), or credentials (`.env`) are included in the diff.
- [ ] All new functions include type hints or docstrings.
- [ ] Any changed contracts are updated in `docs/ARCHITECTURE.md` or `docs/UI_DESIGN_RULES.md`.
- [ ] Teammate has reviewed and approved.
