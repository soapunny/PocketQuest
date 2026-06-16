---
name: bugfix-minimal-patch
description: Reusable skill for fixing bugs with a minimal blast radius.
autoApply: false
---

# Bugfix Minimal Patch Skill

For bugfixes, prioritize stability and minimal changes:

1. **Reproduction Understanding**: Thoroughly understand the reproduction steps and the expected vs. actual behavior.
2. **Root-Cause-First Editing**: Identify the specific root cause before touching any code. Avoid trial-and-error editing.
3. **Minimal Blast Radius**: Implement the fix using the smallest possible safe patch. Avoid opportunistic refactoring during bug fixes.
4. **Regression Check**: Verify the fix does not break related code paths. Check dependencies and consumers of the modified code. Ensure existing tests (if any) continue to pass.
