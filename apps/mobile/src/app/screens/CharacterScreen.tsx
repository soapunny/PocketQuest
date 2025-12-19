import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";

import ConfettiCannon from "react-native-confetti-cannon";
import * as Haptics from "expo-haptics";

import { useCharacter } from "../lib/characterStore";
import { usePlan } from "../lib/planStore";
import { useTransactions } from "../lib/transactionsStore";
import {
  computePlanProgressPercent,
  getPlanPeriodRange,
} from "../lib/planProgress";
import CharacterAvatar from "../components/CharacterAvatar";

function stageFromLevel(level: number) {
  if (level >= 10) return "Legend";
  if (level >= 6) return "Knight";
  if (level >= 3) return "Adventurer";
  return "Beginner";
}

export default function CharacterScreen() {
  const { character, applyPeriodXp, addXp, resetPeriodLock } = useCharacter();
  const { plan } = usePlan();
  const { transactions } = useTransactions();

  const { startISO: periodStartISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan]
  );

  const periodLabel =
    type === "MONTHLY"
      ? "This month"
      : type === "BIWEEKLY"
      ? "This 2 weeks"
      : "This week";

  const progressPercent = useMemo(() => {
    return computePlanProgressPercent(plan, transactions);
  }, [plan, transactions]);

  const stage = stageFromLevel(character.level);

  // 0~100% -> base 0~120 XP per week, scaled by period length
  const periodMultiplier = type === "MONTHLY" ? 4 : type === "BIWEEKLY" ? 2 : 1;
  const periodXpCap = 120 * periodMultiplier;
  const periodXp = Math.min(
    periodXpCap,
    Math.round(progressPercent * 1.2 * periodMultiplier)
  );

  const xpColor =
    stage === "Legend"
      ? "#FFD54A"
      : stage === "Knight"
      ? "#7A8CFF"
      : stage === "Adventurer"
      ? "#2BB673"
      : "black";

  const prevLevelRef = useRef(character.level);
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    if (character.level > prevLevelRef.current) {
      setShowLevelUp(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );

      prevLevelRef.current = character.level;

      const t = setTimeout(() => setShowLevelUp(false), 1800);
      return () => clearTimeout(t);
    }

    prevLevelRef.current = character.level;
  }, [character.level]);

  const barWidthPercent =
    character.xpToNext > 0
      ? Math.round((character.xp / character.xpToNext) * 100)
      : 0;

  const alreadyAppliedThisPeriod =
    character.lastAppliedPeriodStartISO === periodStartISO;

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
      {showLevelUp && (
        <ConfettiCannon
          count={140}
          fallSpeed={280}
          fadeOut
          origin={{ x: 180, y: 0 }}
        />
      )}
      {showLevelUp && (
        <View
          style={{
            alignSelf: "center",
            marginTop: 8,
            marginBottom: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: "black",
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>LEVEL UP!</Text>
        </View>
      )}
      <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 6 }}>
        Character
      </Text>

      <View style={{ alignItems: "center", marginBottom: 16 }}>
        <CharacterAvatar stage={stage as any} size={220} flashy={showLevelUp} />
      </View>

      <Text style={{ color: "#666", marginBottom: 16 }}>Stage: {stage}</Text>

      <Text style={{ fontSize: 16, fontWeight: "700" }}>
        Level {character.level}
      </Text>

      <Text style={{ marginTop: 6, marginBottom: 8, color: "#666" }}>
        XP: {character.xp} / {character.xpToNext}
      </Text>

      {/* XP Bar */}
      <View style={{ height: 12, borderRadius: 999, backgroundColor: "#eee" }}>
        <View
          style={{
            height: 12,
            borderRadius: 999,
            width: `${barWidthPercent}%`,
            backgroundColor: xpColor,
          }}
        />
      </View>

      <View style={{ height: 24 }} />

      <Text style={{ fontWeight: "700", marginBottom: 4 }}>
        {periodLabel} progress: {progressPercent}% → +{periodXp} XP
      </Text>
      {alreadyAppliedThisPeriod && (
        <Text style={{ color: "#666", marginBottom: 8 }}>
          XP already applied for this period.
        </Text>
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {}
          );
          applyPeriodXp(periodStartISO, periodXp);
        }}
        disabled={alreadyAppliedThisPeriod}
        style={{
          height: 48,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: alreadyAppliedThisPeriod ? "#999" : "black",
        }}
      >
        <Text style={{ color: "white", fontWeight: "800" }}>
          {alreadyAppliedThisPeriod
            ? "Applied for this period"
            : "Apply Period XP"}
        </Text>
      </Pressable>
      {__DEV__ ? (
        <>
          <View style={{ height: 12 }} />

          <Pressable
            onPress={() => addXp(50)}
            style={{
              height: 44,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#222",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              DEV: +50 XP
            </Text>
          </Pressable>

          <View style={{ height: 10 }} />

          <Pressable
            onPress={() => resetPeriodLock()}
            style={{
              height: 44,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#555",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>
              DEV: Reset Period Lock
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
