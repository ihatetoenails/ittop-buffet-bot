import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainKeyboard } from "./keyboards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, "..", "data", "anchors.json");

export const ANCHOR_TEXT = [
  "IT TOP Buffet",
  "Бот буфета колледжа IT TOP.",
  "",
  "Как заказать:",
  "1) нажмите «Заказ»",
  "2) укажите фамилию, имя и блюда",
  "3) выберите перемену и подтвердите",
  "",
  "«Меню» - посмотреть фото и цены.",
].join("\n");

function loadAnchors() {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

function saveAnchor(chatId, messageId) {
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = loadAnchors();
    data[String(chatId)] = messageId;
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("Не удалось сохранить anchor:", err.message);
  }
}

function clearStoredAnchor(chatId) {
  try {
    const data = loadAnchors();
    delete data[String(chatId)];
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

function readStoredAnchor(chatId) {
  return loadAnchors()[String(chatId)] || null;
}

function errText(err) {
  return `${err?.description || ""} ${err?.message || ""} ${err || ""}`;
}

function isNotModified(err) {
  return errText(err).includes("message is not modified");
}

function isMessageMissing(err) {
  const t = errText(err).toLowerCase();
  return (
    t.includes("message to edit not found") ||
    t.includes("message can't be edited") ||
    t.includes("message identifier is not specified")
  );
}

function getAnchorId(ctx) {
  return ctx.session.anchorMessageId || readStoredAnchor(ctx.chat.id) || null;
}

function setAnchorId(ctx, messageId) {
  ctx.session.anchorMessageId = messageId;
  saveAnchor(ctx.chat.id, messageId);
}

/**
 * Гарантирует одно якорное сообщение.
 * Если id уже известен - НИЧЕГО не отправляет и не редактирует.
 * @param {import("grammy").Context} ctx
 */
export async function ensureAnchor(ctx) {
  const id = getAnchorId(ctx);
  if (id) {
    ctx.session.anchorMessageId = id;
    return id;
  }

  const msg = await ctx.reply(ANCHOR_TEXT, { reply_markup: mainKeyboard() });
  setAnchorId(ctx, msg.message_id);
  return msg.message_id;
}

/**
 * Обновить текст якоря. Новое сообщение создаёт только если старое пропало.
 * @param {import("grammy").Context} ctx
 * @param {string} [extra]
 */
export async function updateAnchor(ctx, extra = "") {
  const text = extra ? `${ANCHOR_TEXT}\n\n${extra}` : ANCHOR_TEXT;
  let id = getAnchorId(ctx);

  if (id) {
    try {
      await ctx.api.editMessageText(ctx.chat.id, id, text);
      setAnchorId(ctx, id);
      return;
    } catch (err) {
      if (isNotModified(err)) {
        setAnchorId(ctx, id);
        return;
      }
      if (!isMessageMissing(err)) {
        // неизвестная ошибка - не плодим сообщения
        console.warn("updateAnchor edit failed:", errText(err));
        setAnchorId(ctx, id);
        return;
      }
      clearStoredAnchor(ctx.chat.id);
      ctx.session.anchorMessageId = null;
      id = null;
    }
  }

  const msg = await ctx.reply(text, { reply_markup: mainKeyboard() });
  setAnchorId(ctx, msg.message_id);
}

/**
 * @param {import("grammy").Context} ctx
 */
export async function clearUi(ctx) {
  const anchor = getAnchorId(ctx);
  if (anchor) ctx.session.anchorMessageId = anchor;

  const ids = (ctx.session.uiMessages || []).filter((id) => id !== anchor);
  for (const id of ids) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, id);
    } catch {
      /* ignore */
    }
  }
  ctx.session.uiMessages = [];
}

export async function deleteTrigger(ctx) {
  const id = ctx.message?.message_id;
  const anchor = getAnchorId(ctx);
  if (!id || id === anchor) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, id);
  } catch {
    /* ignore */
  }
}

/**
 * @param {import("grammy").Context} ctx
 * @param {string} text
 * @param {object} [other]
 */
export async function sendUi(ctx, text, other = {}) {
  await ensureAnchor(ctx);
  await clearUi(ctx);
  await deleteTrigger(ctx);
  const msg = await ctx.reply(text, other);
  // на всякий случай не затираем якорь
  if (msg.message_id !== getAnchorId(ctx)) {
    ctx.session.uiMessages = [msg.message_id];
  }
  return msg;
}

/**
 * @param {import("grammy").Context} ctx
 * @param {import("grammy").InputFile} photo
 * @param {object} [other]
 */
export async function sendUiPhoto(ctx, photo, other = {}) {
  await ensureAnchor(ctx);
  await clearUi(ctx);
  await deleteTrigger(ctx);
  const msg = await ctx.replyWithPhoto(photo, other);
  if (msg.message_id !== getAnchorId(ctx)) {
    ctx.session.uiMessages = [msg.message_id];
  }
  return msg;
}

export function trackCallbackMessage(ctx) {
  const id = ctx.callbackQuery?.message?.message_id;
  const anchor = getAnchorId(ctx);
  if (!id || id === anchor) return;
  ctx.session.uiMessages = [id];
}
