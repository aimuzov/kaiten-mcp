import axios, { AxiosError, type AxiosInstance, type Method } from "axios";
import type { Config } from "./config.js";
import type { CredentialsProvider } from "./credentials.js";
import type { Logger } from "./logger.js";
import type {
  KaitenBoard,
  KaitenCard,
  KaitenColumn,
  KaitenLane,
  KaitenSpace,
  KaitenUser,
} from "./types.js";

export interface RequestOptions {
  params?: Record<string, unknown>;
  data?: unknown;
}

/** Ошибка обращения к Kaiten API с человекочитаемым сообщением. */
export class KaitenApiError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "KaitenApiError";
    this.status = status;
    this.details = details;
  }
}

/** Простой семафор для ограничения числа одновременных запросов. */
class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.available = max;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available -= 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.available += 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class KaitenClient {
  private http: AxiosInstance;
  private semaphore: Semaphore;
  private logger: Logger;
  private credentials: CredentialsProvider;

  constructor(config: Config, credentials: CredentialsProvider, logger: Logger) {
    this.logger = logger;
    this.credentials = credentials;
    this.semaphore = new Semaphore(config.maxConcurrentRequests);
    // baseURL и Authorization задаются на каждый запрос — креды могут появиться
    // позже (после интерактивного запроса у пользователя).
    this.http = axios.create({
      timeout: config.requestTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    logger.info("Kaiten client initialised", {
      hasCredentials: credentials.hasCredentials,
      maxConcurrent: config.maxConcurrentRequests,
    });
  }

  /** Базовый метод запроса с ретраями и ограничением конкурентности. */
  async request<T = unknown>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    // Гарантируем наличие кредов (при необходимости спросим пользователя)
    // ДО захвата слота семафора, чтобы не блокировать пул на время диалога.
    const { apiUrl, apiToken } = await this.credentials.get();

    const release = await this.semaphore.acquire();
    try {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          this.logger.debug("Kaiten request", { method, path, params: options.params });
          const response = await this.http.request<T>({
            method,
            url: path,
            baseURL: apiUrl,
            headers: { Authorization: `Bearer ${apiToken}` },
            params: options.params,
            data: options.data,
          });
          return response.data;
        } catch (err) {
          const axiosErr = err as AxiosError;
          const status = axiosErr.response?.status;

          if (status && RETRYABLE_STATUSES.has(status) && attempt < MAX_RETRIES) {
            attempt += 1;
            const retryAfterHeader = axiosErr.response?.headers?.["retry-after"];
            const retryAfterMs = retryAfterHeader
              ? Number.parseFloat(String(retryAfterHeader)) * 1000
              : Math.min(2 ** attempt * 250, 5000);
            this.logger.warn("Kaiten request retry", { method, path, status, attempt, retryAfterMs });
            await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : 1000);
            continue;
          }

          throw this.toApiError(axiosErr, method, path);
        }
      }
    } finally {
      release();
    }
  }

  private toApiError(err: AxiosError, method: Method, path: string): KaitenApiError {
    const status = err.response?.status;
    const data = err.response?.data;
    let message = `Kaiten API ${method} ${path} failed`;
    if (status) message += ` (HTTP ${status})`;
    if (data && typeof data === "object") {
      const maybeMessage = (data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error;
      if (typeof maybeMessage === "string") message += `: ${maybeMessage}`;
    } else if (typeof data === "string" && data.length < 500) {
      message += `: ${data}`;
    } else if (err.code === "ECONNABORTED") {
      message += ": таймаут запроса";
    } else if (err.message) {
      message += `: ${err.message}`;
    }
    this.logger.error("Kaiten request failed", { method, path, status });
    return new KaitenApiError(message, status, data);
  }

  // ---- Удобные обёртки над REST-эндпоинтами Kaiten ----

  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  post<T = unknown>(path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, { data, params });
  }

  patch<T = unknown>(path: string, data?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { data });
  }

  put<T = unknown>(path: string, data?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { data });
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // ---- Доменные методы ----

  getCurrentUser(): Promise<KaitenUser> {
    return this.get<KaitenUser>("/users/current");
  }

  listUsers(params?: Record<string, unknown>): Promise<KaitenUser[]> {
    return this.get<KaitenUser[]>("/users", params);
  }

  listSpaces(params?: Record<string, unknown>): Promise<KaitenSpace[]> {
    return this.get<KaitenSpace[]>("/spaces", params);
  }

  getSpace(spaceId: number): Promise<KaitenSpace> {
    return this.get<KaitenSpace>(`/spaces/${spaceId}`);
  }

  listBoards(spaceId: number): Promise<KaitenBoard[]> {
    return this.get<KaitenBoard[]>(`/spaces/${spaceId}/boards`);
  }

  getBoard(boardId: number): Promise<KaitenBoard> {
    return this.get<KaitenBoard>(`/boards/${boardId}`);
  }

  listColumns(boardId: number): Promise<KaitenColumn[]> {
    return this.get<KaitenColumn[]>(`/boards/${boardId}/columns`);
  }

  listLanes(boardId: number): Promise<KaitenLane[]> {
    return this.get<KaitenLane[]>(`/boards/${boardId}/lanes`);
  }

  listCards(params?: Record<string, unknown>): Promise<KaitenCard[]> {
    return this.get<KaitenCard[]>("/cards", params);
  }

  getCard(cardId: number): Promise<KaitenCard> {
    return this.get<KaitenCard>(`/cards/${cardId}`);
  }
}
