export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Rent",
  "Gas",
  "Utilities",
  "Car",
  "Health Insurance",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INCOME_CATEGORIES = [
  "Paycheck",
  "Gift",
  "Bonus",
  "Interest",
  "Other",
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

// Savings goals (targets), NOT transaction categories
export const SAVINGS_GOALS = [
  "Emergency Fund",
  "Rainy Day",
  "Travel",
  "Investment",
  "Retirement",
  "Other",
] as const;

export type SavingsGoal = (typeof SAVINGS_GOALS)[number];

export type AnyCategory = ExpenseCategory | IncomeCategory;
