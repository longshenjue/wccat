# Topic copy structure recovery plan

**Goal:** Recover once from malformed model-owned copy fields such as `en.article.body_zh`, while preserving provenance and existing saved drafts.

**Approach:** Classify schema-shape failures in the existing validator. The generation boundary requests one structure-only repair and validates its complete response again. Share one recovery budget with JSON serialization repair. Source-owned fields, invisible controls, provider errors and editorial review warnings retain their existing behavior; no aliases are guessed or hardcoded.

**Files:** topic-sharing validation/generation, newsroom prompts, focused recovery/concurrency tests and topic-sharing documentation.

**Checks:** Demonstrate the existing failure; run focused generation, validation, store and concurrency tests, TypeScript, lint and production build. Do not run the full suite. Review before commit and push main to trigger existing automatic deployment; do not monitor deployment, per user instruction.

**Validation:** Reproduced both the original schema failure and the mixed-location hard-error bypass before fixing them. The final 58 focused tests, TypeScript and production build pass; lint has no errors and the existing image warning. Independent re-review found no remaining actionable issues.
