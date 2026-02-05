// packages/shared/src/user/types.ts

export type CashflowCarryoverMode = "ROLLING";

export type UserMeDTO = {
  id: string;
  email?: string | null;
  name?: string | null;
  profileImageUri?: string | null;
  provider?: string | null;

  cashflowCarryoverEnabled: boolean;
  cashflowCarryoverMode: CashflowCarryoverMode;
};

export type PatchUserMeRequestDTO = Partial<{
  name: string;
  profileImageUri: string | null;

  cashflowCarryoverEnabled: boolean;
  cashflowCarryoverMode: CashflowCarryoverMode;
}>;
