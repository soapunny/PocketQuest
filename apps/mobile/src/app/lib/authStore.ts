import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AuthProvider = "google" | "kakao";

export type User = {
  id: string;
  email: string;
  name: string;
  profileImageUri?: string | null;
  provider: AuthProvider;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  keepSignedIn: boolean;
  isLoading: boolean; // 초기 로그인 상태 확인 중
};

type Store = {
  user: User | null;
  isAuthenticated: boolean;
  keepSignedIn: boolean;
  isLoading: boolean;
  signIn: (user: User, keepSignedIn: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
};

const AUTH_STORAGE_KEY = "@PocketQuest:auth";
const KEEP_SIGNED_IN_KEY = "@PocketQuest:keepSignedIn";

const AuthContext = createContext<Store | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    keepSignedIn: false,
    isLoading: true, // 초기 로딩 상태
  });

  // 앱 시작 시 저장된 인증 정보 복원
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const [authData, keepSignedIn] = await Promise.all([
          AsyncStorage.getItem(AUTH_STORAGE_KEY),
          AsyncStorage.getItem(KEEP_SIGNED_IN_KEY),
        ]);

        if (keepSignedIn === "true" && authData) {
          const user = JSON.parse(authData) as User;
          setAuthState({
            user,
            isAuthenticated: true,
            keepSignedIn: true,
            isLoading: false,
          });
        } else {
          setAuthState({
            user: null,
            isAuthenticated: false,
            keepSignedIn: false,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error("Failed to restore auth state:", error);
        setAuthState({
          user: null,
          isAuthenticated: false,
          keepSignedIn: false,
          isLoading: false,
        });
      }
    };

    restoreAuth();
  }, []);

  const signIn: Store["signIn"] = async (user, keepSignedIn) => {
    try {
      if (keepSignedIn) {
        // keepSignedIn이 true면 AsyncStorage에 저장
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, "true");
      } else {
        // keepSignedIn이 false면 저장하지 않음 (세션만 유지)
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, "false");
      }

      setAuthState({
        user,
        isAuthenticated: true,
        keepSignedIn,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to sign in:", error);
      throw error;
    }
  };

  const signOut: Store["signOut"] = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem(KEEP_SIGNED_IN_KEY);

      setAuthState({
        user: null,
        isAuthenticated: false,
        keepSignedIn: false,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to sign out:", error);
      throw error;
    }
  };

  const updateUser: Store["updateUser"] = (updates) => {
    setAuthState((prev) => {
      if (!prev.user) return prev;

      const updatedUser = { ...prev.user, ...updates };

      // keepSignedIn이 true면 업데이트된 사용자 정보도 저장
      if (prev.keepSignedIn) {
        AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser)).catch(
          (error) => console.error("Failed to update user in storage:", error)
        );
      }

      return {
        ...prev,
        user: updatedUser,
      };
    });
  };

  const store = useMemo<Store>(
    () => ({
      user: authState.user,
      isAuthenticated: authState.isAuthenticated,
      keepSignedIn: authState.keepSignedIn,
      isLoading: authState.isLoading,
      signIn,
      signOut,
      updateUser,
    }),
    [authState]
  );

  return React.createElement(AuthContext.Provider, { value: store }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}







