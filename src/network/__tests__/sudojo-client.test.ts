import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockNetworkClient } from "@sudobility/di/mocks";
import { createSudojoClient, SudojoClient } from "../sudojo-client";
import { isValidUUID, validateUUID } from "../sudojo-client";

const TEST_TOKEN = "test-token-123";
const BASE_URL = "https://test-sudojo.example.com";
const VALID_UUID = "12345678-1234-1234-1234-123456789abc";

describe("SudojoClient", () => {
  let client: SudojoClient;
  let mockNetworkClient: MockNetworkClient;

  beforeEach(() => {
    mockNetworkClient = new MockNetworkClient();
    client = new SudojoClient(mockNetworkClient, BASE_URL);
  });

  afterEach(() => {
    mockNetworkClient.reset();
  });

  describe("initialization", () => {
    it("should create instance successfully", () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(SudojoClient);
    });

    it("should initialize with different base URL", () => {
      const clientWithDifferentUrl = new SudojoClient(
        mockNetworkClient,
        "https://different.example.com",
      );
      expect(clientWithDifferentUrl).toBeDefined();
      expect(clientWithDifferentUrl).toBeInstanceOf(SudojoClient);
    });
  });

  describe("health check", () => {
    it("should get health status successfully", async () => {
      const mockResponse = {
        success: true,
        data: {
          name: "sudojo_api",
          version: "1.0.0",
          status: "ok",
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getHealth();

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("ok");
      expect(mockNetworkClient.wasUrlCalled(`${BASE_URL}/`)).toBe(true);
    });
  });

  describe("levels", () => {
    it("should get all levels successfully", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            level: 1,
            title: "Beginner",
            text: "Basic techniques",
            requires_subscription: false,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getLevels(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.title).toBe("Beginner");
      expect(mockNetworkClient.wasUrlCalled(`${BASE_URL}/api/v1/levels`)).toBe(
        true,
      );
    });

    it("should get a specific level by number", async () => {
      const mockResponse = {
        success: true,
        data: {
          level: 1,
          title: "Beginner",
          text: "Basic techniques",
          requires_subscription: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels/1`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getLevel(TEST_TOKEN, 1);

      expect(result.success).toBe(true);
      expect(result.data?.level).toBe(1);
    });

    it("should create a level with authentication", async () => {
      const mockResponse = {
        success: true,
        data: {
          level: 5,
          title: "New Level",
          text: null,
          requires_subscription: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.createLevel(TEST_TOKEN, {
        level: 5,
        title: "New Level",
        text: null,
        requires_subscription: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("New Level");
      expect(
        mockNetworkClient.wasUrlCalled(`${BASE_URL}/api/v1/levels`, "POST"),
      ).toBe(true);
    });

    it("should update a level with authentication", async () => {
      const mockResponse = {
        success: true,
        data: {
          level: 1,
          title: "Updated Level",
          text: "Updated description",
          requires_subscription: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels/1`,
        { data: mockResponse },
        "PUT",
      );

      const result = await client.updateLevel(TEST_TOKEN, 1, {
        title: "Updated Level",
        text: "Updated description",
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("Updated Level");
    });

    it("should delete a level with authentication", async () => {
      const mockResponse = {
        success: true,
        data: {
          level: 1,
          title: "Deleted Level",
          text: null,
          requires_subscription: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels/1`,
        { data: mockResponse },
        "DELETE",
      );

      const result = await client.deleteLevel(TEST_TOKEN, 1);

      expect(result.success).toBe(true);
    });
  });

  describe("techniques", () => {
    it("should get all techniques", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            uuid: VALID_UUID,
            level_uuid: null,
            index: 1,
            title: "Hidden Singles",
            text: "Basic technique",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/techniques`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getTechniques(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should filter techniques by level", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/techniques?level=1`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getTechniques(TEST_TOKEN, {
        level: 1,
      });

      expect(result.success).toBe(true);
    });

    it("should create a technique", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          level_uuid: VALID_UUID,
          index: 1,
          title: "New Technique",
          text: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/techniques`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.createTechnique(TEST_TOKEN, {
        level_uuid: VALID_UUID,
        index: 1,
        title: "New Technique",
        text: null,
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("New Technique");
    });
  });

  describe("learning", () => {
    it("should get all learning entries", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            uuid: VALID_UUID,
            technique_uuid: VALID_UUID,
            index: 1,
            language_code: "en",
            text: "Learn this",
            image_url: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/learning`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getLearning(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should filter learning by technique and language", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/learning?technique=1&language_code=en`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getLearning(TEST_TOKEN, {
        technique: 1,
        language_code: "en",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("boards", () => {
    it("should get all boards", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            uuid: VALID_UUID,
            original: "0".repeat(81),
            solution: "1".repeat(81),
            difficulty: 3,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getBoards(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should get a random board", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          original: "0".repeat(81),
          solution: "1".repeat(81),
          difficulty: 3,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards/random`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getRandomBoard(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data?.uuid).toBe(VALID_UUID);
    });

    it("should create a board", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          original: "0".repeat(81),
          solution: "1".repeat(81),
          difficulty: 5,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.createBoard(TEST_TOKEN, {
        original: "0".repeat(81),
        solution: "1".repeat(81),
        difficulty: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data?.difficulty).toBe(5);
    });
  });

  describe("dailies", () => {
    it("should get all dailies", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            uuid: VALID_UUID,
            board_uuid: VALID_UUID,
            date: "2025-01-15",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/dailies`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getDailies(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get today's daily", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          board_uuid: VALID_UUID,
          date: "2025-01-15",
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/dailies/today`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getTodayDaily(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get daily by date", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          board_uuid: VALID_UUID,
          date: "2025-01-15",
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/dailies/date/2025-01-15`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getDailyByDate(TEST_TOKEN, "2025-01-15");

      expect(result.success).toBe(true);
    });
  });

  describe("challenges", () => {
    it("should get all challenges", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            uuid: VALID_UUID,
            difficulty: 3,
            board_uuid: null,
            level_uuid: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/challenges`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getChallenges(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should filter challenges by level and difficulty", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/challenges?level=1&difficulty=5`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getChallenges(TEST_TOKEN, {
        level: 1,
        difficulty: 5,
      });

      expect(result.success).toBe(true);
    });

    it("should get a random challenge", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          difficulty: 3,
          board_uuid: null,
          level_uuid: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/challenges/random`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getRandomChallenge(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should create a challenge", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          difficulty: 3,
          board_uuid: null,
          level_uuid: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/challenges`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.createChallenge(TEST_TOKEN, {
        difficulty: 3,
        board_uuid: null,
        level_uuid: null,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("users", () => {
    it("should get user subscription with authentication", async () => {
      const userId = "user-123";
      const mockResponse = {
        success: true,
        data: {
          hasSubscription: true,
          entitlements: [{ identifier: "premium", isActive: true }],
          subscriptionStartedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/users/${userId}/subscriptions`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getUserSubscription(TEST_TOKEN, userId);

      expect(result.success).toBe(true);
      expect(result.data?.hasSubscription).toBe(true);
    });

    it("should get user subscription without active subscription", async () => {
      const userId = "user-456";
      const mockResponse = {
        success: true,
        data: {
          hasSubscription: false,
          entitlements: [],
          subscriptionStartedAt: null,
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/users/${userId}/subscriptions`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getUserSubscription(TEST_TOKEN, userId);

      expect(result.success).toBe(true);
      expect(result.data?.hasSubscription).toBe(false);
    });
  });

  describe("validation errors", () => {
    it("should throw for invalid level number (0)", async () => {
      await expect(client.getLevel(TEST_TOKEN, 0)).rejects.toThrow(
        "Invalid level: 0. Expected 1-12",
      );
    });

    it("should throw for invalid level number (13)", async () => {
      await expect(client.getLevel(TEST_TOKEN, 13)).rejects.toThrow(
        "Invalid level: 13. Expected 1-12",
      );
    });

    it("should throw for invalid level on update", async () => {
      await expect(
        client.updateLevel(TEST_TOKEN, 0, { title: "test" }),
      ).rejects.toThrow("Invalid level: 0. Expected 1-12");
    });

    it("should throw for invalid level on delete", async () => {
      await expect(client.deleteLevel(TEST_TOKEN, 13)).rejects.toThrow(
        "Invalid level: 13. Expected 1-12",
      );
    });

    it("should throw for invalid technique number", async () => {
      await expect(client.getTechnique(TEST_TOKEN, 0)).rejects.toThrow(
        "Invalid technique: 0. Expected >= 1",
      );
    });

    it("should throw for invalid technique on update", async () => {
      await expect(
        client.updateTechnique(TEST_TOKEN, -1, {
          title: "test",
          index: 1,
          text: null,
        }),
      ).rejects.toThrow("Invalid technique: -1. Expected >= 1");
    });

    it("should throw for invalid technique on delete", async () => {
      await expect(client.deleteTechnique(TEST_TOKEN, 0)).rejects.toThrow(
        "Invalid technique: 0. Expected >= 1",
      );
    });

    it("should throw for invalid date format", async () => {
      await expect(
        client.getDailyByDate(TEST_TOKEN, "01-15-2025"),
      ).rejects.toThrow('Invalid date format: "01-15-2025"');
    });

    it("should throw for incomplete date format", async () => {
      await expect(
        client.getDailyByDate(TEST_TOKEN, "2025-01"),
      ).rejects.toThrow('Invalid date format: "2025-01"');
    });

    it("should throw for empty userId on getUser", async () => {
      await expect(client.getUser(TEST_TOKEN, "")).rejects.toThrow(
        'Invalid userId: ""',
      );
    });

    it("should throw for too long userId on getUser", async () => {
      const longUserId = "a".repeat(129);
      await expect(client.getUser(TEST_TOKEN, longUserId)).rejects.toThrow(
        "Invalid userId",
      );
    });

    it("should throw for empty userId on getUserSubscription", async () => {
      await expect(client.getUserSubscription(TEST_TOKEN, "")).rejects.toThrow(
        'Invalid userId: ""',
      );
    });

    it("should throw for invalid practice technique number", async () => {
      await expect(client.getRandomPractice(TEST_TOKEN, 0)).rejects.toThrow(
        "Invalid technique: 0. Expected >= 1",
      );
    });
  });

  describe("no data handling", () => {
    it("should throw when server returns no data", async () => {
      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/levels`,
        { data: undefined },
        "GET",
      );

      await expect(client.getLevels(TEST_TOKEN)).rejects.toThrow(
        "No data received from server",
      );
    });
  });

  describe("practices", () => {
    it("should get practice counts", async () => {
      const mockResponse = {
        success: true,
        data: [
          { technique: 1, count: 10 },
          { technique: 2, count: 5 },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/practices/counts`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getPracticeCounts(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should get a random practice for a technique", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          technique: 1,
          board_original: "0".repeat(81),
          board_solution: "1".repeat(81),
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/practices/technique/1/random`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getRandomPractice(TEST_TOKEN, 1);

      expect(result.success).toBe(true);
    });

    it("should create a practice", async () => {
      const mockResponse = {
        success: true,
        data: {
          uuid: VALID_UUID,
          technique: 1,
          board_original: "0".repeat(81),
          board_solution: "1".repeat(81),
          created_at: new Date(),
          updated_at: new Date(),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/practices`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.createPractice(TEST_TOKEN, {
        technique: 1,
        board_original: "0".repeat(81),
        board_solution: "1".repeat(81),
      });

      expect(result.success).toBe(true);
    });

    it("should delete all practices", async () => {
      const mockResponse = {
        success: true,
        data: { deleted: 15, message: "All practices deleted" },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/practices?confirm=true`,
        { data: mockResponse },
        "DELETE",
      );

      const result = await client.deleteAllPractices(TEST_TOKEN);

      expect(result.success).toBe(true);
      expect(result.data?.deleted).toBe(15);
    });
  });

  describe("gamification", () => {
    it("should get gamification stats", async () => {
      const mockResponse = {
        success: true,
        data: {
          totalPoints: 1500,
          level: 5,
          badges: [],
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/gamification/stats`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getGamificationStats(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get badge definitions", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: "first_solve",
            name: "First Solve",
            description: "Complete your first puzzle",
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/gamification/badges`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getBadgeDefinitions();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should get point history", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: "txn-1",
            points: 100,
            reason: "puzzle_complete",
            created_at: new Date(),
          },
        ],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/gamification/history`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getPointHistory(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get point history with pagination", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/gamification/history?limit=10&offset=20`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getPointHistory(TEST_TOKEN, {
        limit: 10,
        offset: 20,
      });

      expect(result.success).toBe(true);
    });

    it("should start a play session", async () => {
      const mockResponse = {
        success: true,
        data: { sessionId: "session-123" },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/play/start`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.playStart(TEST_TOKEN, {
        board_uuid: VALID_UUID,
        mode: "play",
      });

      expect(result.success).toBe(true);
    });

    it("should finish a play session", async () => {
      const mockResponse = {
        success: true,
        data: {
          points_earned: 100,
          badges_earned: [],
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/play/finish`,
        { data: mockResponse },
        "POST",
      );

      const result = await client.playFinish(TEST_TOKEN, {
        session_uuid: "session-123",
        completed: true,
        time_seconds: 120,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("solver", () => {
    it("should validate a puzzle", async () => {
      const mockResponse = {
        success: true,
        data: {
          valid: true,
          uniqueSolution: true,
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/solver/validate?original=${"0".repeat(81)}`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.solverValidate(TEST_TOKEN, {
        original: "0".repeat(81),
      });

      expect(result.success).toBe(true);
    });

    it("should generate a puzzle", async () => {
      const mockResponse = {
        success: true,
        data: {
          original: "0".repeat(81),
          solution: "1".repeat(81),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/solver/generate`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.solverGenerate(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should generate a symmetrical puzzle", async () => {
      const mockResponse = {
        success: true,
        data: {
          original: "0".repeat(81),
          solution: "1".repeat(81),
        },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/solver/generate?symmetrical=true`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.solverGenerate(TEST_TOKEN, {
        symmetrical: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("examples", () => {
    it("should get example counts", async () => {
      const mockResponse = {
        success: true,
        data: { total: 100 },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/examples/counts`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getExampleCounts(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get examples", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/examples`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getExamples(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get examples filtered by technique", async () => {
      const mockResponse = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/examples?technique=3`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getExamples(TEST_TOKEN, { technique: 3 });

      expect(result.success).toBe(true);
    });
  });

  describe("board counts", () => {
    it("should get board counts", async () => {
      const mockResponse = {
        success: true,
        data: { total: 500, withoutTechniques: 50 },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards/counts`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getBoardCounts(TEST_TOKEN);

      expect(result.success).toBe(true);
    });

    it("should get board counts by technique", async () => {
      const mockResponse = {
        success: true,
        data: { 1: 100, 2: 200 },
        timestamp: new Date().toISOString(),
      };

      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards/counts/by-technique`,
        { data: mockResponse },
        "GET",
      );

      const result = await client.getBoardCountsByTechnique(TEST_TOKEN);

      expect(result.success).toBe(true);
    });
  });

  // Bit N = technique id N. Technique 60 + technique 1 needs 61 bits, which a
  // JS number cannot hold: Number(MASK) drops bit 1. The client must pass the
  // decimal string (or a bigint) to sudojo_api without a Number round-trip.
  describe("technique bitmasks beyond 2^53", () => {
    const MASK = "1152921504606846978";
    const MASK_BIGINT = (1n << 60n) | (1n << 1n);
    // Number(MASK) is exactly 2^60 (bit 1 lost), but String() of that double
    // is "1152921504606847000" = 2^60 + 24, which a BigInt parser reads as
    // techniques 60, 4 and 3.
    const LOSSY = String(Number(MASK));
    const NUMBER_EXACT = "1152921504606846976"; // BigInt(Number(MASK))

    const lastBody = (): Record<string, unknown> => {
      const body = mockNetworkClient.getLastRequest()?.body;
      expect(typeof body).toBe("string");
      return JSON.parse(body as string) as Record<string, unknown>;
    };

    it("fixture is really beyond Number precision", () => {
      expect(MASK_BIGINT.toString()).toBe(MASK);
      expect(LOSSY).toBe("1152921504606847000");
      expect(BigInt(Number(MASK)).toString()).toBe(NUMBER_EXACT);
    });

    it("getBoards sends a numeric mask > 2^53 as its exact value, not String(n)", async () => {
      // The number already lost bit 1; it must not also invent bits 3 and 4.
      await client.getBoards(TEST_TOKEN, {
        level: undefined,
        symmetrical: undefined,
        limit: undefined,
        offset: undefined,
        techniques: Number(MASK),
        technique_bit: Number(MASK),
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/boards?techniques=${NUMBER_EXACT}&technique_bit=${NUMBER_EXACT}`,
      );
    });

    it("getBoards sends small numeric masks as before", async () => {
      await client.getBoards(TEST_TOKEN, {
        level: 3,
        symmetrical: undefined,
        limit: 10,
        offset: 0,
        techniques: 6,
        technique_bit: 2,
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/boards?level=3&limit=10&offset=0&techniques=6&technique_bit=2`,
      );
    });

    it("getBoards sends techniques / technique_bit strings unchanged", async () => {
      await client.getBoards(TEST_TOKEN, {
        level: undefined,
        symmetrical: undefined,
        limit: undefined,
        offset: undefined,
        techniques: MASK,
        technique_bit: MASK,
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/boards?techniques=${MASK}&technique_bit=${MASK}`,
      );
    });

    it("getBoards sends bigint bitmasks as exact decimal strings", async () => {
      await client.getBoards(TEST_TOKEN, {
        level: undefined,
        symmetrical: undefined,
        limit: undefined,
        offset: undefined,
        techniques: MASK_BIGINT as unknown as string,
        technique_bit: MASK_BIGINT as unknown as string,
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/boards?techniques=${MASK}&technique_bit=${MASK}`,
      );
    });

    it("getBoards preserves bit 127 alongside bit 1", async () => {
      const wideMask = ((1n << 127n) | 2n).toString();
      await client.getBoards(TEST_TOKEN, {
        level: undefined,
        symmetrical: undefined,
        limit: undefined,
        offset: undefined,
        techniques: wideMask,
        technique_bit: wideMask,
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/boards?techniques=${wideMask}&technique_bit=${wideMask}`,
      );
    });

    it.each([
      [
        "createBoard",
        (c: SudojoClient, techniques: string) =>
          c.createBoard(TEST_TOKEN, {
            level: 12,
            symmetrical: undefined,
            board: "0".repeat(81),
            solution: "1".repeat(81),
            techniques,
          }),
      ],
      [
        "updateBoard",
        (c: SudojoClient, techniques: string) =>
          c.updateBoard(TEST_TOKEN, VALID_UUID, {
            level: undefined,
            symmetrical: undefined,
            board: undefined,
            solution: undefined,
            techniques,
          }),
      ],
      [
        "createDaily",
        (c: SudojoClient, techniques: string) =>
          c.createDaily(TEST_TOKEN, {
            date: "2026-09-10",
            board_uuid: undefined,
            level: 12,
            techniques,
            board: "0".repeat(81),
            solution: "1".repeat(81),
          }),
      ],
      [
        "updateDaily",
        (c: SudojoClient, techniques: string) =>
          c.updateDaily(TEST_TOKEN, VALID_UUID, {
            date: undefined,
            board_uuid: undefined,
            level: undefined,
            techniques,
            board: undefined,
            solution: undefined,
          }),
      ],
    ])(
      "%s sends a string techniques bitmask in the body unchanged",
      async (_name, call) => {
        await call(client, MASK);

        expect(lastBody()["techniques"]).toBe(MASK);
        expect(mockNetworkClient.getLastRequest()?.body).toContain(
          `"techniques":"${MASK}"`,
        );
      },
    );

    it("createExample sends a string techniques_bitfield unchanged", async () => {
      await client.createExample(TEST_TOKEN, {
        board: "0".repeat(81),
        pencilmarks: undefined,
        solution: "1".repeat(81),
        techniques_bitfield: MASK,
        primary_technique: 60,
        hint_data: undefined,
        source_board_uuid: undefined,
      });

      expect(lastBody()["techniques_bitfield"]).toBe(MASK);
    });

    it("serializes a bigint in a request body as an exact decimal string", async () => {
      await client.createBoard(TEST_TOKEN, {
        level: 12,
        symmetrical: undefined,
        board: "0".repeat(81),
        solution: "1".repeat(81),
        techniques: MASK_BIGINT as unknown as string,
      });

      expect(lastBody()["techniques"]).toBe(MASK);
    });

    it("returns response techniques_bitmask strings unchanged", async () => {
      mockNetworkClient.setMockResponse(
        `${BASE_URL}/api/v1/boards/${VALID_UUID}`,
        {
          data: {
            success: true,
            data: {
              uuid: VALID_UUID,
              techniques: Number(MASK),
              techniques_bitmask: MASK,
            },
            timestamp: new Date().toISOString(),
          },
        },
        "GET",
      );

      const result = await client.getBoard(TEST_TOKEN, VALID_UUID);

      expect(result.data?.techniques_bitmask).toBe(MASK);
    });

    it("solverSolve techniques is a technique-ID list, sent as-is", async () => {
      mockNetworkClient.setDefaultResponse({
        data: { success: true, data: {}, timestamp: "" },
        status: 200,
        ok: true,
      });

      await client.solverSolve(TEST_TOKEN, {
        original: "0".repeat(81),
        user: "0".repeat(81),
        techniques: "1,2,60",
      });

      expect(mockNetworkClient.getLastRequest()?.url).toBe(
        `${BASE_URL}/api/v1/solver/solve?original=${"0".repeat(81)}&techniques=1,2,60&user=${"0".repeat(81)}`,
      );
    });
  });
});

describe("createSudojoClient", () => {
  it("should create a SudojoClient instance", () => {
    const mockNetworkClient = new MockNetworkClient();
    const client = createSudojoClient(mockNetworkClient, BASE_URL);

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(SudojoClient);
  });
});

describe("utility exports", () => {
  describe("isValidUUID", () => {
    it("should return true for a valid UUID", () => {
      expect(isValidUUID(VALID_UUID)).toBe(true);
    });

    it("should return false for an invalid UUID", () => {
      expect(isValidUUID("not-a-uuid")).toBe(false);
    });

    it("should return false for an empty string", () => {
      expect(isValidUUID("")).toBe(false);
    });
  });

  describe("validateUUID", () => {
    it("should return the UUID for a valid input", () => {
      expect(validateUUID(VALID_UUID, "Test")).toBe(VALID_UUID);
    });

    it("should throw for an invalid UUID", () => {
      expect(() => validateUUID("not-valid", "Test")).toThrow();
    });
  });
});
