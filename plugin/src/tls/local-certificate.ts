import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "selfsigned";

export interface LocalTlsMaterial {
  certificatePath: string;
  privateKeyPath: string;
  fingerprint: string;
  certificate: string;
  privateKey: string;
}

export async function generateLocalTlsCertificate(
  tlsDirectory: string,
): Promise<LocalTlsMaterial> {
  await mkdir(tlsDirectory, { recursive: true, mode: 0o700 });

  const notBeforeDate = new Date(Date.now() - 5 * 60 * 1000);
  const notAfterDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pems = await generate(
    [{ name: "commonName", value: "localhost" }],
    {
      keyType: "ec",
      curve: "P-256",
      algorithm: "sha256",
      notBeforeDate,
      notAfterDate,
      extensions: [
        {
          name: "basicConstraints",
          cA: true,
          critical: true,
        },
        {
          name: "keyUsage",
          digitalSignature: true,
          keyEncipherment: true,
          keyCertSign: true,
          critical: true,
        },
        {
          name: "extKeyUsage",
          serverAuth: true,
          clientAuth: true,
        },
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: "localhost" },
            { type: 7, ip: "127.0.0.1" },
            { type: 7, ip: "::1" },
          ],
        },
      ],
    },
  );

  const certificatePath = path.join(tlsDirectory, "localhost.pem");
  const privateKeyPath = path.join(tlsDirectory, "localhost-key.pem");

  await writeFile(certificatePath, pems.cert, {
    encoding: "utf-8",
    mode: 0o644,
  });
  await writeFile(privateKeyPath, pems.private, {
    encoding: "utf-8",
    mode: 0o600,
  });
  await chmod(privateKeyPath, 0o600);

  return {
    certificatePath,
    privateKeyPath,
    fingerprint: pems.fingerprint,
    certificate: pems.cert,
    privateKey: pems.private,
  };
}

export async function readLocalTlsMaterial(
  certificatePath: string,
  privateKeyPath: string,
  fingerprint: string = "",
): Promise<LocalTlsMaterial> {
  const [certificate, privateKey] = await Promise.all([
    readFile(certificatePath, "utf-8"),
    readFile(privateKeyPath, "utf-8"),
  ]);

  return {
    certificatePath,
    privateKeyPath,
    fingerprint,
    certificate,
    privateKey,
  };
}
