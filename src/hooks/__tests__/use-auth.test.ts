import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockSignInAction = vi.fn();
const mockSignUpAction = vi.fn();
const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
const mockGetProjects = vi.fn();
const mockCreateProject = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignInAction(...args),
  signUp: (...args: unknown[]) => mockSignUpAction(...args),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: (input: unknown) => mockCreateProject(input),
}));

import { useAuth } from "../use-auth";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    test("returns isLoading as false initially", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    test("returns signIn function", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
    });

    test("returns signUp function", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    test("sets isLoading to true during sign in", async () => {
      let resolveSignIn: (value: { success: boolean }) => void;
      mockSignInAction.mockImplementation(
        () => new Promise((resolve) => { resolveSignIn = resolve; })
      );

      const { result } = renderHook(() => useAuth());

      let signInPromise: Promise<unknown>;
      act(() => {
        signInPromise = result.current.signIn("test@example.com", "password123");
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolveSignIn!({ success: false });
        await signInPromise;
      });
    });

    test("sets isLoading to false after sign in completes", async () => {
      mockSignInAction.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("calls signInAction with email and password", async () => {
      mockSignInAction.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "securepass");
      });

      expect(mockSignInAction).toHaveBeenCalledWith("user@test.com", "securepass");
    });

    test("returns the result from signInAction", async () => {
      const expectedResult = { success: true };
      mockSignInAction.mockResolvedValue(expectedResult);
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "proj-1" }]);

      const { result } = renderHook(() => useAuth());

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signIn("test@example.com", "password");
      });

      expect(signInResult).toEqual(expectedResult);
    });

    test("returns error result on failed sign in", async () => {
      const expectedResult = { success: false, error: "Invalid credentials" };
      mockSignInAction.mockResolvedValue(expectedResult);

      const { result } = renderHook(() => useAuth());

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signIn("wrong@example.com", "wrongpass");
      });

      expect(signInResult).toEqual(expectedResult);
    });

    test("sets isLoading to false even if sign in fails", async () => {
      mockSignInAction.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.signIn("test@example.com", "password");
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isLoading).toBe(false);
    });

    describe("post sign in behavior", () => {
      test("creates project from anonymous work if it exists", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "Hello" }],
          fileSystemData: { "/App.jsx": "content" },
        });
        mockCreateProject.mockResolvedValue({ id: "new-project-123" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^Design from /),
          messages: [{ role: "user", content: "Hello" }],
          data: { "/App.jsx": "content" },
        });
      });

      test("clears anonymous work after creating project", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "Test" }],
          fileSystemData: {},
        });
        mockCreateProject.mockResolvedValue({ id: "proj-456" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockClearAnonWork).toHaveBeenCalled();
      });

      test("redirects to new project created from anonymous work", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "Test" }],
          fileSystemData: {},
        });
        mockCreateProject.mockResolvedValue({ id: "anon-project-789" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockPush).toHaveBeenCalledWith("/anon-project-789");
      });

      test("does not create project from anonymous work if messages are empty", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [],
          fileSystemData: {},
        });
        mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockCreateProject).not.toHaveBeenCalledWith(
          expect.objectContaining({ name: expect.stringMatching(/^Design from /) })
        );
      });

      test("redirects to most recent project if no anonymous work", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([
          { id: "recent-proj" },
          { id: "older-proj" },
        ]);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockPush).toHaveBeenCalledWith("/recent-proj");
      });

      test("creates new project if user has no projects", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "brand-new-proj" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
      });

      test("redirects to newly created project if user has no projects", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "fresh-project" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "password");
        });

        expect(mockPush).toHaveBeenCalledWith("/fresh-project");
      });

      test("does not perform post sign in actions on failed sign in", async () => {
        mockSignInAction.mockResolvedValue({ success: false, error: "Invalid" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("test@example.com", "wrongpass");
        });

        expect(mockGetAnonWorkData).not.toHaveBeenCalled();
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });

  describe("signUp", () => {
    test("sets isLoading to true during sign up", async () => {
      let resolveSignUp: (value: { success: boolean }) => void;
      mockSignUpAction.mockImplementation(
        () => new Promise((resolve) => { resolveSignUp = resolve; })
      );

      const { result } = renderHook(() => useAuth());

      let signUpPromise: Promise<unknown>;
      act(() => {
        signUpPromise = result.current.signUp("new@example.com", "newpassword");
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolveSignUp!({ success: false });
        await signUpPromise;
      });
    });

    test("sets isLoading to false after sign up completes", async () => {
      mockSignUpAction.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "newpassword");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("calls signUpAction with email and password", async () => {
      mockSignUpAction.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("newuser@test.com", "newsecurepass");
      });

      expect(mockSignUpAction).toHaveBeenCalledWith("newuser@test.com", "newsecurepass");
    });

    test("returns the result from signUpAction", async () => {
      const expectedResult = { success: true };
      mockSignUpAction.mockResolvedValue(expectedResult);
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "new-proj" });

      const { result } = renderHook(() => useAuth());

      let signUpResult;
      await act(async () => {
        signUpResult = await result.current.signUp("new@example.com", "password");
      });

      expect(signUpResult).toEqual(expectedResult);
    });

    test("returns error result on failed sign up", async () => {
      const expectedResult = { success: false, error: "Email already registered" };
      mockSignUpAction.mockResolvedValue(expectedResult);

      const { result } = renderHook(() => useAuth());

      let signUpResult;
      await act(async () => {
        signUpResult = await result.current.signUp("existing@example.com", "password");
      });

      expect(signUpResult).toEqual(expectedResult);
    });

    test("sets isLoading to false even if sign up fails", async () => {
      mockSignUpAction.mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.signUp("test@example.com", "password");
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isLoading).toBe(false);
    });

    describe("post sign up behavior", () => {
      test("creates project from anonymous work if it exists", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "assistant", content: "Generated code" }],
          fileSystemData: { "/App.jsx": "code" },
        });
        mockCreateProject.mockResolvedValue({ id: "signup-project" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^Design from /),
          messages: [{ role: "assistant", content: "Generated code" }],
          data: { "/App.jsx": "code" },
        });
      });

      test("clears anonymous work after creating project on sign up", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "Create a button" }],
          fileSystemData: {},
        });
        mockCreateProject.mockResolvedValue({ id: "cleared-proj" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "password");
        });

        expect(mockClearAnonWork).toHaveBeenCalled();
      });

      test("redirects to project created from anonymous work on sign up", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "Test" }],
          fileSystemData: {},
        });
        mockCreateProject.mockResolvedValue({ id: "signup-anon-proj" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "password");
        });

        expect(mockPush).toHaveBeenCalledWith("/signup-anon-proj");
      });

      test("creates new project for new user with no anonymous work", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "new-user-proj" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("brand-new@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
        expect(mockPush).toHaveBeenCalledWith("/new-user-proj");
      });

      test("does not perform post sign up actions on failed sign up", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "Password too short" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "short");
        });

        expect(mockGetAnonWorkData).not.toHaveBeenCalled();
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });

  describe("edge cases", () => {
    test("handles anonymous work with empty fileSystemData", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "test" }],
        fileSystemData: {},
      });
      mockCreateProject.mockResolvedValue({ id: "empty-fs-proj" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockCreateProject).toHaveBeenCalledWith({
        name: expect.any(String),
        messages: [{ role: "user", content: "test" }],
        data: {},
      });
    });

    test("handles null return from getAnonWorkData", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "fallback-proj" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockPush).toHaveBeenCalledWith("/fallback-proj");
    });

    test("handles concurrent sign in calls", async () => {
      let resolveFirst: (value: { success: boolean }) => void;
      let resolveSecond: (value: { success: boolean }) => void;

      mockSignInAction
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveFirst = resolve; })
        )
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveSecond = resolve; })
        );

      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "proj" }]);

      const { result } = renderHook(() => useAuth());

      let promise1: Promise<unknown>;
      let promise2: Promise<unknown>;

      await act(async () => {
        promise1 = result.current.signIn("first@example.com", "pass1");
        promise2 = result.current.signIn("second@example.com", "pass2");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFirst!({ success: true });
        resolveSecond!({ success: true });
        await Promise.all([promise1, promise2]);
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("project name includes time for anonymous work", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "test" }],
        fileSystemData: {},
      });
      mockCreateProject.mockResolvedValue({ id: "timed-proj" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      const createCall = mockCreateProject.mock.calls[0][0];
      expect(createCall.name).toMatch(/^Design from \d{1,2}:\d{2}:\d{2}/);
    });

    test("new project name includes random number", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "random-proj" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      const createCall = mockCreateProject.mock.calls[0][0];
      expect(createCall.name).toMatch(/^New Design #\d+$/);
    });
  });
});
