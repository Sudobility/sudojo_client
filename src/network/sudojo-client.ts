import type { NetworkClient, UserInfoResponse } from "@sudobility/types";
import {
  type BadgeDefinition,
  type BadgeDefinitionCreateRequest,
  type BadgeDefinitionUpdateRequest,
  type BaseResponse,
  type ValidateOptions as BaseValidateOptions,
  type Board,
  type BoardCountsByTechniqueData,
  type BoardCountsData,
  type BoardCreateRequest,
  type BoardQueryParams,
  type BoardUpdateRequest,
  type Challenge,
  type ChallengeCreateRequest,
  type ChallengeQueryParams,
  type ChallengeUpdateRequest,
  type Community,
  type CommunityCreateRequest,
  type CommunityQueryParams,
  type CommunityUpdateRequest,
  type Daily,
  type DailyCreateRequest,
  type DailyUpdateRequest,
  type ExampleCountsData,
  type GameFinishRequest,
  type GameFinishResponse,
  type GameStartRequest,
  type GameStartResponse,
  type GamificationStats,
  type GenerateData,
  type GenerateOptions,
  type HealthCheckData,
  type HintAccessDeniedResponse,
  isValidLevel,
  isValidUUID,
  type Learning,
  type LearningCreateRequest,
  type LearningQueryParams,
  type LearningUpdateRequest,
  type Level,
  type LevelCreateRequest,
  type LevelUpdateRequest,
  MAX_LEVEL,
  MIN_LEVEL,
  type OCRExtractData,
  type OcrSource,
  type Optional,
  type PointTransaction,
  type PracticesBulkDeleteData,
  type PracticesRegenerateHintsData,
  type SolveData,
  type SolveOptions,
  type Strategy,
  type StrategyCreateRequest,
  type StrategyUpdateRequest,
  type SubscriptionResult,
  type Technique,
  type TechniqueCreateRequest,
  type TechniqueExample,
  type TechniqueExampleCreateRequest,
  type TechniqueExampleQueryParams,
  type TechniqueExampleUpdateRequest,
  type TechniquePractice,
  type TechniquePracticeCountItem,
  type TechniquePracticeCreateRequest,
  type TechniqueQueryParams,
  type TechniqueUpdateRequest,
  type UpdateStatsData,
  type ValidateData,
  validateUUID,
} from "@sudobility/sudojo_types";
import { HintAccessDeniedError } from "../errors";

// Re-export option types for convenience
export type { SolveOptions, GenerateOptions };

/**
 * Options for `solverValidate`.
 *
 * Extends the sudojo_types `ValidateOptions` with `brutalForce`, which
 * `GET /api/v1/solver/validate` passes through to the solver.
 *
 * TODO(sudojo_types): move `brutalForce` into `ValidateOptions` there.
 */
export type ValidateOptions = BaseValidateOptions & {
  /**
   * Verify uniqueness by brute force. The solver defaults to `true` when the
   * parameter is omitted, so it is only sent when set.
   */
  brutalForce?: boolean | undefined;
};

/**
 * `{ deleted: true }` body returned by `DELETE /api/v1/users/:userId` and
 * `DELETE /api/v1/gamification/badges/:badgeKey`.
 *
 * TODO(sudojo_types): no shared type exists for this response yet.
 */
export interface DeletedData {
  deleted: boolean;
}

/**
 * Optional OAuth provider tokens for `DELETE /api/v1/users/:userId`. When
 * given, the API revokes them while deleting the Firebase user.
 *
 * TODO(sudojo_types): no shared type exists for this request body yet.
 */
export interface DeleteUserRequest {
  googleAccessToken?: string | undefined;
  appleAuthorizationCode?: string | undefined;
}

const assertValidLevel = (level: number): void => {
  if (!isValidLevel(level)) {
    throw new Error(
      `Invalid level: ${level}. Expected ${MIN_LEVEL}-${MAX_LEVEL}`,
    );
  }
};

// =============================================================================
// Solution Decryption
// =============================================================================

let _solutionKey: CryptoKey | null = null;

/**
 * Configure the symmetric key used to decrypt `solution` fields in API responses.
 * Call once at app startup with the hex-encoded 256-bit key.
 * If not called (or called with empty string), encrypted solutions pass through as-is.
 */
export async function configureSolutionKey(keyHex: string): Promise<void> {
  if (!keyHex) return;
  const hexPairs = keyHex.match(/.{2}/g);
  if (!hexPairs) return;
  const keyBytes = new Uint8Array(hexPairs.map((byte) => parseInt(byte, 16)));
  _solutionKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"],
  );
}

async function decryptSolution(encrypted: string): Promise<string> {
  if (!_solutionKey) return encrypted;

  const raw = globalThis.atob(encrypted.slice(4)); // strip "enc:" prefix
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }

  const nonce = bytes.slice(0, 12);
  const ciphertextWithTag = bytes.slice(12);

  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    _solutionKey,
    ciphertextWithTag,
  );

  return new TextDecoder().decode(decrypted);
}

async function decryptSolutionFields(data: unknown): Promise<unknown> {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return Promise.all(data.map((item) => decryptSolutionFields(item)));
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (
        key === "solution" &&
        typeof obj[key] === "string" &&
        (obj[key] as string).startsWith("enc:")
      ) {
        result[key] = await decryptSolution(obj[key] as string);
      } else {
        result[key] = await decryptSolutionFields(obj[key]);
      }
    }
    return result;
  }

  return data;
}

// =============================================================================
// URL Search Params Utility
// =============================================================================

/**
 * Creates a lightweight URL search params builder.
 *
 * This is a custom implementation instead of the standard `URLSearchParams`
 * because the solver API requires a special encoding behavior: **commas must
 * NOT be percent-encoded** in pencilmark values. The standard `URLSearchParams`
 * encodes commas as `%2C`, which the Kotlin-based solver backend does not decode.
 *
 * @returns An object with `append(key, value)` and `toString()` methods
 *
 * @example
 * ```ts
 * const params = createURLSearchParams();
 * params.append("pencilmarks", "1,2,3");
 * params.toString(); // "pencilmarks=1,2,3" (commas preserved)
 * ```
 */
