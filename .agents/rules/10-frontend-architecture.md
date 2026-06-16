---
trigger: model_decision
description: Apply when working on frontend architecture, screen structure, state flow, or frontend-side integration patterns in apps/mobile.
---

# .agents/rules/10-frontend-architecture.md

# Frontend Architecture Rules

Frontend architectural rules remain necessarily lightweight for now.

## Core Rules
- **Preserve Behavior**: Maintain existing mobile behavior and public contracts without disruption.
- **Contract Adherence**: Synchronize `apps/mobile` inputs smoothly to reflect any shifts within `packages/shared`. Do not invent local UI types to skirt unified contracts.
- **No Broad Rewrites**: Do not instigate expansive architecture refactors or state-management shifts. Refactoring operations should be strategically isolated and localized.

## Design Tokens
All styling must use the design token SSOT at `apps/mobile/src/app/theme.ts`. Never hardcode color strings, font sizes, spacing, border-radius, or opacity values in screen or component files.

| Token group | Export | Example usage |
|---|---|---|
| Colors | `Colors` | `Colors.ink`, `Colors.gray200`, `Colors.statusGood` |
| Font sizes | `FontSize` | `FontSize.sm`, `FontSize["2xl"]`, `FontSize.stat` |
| Font weights | `FontWeight` | `FontWeight.bold`, `FontWeight.black` |
| Spacing | `Spacing` | `Spacing.md`, `Spacing["3xl"]` |
| Border radius | `Radius` | `Radius.pill`, `Radius.md` |
| Opacity | `Opacity` | `Opacity.faint`, `Opacity.disabled` |

When adding a new color or scale value that does not exist yet, add it to `theme.ts` first — do not inline it in a component.