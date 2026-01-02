import { useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, Alert, Platform } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../lib/authStore";
import { usePlan } from "../lib/planStore";
import LoadingButton from "../components/LoadingButton";

type RouteParams = {
  profileImageUri?: string | null;
  profileName?: string;
};

export default function ProfileImageModal() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const routeParams = (route.params || {}) as RouteParams;
  const [profileImageUri, setProfileImageUri] = useState<string | null>(
    routeParams.profileImageUri || user?.profileImageUri || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const profileName = routeParams.profileName || user?.name || "User";

  const handleChangeImage = async () => {
    if (isLoading) return; // 중복 클릭 방지

    setIsLoading(true);
    try {
      // 권한 요청
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
        setProfileImageUri(uri);
        // authStore에 프로필 이미지 업데이트
        updateUser({ profileImageUri: uri });
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
        <LoadingButton
          onPress={handleChangeImage}
          isLoading={isLoading}
          title={tr("Change", "변경")}
          style={styles.headerButton}
          textStyle={styles.headerButtonText}
          loadingColor="white"
        />
      </View>

      {/* 이미지 영역 */}
      <View style={styles.imageContainer}>
        {profileImageUri ? (
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: profileImageUri }}
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

