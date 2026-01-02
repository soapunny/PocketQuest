import { type TextStyle, type ViewStyle } from "react-native";

export const ScreenTitle: TextStyle = {
  fontSize: 28,
  fontWeight: "900",
  color: "#111",
};

export const ScreenSubtitle: TextStyle = {
  marginTop: 4,
  fontSize: 13,
  color: "#666",
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
  // Section header should be clearly visible but not compete with ScreenTitle.
  section: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111",
  },
  description: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: "#666",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },
  fieldHelp: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: "#666",
  },

  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    width: "100%", // 명시적으로 전체 너비를 차지하도록 설정
    alignSelf: "stretch", // 부모 View의 padding을 고려하여 너비 조정
  },

  sectionGap: { marginTop: 16 },
  fieldGap: { marginTop: 14 },

  // Aliases
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    letterSpacing: 0.2,
  },
  // Use this when you need a smaller one-line subtitle under a section header.
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: "#666",
  },
  descriptionText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: "#666",
  },
  fieldHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: "#666",
  },
};
