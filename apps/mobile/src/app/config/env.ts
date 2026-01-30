// apps/mobile/src/app/config/env.ts

//EXPO_PUBLIC_API_URL=http://10.0.0.68:3001
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001"; // fallback (dev)

// 실기기(Expo Go)면: http://192.168.x.x:3001

export const DEV_USER_ID =
  process.env.EXPO_PUBLIC_DEV_USER_ID || "cmjw3lb0d000076zuddg5lo6o";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
