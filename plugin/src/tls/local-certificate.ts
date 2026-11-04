import {
  createPrivateKey,
  createSign,
  createVerify,
  X509Certificate,
} from "node:crypto";
import { generate } from "selfsigned";

export interface LocalTlsMaterial {
  fingerprint: string;
  certificate: string;
  privateKey: string;
}

export function restoreLocalTlsMaterial(
  certificate: string,
  privateKey: string,
  fingerprint: string,
): LocalTlsMaterial | null {
  if (
    !certificate.includes("BEGIN CERTIFICATE")
    || !privateKey.includes("PRIVATE KEY")
  ) {
    return null;
  }

  try {
    const certPublicKey = new X509Certificate(certificate).publicKey;
    const privateKeyObject = createPrivateKey(privateKey);
    const message = Buffer.from("A2RG local TLS pair verification");
    const signature = createSign("sha256")
      .update(message)
      .sign(privateKeyObject);
    const validPair = createVerify("sha256")
      .update(message)
      .verify(certPublicKey, signature);

    if (!validPair) {
      return null;
    }

    return {
      certificate,
      privateKey,
      fingerprint,
    };
  } catch {
    return null;
  }
}

export async function generateLocalTlsCertificate(): Promise<LocalTlsMaterial> {
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

  return {
    fingerprint: pems.fingerprint,
    certificate: pems.cert,
    privateKey: pems.private,
  };
}
