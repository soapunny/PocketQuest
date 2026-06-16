import { type TextStyle, type ViewStyle } from "react-native";
import { Colors, FontSize, FontWeight, Radius, Spacing } from "../theme";

export const ScreenTitle: TextStyle = {
  fontSize: FontSize["4xl"],
  fontWeight: FontWeight.black,
  color: Colors.ink,
};

export const ScreenSubtitle: TextStyle = {
  marginTop: Spacing.xs,
  fontSize: FontSize.base,
  color: Colors.gray600,
};

//
// CardSpacing is a small design token set for spacing + typography.
// IMPORTANT: Some screens may still reference older property names.
// To avoid breaking changes, we keep aliases (sectionHeader, descriptionText, etc.).
//

type CardSpacingStyles = {
  // Text
  section: TextStyle; // Cashflow / Budget / Savings 같은 섹션 제목
  sectionTitle: TextStyle; // 카드 내부 소제목 (By goal 등)
  cardTitle: TextStyle; // 카드 타이틀
  description: TextStyle; // 설명/헬프 텍스트
  fieldLabel: TextStyle; // Type / Amount 같은 필드 라벨
  fieldHelp: TextStyle; // 필드 아래 도움말

  // View
  card: ViewStyle; // 카드 컨테이너 공통
  sectionGap: ViewStyle; // 섹션 간 간격
  fieldGap: ViewStyle; // 필드 간 간격

  // ---- Backwards-compatible aliases (do not remove) ----
  sectionHeader: TextStyle;
  sectionSubtitle: TextStyle;
  descriptionText: TextStyle;
  fieldHeader: TextStyle;
  fieldHint: TextStyle;
};

export const CardSpacing: CardSpacingStyles = {
  section: {
    marginTop: Spacing["4xl"],
    marginBottom: Spacing.lg,
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.ink,
  },
  description: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 16,
    color: Colors.gray600,
  },
  fieldLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  fieldHelp: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 16,
    color: Colors.gray600,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: Colors.gray100,
    width: "100%",
    alignSelf: "stretch",
    // iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    // Android
    elevation: 2,
  },

  sectionGap: { marginTop: Spacing["3xl"] },
  fieldGap: { marginTop: Spacing["2xl"] },

  // Aliases (keep for backwards compatibility — do not remove)
  sectionHeader: {
    marginTop: Spacing["4xl"],
    marginBottom: Spacing.lg,
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: FontSize.sm,
    lineHeight: 16,
    color: Colors.gray600,
  },
  descriptionText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 16,
    color: Colors.gray600,
  },
  fieldHeader: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  fieldHint: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    lineHeight: 16,
    color: Colors.gray600,
  },
};
