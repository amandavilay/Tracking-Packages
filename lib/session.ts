export async function sessionToken(password: string) {
  const data = new TextEncoder().encode(`shopping-tracker:${password}:${process.env.TOKEN_ENCRYPTION_KEY || ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
