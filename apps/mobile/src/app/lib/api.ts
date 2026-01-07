// API client for mobile app

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  // Get token from storage (will be stored by authStore)
  // For now, we'll pass token via headers from the caller
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, error.error || "Request failed", error);
  }

  return response.json();
}

// Auth API
export const authApi = {
  signIn: async (data: {
    provider: "google" | "kakao";
    providerId: string;
    email: string;
    name: string;
    profileImageUri?: string | null;
  }) => {
    return request<{ token: string; user: any }>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// Transactions API
export const transactionsApi = {
  getAll: async (token: string) => {
    return request<any[]>("/api/transactions", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  create: async (token: string, data: any) => {
    return request<any>("/api/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
  update: async (token: string, id: string, data: any) => {
    return request<any>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
  delete: async (token: string, id: string) => {
    return request<{ success: boolean }>(`/api/transactions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

// Plans API
export const plansApi = {
  get: async (token: string) => {
    return request<any>("/api/plans", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  update: async (token: string, data: any) => {
    return request<any>("/api/plans", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
  budgetGoals: {
    getAll: async (token: string) => {
      return request<any[]>("/api/plans/budget-goals", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    upsert: async (
      token: string,
      data: { category: string; limitMinor: number }
    ) => {
      return request<any>("/api/plans/budget-goals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    },
  },
  savingsGoals: {
    getAll: async (token: string) => {
      return request<any[]>("/api/plans/savings-goals", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (
      token: string,
      data: { name: string; targetMinor: number }
    ) => {
      return request<any>("/api/plans/savings-goals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    },
    delete: async (token: string, id: string) => {
      return request<{ success: boolean }>(
        `/api/plans/savings-goals?id=${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    },
  },
};

// User API
export const userApi = {
  getMe: async (token: string) => {
    return request<any>("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  updateMe: async (
    token: string,
    data: { name?: string; profileImageUri?: string | null }
  ) => {
    return request<any>("/api/users/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
};

// Character API
export const characterApi = {
  get: async (token: string) => {
    return request<any>("/api/character", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};








