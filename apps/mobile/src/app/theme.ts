// apps/mobile/src/app/theme.ts
// Design token SSOT for the mobile app.
// All colors, sizes, weights, and radii should be defined here.

// ─── Colors ────────────────────────────────────────────────────────────────

export const Colors = {
  // Base
  ink: "#111111",
  white: "#ffffff",
  offWhite: "#f7f7f7",

  // Neutrals (surface / border / text)
  gray50: "#fafafa",    // read-only field bg
  gray100: "#eeeeee",   // inactive chip / secondary button bg
  gray200: "#dddddd",   // input border, chip border
  gray300: "#cccccc",
  gray400: "#999999",   // disabled button bg
  gray500: "#777777",   // meta / timestamp text
  gray600: "#666666",   // secondary / description text
  gray700: "#555555",   // note text

  // Overlays (rgba on black — for backgrounds and borders that need transparency)
  overlay02: "rgba(0,0,0,0.02)",   // subtle section bg
  overlay04: "rgba(0,0,0,0.04)",   // chip bg, status chip bg
  overlay06: "rgba(0,0,0,0.06)",   // progress track, section divider
  overlay08: "rgba(0,0,0,0.08)",   // details box border
  overlay35: "rgba(0,0,0,0.35)",   // modal backdrop

  // Status — cashflow & budget
  statusGood: "#16A34A",      // green
  statusOk: "#2563EB",        // blue
  statusCaution: "#F59E0B",   // amber
  statusRisk: "#DC2626",      // red
  statusMuted: "#6B7280",     // gray

  // Status — savings (slightly warmer palette)
  savingsPush: "#D97706",     // warm orange
  savingsGood: "#059669",     // teal-green
  savingsBest: "#7C3AED",     // purple

  // Error / danger
  error: "#b42318",           // error text, validation border
  errorBg: "#fff5f5",         // danger button background
  errorBorder: "#f0caca",     // danger button border
  errorDark: "#cc0000",       // delete action text
} as const;

// ─── Typography ────────────────────────────────────────────────────────────

export const FontSize = {
  xs: 11,    // detail card sub-label
  sm: 12,    // meta text, helper, chip label, status chip
  base: 13,  // secondary title, metric title
  md: 14,    // field label, card body
  lg: 15,    // card title
  xl: 16,    // amount input
  "2xl": 18, // section header, detail metric value
  "3xl": 20, // primary metric value, transaction amount
  stat: 24,  // stat card value (Profile)
  "4xl": 28, // screen title
  avatar: 32, // avatar placeholder initial
} as const;

export const FontWeight = {
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

// ─── Spacing ───────────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 14,
  "3xl": 16,
  "4xl": 18,
  "5xl": 24,
} as const;

// ─── Border radius ─────────────────────────────────────────────────────────

export const Radius = {
  sm: 8,
  md: 12,   // inputs, buttons
  lg: 14,   // cards
  pill: 999, // chips, pills, avatar
} as const;

// ─── Opacity ───────────────────────────────────────────────────────────────
// Used for consistent muted/disabled states without hardcoding per-element.

export const Opacity = {
  muted: 0.7,
  subtle: 0.75,
  faint: 0.45,    // disabled state
  disabled: 0.35, // chip disabled
} as const;