const createURLSearchParams = () => {
  const params: Record<string, string[]> = {};
  return {
    append: (key: string, value: string) => {
      if (!params[key]) {
        params[key] = [];
      }
      params[key]?.push(value);
    },
    toString: () => {
      return Object.entries(params)
        .flatMap(([key, values]) =>
          values.map(
            (value) =>
              // Don't encode commas - the solver API expects literal commas in pencilmarks
              `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%2C/g, ",")}`,
          ),
        )
        .join("&");
    },
  };
};

/**
 * `JSON.stringify` replacer that sends a `bigint` as its exact base-10 string.
 *
 * Technique bitmasks (bit N = technique N, up to 128 bits) don't fit in a JS
 * number, so `sudojo_api` accepts them as decimal strings. Plain
 * `JSON.stringify` throws on a `bigint`, and converting through `Number` would
 * drop the low bits.
 */
const bigintAsString = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString(10) : value;

/**
 * Format a technique bitmask for a query string without losing bits.
 *
 * Decimal strings and bigints are sent exactly. An integer number goes through
 * `BigInt`, because `String(n)` rounds anything above 2^53 to a different
 * decimal: `String(2 ** 60)` is "1152921504606847000" (2^60 + 24), which the
 * API would read as techniques 60, 4 and 3. Anything else goes through
 * `String()` unchanged, and `sudojo_api` rejects it with a 400.
 */
export const bitmaskQueryValue = (
  value: number | string | bigint | null,
): string =>
  typeof value === "number" && Number.isInteger(value)
    ? BigInt(value).toString(10)
    : String(value);

// =============================================================================
// API Configuration Factory
// =============================================================================

