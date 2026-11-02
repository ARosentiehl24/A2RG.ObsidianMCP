import { homedir } from "node:os";
import path from "node:path";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

export class SecureConfigStore {
  getDirectory(): string {
    const home = homedir();
    if (process.platform === "darwin") {
      return path.join(
        home,
        "Library",
        "Application Support",
        "Obsidian",
        "a2rg-mcp-bridge",
      );
    }
    if (process.platform === "win32") {
      const appData =
        process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
      return path.join(appData, "Obsidian", "a2rg-mcp-bridge");
    }
    return path.join(home, ".config", "obsidian", "a2rg-mcp-bridge");
  }

  getTlsDirectory(): string {
    return path.join(this.getDirectory(), "tls");
  }

  isWithinDirectory(filePath: string, directory: string): boolean {
    const relative = path.relative(directory, filePath);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  async ensureToken(generate: () => string): Promise<string> {
    const tokenFile = path.join(this.getDirectory(), "token");
    try {
      await mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
      await chmod(path.dirname(tokenFile), 0o700).catch(() => undefined);
      const existing = (await readFile(tokenFile, "utf-8")).trim();
      if (/^[0-9a-f]{64}$/i.test(existing)) {
        await chmod(tokenFile, 0o600).catch(() => undefined);
        return existing;
      }
    } catch {
      // Generate a replacement token below.
    }

    const token = generate();
    await this.writeToken(token);
    return token;
  }

  async writeToken(token: string): Promise<void> {
    const secureDirectory = this.getDirectory();
    const tokenFile = path.join(secureDirectory, "token");
    await mkdir(secureDirectory, { recursive: true, mode: 0o700 });
    await chmod(secureDirectory, 0o700).catch(() => undefined);
    await writeFile(tokenFile, token, { encoding: "utf-8", mode: 0o600 });
    await chmod(tokenFile, 0o600);
  }

  async secureSecrets(privateKeyPath: string = ""): Promise<string[]> {
    if (process.platform === "win32") {
      return [];
    }

    const warnings: string[] = [];
    const secureDirectory = this.getDirectory();
    await mkdir(secureDirectory, { recursive: true, mode: 0o700 }).catch(() => undefined);
    await chmod(secureDirectory, 0o700).catch(() => undefined);
    if (!(await this.isPrivateDirectory(secureDirectory))) {
      warnings.push("secure configuration directory");
    }

    const tokenFile = path.join(secureDirectory, "token");
    await chmod(tokenFile, 0o600).catch(() => undefined);
    if (await this.pathExists(tokenFile) && !(await this.isPrivateFile(tokenFile))) {
      warnings.push("bearer token");
    }

    const tlsDirectory = this.getTlsDirectory();
    await mkdir(tlsDirectory, { recursive: true, mode: 0o700 }).catch(() => undefined);
    await chmod(tlsDirectory, 0o700).catch(() => undefined);
    if (!(await this.isPrivateDirectory(tlsDirectory))) {
      warnings.push("TLS directory");
    }

    if (privateKeyPath) {
      await chmod(privateKeyPath, 0o600).catch(() => undefined);
      if (
        await this.pathExists(privateKeyPath) &&
        !(await this.isPrivateFile(privateKeyPath))
      ) {
        warnings.push("TLS private key");
      }
    }

    return warnings;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await lstat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async isPrivateDirectory(directoryPath: string): Promise<boolean> {
    try {
      const stat = await lstat(directoryPath);
      return stat.isDirectory() && (stat.mode & 0o077) === 0;
    } catch {
      return false;
    }
  }

  private async isPrivateFile(filePath: string): Promise<boolean> {
    try {
      const stat = await lstat(filePath);
      return stat.isFile() && (stat.mode & 0o077) === 0;
    } catch {
      return false;
    }
  }
}
