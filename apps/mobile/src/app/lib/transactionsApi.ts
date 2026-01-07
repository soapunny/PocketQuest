// Centralized helper for talking to the Transactions API from the mobile app.
// 화면단(TransactionsScreen 등)에서는 직접 fetch를 쓰지 말고
// 여기 있는 함수들만 사용하면, URL/쿼리/응답 구조를 이 파일 하나에서 관리할 수 있어요.

// TODO: 실제 배포 환경에 맞게 EXPO_PUBLIC_API_BASE_URL을 설정해 주세요.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// 서버와 공유하는 기본 타입들.
// (필요에 따라 나중에 서버 측 타입 선언과 공유하도록 리팩터링할 수 있습니다.)
export type TxType = "EXPENSE" | "INCOME" | "SAVING";
export type CurrencyCode = "USD" | "KRW";

// 서버 /api/transactions 응답의 개별 Transaction 레코드 형태.
// Prisma Transaction 모델과 대응됩니다.
export interface TransactionDTO {
  id: string;
  userId: string;
  type: TxType;
  amountMinor: number;
  currency: CurrencyCode;
  fxUsdKrw?: number | null;
  category: string;
  occurredAt: string; // ISO string
  note?: string | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// 서버 summary 필드 구조(합계, 개수, 비율 등).
export interface TransactionSummary {
  incomeMinor: number;
  expenseMinor: number;
  savingMinor: number;
  incomeCount: number;
  expenseCount: number;
  savingCount: number;
  cashflowMinor: number;
  incomeSharePercent: number | null;
  expenseSharePercent: number | null;
  savingSharePercent: number | null;
}

// fetchTransactions의 반환 타입
// 서버의 전체 응답을 그대로 감싸되, 화면에서 쓰기 쉽게 타입을 붙여둡니다.
export interface FetchTransactionsResult {
  transactions: TransactionDTO[];
  count: number;
  summary: TransactionSummary | null;
  filter: {
    range: "THIS_MONTH" | "LAST_MONTH" | "ALL";
    timeZone: string;
    periodStartUTC: string | null;
    periodEndUTC: string | null;
  } | null;
}

// 클라이언트에서 사용할 쿼리 파라미터 타입.
export interface FetchTransactionsParams {
  range?: "THIS_MONTH" | "LAST_MONTH" | "ALL";
  includeSummary?: boolean;
}

// 모바일 앱에서 서버로 새 트랜잭션을 생성할 때 사용하는 입력 타입.
// 서버에서는 userId를 인증/DEV_USER_ID로 채우므로 여기에는 포함하지 않습니다.
export interface CreateTransactionInput {
  type: TxType;
  amountMinor: number; // 항상 0 이상 (지출/수입/저축은 type으로 구분)
  currency: CurrencyCode;
  fxUsdKrw?: number;
  category: string;
  occurredAtISO: string; // 클라이언트에서 ISO 문자열로 보냄
  note?: string;
}

/**
 * 서버에 새 트랜잭션을 생성합니다.
 *
 * 사용 예:
 *   await createTransaction({
 *     type: "EXPENSE",
 *     amountMinor: 500,
 *     currency: "USD",
 *     category: "Groceries",
 *     occurredAtISO: new Date().toISOString(),
 *     note: "coffee",
 *   });
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<TransactionDTO> {
  const res = await fetch(`${API_BASE_URL}/api/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    console.warn(
      "[transactionsApi] failed to create transaction",
      res.status,
      res.statusText
    );
    throw new Error("Failed to create transaction");
  }

  const json: any = await res.json();

  // 서버가 { transaction: {...} } 형태로 반환하거나
  // 바로 트랜잭션 객체를 반환하는 경우를 모두 대응.
  if (json && typeof json === "object" && "transaction" in json) {
    return json.transaction as TransactionDTO;
  }

  return json as TransactionDTO;
}

/**
 * 내부용 쿼리 문자열 빌더.
 */
function buildQuery(params: FetchTransactionsParams = {}): string {
  const search = new URLSearchParams();

  if (params.range) {
    search.set("range", params.range);
  }
  if (params.includeSummary) {
    search.set("includeSummary", "1");
  }

  // ⚠️ DEV 전용:
  // 서버가 "Unauthorized: pass ?userId=..."라고 알려주므로
  // 로컬 개발 중에는 DB에 존재하는 고정 userId를 붙여서 테스트합니다.
  // 실제 로그인/인증이 붙으면 이 부분은 제거하거나 토큰 기반으로 교체해야 합니다.
  const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;

  if (typeof __DEV__ !== "undefined" && __DEV__ && DEV_USER_ID) {
    search.set("userId", DEV_USER_ID);
  }

  const s = search.toString();
  return s ? `?${s}` : "";
}

/**
 * 서버에서 트랜잭션 목록을 가져오는 함수입니다.
 *
 * 사용 예:
 *   const { transactions, summary } = await fetchTransactions({
 *     range: "THIS_MONTH",
 *     includeSummary: true,
 *   });
 */
export async function fetchTransactions(
  params: FetchTransactionsParams = {}
): Promise<FetchTransactionsResult> {
  const query = buildQuery(params);

  const res = await fetch(`${API_BASE_URL}/api/transactions${query}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    console.warn(
      "[transactionsApi] failed to fetch transactions",
      res.status,
      res.statusText
    );
    throw new Error("Failed to fetch transactions");
  }

  const json: any = await res.json();

  return {
    transactions: Array.isArray(json.transactions)
      ? (json.transactions as TransactionDTO[])
      : [],
    count: typeof json.count === "number" ? json.count : 0,
    summary: (json.summary as TransactionSummary | null) ?? null,
    filter: json.filter ?? null,
  };
}
