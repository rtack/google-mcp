import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server as NetServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to reserve a TCP port");
  }

  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
};

const waitForStartup = async (child: ChildProcessWithoutNullStreams): Promise<string> => {
  let stderr = "";
  await new Promise<void>((resolveStartup, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`server did not start in time:\n${stderr}`));
    }, 10_000);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes("Google MCP Server running")) {
        clearTimeout(timeout);
        resolveStartup();
      }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `server exited before startup (code=${String(code)}, signal=${String(signal)}):\n${stderr}`
        )
      );
    });
  });
  return stderr;
};

const waitForExit = async (
  child: ChildProcessWithoutNullStreams
): Promise<{ code: number | null; stderr: string }> => {
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const code = await new Promise<number | null>((resolveExit, reject) => {
    const timeout = setTimeout(() => reject(new Error(`process did not exit in time:\n${stderr}`)), 10_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timeout);
      resolveExit(exitCode);
    });
  });
  return { code, stderr };
};

const spawnServer = (
  port: number,
  dataRoot: string,
  extraEnv: Record<string, string> = {}
): ChildProcessWithoutNullStreams =>
  spawn(resolve("node_modules/.bin/tsx"), ["src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOOGLE_MCP_HOST: "127.0.0.1",
      GOOGLE_MCP_PORT: String(port),
      XDG_CONFIG_HOME: join(dataRoot, "config"),
      XDG_DATA_HOME: join(dataRoot, "data"),
      ...extraEnv,
    },
    stdio: "pipe",
  });

describe("Google MCP port-conflict handling", () => {
  const cleanup: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("exits 0 with a clear message when another google-mcp is already healthy on the port", async () => {
    const port = await reservePort();
    const dataRoot = await mkdtemp(join(tmpdir(), "google-mcp-conflict-test-"));
    cleanup.push(() => rm(dataRoot, { recursive: true, force: true }));

    const first = spawnServer(port, dataRoot);
    cleanup.push(() => {
      if (first.exitCode === null) first.kill("SIGTERM");
    });
    await waitForStartup(first);

    const second = spawnServer(port, dataRoot);
    const { code, stderr } = await waitForExit(second);

    expect(code).toBe(0);
    expect(stderr).toContain("already running");
    expect(stderr).toContain(`${port}`);
    // The whole point: no raw Node crash trace, just the explanation.
    expect(stderr).not.toContain("Unhandled 'error' event");
    expect(stderr).not.toContain("EADDRINUSE");
  });

  it("exits 1 with actionable guidance when an unrelated process holds the port", async () => {
    const port = await reservePort();
    const dataRoot = await mkdtemp(join(tmpdir(), "google-mcp-conflict-test-"));
    cleanup.push(() => rm(dataRoot, { recursive: true, force: true }));

    const squatter: NetServer = createServer();
    const squatterSockets = new Set<Socket>();
    squatter.on("connection", (socket) => {
      squatterSockets.add(socket);
      socket.on("close", () => squatterSockets.delete(socket));
    });
    await new Promise<void>((resolveListen, reject) => {
      squatter.once("error", reject);
      squatter.listen(port, "127.0.0.1", resolveListen);
    });
    cleanup.push(() => {
      for (const socket of squatterSockets) socket.destroy();
      return new Promise<void>((r) => squatter.close(() => r()));
    });

    const child = spawnServer(port, dataRoot);
    const { code, stderr } = await waitForExit(child);

    expect(code).toBe(1);
    expect(stderr).toContain(`port ${port}`);
    expect(stderr).toContain("lsof -nP");
    expect(stderr).toContain("GOOGLE_MCP_PORT");
    expect(stderr).not.toContain("Unhandled 'error' event");
  });

  it("serves its identity at GET /health", async () => {
    const port = await reservePort();
    const dataRoot = await mkdtemp(join(tmpdir(), "google-mcp-conflict-test-"));
    cleanup.push(() => rm(dataRoot, { recursive: true, force: true }));

    const child = spawnServer(port, dataRoot);
    cleanup.push(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    });
    await waitForStartup(child);

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { name?: string; pid?: number };
    expect(body.name).toBe("google-mcp");
    expect(typeof body.pid).toBe("number");
  });

  it("releases the port promptly on SIGTERM instead of lingering as an orphan", async () => {
    const port = await reservePort();
    const dataRoot = await mkdtemp(join(tmpdir(), "google-mcp-conflict-test-"));
    cleanup.push(() => rm(dataRoot, { recursive: true, force: true }));

    const child = spawnServer(port, dataRoot);
    cleanup.push(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    });
    await waitForStartup(child);

    child.kill("SIGTERM");
    const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveExit, reject) => {
        const timeout = setTimeout(() => reject(new Error("did not exit within 3s of SIGTERM")), 3_000);
        child.once("exit", (exitCode, exitSignal) => {
          clearTimeout(timeout);
          resolveExit({ code: exitCode, signal: exitSignal });
        });
      }
    );
    expect(code === 0 || signal === "SIGTERM").toBe(true);

    // Port must be free immediately after — a fresh listener should bind clean.
    const probe = createServer();
    await new Promise<void>((resolveListen, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolveListen);
    });
    await new Promise<void>((r) => probe.close(() => r()));
  });
});
