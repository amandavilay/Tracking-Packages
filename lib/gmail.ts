import { google, gmail_v1 } from "googleapis";
import * as cheerio from "cheerio";
import { db, getSettings } from "./db";
import { encrypt, decrypt } from "./crypto";
import type { RawEmail } from "./parser";

export const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.email"];

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/auth/google/callback`,
  );
}

export function authUrl() {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
}

export async function saveTokensFromCode(code: string) {
  const o = oauthClient();
  const { tokens } = await o.getToken(code);
  o.setCredentials(tokens);
  const me = await google.oauth2({ version: "v2", auth: o }).userinfo.get();
  await getSettings();
  await db.settings.update({ where: { id: 1 }, data: { gmailTokensEnc: encrypt(JSON.stringify(tokens)), gmailEmail: me.data.email } });
}

export async function gmailClient(): Promise<gmail_v1.Gmail | null> {
  const s = await getSettings();
  if (!s.gmailTokensEnc) return null;
  const o = oauthClient();
  o.setCredentials(JSON.parse(decrypt(s.gmailTokensEnc)));
  // Persist refreshed tokens (still encrypted).
  o.on("tokens", async (t) => {
    const cur = JSON.parse(decrypt((await getSettings()).gmailTokensEnc!));
    await db.settings.update({ where: { id: 1 }, data: { gmailTokensEnc: encrypt(JSON.stringify({ ...cur, ...t })) } });
  });
  return google.gmail({ version: "v1", auth: o });
}

const PHRASES = ["order confirmation", "tracking number", "has shipped", "on its way", "out for delivery", "return label", "return received", "refund", "order confirmed", "your order", "delivered"];
const SENDERS = ["amazon.com", "ups.com", "usps.com", "fedex.com", "dhl.com", "shop.app", "narvar.com", "route.com", "loopreturns.com", "happyreturns.com"];

export function buildQuery(after: Date) {
  const phrases = PHRASES.map((p) => `"${p}"`).join(" OR ");
  const senders = SENDERS.map((s) => `from:${s}`).join(" OR ");
  return `(${phrases} OR ${senders}) after:${Math.floor(after.getTime() / 1000)} -in:chats`;
}

export async function listMessageIds(g: gmail_v1.Gmail, q: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await g.users.messages.list({ userId: "me", q, maxResults: 500, pageToken });
    (r.data.messages || []).forEach((m) => m.id && ids.push(m.id));
    pageToken = r.data.nextPageToken || undefined;
  } while (pageToken && ids.length < 3000);
  return ids;
}

function decode(data?: string | null) {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
}

function walk(p: gmail_v1.Schema$MessagePart | undefined, acc: { text: string; html: string }) {
  if (!p) return;
  if (p.mimeType === "text/plain") acc.text += decode(p.body?.data);
  else if (p.mimeType === "text/html") acc.html += decode(p.body?.data);
  p.parts?.forEach((c) => walk(c, acc));
}

export function htmlToText(html: string) {
  const $ = cheerio.load(html);
  $("style,script,head").remove();
  $("br").replaceWith("\n");
  $("p,div,tr,li,h1,h2,h3,h4,table").each((_, el) => { $(el).append("\n"); });
  $("td").each((_, el) => { $(el).append(" "); });
  return $.text().replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export async function fetchMessage(g: gmail_v1.Gmail, id: string): Promise<RawEmail> {
  const r = await g.users.messages.get({ userId: "me", id, format: "full" });
  const h = (n: string) => r.data.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value || "";
  const acc = { text: "", html: "" };
  walk(r.data.payload, acc);
  const text = acc.html ? htmlToText(acc.html) : acc.text;
  return { id, from: h("from"), subject: h("subject"), date: new Date(Number(r.data.internalDate)), text, html: acc.html || undefined };
}

export const gmailLink = (id: string) => `https://mail.google.com/mail/u/0/#all/${id}`;
