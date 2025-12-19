import React, { createContext, useContext, useMemo, useState } from "react";

export type CharacterState = {
  level: number;
  xp: number; // current xp in this level
  xpToNext: number;
  lastAppliedPeriodStartISO?: string;
};

type Store = {
  character: CharacterState;
  addXp: (amount: number) => void;

  // New (period-based)
  applyPeriodXp: (periodStartISO: string, amount: number) => boolean;
  resetPeriodLock: () => void;

  // Back-compat (legacy weekly API)
  applyWeeklyXp: (weekStartISO: string, amount: number) => boolean;
  resetWeeklyLock: () => void;
};

const CharacterContext = createContext<Store | null>(null);

function xpToNext(level: number) {
  // 간단한 성장 곡선 (나중에 조정)
  return 100 + (level - 1) * 40;
}

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [character, setCharacter] = useState<CharacterState>({
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    lastAppliedPeriodStartISO: undefined,
  });

  const addXp: Store["addXp"] = (amount) => {
    if (amount <= 0) return;

    setCharacter((prev) => {
      let level = prev.level;
      let xp = prev.xp + amount;
      let next = xpToNext(level);

      while (xp >= next) {
        xp -= next;
        level += 1;
        next = xpToNext(level);
      }

      return { ...prev, level, xp, xpToNext: next };
    });
  };

  const applyPeriodXp: Store["applyPeriodXp"] = (periodStartISO, amount) => {
    if (!periodStartISO || amount <= 0) return false;

    let applied = false;

    setCharacter((prev) => {
      if (prev.lastAppliedPeriodStartISO === periodStartISO) {
        applied = false;
        return prev;
      }

      let level = prev.level;
      let xp = prev.xp + amount;
      let next = xpToNext(level);

      while (xp >= next) {
        xp -= next;
        level += 1;
        next = xpToNext(level);
      }

      applied = true;
      return {
        ...prev,
        level,
        xp,
        xpToNext: next,
        lastAppliedPeriodStartISO: periodStartISO,
      };
    });

    return applied;
  };

  // Back-compat
  const applyWeeklyXp: Store["applyWeeklyXp"] = (weekStartISO, amount) => {
    return applyPeriodXp(weekStartISO, amount);
  };

  const resetPeriodLock: Store["resetPeriodLock"] = () => {
    setCharacter((prev) => ({ ...prev, lastAppliedPeriodStartISO: undefined }));
  };

  // Back-compat
  const resetWeeklyLock: Store["resetWeeklyLock"] = () => {
    resetPeriodLock();
  };

  const store = useMemo<Store>(
    () => ({
      character,
      addXp,
      applyPeriodXp,
      resetPeriodLock,
      applyWeeklyXp,
      resetWeeklyLock,
    }),
    [character]
  );

  return React.createElement(
    CharacterContext.Provider,
    { value: store },
    children
  );
}

export function useCharacter() {
  const ctx = useContext(CharacterContext);
  if (!ctx)
    throw new Error("useCharacter must be used within CharacterProvider");
  return ctx;
}
