import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useAuth } from "../lib/authStore";
import { usePlan } from "../lib/planStore";
import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import LoadingButton from "../components/LoadingButton";
import { CardSpacing } from "../components/Typography";
import ScreenCard from "../components/layout/ScreenCard";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isKakaoLoading, setIsKakaoLoading] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const handleGoogleLogin = async () => {
    if (isGoogleLoading || isKakaoLoading) return;

    setIsGoogleLoading(true);
    try {
      // TODO: 실제 Google 로그인 구현
      // 현재는 임시 사용자 데이터로 로그인
      const mockUser = {
        id: "google_" + Date.now(),
        email: "user@gmail.com",
        name: "Google User",
        profileImageUri: null,
        provider: "google" as const,
      };

      await signIn(mockUser, keepSignedIn);
    } catch (error) {
      console.error("Google login failed:", error);
      // TODO: 에러 처리 (Alert 등)
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    if (isGoogleLoading || isKakaoLoading) return;

    setIsKakaoLoading(true);
    try {
      // TODO: 실제 카카오 로그인 구현
      // 현재는 임시 사용자 데이터로 로그인
      const mockUser = {
        id: "kakao_" + Date.now(),
        email: "user@kakao.com",
        name: "카카오 사용자",
        profileImageUri: null,
        provider: "kakao" as const,
      };

      await signIn(mockUser, keepSignedIn);
    } catch (error) {
      console.error("Kakao login failed:", error);
      // TODO: 에러 처리 (Alert 등)
    } finally {
      setIsKakaoLoading(false);
    }
  };

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Welcome", "환영합니다")}
          subtitle={tr("Sign in to continue", "로그인하여 계속하세요")}
        />
      }
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
      }}
    >
      <ScreenCard>
        <Text style={CardSpacing.cardTitle}>
          {tr("Sign In", "로그인")}
        </Text>
        <Text style={CardSpacing.description}>
          {tr(
            "Choose a sign-in method to get started",
            "시작하려면 로그인 방법을 선택하세요"
          )}
        </Text>

        <View style={styles.buttonContainer}>
          <LoadingButton
            onPress={handleGoogleLogin}
            isLoading={isGoogleLoading}
            disabled={isKakaoLoading}
            title={tr("Continue with Google", "구글로 계속하기")}
            style={styles.loginButton}
            textStyle={styles.loginButtonText}
            loadingColor="#4285F4"
            disabledStyle={styles.buttonDisabled}
          />

          <LoadingButton
            onPress={handleKakaoLogin}
            isLoading={isKakaoLoading}
            disabled={isGoogleLoading}
            title={tr("Continue with Kakao", "카카오로 계속하기")}
            style={[styles.loginButton, styles.kakaoButton]}
            textStyle={[styles.loginButtonText, styles.kakaoButtonText]}
            loadingColor="#FEE500"
            disabledStyle={styles.buttonDisabled}
          />
        </View>

        <Pressable
          onPress={() => setKeepSignedIn(!keepSignedIn)}
          style={styles.keepSignedInContainer}
        >
          <View
            style={[
              styles.checkbox,
              keepSignedIn && styles.checkboxChecked,
            ]}
          >
            {keepSignedIn && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.keepSignedInText}>
            {tr("Keep me signed in", "로그인 상태 유지")}
          </Text>
        </Pressable>
      </ScreenCard>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  loginButton: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#4285F4",
    justifyContent: "center",
    alignItems: "center",
  },
  kakaoButton: {
    backgroundColor: "#FEE500",
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  kakaoButtonText: {
    color: "#000000",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  keepSignedInContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  checkboxChecked: {
    backgroundColor: "#4285F4",
    borderColor: "#4285F4",
  },
  checkmark: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  keepSignedInText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});










