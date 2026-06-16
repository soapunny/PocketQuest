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

## Shared Component Patterns

### Cards
`CardSpacing.card` (from `Typography.ts`) is the base style for all cards — it includes background, border, padding, and shadow. Use `ScreenCard` component which applies this automatically. Do not re-define card shadow or border per screen.

### Pill chips
Import from `components/chipStyles.ts`:
```ts
import { chipStyle, chipTextStyle, chipStyles } from "../components/chipStyles";
```
`chipStyle(active)` and `chipTextStyle(active)` return the correct style arrays. `chipStyles.chipDisabled` handles the disabled state. Never re-define these per screen.

### Segment control
Use `components/SegmentControl.tsx` for connected toggle strips (On/Off, Weekly/Biweekly/Monthly, etc.). `chipStyles` is for individual floating chips.

## i18n
Use `makeTr(language)` from `domain/i18n.ts` to replace the repeated two-line pattern:
```ts
// ❌ old
const isKo = language === "ko";
const tr = (en: string, ko: string) => (isKo ? ko : en);

// ✅ new
const tr = makeTr(language);
```
Keep `isKo` only when two full JSX trees (with nested `<Text>` components) must be conditionally rendered — `tr()` only handles plain strings.

## Component Extraction
Never define a component inside a render function — it re-creates the component on every render and breaks React reconciliation. Extract to a separate file under `components/`:
```ts
// ❌ inside a screen's render
function StatusChip(...) { ... }

// ✅ separate file: components/StatusChip.tsx
export function StatusChip(...) { ... }
```

## Text Overflow
For text values that can be long (financial amounts, combined strings like `"$1,234 / $5,000"`), add overflow guards:
```tsx
<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
  {value}
</Text>
```

## Date Locale
When displaying dates, derive the locale from the `language` prop:
```ts
const dateLocale = language === "ko" ? "ko-KR" : "en-US";
new Date(dateISO).toLocaleString(dateLocale);
```