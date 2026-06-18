import { normalizeApiUrl, redactToken } from "./config.js";
import type { Logger } from "./logger.js";

export interface Credentials {
  apiUrl: string;
  apiToken: string;
}

/** Что именно нужно запросить у пользователя. */
export interface CredentialNeed {
  url: boolean;
  token: boolean;
}

/**
 * Функция интерактивного запроса кредов у пользователя (через MCP elicitation).
 * Возвращает введённые значения или null, если пользователь отказался / клиент
 * не поддерживает elicitation.
 */
export type CredentialElicitor = (
  need: CredentialNeed
) => Promise<{ api_url?: string; api_token?: string } | null>;

const MISSING_MESSAGE =
  "Не заданы учётные данные Kaiten. Укажите KAITEN_API_URL и KAITEN_API_TOKEN " +
  "(в .env или в конфиге MCP-сервера), либо используйте клиент с поддержкой " +
  "интерактивного запроса (elicitation), чтобы ввести их при обращении.";

/**
 * Хранит учётные данные Kaiten и при необходимости запрашивает недостающие
 * интерактивно. Полученные значения кэшируются на время жизни процесса
 * (нигде не сохраняются на диск).
 */
export class CredentialsProvider {
  private apiUrl?: string;
  private apiToken?: string;
  private elicitor?: CredentialElicitor;
  private pending?: Promise<void>;

  constructor(
    initial: { apiUrl?: string; apiToken?: string },
    private readonly logger: Logger
  ) {
    this.apiUrl = initial.apiUrl;
    this.apiToken = initial.apiToken;
  }

  /** Подключает интерактивный запрос (вызывается после создания MCP-сервера). */
  setElicitor(elicitor: CredentialElicitor): void {
    this.elicitor = elicitor;
  }

  /** Есть ли полный набор кредов прямо сейчас (без запроса). */
  get hasCredentials(): boolean {
    return Boolean(this.apiUrl && this.apiToken);
  }

  /**
   * Возвращает креды, при необходимости запрашивая недостающие у пользователя.
   * Параллельные вызовы переиспользуют один и тот же запрос (не спрашиваем дважды).
   */
  async get(): Promise<Credentials> {
    if (this.apiUrl && this.apiToken) {
      return { apiUrl: this.apiUrl, apiToken: this.apiToken };
    }

    if (this.elicitor) {
      if (!this.pending) {
        this.pending = this.elicitOnce().finally(() => {
          this.pending = undefined;
        });
      }
      await this.pending;
    }

    if (this.apiUrl && this.apiToken) {
      return { apiUrl: this.apiUrl, apiToken: this.apiToken };
    }
    throw new Error(MISSING_MESSAGE);
  }

  private async elicitOnce(): Promise<void> {
    if (!this.elicitor) return;
    const need: CredentialNeed = { url: !this.apiUrl, token: !this.apiToken };
    this.logger.info("Запрашиваю учётные данные Kaiten у пользователя (elicitation)", need);

    const result = await this.elicitor(need);
    if (!result) {
      this.logger.warn("Интерактивный запрос кредов не дал результата (отказ или нет поддержки)");
      return;
    }

    if (result.api_url && result.api_url.trim()) {
      this.apiUrl = normalizeApiUrl(result.api_url);
    }
    if (result.api_token && result.api_token.trim()) {
      this.apiToken = result.api_token.trim();
    }

    if (this.apiUrl && this.apiToken) {
      this.logger.info("Учётные данные Kaiten получены", {
        apiUrl: this.apiUrl,
        token: redactToken(this.apiToken),
      });
    }
  }
}
