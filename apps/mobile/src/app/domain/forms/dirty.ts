// apps/mobile/src/app/domain/forms/dirty.ts

import type { Currency } from "../../../../../../packages/shared/src/money/types";
import { parseInputToMinor } from "../money";

function normText(v: unknown): string {
  return String(v ?? "").trim();
}

function normMinor(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * Name dirty check (trim-based). Case-sensitive by default.
 * (원하면 나중에 .toLowerCase()로 케이스 무시 가능)
 */
export function isNameDirty(draftName: unknown, currentName: unknown): boolean {
  return normText(draftName) !== normText(currentName);
}

/**
 * Money dirty check:
 * - draft input text -> minor (empty/invalid => 0)
 * - compare vs current minor
 */
export function isMoneyDirty(
  draftText: unknown,
  currentMinor: unknown,
  currency: Currency
): boolean {
  const draftMinor = Math.max(
    0,
    parseInputToMinor(normText(draftText), currency)
  );
  return draftMinor !== normMinor(currentMinor);
}

/** True if blank after trim */
export function isBlankText(v: unknown): boolean {
  return !normText(v);
}

/** draft text -> minor (>=0), empty/invalid => 0 */
export function moneyTextToMinor(
  draftText: unknown,
  currency: Currency
): number {
  return Math.max(0, parseInputToMinor(normText(draftText), currency));
}

export function deriveBudgetDirty(args: {
  selectedLimitText: unknown;
  currentLimitMinor: unknown;
  currency: Currency;
}): { dirty: boolean; nextLimitMinor: number } {
  const nextLimitMinor = moneyTextToMinor(
    args.selectedLimitText,
    args.currency
  );
  const dirty = nextLimitMinor !== normMinor(args.currentLimitMinor);
  return { dirty, nextLimitMinor };
}

export function deriveSavingsDirty(args: {
  draftName: unknown;
  currentName: unknown;
  draftTargetText: unknown;
  currentTargetMinor: unknown;
  currency: Currency;
}): {
  dirty: boolean;
  nameDirty: boolean;
  targetDirty: boolean;
  nextTargetMinor: number;
} {
  const nameDirty = isNameDirty(args.draftName, args.currentName);
  const nextTargetMinor = moneyTextToMinor(args.draftTargetText, args.currency);
  const targetDirty = nextTargetMinor !== normMinor(args.currentTargetMinor);
  const dirty = nameDirty || targetDirty;
  return { dirty, nameDirty, targetDirty, nextTargetMinor };
}

export function deriveTransactionDirty(args: {
  draftType: unknown;
  currentType: unknown;
  draftCategory: unknown;
  currentCategory: unknown;
  draftSavingsGoalId: unknown;
  currentSavingsGoalId: unknown;
  draftAmountText: unknown;
  currentAmountMinor: unknown; // should be ABS minor
  currency: Currency;
  draftNote: unknown;
  currentNote: unknown; // null/undefined treated as ""
}): {
  dirty: boolean;
  typeDirty: boolean;
  categoryDirty: boolean;
  savingsGoalDirty: boolean;
  amountDirty: boolean;
  noteDirty: boolean;
  nextAmountMinorAbs: number;
} {
  const draftType = normText(args.draftType);
  const currentType = normText(args.currentType);
  const typeDirty = draftType !== currentType;

  const draftCategory = normText(args.draftCategory);
  const currentCategory = normText(args.currentCategory);
  const categoryDirty = draftCategory !== currentCategory;

  const draftGoalId = normText(args.draftSavingsGoalId);
  const currentGoalId = normText(args.currentSavingsGoalId);
  const savingsGoalDirty = draftGoalId !== currentGoalId;

  const nextAmountMinorAbs = moneyTextToMinor(
    args.draftAmountText,
    args.currency
  );
  const amountDirty = nextAmountMinorAbs !== normMinor(args.currentAmountMinor);

  const noteDirty = isNameDirty(args.draftNote, args.currentNote);

  const dirty =
    typeDirty || categoryDirty || savingsGoalDirty || amountDirty || noteDirty;

  return {
    dirty,
    typeDirty,
    categoryDirty,
    savingsGoalDirty,
    amountDirty,
    noteDirty,
    nextAmountMinorAbs,
  };
}
