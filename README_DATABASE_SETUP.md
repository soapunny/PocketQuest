# Database Setup Guide

이 가이드는 Supabase와 Prisma를 연동하는 방법을 설명합니다.

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 로그인
2. "New Project" 클릭
3. 프로젝트 이름, 데이터베이스 비밀번호 설정
4. 지역 선택 (가장 가까운 지역 권장)
5. 프로젝트 생성 완료 대기 (약 2분)

## 2. 데이터베이스 연결 정보 가져오기

1. Supabase 대시보드에서 프로젝트 선택
2. Settings → Database 이동
3. "Connection string" 섹션에서 "URI" 선택
4. 연결 문자열 복사 (예: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`)

## 3. 환경 변수 설정

### Prisma 환경 변수

프로젝트 루트에 `.env` 파일 생성:

```bash
cp prisma/.env.example prisma/.env
```

`prisma/.env` 파일에서 `DATABASE_URL`을 Supabase 연결 문자열로 업데이트:

```
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST].supabase.co:5432/postgres?schema=public"
```

### 서버 환경 변수

`apps/server/.env.local` 파일 생성:

```bash
cp apps/server/.env.example apps/server/.env.local
```

다음 내용 입력:

```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST].supabase.co:5432/postgres?schema=public"
JWT_SECRET="your-random-secret-key-here-change-in-production"
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

**JWT_SECRET 생성 방법:**
```bash
openssl rand -base64 32
```

## 4. Prisma 마이그레이션 실행

프로젝트 루트에서 실행:

```bash
# Prisma Client 생성
pnpm --filter prisma prisma generate

# 데이터베이스 마이그레이션 실행
pnpm --filter prisma prisma migrate dev --name init
```

또는:

```bash
cd prisma
npx prisma generate
npx prisma migrate dev --name init
```

## 5. 확인

Prisma Studio로 데이터베이스 확인:

```bash
pnpm --filter prisma prisma studio
```

또는:

```bash
cd prisma
npx prisma studio
```

## 6. 서버 실행

```bash
# 개발 서버 실행
pnpm dev:server

# 또는
cd apps/server
pnpm dev
```

API 서버는 `http://localhost:3001`에서 실행됩니다.

## 문제 해결

### 연결 오류

- `DATABASE_URL`이 올바른지 확인
- Supabase 프로젝트가 완전히 생성되었는지 확인
- 방화벽/IP 제한이 없는지 확인 (Supabase Settings → Database → Connection pooling)

### 마이그레이션 오류

- 데이터베이스가 비어있는지 확인
- Prisma schema가 올바른지 확인
- Supabase 데이터베이스가 준비되었는지 확인

