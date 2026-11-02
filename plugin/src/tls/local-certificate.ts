import { generate } from "selfsigned";

export interface LocalTlsMaterial {
  fingerprint: string;
  certificate: string;
  privateKey: string;
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
