// apps/mobile/src/app/lib/config.ts
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001"; // fallback (dev)

export const DEV_USER_ID =
  process.env.EXPO_PUBLIC_DEV_USER_ID || "cmjw3lb0d000076zuddg5lo6o";
