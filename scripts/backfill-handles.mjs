import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const flags = process.argv.slice(2);
const target = flags.includes("--remote") ? "--remote" : "--local";
const dry = flags.includes("--dry");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

const vars = existsSync(join(root, ".dev.vars"))
  ? Object.fromEntries(readFileSync(join(root, ".dev.vars"), "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  : {};
const env = (k) => process.env[k] || vars[k];

const TWITCH_LOGIN = /^[a-z0-9_]{1,25}$/;
const YOUTUBE_HANDLE = /^[a-z0-9._-]{3,30}$/;

function d1(command) {
  const out = execFileSync(process.execPath, [WRANGLER, "d1", "execute", "deadcards", target, "--json", "--command", command], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out)[0].results;
}

async function twitchLogins(ids) {
  const token = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: env("TWITCH_CLIENT_ID"), client_secret: env("TWITCH_CLIENT_SECRET"), grant_type: "client_credentials" }),
  }).then((r) => r.json());
  if (!token.access_token) throw new Error(`token da Twitch falhou: ${JSON.stringify(token)}`);
  const logins = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const qs = ids.slice(i, i + 100).map((id) => `id=${encodeURIComponent(id)}`).join("&");
    const res = await fetch(`https://api.twitch.tv/helix/users?${qs}`, { headers: { authorization: `Bearer ${token.access_token}`, "client-id": env("TWITCH_CLIENT_ID") } });
    if (!res.ok) throw new Error(`helix/users ${res.status}: ${await res.text()}`);
    for (const u of (await res.json()).data ?? []) if (TWITCH_LOGIN.test(u.login)) logins.set(u.id, u.login);
  }
  return logins;
}

async function youtubeHandle(refreshToken) {
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: refreshToken, grant_type: "refresh_token" }),
  }).then((r) => r.json());
  if (!token.access_token) return { error: token.error ?? "sem access_token" };
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!res.ok) return { error: `channels ${res.status}` };
  const url = (await res.json()).items?.[0]?.snippet?.customUrl;
  const handle = typeof url === "string" ? url.toLowerCase().replace(/^@/, "") : null;
  return handle && YOUTUBE_HANDLE.test(handle) ? { handle } : { error: "sem @ no canal" };
}

const accounts = d1(`SELECT "userId", "providerId", "accountId", "refreshToken" FROM account WHERE "providerId" IN ('twitch', 'google')`);
const held = d1("SELECT user_id, handle, provider FROM profile_handles");
const byUser = new Map(held.map((h) => [h.user_id, h]));
const byHandle = new Map(held.map((h) => [h.handle, h]));
const plan = [];
const skipped = [];

// mesmas regras do syncHandle em src/handles.ts: Twitch primeiro e pode tomar o nick de um canal do YouTube
function assign(userId, handle, provider) {
  const holder = byHandle.get(handle);
  if (holder && holder.user_id !== userId && holder.provider !== provider && provider !== "twitch") return skipped.push(`${userId} (${provider}): @${handle} já é de outro usuário`);
  if (holder && holder.user_id !== userId) byUser.delete(holder.user_id);
  const row = { user_id: userId, handle, provider };
  byUser.set(userId, row);
  byHandle.set(handle, row);
  plan.push(row);
}

const twitch = accounts.filter((a) => a.providerId === "twitch" && !byUser.has(a.userId));
const logins = twitch.length ? await twitchLogins(twitch.map((a) => a.accountId)) : new Map();
for (const a of twitch) {
  const login = logins.get(a.accountId);
  if (login) assign(a.userId, login, "twitch");
  else skipped.push(`${a.userId} (twitch): login não encontrado`);
}

for (const a of accounts.filter((x) => x.providerId === "google" && !byUser.has(x.userId))) {
  if (!a.refreshToken) { skipped.push(`${a.userId} (google): sem refresh token`); continue; }
  const r = await youtubeHandle(a.refreshToken);
  if (r.handle) assign(a.userId, r.handle, "google");
  else skipped.push(`${a.userId} (google): ${r.error}`);
}

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
console.log(`${plan.length} @ para gravar, ${skipped.length} pulados (${target.slice(2)})`);
for (const p of plan) console.log(`  ${p.user_id} -> @${p.handle} (${p.provider})`);
for (const s of skipped) console.log(`  pulado: ${s}`);
if (dry || !plan.length) process.exit(0);

const statements = plan.flatMap((p) => [
  `DELETE FROM profile_handles WHERE handle = ${sql(p.handle)} AND user_id <> ${sql(p.user_id)};`,
  `INSERT INTO profile_handles (user_id, handle, provider) VALUES (${sql(p.user_id)}, ${sql(p.handle)}, ${sql(p.provider)}) ON CONFLICT(user_id) DO NOTHING;`,
]);
const file = join(root, ".wrangler", "backfill-handles.sql");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, statements.join("\n"));
execFileSync(process.execPath, [WRANGLER, "d1", "execute", "deadcards", target, "--file", file], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
