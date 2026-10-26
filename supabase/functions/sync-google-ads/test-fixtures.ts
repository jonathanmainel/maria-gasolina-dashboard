// Synthetic credentials generated in memory for tests. Never use a real key here.
export async function serviceAccountFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    publicKey: keyPair.publicKey,
    json: {
      type: "service_account",
      client_email: "test@synthetic-project.iam.gserviceaccount.com",
      private_key: `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`,
      token_uri: "https://oauth2.googleapis.com/token",
    },
  };
}
