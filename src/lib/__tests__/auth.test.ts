import { describe, test, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to declare mocks before they're used in vi.mock factories
const { mockCookieStore, mockSign, mockJwtVerify, mockSetProtectedHeader, mockSetExpirationTime, mockSetIssuedAt, mockSignJWTConstructor } = vi.hoisted(() => {
  const mockSign = vi.fn().mockResolvedValue("mock-jwt-token");
  const mockSetIssuedAt = vi.fn().mockReturnThis();
  const mockSetExpirationTime = vi.fn().mockReturnThis();
  const mockSetProtectedHeader = vi.fn().mockReturnThis();

  return {
    mockCookieStore: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    mockSign,
    mockJwtVerify: vi.fn(),
    mockSetProtectedHeader,
    mockSetExpirationTime,
    mockSetIssuedAt,
    mockSignJWTConstructor: vi.fn().mockImplementation(() => ({
      setProtectedHeader: mockSetProtectedHeader,
      setExpirationTime: mockSetExpirationTime,
      setIssuedAt: mockSetIssuedAt,
      sign: mockSign,
    })),
  };
});

// Mock server-only to prevent import error
vi.mock("server-only", () => ({}));

// Mock next/headers cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// Mock jose for tests (jsdom has issues with jose's Uint8Array handling)
vi.mock("jose", () => ({
  SignJWT: mockSignJWTConstructor,
  jwtVerify: mockJwtVerify,
}));

// Import after mocks are set up
import {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} from "@/lib/auth";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSession", () => {
    test("creates a session and sets a cookie", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      const [cookieName, token, options] = mockCookieStore.set.mock.calls[0];

      expect(cookieName).toBe("auth-token");
      expect(token).toBe("mock-jwt-token");
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
      expect(options.expires).toBeInstanceOf(Date);
    });

    test("sets cookie expiration to 7 days from now", async () => {
      const beforeCreate = Date.now();
      await createSession("user-123", "test@example.com");
      const afterCreate = Date.now();

      const options = mockCookieStore.set.mock.calls[0][2];
      const expiresAt = options.expires.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(beforeCreate + sevenDaysMs - 1000);
      expect(expiresAt).toBeLessThanOrEqual(afterCreate + sevenDaysMs + 1000);
    });

    test("uses httpOnly cookie for security", async () => {
      await createSession("user-456", "another@example.com");

      const options = mockCookieStore.set.mock.calls[0][2];
      expect(options.httpOnly).toBe(true);
    });

    test("uses lax sameSite policy", async () => {
      await createSession("user-789", "user@example.com");

      const options = mockCookieStore.set.mock.calls[0][2];
      expect(options.sameSite).toBe("lax");
    });

    test("creates JWT with userId and email in payload", async () => {
      await createSession("user-abc", "payload@example.com");

      expect(mockSignJWTConstructor).toHaveBeenCalledTimes(1);
      const payload = mockSignJWTConstructor.mock.calls[0][0];

      expect(payload.userId).toBe("user-abc");
      expect(payload.email).toBe("payload@example.com");
      expect(payload.expiresAt).toBeInstanceOf(Date);
    });

    test("sets JWT protected header with HS256 algorithm", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockSetProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
    });

    test("sets JWT expiration time to 7 days", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockSetExpirationTime).toHaveBeenCalledWith("7d");
    });

    test("sets JWT issued at timestamp", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockSetIssuedAt).toHaveBeenCalledTimes(1);
    });

    test("signs the JWT token", async () => {
      await createSession("user-123", "test@example.com");

      expect(mockSign).toHaveBeenCalledTimes(1);
    });

    test("sets cookie path to root", async () => {
      await createSession("user-123", "test@example.com");

      const options = mockCookieStore.set.mock.calls[0][2];
      expect(options.path).toBe("/");
    });

    test("handles different user IDs correctly", async () => {
      await createSession("different-user-id-12345", "test@example.com");

      const payload = mockSignJWTConstructor.mock.calls[0][0];
      expect(payload.userId).toBe("different-user-id-12345");
    });

    test("handles different email addresses correctly", async () => {
      await createSession("user-123", "different.email+test@subdomain.example.com");

      const payload = mockSignJWTConstructor.mock.calls[0][0];
      expect(payload.email).toBe("different.email+test@subdomain.example.com");
    });

    test("creates unique expiration date for each session", async () => {
      await createSession("user-1", "test1@example.com");
      const firstExpires = mockCookieStore.set.mock.calls[0][2].expires;

      vi.clearAllMocks();

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createSession("user-2", "test2@example.com");
      const secondExpires = mockCookieStore.set.mock.calls[0][2].expires;

      expect(secondExpires.getTime()).toBeGreaterThanOrEqual(firstExpires.getTime());
    });

    test("calls JWT methods in correct order", async () => {
      const callOrder: string[] = [];
      mockSetProtectedHeader.mockImplementation(() => {
        callOrder.push("setProtectedHeader");
        return {
          setExpirationTime: mockSetExpirationTime,
          setIssuedAt: mockSetIssuedAt,
          sign: mockSign,
        };
      });
      mockSetExpirationTime.mockImplementation(() => {
        callOrder.push("setExpirationTime");
        return {
          setIssuedAt: mockSetIssuedAt,
          sign: mockSign,
        };
      });
      mockSetIssuedAt.mockImplementation(() => {
        callOrder.push("setIssuedAt");
        return { sign: mockSign };
      });
      mockSign.mockImplementation(() => {
        callOrder.push("sign");
        return Promise.resolve("mock-jwt-token");
      });

      await createSession("user-123", "test@example.com");

      expect(callOrder).toEqual([
        "setProtectedHeader",
        "setExpirationTime",
        "setIssuedAt",
        "sign",
      ]);
    });
  });

  describe("getSession", () => {
    test("returns null when no cookie exists", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const session = await getSession();

      expect(session).toBeNull();
    });

    test("returns null when cookie value is empty", async () => {
      mockCookieStore.get.mockReturnValue({ value: "" });

      const session = await getSession();

      expect(session).toBeNull();
    });

    test("returns session payload for valid token", async () => {
      const mockPayload = {
        userId: "user-123",
        email: "test@example.com",
        expiresAt: new Date().toISOString(),
      };
      mockCookieStore.get.mockReturnValue({ value: "valid-token" });
      mockJwtVerify.mockResolvedValue({ payload: mockPayload });

      const session = await getSession();

      expect(session).toEqual(mockPayload);
      expect(mockJwtVerify).toHaveBeenCalled();
    });

    test("returns null for invalid token", async () => {
      mockCookieStore.get.mockReturnValue({ value: "invalid-token" });
      mockJwtVerify.mockRejectedValue(new Error("Invalid token"));

      const session = await getSession();

      expect(session).toBeNull();
    });

    test("returns null for expired token", async () => {
      mockCookieStore.get.mockReturnValue({ value: "expired-token" });
      mockJwtVerify.mockRejectedValue(new Error("Token expired"));

      const session = await getSession();

      expect(session).toBeNull();
    });
  });

  describe("deleteSession", () => {
    test("deletes the auth cookie", async () => {
      await deleteSession();

      expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
    });

    test("calls delete exactly once", async () => {
      await deleteSession();

      expect(mockCookieStore.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("verifySession", () => {
    test("returns null when no cookie in request", async () => {
      const mockRequest = {
        cookies: {
          get: vi.fn().mockReturnValue(undefined),
        },
      } as any;

      const session = await verifySession(mockRequest);

      expect(session).toBeNull();
      expect(mockRequest.cookies.get).toHaveBeenCalledWith("auth-token");
    });

    test("returns null when cookie value is missing", async () => {
      const mockRequest = {
        cookies: {
          get: vi.fn().mockReturnValue({}),
        },
      } as any;

      const session = await verifySession(mockRequest);

      expect(session).toBeNull();
    });

    test("returns session payload for valid token in request", async () => {
      const mockPayload = {
        userId: "user-456",
        email: "middleware@example.com",
        expiresAt: new Date().toISOString(),
      };
      const mockRequest = {
        cookies: {
          get: vi.fn().mockReturnValue({ value: "valid-request-token" }),
        },
      } as any;
      mockJwtVerify.mockResolvedValue({ payload: mockPayload });

      const session = await verifySession(mockRequest);

      expect(session).toEqual(mockPayload);
    });

    test("returns null for invalid token in request", async () => {
      const mockRequest = {
        cookies: {
          get: vi.fn().mockReturnValue({ value: "invalid-token" }),
        },
      } as any;
      mockJwtVerify.mockRejectedValue(new Error("Invalid signature"));

      const session = await verifySession(mockRequest);

      expect(session).toBeNull();
    });

    test("returns null for expired token in request", async () => {
      const mockRequest = {
        cookies: {
          get: vi.fn().mockReturnValue({ value: "expired-token" }),
        },
      } as any;
      mockJwtVerify.mockRejectedValue(new Error("Token expired"));

      const session = await verifySession(mockRequest);

      expect(session).toBeNull();
    });
  });
});
