-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currency" "CurrencyCode" NOT NULL DEFAULT 'USD',
ADD COLUMN     "language" "LanguageCode" NOT NULL DEFAULT 'en';
