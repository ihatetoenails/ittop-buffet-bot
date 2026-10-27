import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, "..", "data", "admin_chats.json");

function ensureStore() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, "{}", "utf8");
}

/** Chat IDs from env (stable on cloud): ADMIN_CHAT_IDS=123,456 */
function envChatIds() {
  return (process.env.ADMIN_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

/** @returns {Record<string, number>} */
export function loadAdminChats() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

/** @param {string} username @param {number} chatId */
export function saveAdminChat(username, chatId) {
  const data = loadAdminChats();
  data[username.toLowerCase()] = chatId;
  ensureStore();
  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("Не удалось сохранить admin chat id:", err.message);
  }
}

/**
 * @param {import("grammy").Bot} bot
 * @param {string[]} usernames
 * @param {string} text
 */
export async function notifyAdmins(bot, usernames, text) {
  const chats = loadAdminChats();
  const sent = new Set();

  for (const chatId of envChatIds()) {
    if (sent.has(chatId)) continue;
    try {
      await bot.api.sendMessage(chatId, text);
      sent.add(chatId);
    } catch (err) {
      console.error(`Не удалось отправить chat_id ${chatId}:`, err.message);
    }
  }

  for (const username of usernames) {
    const key = username.toLowerCase().replace(/^@/, "");
    const chatId = chats[key];
    if (!chatId || sent.has(chatId)) continue;
    try {
      await bot.api.sendMessage(chatId, text);
      sent.add(chatId);
    } catch (err) {
      console.error(`Не удалось отправить админу @${key}:`, err.message);
    }
  }

  return sent.size;
}
