// apps/mobile/src/app/domain/i18n.ts

export function makeTr(language: string | null | undefined) {
  const isKo = language === "ko";
  return (en: string, ko: string) => (isKo ? ko : en);
}