const createApiConfig = (baseUrl: string) => ({
  BASE_URL: baseUrl,
  ENDPOINTS: {
    // Health
    HEALTH: "/",

    // Levels
    LEVELS: "/api/v1/levels",
    LEVEL: (level: number) => `/api/v1/levels/${level}`,

    // Techniques
    TECHNIQUES: "/api/v1/techniques",
    TECHNIQUE: (technique: number) => `/api/v1/techniques/${technique}`,
    TECHNIQUE_BY_PATH: (path: string) =>
      `/api/v1/techniques/path/${encodeURIComponent(path)}`,

    // Learning
    LEARNING: "/api/v1/learning",
    LEARNING_ITEM: (uuid: string) => `/api/v1/learning/${uuid}`,

    // Boards
    BOARDS: "/api/v1/boards",
    BOARDS_RANDOM: "/api/v1/boards/random",
    BOARD: (uuid: string) => `/api/v1/boards/${uuid}`,

    // Dailies
    DAILIES: "/api/v1/dailies",
    DAILIES_TODAY: "/api/v1/dailies/today",
    DAILIES_DATE: (date: string) => `/api/v1/dailies/date/${date}`,
    DAILY: (uuid: string) => `/api/v1/dailies/${uuid}`,

    // Challenges
    CHALLENGES: "/api/v1/challenges",
    CHALLENGES_RANDOM: "/api/v1/challenges/random",
    CHALLENGE: (uuid: string) => `/api/v1/challenges/${uuid}`,

    // Users
    USER: (userId: string) => `/api/v1/users/${userId}`,
    USER_SUBSCRIPTIONS: (userId: string) =>
      `/api/v1/users/${userId}/subscriptions`,

    // Solver
    SOLVER_SOLVE: "/api/v1/solver/solve",
    SOLVER_VALIDATE: "/api/v1/solver/validate",
    SOLVER_GENERATE: "/api/v1/solver/generate",

    // OCR
    OCR_EXTRACT: "/api/v1/ocr/extract",

    // Practices
    PRACTICES: "/api/v1/practices",
    PRACTICES_COUNTS: "/api/v1/practices/counts",
    PRACTICE_RANDOM: (technique: number) =>
      `/api/v1/practices/technique/${technique}/random`,
    PRACTICE: (uuid: string) => `/api/v1/practices/${uuid}`,

    // Examples
    EXAMPLES: "/api/v1/examples",
    EXAMPLES_COUNTS: "/api/v1/examples/counts",
    EXAMPLES_RANDOM: "/api/v1/examples/random",
    EXAMPLE: (uuid: string) => `/api/v1/examples/${uuid}`,

    // Boards counts
    BOARDS_COUNTS: "/api/v1/boards/counts",
    BOARDS_COUNTS_BY_TECHNIQUE: "/api/v1/boards/counts/by-technique",
    BOARDS_UPDATE_STATS: "/api/v1/boards/update-stats",

    // Play (game sessions)
    PLAY_START: "/api/v1/play/start",
    PLAY_FINISH: "/api/v1/play/finish",

    // Gamification
    GAMIFICATION_STATS: "/api/v1/gamification/stats",
    GAMIFICATION_BADGES: "/api/v1/gamification/badges",
    GAMIFICATION_BADGE: (badgeKey: string) =>
      `/api/v1/gamification/badges/${encodeURIComponent(badgeKey)}`,
    GAMIFICATION_HISTORY: "/api/v1/gamification/history",

    // Communities
    COMMUNITIES: "/api/v1/communities",
    COMMUNITY: (uuid: string) => `/api/v1/communities/${uuid}`,

    // Strategies
    STRATEGIES: "/api/v1/strategies",
    STRATEGY: (strategy: number) => `/api/v1/strategies/${strategy}`,
    STRATEGY_BY_STUB: (stub: string) => `/api/v1/strategies/stub/${stub}`,
  },
  DEFAULT_HEADERS: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =============================================================================
// Sudojo Client Class
// =============================================================================

/**
 * Type-safe client for the Sudojo REST API.
 *
 * Provides methods for all Sudojo API endpoints including levels, techniques,
 * boards, dailies, challenges, users, solver, practices, examples, and gamification.
 *
 * ## Error Handling
 *
 * All methods throw errors on failure:
 * - **Network errors**: Thrown by the underlying `NetworkClient` (e.g., connection refused, timeout)
 * - **Empty response**: Throws `Error("No data received from server")` when the server returns no data
 * - **Validation errors**: Thrown before the request for invalid parameters (e.g., invalid UUID, level out of range)
 * - **HTTP 402** (deprecated): `solverSolve()` throws {@link HintAccessDeniedError} on a 402
 *   `HINT_ACCESS_DENIED`. Current `sudojo_api` never sends one.
 * - **Other HTTP errors**: Depend on the `NetworkClient` implementation - typically thrown as generic `Error`
 *
 * ## Authentication
 *
 * Most methods accept a `token` parameter (Firebase ID token). The token is sent
 * as a `Bearer` token in the `Authorization` header. Public endpoints (health,
 * levels, boards, etc.) accept but do not require a token. User-specific endpoints
 * (subscriptions, gamification) require a valid token.
 *
 * ## Usage
 *
 * Apps and sudojo_lib should use the React Query hooks instead; direct client
 * use is reserved for sudojo_client internals and non-React consumers of the
 * `./network` entry (e.g. sudojo_bot).
 *
 * ```typescript
 * const client = new SudojoClient(networkClient, "https://api.sudojo.com");
 * const levels = await client.getLevels(token);
 * const daily = await client.getDailyByDate(token, "2024-01-15");
 * ```
 */
export class SudojoClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private networkClient: NetworkClient;
  private config: ReturnType<typeof createApiConfig>;

  /**
   * Create a SudojoClient instance.
   *
   * @param networkClient - Network client for making HTTP requests (from `@sudobility/types`)
   * @param baseUrl - Base URL for the Sudojo API (e.g., "https://api.sudojo.com")
   */
  constructor(networkClient: NetworkClient, baseUrl: string) {
    this.config = createApiConfig(baseUrl);
    this.baseUrl = this.config.BASE_URL;
    this.networkClient = networkClient;

    this.headers = {
      ...this.config.DEFAULT_HEADERS,
    };
  }

  // ===========================================================================
  // Private Request Method
  // ===========================================================================

  private async request<T>(
    endpoint: string,
    options: {
      method?: Optional<"GET" | "POST" | "PUT" | "DELETE">;
      body?: Optional<Record<string, unknown>>;
      headers?: Optional<Record<string, string>>;
      token?: Optional<string>;
      timeout?: Optional<number>;
    } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      ...this.headers,
      ...options.headers,
    };

    // Add authorization header if token is provided
    if (options.token) {
      requestHeaders["Authorization"] = `Bearer ${options.token}`;
    }

    const requestOptions: {
      method: "GET" | "POST" | "PUT" | "DELETE";
      headers: Record<string, string>;
      body?: string;
      timeout?: number;
    } = {
      method: options.method || "GET",
      headers: requestHeaders,
    };

    // Add body for POST/PUT/DELETE requests
    if (options.body && options.method !== "GET") {
      requestOptions.body = JSON.stringify(options.body, bigintAsString);
    }

    // Add timeout if specified
    if (options.timeout) {
      requestOptions.timeout = options.timeout;
    }

    const response = await this.networkClient.request<T>(url, requestOptions);

    if (response.data === undefined) {
      throw new Error("No data received from server");
    }

    return (await decryptSolutionFields(response.data)) as T;
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async getHealth(): Promise<BaseResponse<HealthCheckData>> {
    return this.request<BaseResponse<HealthCheckData>>(
      this.config.ENDPOINTS.HEALTH,
    );
  }

  // ===========================================================================
  // Levels
  // ===========================================================================

  async getLevels(token: string): Promise<BaseResponse<Level[]>> {
    return this.request<BaseResponse<Level[]>>(this.config.ENDPOINTS.LEVELS, {
      token,
    });
  }

  async getLevel(token: string, level: number): Promise<BaseResponse<Level>> {
    assertValidLevel(level);
    return this.request<BaseResponse<Level>>(
      this.config.ENDPOINTS.LEVEL(level),
      { token },
    );
  }

  async createLevel(
    token: string,
    data: LevelCreateRequest,
  ): Promise<BaseResponse<Level>> {
    return this.request<BaseResponse<Level>>(this.config.ENDPOINTS.LEVELS, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      token,
    });
  }

  async updateLevel(
    token: string,
    level: number,
    data: LevelUpdateRequest,
  ): Promise<BaseResponse<Level>> {
    assertValidLevel(level);
    return this.request<BaseResponse<Level>>(
      this.config.ENDPOINTS.LEVEL(level),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteLevel(
    token: string,
    level: number,
  ): Promise<BaseResponse<Level>> {
    assertValidLevel(level);
    return this.request<BaseResponse<Level>>(
      this.config.ENDPOINTS.LEVEL(level),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Techniques
  // ===========================================================================

  async getTechniques(
    token: string,
    queryParams?: TechniqueQueryParams,
  ): Promise<BaseResponse<Technique[]>> {
    const params = createURLSearchParams();

    if (queryParams?.level !== undefined) {
      params.append("level", String(queryParams.level));
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.TECHNIQUES}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Technique[]>>(endpoint, { token });
  }

  async getTechnique(
    token: string,
    technique: number,
  ): Promise<BaseResponse<Technique>> {
    if (technique < 1) {
      throw new Error(`Invalid technique: ${technique}. Expected >= 1`);
    }
    return this.request<BaseResponse<Technique>>(
      this.config.ENDPOINTS.TECHNIQUE(technique),
      { token },
    );
  }

  /**
   * Get a technique by its URL path slug (e.g. "naked-single").
   */
  async getTechniqueByPath(
    token: string,
    path: string,
  ): Promise<BaseResponse<Technique>> {
    if (!path || path.length > 255) {
      throw new Error(
        `Invalid technique path: "${path}". Expected 1-255 chars`,
      );
    }
    return this.request<BaseResponse<Technique>>(
      this.config.ENDPOINTS.TECHNIQUE_BY_PATH(path),
      { token },
    );
  }

  async createTechnique(
    token: string,
    data: TechniqueCreateRequest,
  ): Promise<BaseResponse<Technique>> {
    return this.request<BaseResponse<Technique>>(
      this.config.ENDPOINTS.TECHNIQUES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async updateTechnique(
    token: string,
    technique: number,
    data: TechniqueUpdateRequest,
  ): Promise<BaseResponse<Technique>> {
    if (technique < 1) {
      throw new Error(`Invalid technique: ${technique}. Expected >= 1`);
    }
    return this.request<BaseResponse<Technique>>(
      this.config.ENDPOINTS.TECHNIQUE(technique),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteTechnique(
    token: string,
    technique: number,
  ): Promise<BaseResponse<Technique>> {
    if (technique < 1) {
      throw new Error(`Invalid technique: ${technique}. Expected >= 1`);
    }
    return this.request<BaseResponse<Technique>>(
      this.config.ENDPOINTS.TECHNIQUE(technique),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Learning
  // ===========================================================================

  async getLearning(
    token: string,
    queryParams?: LearningQueryParams,
  ): Promise<BaseResponse<Learning[]>> {
    const params = createURLSearchParams();

    if (queryParams?.technique !== undefined) {
      params.append("technique", String(queryParams.technique));
    }
    if (queryParams?.language_code) {
      params.append("language_code", queryParams.language_code);
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.LEARNING}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Learning[]>>(endpoint, { token });
  }

  async getLearningItem(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Learning>> {
    const validatedUuid = validateUUID(uuid, "Learning UUID");
    return this.request<BaseResponse<Learning>>(
      this.config.ENDPOINTS.LEARNING_ITEM(validatedUuid),
      { token },
    );
  }

  async createLearning(
    token: string,
    data: LearningCreateRequest,
  ): Promise<BaseResponse<Learning>> {
    return this.request<BaseResponse<Learning>>(
      this.config.ENDPOINTS.LEARNING,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async updateLearning(
    token: string,
    uuid: string,
    data: LearningUpdateRequest,
  ): Promise<BaseResponse<Learning>> {
    const validatedUuid = validateUUID(uuid, "Learning UUID");
    return this.request<BaseResponse<Learning>>(
      this.config.ENDPOINTS.LEARNING_ITEM(validatedUuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteLearning(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Learning>> {
    const validatedUuid = validateUUID(uuid, "Learning UUID");
    return this.request<BaseResponse<Learning>>(
      this.config.ENDPOINTS.LEARNING_ITEM(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Boards
  // ===========================================================================

  async getBoards(
    token: string,
    queryParams?: BoardQueryParams,
  ): Promise<BaseResponse<Board[]>> {
    const params = createURLSearchParams();

    if (queryParams?.level !== undefined) {
      params.append("level", String(queryParams.level));
    }
    if (queryParams?.limit !== undefined) {
      params.append("limit", String(queryParams.limit));
    }
    if (queryParams?.offset !== undefined) {
      params.append("offset", String(queryParams.offset));
    }
    // Bitmasks exceed 2^53 once any technique ID >= 54 is set. Never convert
    // them with Number() or String(number).
    if (queryParams?.techniques !== undefined) {
      params.append("techniques", bitmaskQueryValue(queryParams.techniques));
    }
    if (queryParams?.technique_bit !== undefined) {
      params.append(
        "technique_bit",
        bitmaskQueryValue(queryParams.technique_bit),
      );
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.BOARDS}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Board[]>>(endpoint, { token });
  }

  async getRandomBoard(
    token: string,
    queryParams?: BoardQueryParams,
  ): Promise<BaseResponse<Board>> {
    const params = createURLSearchParams();

    if (queryParams?.level !== undefined) {
      params.append("level", String(queryParams.level));
    }

    if (queryParams?.symmetrical !== undefined) {
      params.append("symmetrical", String(queryParams.symmetrical));
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.BOARDS_RANDOM}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Board>>(endpoint, { token });
  }

  async getBoard(token: string, uuid: string): Promise<BaseResponse<Board>> {
    const validatedUuid = validateUUID(uuid, "Board UUID");
    return this.request<BaseResponse<Board>>(
      this.config.ENDPOINTS.BOARD(validatedUuid),
      { token },
    );
  }

  async createBoard(
    token: string,
    data: BoardCreateRequest,
  ): Promise<BaseResponse<Board>> {
    return this.request<BaseResponse<Board>>(this.config.ENDPOINTS.BOARDS, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      token,
    });
  }

  async updateBoard(
    token: string,
    uuid: string,
    data: BoardUpdateRequest,
  ): Promise<BaseResponse<Board>> {
    const validatedUuid = validateUUID(uuid, "Board UUID");
    return this.request<BaseResponse<Board>>(
      this.config.ENDPOINTS.BOARD(validatedUuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteBoard(token: string, uuid: string): Promise<BaseResponse<Board>> {
    const validatedUuid = validateUUID(uuid, "Board UUID");
    return this.request<BaseResponse<Board>>(
      this.config.ENDPOINTS.BOARD(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Dailies
  // ===========================================================================

  async getDailies(token: string): Promise<BaseResponse<Daily[]>> {
    return this.request<BaseResponse<Daily[]>>(this.config.ENDPOINTS.DAILIES, {
      token,
    });
  }

  async getTodayDaily(token: string): Promise<BaseResponse<Daily>> {
    return this.request<BaseResponse<Daily>>(
      this.config.ENDPOINTS.DAILIES_TODAY,
      { token },
    );
  }

  async getDailyByDate(
    token: string,
    date: string,
  ): Promise<BaseResponse<Daily>> {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(
        `Invalid date format: "${date}". Expected YYYY-MM-DD format`,
      );
    }
    return this.request<BaseResponse<Daily>>(
      this.config.ENDPOINTS.DAILIES_DATE(date),
      { token },
    );
  }

  async getDaily(token: string, uuid: string): Promise<BaseResponse<Daily>> {
    const validatedUuid = validateUUID(uuid, "Daily UUID");
    return this.request<BaseResponse<Daily>>(
      this.config.ENDPOINTS.DAILY(validatedUuid),
      { token },
    );
  }

  async createDaily(
    token: string,
    data: DailyCreateRequest,
  ): Promise<BaseResponse<Daily>> {
    return this.request<BaseResponse<Daily>>(this.config.ENDPOINTS.DAILIES, {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      token,
    });
  }

  async updateDaily(
    token: string,
    uuid: string,
    data: DailyUpdateRequest,
  ): Promise<BaseResponse<Daily>> {
    const validatedUuid = validateUUID(uuid, "Daily UUID");
    return this.request<BaseResponse<Daily>>(
      this.config.ENDPOINTS.DAILY(validatedUuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteDaily(token: string, uuid: string): Promise<BaseResponse<Daily>> {
    const validatedUuid = validateUUID(uuid, "Daily UUID");
    return this.request<BaseResponse<Daily>>(
      this.config.ENDPOINTS.DAILY(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Challenges
  // ===========================================================================

  async getChallenges(
    token: string,
    queryParams?: ChallengeQueryParams,
  ): Promise<BaseResponse<Challenge[]>> {
    const params = createURLSearchParams();

    if (queryParams?.level !== undefined) {
      params.append("level", String(queryParams.level));
    }
    if (queryParams?.difficulty) {
      params.append("difficulty", queryParams.difficulty);
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.CHALLENGES}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Challenge[]>>(endpoint, { token });
  }

  async getRandomChallenge(
    token: string,
    queryParams?: ChallengeQueryParams,
  ): Promise<BaseResponse<Challenge>> {
    const params = createURLSearchParams();

    if (queryParams?.level !== undefined) {
      params.append("level", String(queryParams.level));
    }
    if (queryParams?.difficulty) {
      params.append("difficulty", queryParams.difficulty);
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.CHALLENGES_RANDOM}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Challenge>>(endpoint, { token });
  }

  async getChallenge(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Challenge>> {
    const validatedUuid = validateUUID(uuid, "Challenge UUID");
    return this.request<BaseResponse<Challenge>>(
      this.config.ENDPOINTS.CHALLENGE(validatedUuid),
      { token },
    );
  }

  async createChallenge(
    token: string,
    data: ChallengeCreateRequest,
  ): Promise<BaseResponse<Challenge>> {
    return this.request<BaseResponse<Challenge>>(
      this.config.ENDPOINTS.CHALLENGES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async updateChallenge(
    token: string,
    uuid: string,
    data: ChallengeUpdateRequest,
  ): Promise<BaseResponse<Challenge>> {
    const validatedUuid = validateUUID(uuid, "Challenge UUID");
    return this.request<BaseResponse<Challenge>>(
      this.config.ENDPOINTS.CHALLENGE(validatedUuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteChallenge(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Challenge>> {
    const validatedUuid = validateUUID(uuid, "Challenge UUID");
    return this.request<BaseResponse<Challenge>>(
      this.config.ENDPOINTS.CHALLENGE(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Users
  // ===========================================================================

  async getUser(
    token: string,
    userId: string,
  ): Promise<BaseResponse<UserInfoResponse>> {
    if (!userId || userId.length === 0 || userId.length > 128) {
      throw new Error(`Invalid userId: "${userId}". Expected 1-128 characters`);
    }
    return this.request<BaseResponse<UserInfoResponse>>(
      this.config.ENDPOINTS.USER(userId),
      {
        token,
      },
    );
  }

  async getUserSubscription(
    token: string,
    userId: string,
    testMode?: boolean,
  ): Promise<BaseResponse<SubscriptionResult>> {
    if (!userId || userId.length === 0 || userId.length > 128) {
      throw new Error(`Invalid userId: "${userId}". Expected 1-128 characters`);
    }
    const endpoint = testMode
      ? `${this.config.ENDPOINTS.USER_SUBSCRIPTIONS(userId)}?testMode=true`
      : this.config.ENDPOINTS.USER_SUBSCRIPTIONS(userId);
    return this.request<BaseResponse<SubscriptionResult>>(endpoint, {
      token,
    });
  }

  /**
   * Delete (soft-delete) the signed-in user's account.
   *
   * The API checks that `token` belongs to `userId`, refuses while a
   * subscription is active (409) or when already deleted (410), marks the
   * account deleted, revokes any provider tokens given, and deletes the
   * Firebase user server-side.
   *
   * Unlike most methods, this throws when the API answers `success: false`,
   * with the API's error message, so callers can't mistake a refusal for a
   * deletion.
   */
  async deleteUser(
    token: string,
    userId: string,
    providerTokens?: DeleteUserRequest,
  ): Promise<BaseResponse<DeletedData>> {
    if (!userId || userId.length === 0 || userId.length > 128) {
      throw new Error(`Invalid userId: "${userId}". Expected 1-128 characters`);
    }
    const result = await this.request<BaseResponse<DeletedData>>(
      this.config.ENDPOINTS.USER(userId),
      {
        method: "DELETE",
        body: { ...providerTokens },
        token,
      },
    );
    if (result.success === false) {
      throw new Error(result.error || "Failed to delete account");
    }
    return result;
  }

  // ===========================================================================
  // Practices
  // ===========================================================================

  /**
   * Get practice counts for all techniques
   */
  async getPracticeCounts(
    token: string,
  ): Promise<BaseResponse<TechniquePracticeCountItem[]>> {
    return this.request<BaseResponse<TechniquePracticeCountItem[]>>(
      this.config.ENDPOINTS.PRACTICES_COUNTS,
      { token },
    );
  }

  /**
   * Get a random practice for a specific technique
   */
  async getRandomPractice(
    token: string,
    technique: number,
  ): Promise<BaseResponse<TechniquePractice>> {
    if (technique < 1) {
      throw new Error(`Invalid technique: ${technique}. Expected >= 1`);
    }
    return this.request<BaseResponse<TechniquePractice>>(
      this.config.ENDPOINTS.PRACTICE_RANDOM(technique),
      { token },
    );
  }

  /**
   * Get a single practice by UUID
   */
  async getPractice(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<TechniquePractice>> {
    const validatedUuid = validateUUID(uuid, "Practice UUID");
    return this.request<BaseResponse<TechniquePractice>>(
      this.config.ENDPOINTS.PRACTICE(validatedUuid),
      { token },
    );
  }

  /**
   * Delete a single practice (admin only)
   */
  async deletePractice(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<TechniquePractice>> {
    const validatedUuid = validateUUID(uuid, "Practice UUID");
    return this.request<BaseResponse<TechniquePractice>>(
      this.config.ENDPOINTS.PRACTICE(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  /**
   * Create a new practice (admin only)
   */
  async createPractice(
    token: string,
    data: TechniquePracticeCreateRequest,
  ): Promise<BaseResponse<TechniquePractice>> {
    return this.request<BaseResponse<TechniquePractice>>(
      this.config.ENDPOINTS.PRACTICES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Delete all practices (admin only, requires confirm=true)
   */
  async deleteAllPractices(
    token: string,
  ): Promise<BaseResponse<PracticesBulkDeleteData>> {
    return this.request<BaseResponse<PracticesBulkDeleteData>>(
      `${this.config.ENDPOINTS.PRACTICES}?confirm=true`,
      {
        method: "DELETE",
        token,
      },
    );
  }

  /**
   * Regenerate hint_data for all practices by calling the solver (admin only).
   * Uses a 10-minute timeout because this processes all practices sequentially.
   */
  async regeneratePracticeHints(
    token: string,
  ): Promise<BaseResponse<PracticesRegenerateHintsData>> {
    return this.request<BaseResponse<PracticesRegenerateHintsData>>(
      `${this.config.ENDPOINTS.PRACTICES}/regenerate-hints`,
      {
        method: "POST",
        token,
        timeout: 600000,
      },
    );
  }

  // ===========================================================================
  // Examples
  // ===========================================================================

  /**
   * Get example counts for all techniques
   */
  async getExampleCounts(
    token: string,
  ): Promise<BaseResponse<ExampleCountsData>> {
    return this.request<BaseResponse<ExampleCountsData>>(
      this.config.ENDPOINTS.EXAMPLES_COUNTS,
      { token },
    );
  }

  /**
   * Get examples, optionally filtered by technique
   */
  async getExamples(
    token: string,
    queryParams?: TechniqueExampleQueryParams,
  ): Promise<BaseResponse<TechniqueExample[]>> {
    const params = createURLSearchParams();

    if (queryParams?.technique !== undefined) {
      params.append("technique", String(queryParams.technique));
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.EXAMPLES}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<TechniqueExample[]>>(endpoint, { token });
  }

  /**
   * Create a new example (admin only)
   */
  async createExample(
    token: string,
    data: TechniqueExampleCreateRequest,
  ): Promise<BaseResponse<TechniqueExample>> {
    return this.request<BaseResponse<TechniqueExample>>(
      this.config.ENDPOINTS.EXAMPLES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Get a random example, optionally filtered by primary technique
   */
  async getRandomExample(
    token: string,
    queryParams?: TechniqueExampleQueryParams,
  ): Promise<BaseResponse<TechniqueExample>> {
    const params = createURLSearchParams();

    if (
      queryParams?.technique !== undefined &&
      queryParams.technique !== null
    ) {
      params.append("technique", String(queryParams.technique));
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.EXAMPLES_RANDOM}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<TechniqueExample>>(endpoint, { token });
  }

  /**
   * Get a single example by UUID
   */
  async getExample(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<TechniqueExample>> {
    const validatedUuid = validateUUID(uuid, "Example UUID");
    return this.request<BaseResponse<TechniqueExample>>(
      this.config.ENDPOINTS.EXAMPLE(validatedUuid),
      { token },
    );
  }

  /**
   * Update an example (admin only)
   */
  async updateExample(
    token: string,
    uuid: string,
    data: TechniqueExampleUpdateRequest,
  ): Promise<BaseResponse<TechniqueExample>> {
    const validatedUuid = validateUUID(uuid, "Example UUID");
    return this.request<BaseResponse<TechniqueExample>>(
      this.config.ENDPOINTS.EXAMPLE(validatedUuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Delete an example (admin only)
   */
  async deleteExample(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<TechniqueExample>> {
    const validatedUuid = validateUUID(uuid, "Example UUID");
    return this.request<BaseResponse<TechniqueExample>>(
      this.config.ENDPOINTS.EXAMPLE(validatedUuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Board Counts
  // ===========================================================================

  /**
   * Get board counts (total and without techniques)
   */
  async getBoardCounts(token: string): Promise<BaseResponse<BoardCountsData>> {
    return this.request<BaseResponse<BoardCountsData>>(
      this.config.ENDPOINTS.BOARDS_COUNTS,
      { token },
    );
  }

  /**
   * Get board counts by technique (count of boards with each technique bit set)
   * Returns Record<number, number> where key is technique ID and value is count
   */
  async getBoardCountsByTechnique(
    token: string,
  ): Promise<BaseResponse<BoardCountsByTechniqueData>> {
    return this.request<BaseResponse<BoardCountsByTechniqueData>>(
      this.config.ENDPOINTS.BOARDS_COUNTS_BY_TECHNIQUE,
      { token },
    );
  }

  /**
   * Calculate and update puzzle stats (percentages) on levels and techniques.
   * Requires admin authentication.
   */
  async updatePuzzleStats(
    token: string,
  ): Promise<BaseResponse<UpdateStatsData>> {
    return this.request<BaseResponse<UpdateStatsData>>(
      this.config.ENDPOINTS.BOARDS_UPDATE_STATS,
      {
        method: "POST",
        token,
      },
    );
  }

  // ===========================================================================
  // Solver
  // ===========================================================================

  /**
   * Builds an endpoint path with query parameters for solver endpoints
   */
  private buildSolverUrl(
    endpoint: string,
    params: Record<string, string | boolean | undefined>,
  ): string {
    const searchParams = createURLSearchParams();
    // Sort keys alphabetically to match Kotlin behavior
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      const value = params[key];
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const query = searchParams.toString();
    // Return endpoint + query only, baseUrl is added by request()
    return `${endpoint}${query ? `?${query}` : ""}`;
  }

  /**
   * Get hints for solving a Sudoku puzzle.
   *
   * `/solver/solve` accepts anonymous calls; with a token, hints on the active
   * play session earn points. Pass `""` for no token.
   *
   * Hints are unrestricted server-side (owner decision, see sudojo_api
   * CLAUDE.md "Auth & Access Model"), so the API never sends a 402.
   *
   * @throws {HintAccessDeniedError} Deprecated: only on a 402
   *   `HINT_ACCESS_DENIED`, which current `sudojo_api` never sends.
   */
  async solverSolve(
    token: string,
    options: SolveOptions,
  ): Promise<BaseResponse<SolveData>> {
    const url = this.buildSolverUrl(this.config.ENDPOINTS.SOLVER_SOLVE, {
      original: options.original,
      user: options.user,
      autopencilmarks: options.autoPencilmarks,
      pencilmarks: options.pencilmarks,
      // @deprecated `filters` is ignored by sudojo_api and the solver; it is
      // still sent so the request is unchanged. Use `techniques`.
      filters: options.filters,
      // Comma-separated technique IDs ("1,2,60"), not a bitmask
      techniques: options.techniques,
    });

    const fullUrl = `${this.baseUrl}${url}`;
    const requestHeaders: Record<string, string> = {
      ...this.headers,
    };

    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }

    // Use 120 second timeout for solve (advanced techniques can be slow)
    const response = await this.networkClient.request<
      BaseResponse<SolveData> | HintAccessDeniedResponse
    >(fullUrl, {
      method: "GET",
      headers: requestHeaders,
      timeout: 120000,
    });

    /**
     * @deprecated Dead path: sudojo_api never sends 402 HINT_ACCESS_DENIED
     * (hints are unrestricted server-side by owner decision). Kept so the
     * behaviour is unchanged for clients that still catch it; remove in a
     * breaking release together with HintAccessDeniedError.
     */
    if (response.status === 402 && response.data) {
      const errorResponse = response.data as HintAccessDeniedResponse;
      if (errorResponse.error?.code === "HINT_ACCESS_DENIED") {
        throw new HintAccessDeniedError(errorResponse.error);
      }
    }

    // Check for other errors
    if (!response.ok || response.data === undefined) {
      throw new Error("Failed to get hints from solver");
    }

    return (await decryptSolutionFields(
      response.data,
    )) as BaseResponse<SolveData>;
  }

  /**
   * Validate that a Sudoku puzzle has a unique solution.
   * Uses a longer timeout (120s) because validation involves iterative solving.
   */
  async solverValidate(
    token: string,
    options: ValidateOptions,
  ): Promise<BaseResponse<ValidateData>> {
    const url = this.buildSolverUrl(this.config.ENDPOINTS.SOLVER_VALIDATE, {
      brutalForce: options.brutalForce,
      original: options.original,
    });

    // Use 120 second timeout for validation (iterative solving can be slow)
    return this.request<BaseResponse<ValidateData>>(url, {
      token,
      timeout: 120000,
    });
  }

  /**
   * Generate a new random Sudoku puzzle
   */
  async solverGenerate(
    token: string,
    options: GenerateOptions = {},
  ): Promise<BaseResponse<GenerateData>> {
    const url = this.buildSolverUrl(this.config.ENDPOINTS.SOLVER_GENERATE, {
      symmetrical: options.symmetrical,
    });

    return this.request<BaseResponse<GenerateData>>(url, { token });
  }

  // ===========================================================================
  // OCR
  // ===========================================================================

  /**
   * Read a Sudoku board from a photo or screenshot.
   *
   * Recognition happens server-side, so no client bundles an OCR engine.
   *
   * @param token - Auth token
   * @param image - The image as base64, with or without a `data:` URL prefix
   * @param options.source - Where the image came from. Camera captures go
   *   straight to paddle_ocr; everything else prefers the whole-board model and
   *   falls back to paddle. Defaults to "library".
   * @param options.timeout - Request timeout in ms (default 60000). The server
   *   may try two backends, so this is well above the default request timeout.
   */
  async extractOcr(
    token: string,
    image: string,
    options: { source?: Optional<OcrSource>; timeout?: Optional<number> } = {},
  ): Promise<BaseResponse<OCRExtractData>> {
    // Callers hold images as canvas/file data URLs; the API wants raw base64.
    const base64 = image.replace(/^data:[^;,]*;base64,/, "").trim();
    if (!base64) {
      throw new Error("extractOcr: image is empty");
    }

    return this.request<BaseResponse<OCRExtractData>>(
      this.config.ENDPOINTS.OCR_EXTRACT,
      {
        method: "POST",
        body: { image: base64, source: options.source ?? "library" },
        token,
        timeout: options.timeout ?? 60000,
      },
    );
  }

  // ===========================================================================
  // Play (Game Session) Endpoints
  // ===========================================================================

  /**
   * Start a new game session
   */
  async playStart(
    token: string,
    data: GameStartRequest,
  ): Promise<BaseResponse<GameStartResponse>> {
    return this.request<BaseResponse<GameStartResponse>>(
      this.config.ENDPOINTS.PLAY_START,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Finish the current game session and get rewards
   */
  async playFinish(
    token: string,
    data: GameFinishRequest,
  ): Promise<BaseResponse<GameFinishResponse>> {
    return this.request<BaseResponse<GameFinishResponse>>(
      this.config.ENDPOINTS.PLAY_FINISH,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  // ===========================================================================
  // Communities
  // ===========================================================================

  async getCommunities(
    token: string,
    queryParams?: CommunityQueryParams,
  ): Promise<BaseResponse<Community[]>> {
    const params = createURLSearchParams();

    if (queryParams?.language !== undefined) {
      params.append("language", queryParams.language);
    }

    const query = params.toString();
    const endpoint = `${this.config.ENDPOINTS.COMMUNITIES}${query ? `?${query}` : ""}`;

    return this.request<BaseResponse<Community[]>>(endpoint, { token });
  }

  async getCommunity(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Community>> {
    validateUUID(uuid);
    return this.request<BaseResponse<Community>>(
      this.config.ENDPOINTS.COMMUNITY(uuid),
      { token },
    );
  }

  async createCommunity(
    token: string,
    data: CommunityCreateRequest,
  ): Promise<BaseResponse<Community>> {
    return this.request<BaseResponse<Community>>(
      this.config.ENDPOINTS.COMMUNITIES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async updateCommunity(
    token: string,
    uuid: string,
    data: CommunityUpdateRequest,
  ): Promise<BaseResponse<Community>> {
    validateUUID(uuid);
    return this.request<BaseResponse<Community>>(
      this.config.ENDPOINTS.COMMUNITY(uuid),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteCommunity(
    token: string,
    uuid: string,
  ): Promise<BaseResponse<Community>> {
    validateUUID(uuid);
    return this.request<BaseResponse<Community>>(
      this.config.ENDPOINTS.COMMUNITY(uuid),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Strategies
  // ===========================================================================

  async getStrategies(token: string): Promise<BaseResponse<Strategy[]>> {
    return this.request<BaseResponse<Strategy[]>>(
      this.config.ENDPOINTS.STRATEGIES,
      { token },
    );
  }

  async getStrategy(
    token: string,
    strategy: number,
  ): Promise<BaseResponse<Strategy>> {
    if (strategy < 1) throw new Error("Strategy ID must be >= 1");
    return this.request<BaseResponse<Strategy>>(
      this.config.ENDPOINTS.STRATEGY(strategy),
      { token },
    );
  }

  async getStrategyByStub(
    token: string,
    stub: string,
  ): Promise<BaseResponse<Strategy>> {
    return this.request<BaseResponse<Strategy>>(
      this.config.ENDPOINTS.STRATEGY_BY_STUB(stub),
      { token },
    );
  }

  async createStrategy(
    token: string,
    data: StrategyCreateRequest,
  ): Promise<BaseResponse<Strategy>> {
    return this.request<BaseResponse<Strategy>>(
      this.config.ENDPOINTS.STRATEGIES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async updateStrategy(
    token: string,
    strategy: number,
    data: StrategyUpdateRequest,
  ): Promise<BaseResponse<Strategy>> {
    if (strategy < 1) throw new Error("Strategy ID must be >= 1");
    return this.request<BaseResponse<Strategy>>(
      this.config.ENDPOINTS.STRATEGY(strategy),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  async deleteStrategy(
    token: string,
    strategy: number,
  ): Promise<BaseResponse<Strategy>> {
    if (strategy < 1) throw new Error("Strategy ID must be >= 1");
    return this.request<BaseResponse<Strategy>>(
      this.config.ENDPOINTS.STRATEGY(strategy),
      {
        method: "DELETE",
        token,
      },
    );
  }

  // ===========================================================================
  // Gamification Endpoints
  // ===========================================================================

  /**
   * Get user's gamification stats (points, level, badges)
   */
  async getGamificationStats(
    token: string,
  ): Promise<BaseResponse<GamificationStats>> {
    return this.request<BaseResponse<GamificationStats>>(
      this.config.ENDPOINTS.GAMIFICATION_STATS,
      { token },
    );
  }

  /**
   * Get all badge definitions (public)
   */
  async getBadgeDefinitions(): Promise<BaseResponse<BadgeDefinition[]>> {
    return this.request<BaseResponse<BadgeDefinition[]>>(
      this.config.ENDPOINTS.GAMIFICATION_BADGES,
    );
  }

  /**
   * Create a badge definition (admin only)
   */
  async createBadge(
    token: string,
    data: BadgeDefinitionCreateRequest,
  ): Promise<BaseResponse<BadgeDefinition>> {
    return this.request<BaseResponse<BadgeDefinition>>(
      this.config.ENDPOINTS.GAMIFICATION_BADGES,
      {
        method: "POST",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Update a badge definition by key (admin only)
   */
  async updateBadge(
    token: string,
    badgeKey: string,
    data: BadgeDefinitionUpdateRequest,
  ): Promise<BaseResponse<BadgeDefinition>> {
    if (!badgeKey || badgeKey.length > 100) {
      throw new Error(`Invalid badgeKey: "${badgeKey}". Expected 1-100 chars`);
    }
    return this.request<BaseResponse<BadgeDefinition>>(
      this.config.ENDPOINTS.GAMIFICATION_BADGE(badgeKey),
      {
        method: "PUT",
        body: data as unknown as Record<string, unknown>,
        token,
      },
    );
  }

  /**
   * Delete a badge definition by key (admin only). The API also deletes every
   * user's award of that badge.
   */
  async deleteBadge(
    token: string,
    badgeKey: string,
  ): Promise<BaseResponse<DeletedData>> {
    if (!badgeKey || badgeKey.length > 100) {
      throw new Error(`Invalid badgeKey: "${badgeKey}". Expected 1-100 chars`);
    }
    return this.request<BaseResponse<DeletedData>>(
      this.config.ENDPOINTS.GAMIFICATION_BADGE(badgeKey),
      {
        method: "DELETE",
        token,
      },
    );
  }

  /**
   * Get user's point transaction history
   */
  async getPointHistory(
    token: string,
    options?: { limit?: number; offset?: number },
  ): Promise<BaseResponse<PointTransaction[]>> {
    let endpoint = this.config.ENDPOINTS.GAMIFICATION_HISTORY;
    if (options?.limit || options?.offset) {
      const params = createURLSearchParams();
      if (options.limit) params.append("limit", String(options.limit));
      if (options.offset) params.append("offset", String(options.offset));
      endpoint = `${endpoint}?${params.toString()}`;
    }
    return this.request<BaseResponse<PointTransaction[]>>(endpoint, { token });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Factory function to create a new SudojoClient instance.
 *
 * Equivalent to `new SudojoClient(networkClient, baseUrl)` but useful
 * for dependency injection and functional composition patterns.
 *
 * @param networkClient - Network client for making HTTP requests
 * @param baseUrl - Base URL for the Sudojo API
 * @returns A new SudojoClient instance
 */
export const createSudojoClient = (
  networkClient: NetworkClient,
  baseUrl: string,
): SudojoClient => {
  return new SudojoClient(networkClient, baseUrl);
};

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Re-exported UUID validation utilities from `@sudobility/sudojo_types`.
 *
 * These are used internally by the SudojoClient for parameter validation
 * and are also exported for consumer convenience. Use `isValidUUID` for
 * boolean checks and `validateUUID` when you want an error thrown on invalid input.
 *
 * - `isValidUUID(value)` - Returns true if the string is a valid UUID v4
 * - `validateUUID(value, label)` - Returns the UUID or throws an Error with the label
 */
export { isValidUUID, validateUUID };
