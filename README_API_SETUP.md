# 서버 및 데이터베이스 설정 가이드

이 가이드는 PocketQuest 앱의 Next.js 서버와 Supabase 데이터베이스 연동 방법을 설명합니다.

## 📋 목차

1. [필수 패키지 설치](#1-필수-패키지-설치)
2. [Supabase 설정](#2-supabase-설정)
3. [환경 변수 설정](#3-환경-변수-설정)
4. [Prisma 마이그레이션](#4-prisma-마이그레이션)
5. [API 서버 실행](#5-api-서버-실행)

## 1. 필수 패키지 설치

프로젝트 루트에서 실행:

```bash
pnpm install
```

이 명령어는 모든 workspace 패키지를 설치합니다:
- `apps/server` - Next.js 서버
- `apps/mobile` - React Native 앱
- `prisma` - Prisma ORM

## 2. Supabase 설정

### 2.1 Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 로그인
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - **Name**: `pocketquest` (원하는 이름)
   - **Database Password**: 강력한 비밀번호 설정 (나중에 필요)
   - **Region**: 가장 가까운 지역 선택
4. 프로젝트 생성 완료 대기 (약 2분)

### 2.2 데이터베이스 연결 정보 가져오기

1. Supabase 대시보드 → 프로젝트 선택
2. **Settings** → **Database** 이동
3. **Connection string** 섹션에서 **URI** 선택
4. 연결 문자열 복사 (형식: `postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres`)

**참고**: 비밀번호를 `[PASSWORD]`로 표시된 부분에 실제 비밀번호로 교체해야 합니다.

## 3. 환경 변수 설정

### 3.1 서버 환경 변수

`apps/server/.env.local` 파일 생성:

```bash
cd apps/server
cp .env.example .env.local
```

`.env.local` 파일 내용:

```env
# Supabase PostgreSQL 연결 문자열
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres?schema=public"

# JWT 토큰 서명용 비밀키 (랜덤 문자열 생성)
JWT_SECRET="your-random-secret-key-here-change-in-production"

# API 서버 URL
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

**JWT_SECRET 생성 방법:**

```bash
openssl rand -base64 32
```

또는 온라인 도구 사용: https://generate-secret.vercel.app/32

### 3.2 모바일 앱 환경 변수 (선택사항)

모바일 앱에서 API URL을 설정하려면 `apps/mobile/.env` 파일 생성:

```env
EXPO_PUBLIC_API_URL="http://localhost:3001"
```

**참고**: 실제 기기에서 테스트할 경우 로컬 IP 주소 사용:
```env
EXPO_PUBLIC_API_URL="http://192.168.1.xxx:3001"
```

## 4. Prisma 마이그레이션

### 4.1 Prisma Client 생성

```bash
pnpm db:generate
```

또는:

```bash
cd prisma
pnpm prisma generate
```

### 4.2 데이터베이스 마이그레이션

```bash
pnpm db:migrate
```

마이그레이션 이름을 지정하려면:

```bash
cd prisma
pnpm prisma migrate dev --name init
```

이 명령어는:
1. 데이터베이스에 테이블 생성 (User, Transaction, Plan, BudgetGoal, SavingsGoal, Character)
2. 마이그레이션 파일 생성
3. Prisma Client 재생성

### 4.3 데이터베이스 확인 (선택사항)

Prisma Studio로 데이터베이스 확인:

```bash
pnpm db:studio
```

브라우저에서 `http://localhost:5555` 열림

## 5. API 서버 실행

### 5.1 개발 서버 실행

```bash
pnpm dev:server
```

또는:

```bash
cd apps/server
pnpm dev
```

API 서버는 `http://localhost:3001`에서 실행됩니다.

### 5.2 API 테스트

터미널에서 테스트:

```bash
# Health check
curl http://localhost:3001/api/health
```

정상 응답:
```json
{
  "status": "ok",
  "timestamp": "2025-01-XX..."
}
```

## 📁 생성된 파일 구조

```
apps/server/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── auth/
│   │       │   └── sign-in/route.ts
│   │       ├── transactions/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       ├── plans/
│   │       │   ├── route.ts
│   │       │   ├── budget-goals/route.ts
│   │       │   └── savings-goals/route.ts
│   │       ├── character/route.ts
│   │       └── users/
│   │           └── me/route.ts
│   └── lib/
│       ├── prisma.ts
│       └── auth.ts
├── package.json
└── .env.local

prisma/
├── schema.prisma
├── migrations/
└── package.json
```

## 🔐 API 인증

모든 API 엔드포인트는 JWT 토큰 인증을 사용합니다 (health 제외).

요청 헤더:
```
Authorization: Bearer <token>
```

토큰은 `/api/auth/sign-in` 엔드포인트에서 받을 수 있습니다.

## 🐛 문제 해결

### 연결 오류

- `DATABASE_URL`이 올바른지 확인 (비밀번호 포함)
- Supabase 프로젝트가 완전히 생성되었는지 확인
- Supabase Settings → Database → Connection pooling에서 IP 제한 확인

### 마이그레이션 오류

- 데이터베이스가 비어있는지 확인
- Prisma schema 문법 오류 확인
- Supabase 데이터베이스가 준비되었는지 확인

### CORS 오류

- `apps/server/src/middleware.ts`에서 허용된 origin 확인
- 모바일 앱의 API URL이 올바른지 확인

## 📚 다음 단계

1. 모바일 앱에서 API 연동 테스트
2. 실제 소셜 로그인 구현 (Google, Kakao)
3. API 엔드포인트 확장 (필요시)
4. 프로덕션 배포 준비

