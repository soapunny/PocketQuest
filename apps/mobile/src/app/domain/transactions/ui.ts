// apps/mobile/src/app/domain/transactions/ui.ts

import { TxType } from "../../../../../../packages/shared/src/transactions/types";

export function typeUI(t: TxType) {
  if (t === "EXPENSE") {
    return {
      label: "EXPENSE",
      pillBg: "#FFF1F2",
      pillText: "#B42318",
      border: "#FEE4E2",
      accent: "#F04438",
    };
  }

  if (t === "INCOME") {
    return {
      label: "INCOME",
      pillBg: "#ECFDF3",
      pillText: "#067647",
      border: "#D1FADF",
      accent: "#12B76A",
    };
  }

  return {
    label: "SAVING",
    pillBg: "#EFF8FF",
    pillText: "#175CD3",
    border: "#D1E9FF",
    accent: "#2E90FA",
  };
}
