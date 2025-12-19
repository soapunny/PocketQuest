import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, Text, View } from "react-native";

type Stage = "Beginner" | "Adventurer" | "Knight" | "Legend";

type Props = {
  stage: Stage;
  size?: number;
  flashy?: boolean; // 레벨업 순간
};

function starsForStage(stage: Stage) {
  switch (stage) {
    case "Legend":
      return 3;
    case "Knight":
      return 2;
    case "Adventurer":
      return 1;
    default:
      return 0;
  }
}

function badgeForStage(stage: Stage) {
  switch (stage) {
    case "Legend":
      return "👑";
    case "Knight":
      return "🛡️";
    case "Adventurer":
      return "🎒";
    default:
      return "🌱";
  }
}

export default function CharacterAvatar({ stage, size = 220, flashy }: Props) {
  const source = useMemo(() => {
    switch (stage) {
      case "Legend":
        return require("../../../assets/characters/cat_legend.png");
      case "Knight":
        return require("../../../assets/characters/cat_knight.png");
      case "Adventurer":
        return require("../../../assets/characters/cat_adventurer.png");
      default:
        return require("../../../assets/characters/cat_beginner.png");
    }
  }, [stage]);

  // RN 기본 Animated로 팝(Scale) 효과
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!flashy) return;

    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.08,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flashy, scale]);

  const stars = starsForStage(stage);
  const badge = badgeForStage(stage);

  const ringColor =
    stage === "Legend" ? "#FFD54A" : stage === "Knight" ? "#B8C7FF" : "#ddd";

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale }],
      }}
    >
      {/* 배경 카드 */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: 20,
          backgroundColor: "#f3f3f3",
        }}
      />

      {/* 오라 링 (Legend / Knight / 레벨업 순간) */}
      {(flashy || stage === "Legend" || stage === "Knight") && (
        <View
          style={{
            position: "absolute",
            width: size * 0.98,
            height: size * 0.98,
            borderRadius: 999,
            borderWidth: 4,
            borderColor: ringColor,
            opacity: stage === "Legend" ? 0.95 : 0.8,
          }}
        />
      )}

      {/* 스파클 (레벨업 혹은 레전드일때) */}
      {(flashy || stage === "Legend") && (
        <>
          <Text
            style={{
              position: "absolute",
              top: 10,
              left: 18,
              fontSize: stage === "Legend" ? 16 : 22,
              opacity: stage === "Legend" ? 0.6 : 1,
            }}
          >
            ✨
          </Text>
          <Text
            style={{
              position: "absolute",
              top: 30,
              right: 18,
              fontSize: stage === "Legend" ? 14 : 18,
              opacity: stage === "Legend" ? 0.6 : 1,
            }}
          >
            ✨
          </Text>
          <Text
            style={{
              position: "absolute",
              bottom: 18,
              left: 26,
              fontSize: stage === "Legend" ? 14 : 18,
              opacity: stage === "Legend" ? 0.6 : 1,
            }}
          >
            ✨
          </Text>
        </>
      )}

      {/* 고양이 이미지 */}
      <Image
        source={source}
        style={{ width: size, height: size, resizeMode: "contain" }}
      />

      {/* 왼쪽 위 배지 */}
      <View
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.78)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "800" }}>
          {badge} {stage}
        </Text>
      </View>

      {/* 아래 별 등급 */}
      <View
        style={{
          position: "absolute",
          bottom: 10,
          alignSelf: "center",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.9)",
          borderWidth: 1,
          borderColor: "#ddd",
        }}
      >
        <Text style={{ fontWeight: "800" }}>
          {"★".repeat(stars)}
          {"☆".repeat(3 - stars)}
        </Text>
      </View>
    </Animated.View>
  );
}
