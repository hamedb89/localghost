import { createServer } from "node:net";

export type FindAvailablePortOptions = {
  host?: string;
  maxAttempts?: number;
};

export async function isPortAvailable(port: number, host = "127.0.0.1") {
  return new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

export async function findAvailablePort(startPort: number, options: FindAvailablePortOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const maxAttempts = options.maxAttempts ?? 50;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + maxAttempts - 1}.`);
}
