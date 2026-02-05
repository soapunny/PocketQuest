// apps/mobile/src/app/screens/ProfileImageModal.tsx

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

// UI components
import LoadingButton from "../components/LoadingButton";

import { useAuthStore } from "../store/authStore";
import { usePlan } from "../store/planStore";

type RouteParams = {
  profileImageUri?: string | null;
  profileName?: string;
};

export default function ProfileImageModal() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const supaUser = session?.user ?? null;
  const meta = (supaUser?.user_metadata as any) ?? {};
  const { language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const routeParams = (route.params || {}) as RouteParams;

  const baseProfileImageUri = meta.avatar_url || meta.picture || null;

  const initialProfileImageUri =
    routeParams.profileImageUri || baseProfileImageUri || null;

  const [draftProfileImageUri, setDraftProfileImageUri] = useState<
    string | null
  >(() => initialProfileImageUri);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const isDirty =
    (draftProfileImageUri || null) !== (initialProfileImageUri || null);

  const applyButtonStyle = StyleSheet.flatten([
    styles.headerButton,
    !isDirty ? styles.headerButtonDisabled : null,
  ]);

  const email = supaUser?.email ?? "";
  const derivedName = String(
    meta.full_name ?? meta.name ?? (email ? email.split("@")[0] : "")
  );
  const profileName = routeParams.profileName || derivedName || "User";

  const handleChangeImage = async () => {
    if (isLoading) return; // 중복 클릭 방지

    setIsLoading(true);
    try {
      // 권한 요청
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setIsLoading(false);
          Alert.alert(
            tr("Permission required", "권한 필요"),
            tr(
              "Sorry, we need camera roll permissions to change your profile picture!",
              "프로필 사진을 변경하려면 사진 라이브러리 권한이 필요해요!"
            )
          );
          return;
        }
      }

      // 이미지 선택 옵션
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setDraftProfileImageUri(uri);
      }
    } catch (error) {
      console.error("이미지 선택 중 오류:", error);
      Alert.alert(
        tr("Error", "오류"),
        tr(
          "Failed to select image. Please try again.",
          "이미지 선택에 실패했어요. 다시 시도해주세요."
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (isLoading || isApplying) return;
    setDraftProfileImageUri(baseProfileImageUri || null);
  };

  const handleApply = async () => {
    if (isApplying || isLoading) return;
    if (!isDirty) {
      navigation.goBack();
      return;
    }

    setIsApplying(true);
    try {
      const next = draftProfileImageUri || null;
      const base = baseProfileImageUri || null;

      // If user applies the base avatar (metadata) or clears, remove local override.
      if (!next || next === base) {
        await AsyncStorage.removeItem("pq_profile_image_uri");
      } else {
        await AsyncStorage.setItem("pq_profile_image_uri", next);
      }
      navigation.goBack();
    } catch (e) {
      console.error("[ProfileImageModal] apply failed", e);
      Alert.alert(
        tr("Error", "오류"),
        tr(
          "Failed to apply changes. Please try again.",
          "변경사항 반영에 실패했어요. 다시 시도해주세요."
        )
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 상단 버튼들 */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            paddingBottom: 8,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>✕</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <LoadingButton
            onPress={handleReset}
            isLoading={false}
            title={tr("Reset", "초기화")}
            style={StyleSheet.flatten([
              styles.headerButton,
              styles.headerButtonSecondary,
              !isDirty ? styles.headerButtonDisabled : null,
            ])}
            textStyle={styles.headerButtonText}
            loadingColor="white"
          />
          <LoadingButton
            onPress={handleChangeImage}
            isLoading={isLoading}
            title={tr("Change", "변경")}
            style={styles.headerButton}
            textStyle={styles.headerButtonText}
            loadingColor="white"
          />
          <LoadingButton
            onPress={handleApply}
            isLoading={isApplying}
            title={tr("Apply", "반영")}
            style={applyButtonStyle}
            textStyle={styles.headerButtonText}
            loadingColor="white"
          />
        </View>
      </View>

      {/* 이미지 영역 */}
      <View style={styles.imageContainer}>
        {draftProfileImageUri ? (
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: draftProfileImageUri }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {profileName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerButtonText: {
    color: "white",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  headerButtonSecondary: {
    opacity: 0.9,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapper: {
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 80,
    fontWeight: "700",
    color: "#666",
  },
});
