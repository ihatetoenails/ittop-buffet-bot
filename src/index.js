import "dotenv/config";
import { readFileSync } from "node:fs";
import { Bot, InputFile, session } from "grammy";
import { notifyAdmins, saveAdminChat } from "./admins.js";
import {
  cancelKeyboard,
  cartKeyboard,
  cartSummaryLine,
  categoriesKeyboard,
  confirmKeyboard,
  itemsKeyboard,
  timeSlotsKeyboard,
} from "./keyboards.js";
import {
  cartTotal,
  categories,
  findItem,
  formatCart,
  timeSlots,
} from "./menu.js";
import {
  clearUi,
  sendUi,
  sendUiPhoto,
  trackCallbackMessage,
  updateAnchor,
} from "./ui.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Нет BOT_TOKEN в .env");
  process.exit(1);
}

const adminUsernames = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((u) => u.trim().replace(/^@/, "").toLowerCase())
  .filter(Boolean);

/** @typedef {{
 *   step: null | "surname" | "name" | "items" | "time" | "confirm",
 *   surname: string,
 *   name: string,
 *   cart: Record<string, number>,
 *   timeId: string,
 *   categoryId: string | null,
 *   uiMessages: number[],
 *   anchorMessageId: number | null,
 * }} SessionData */

function initialSession() {
  return {
    step: null,
    surname: "",
    name: "",
    cart: {},
    timeId: "",
    categoryId: null,
    uiMessages: [],
    anchorMessageId: null,
  };
}

const bot = new Bot(token);

bot.use(
  session({
    initial: initialSession,
  }),
);

function isAdmin(ctx) {
  const username = ctx.from?.username?.toLowerCase();
  return Boolean(username && adminUsernames.includes(username));
}

function rememberAdmin(ctx) {
  if (!isAdmin(ctx)) return;
  saveAdminChat(ctx.from.username, ctx.chat.id);
}

function resetOrder(ctx) {
  const uiMessages = ctx.session.uiMessages || [];
  const anchorMessageId = ctx.session.anchorMessageId ?? null;
  ctx.session = { ...initialSession(), uiMessages, anchorMessageId };
}

async function sendWelcome(ctx) {
  rememberAdmin(ctx);
  await clearUi(ctx);
  await deleteTriggerSafe(ctx);
  const adminHint = isAdmin(ctx)
    ? "Вы админ буфета - заказы будут приходить сюда."
    : "";
  await updateAnchor(ctx, adminHint);
}

async function deleteTriggerSafe(ctx) {
  const id = ctx.message?.message_id;
  if (!id || id === ctx.session.anchorMessageId) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, id);
  } catch {
    /* ignore */
  }
}

bot.command("start", sendWelcome);

bot.hears(["❌ Отмена", "Отмена"], async (ctx) => {
  resetOrder(ctx);
  await clearUi(ctx);
  await deleteTriggerSafe(ctx);
  await updateAnchor(ctx, "Заказ отменён. Можно начать заново кнопкой «Заказ».");
});

bot.hears(["🍽 Меню", "Меню", "🍽 Посмотреть меню"], async (ctx) => {
  rememberAdmin(ctx);
  await sendUi(ctx, "Выберите раздел меню:", {
    reply_markup: categoriesKeyboard("view"),
  });
});

bot.hears(["🛒 Заказ", "Заказ", "🛒 Сделать заказ"], async (ctx) => {
  rememberAdmin(ctx);
  await clearUi(ctx);
  resetOrder(ctx);
  ctx.session.step = "surname";
  await sendUi(ctx, "Введите фамилию:", { reply_markup: cancelKeyboard() });
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  rememberAdmin(ctx);

  if (data === "view:cats") {
    await ctx.answerCallbackQuery();
    trackCallbackMessage(ctx);
    await sendUi(ctx, "Выберите раздел меню:", {
      reply_markup: categoriesKeyboard("view"),
    });
    return;
  }

  if (data.startsWith("view:cat:")) {
    await showCategory(ctx, data.slice("view:cat:".length), "view");
    return;
  }

  if (data.startsWith("view:item:")) {
    const item = findItem(data.slice("view:item:".length));
    await ctx.answerCallbackQuery(
      item ? `${item.name} - ${item.price}₽` : "Позиция не найдена",
    );
    return;
  }

  if (data === "order:cats") {
    if (ctx.session.step !== "items" && ctx.session.step !== "time") {
      await ctx.answerCallbackQuery("Сначала нажмите «Заказ»");
      return;
    }
    ctx.session.step = "items";
    await ctx.answerCallbackQuery();
    trackCallbackMessage(ctx);
    await sendUi(
      ctx,
      `Выберите раздел\n${cartSummaryLine(ctx.session.cart)}`,
      { reply_markup: categoriesKeyboard("order", ctx.session.cart) },
    );
    return;
  }

  if (data.startsWith("order:cat:")) {
    if (ctx.session.step !== "items") {
      await ctx.answerCallbackQuery("Сначала нажмите «Заказ»");
      return;
    }
    const categoryId = data.slice("order:cat:".length);
    ctx.session.categoryId = categoryId;
    await showCategory(ctx, categoryId, "order", ctx.session.cart);
    return;
  }

  if (data.startsWith("order:item:")) {
    if (ctx.session.step !== "items") {
      await ctx.answerCallbackQuery("Сначала нажмите «Заказ»");
      return;
    }
    const itemId = data.slice("order:item:".length);
    const item = findItem(itemId);
    if (!item) {
      await ctx.answerCallbackQuery("Позиция не найдена");
      return;
    }
    ctx.session.cart[itemId] = (ctx.session.cart[itemId] || 0) + 1;
    await ctx.answerCallbackQuery(`+ ${item.short}`);

    const categoryId =
      ctx.session.categoryId ||
      Object.keys(categories).find((id) =>
        categories[id].items.some((i) => i.id === itemId),
      );
    if (categoryId) {
      const category = categories[categoryId];
      try {
        await ctx.editMessageCaption({
          caption: `${category.title}\nНажмите номер, чтобы добавить\n${cartSummaryLine(ctx.session.cart)}`,
          reply_markup: itemsKeyboard(categoryId, "order", ctx.session.cart),
        });
        trackCallbackMessage(ctx);
      } catch {
        try {
          await ctx.editMessageReplyMarkup({
            reply_markup: itemsKeyboard(categoryId, "order", ctx.session.cart),
          });
        } catch {
          /* ignore */
        }
      }
    }
    return;
  }

  if (data.startsWith("order:dec:")) {
    const itemId = data.slice("order:dec:".length);
    if (ctx.session.cart[itemId]) {
      ctx.session.cart[itemId] -= 1;
      if (ctx.session.cart[itemId] <= 0) delete ctx.session.cart[itemId];
    }
    await ctx.answerCallbackQuery("Убрано");
    await ctx.editMessageText(
      `🧺 Корзина\n\n${formatCart(ctx.session.cart)}\n\n${cartSummaryLine(ctx.session.cart)}`,
      { reply_markup: cartKeyboard(ctx.session.cart) },
    );
    trackCallbackMessage(ctx);
    return;
  }

  if (data === "order:cart") {
    await ctx.answerCallbackQuery();
    trackCallbackMessage(ctx);
    await sendUi(
      ctx,
      `🧺 Корзина\n\n${formatCart(ctx.session.cart)}\n\n${cartSummaryLine(ctx.session.cart)}`,
      { reply_markup: cartKeyboard(ctx.session.cart) },
    );
    return;
  }

  if (data === "order:clear") {
    ctx.session.cart = {};
    await ctx.answerCallbackQuery("Очищено");
    await ctx.editMessageText("🧺 Корзина пуста", {
      reply_markup: cartKeyboard(ctx.session.cart),
    });
    trackCallbackMessage(ctx);
    return;
  }

  if (data === "order:done") {
    if (!Object.keys(ctx.session.cart).length) {
      await ctx.answerCallbackQuery("Добавьте хотя бы одну позицию");
      return;
    }
    ctx.session.step = "time";
    await ctx.answerCallbackQuery();
    trackCallbackMessage(ctx);
    await sendUi(
      ctx,
      `На когда забрать?\nТолько во время перемен\n\n${cartSummaryLine(ctx.session.cart)}`,
      { reply_markup: timeSlotsKeyboard() },
    );
    return;
  }

  if (data.startsWith("order:time:")) {
    const timeId = data.slice("order:time:".length);
    const slot = timeSlots.find((s) => s.id === timeId);
    if (!slot) {
      await ctx.answerCallbackQuery("Слот не найден");
      return;
    }
    ctx.session.timeId = timeId;
    ctx.session.step = "confirm";
    await ctx.answerCallbackQuery();
    trackCallbackMessage(ctx);
    await sendUi(ctx, buildConfirmText(ctx.session), {
      reply_markup: confirmKeyboard(),
    });
    return;
  }

  if (data === "order:confirm") {
    if (ctx.session.step !== "confirm") {
      await ctx.answerCallbackQuery("Заказ уже неактуален");
      return;
    }
    const text = buildOrderMessage(ctx);
    const sent = await notifyAdmins(bot, adminUsernames, text);
    await ctx.answerCallbackQuery();
    await clearUi(ctx);
    resetOrder(ctx);

    let status =
      "Заказ отправлен в буфет! Заберите его лично в выбранное время.";
    if (sent === 0) {
      status =
        "Заказ создан, но админы ещё не нажали /start - попросите @alina_lulik и @churkanothappy.";
      console.warn("Заказ создан, но админам не доставлено:", text);
    }
    await updateAnchor(ctx, status);
    return;
  }

  if (data === "order:cancel") {
    resetOrder(ctx);
    await clearUi(ctx);
    await ctx.answerCallbackQuery();
    await updateAnchor(ctx, "Заказ отменён. Можно начать заново кнопкой «Заказ».");
    return;
  }

  await ctx.answerCallbackQuery();
});

bot.on("message:text", async (ctx) => {
  rememberAdmin(ctx);
  const text = ctx.message.text.trim();
  const menuButtons = [
    "🍽 Меню",
    "🛒 Заказ",
    "❌ Отмена",
    "Меню",
    "Заказ",
    "Отмена",
    "🍽 Посмотреть меню",
    "🛒 Сделать заказ",
  ];
  if (text.startsWith("/") || menuButtons.includes(text)) return;

  if (ctx.session.step === "surname") {
    ctx.session.surname = text;
    ctx.session.step = "name";
    await sendUi(ctx, "Введите имя:", { reply_markup: cancelKeyboard() });
    return;
  }

  if (ctx.session.step === "name") {
    ctx.session.name = text;
    ctx.session.step = "items";
    await sendUi(
      ctx,
      `${ctx.session.surname} ${ctx.session.name}\nВыберите раздел и позиции:`,
      { reply_markup: categoriesKeyboard("order", ctx.session.cart) },
    );
    return;
  }
});

/**
 * @param {import("grammy").Context} ctx
 * @param {string} categoryId
 * @param {"view" | "order"} mode
 * @param {Record<string, number>} [cart]
 */
async function showCategory(ctx, categoryId, mode, cart = {}) {
  const category = categories[categoryId];
  if (!category) {
    await ctx.answerCallbackQuery("Раздел не найден");
    return;
  }

  await ctx.answerCallbackQuery();
  trackCallbackMessage(ctx);

  const caption =
    mode === "order"
      ? `${category.title}\nНажмите номер, чтобы добавить\n${cartSummaryLine(cart)}`
      : category.title;

  const photo = new InputFile(readFileSync(category.photo), `${categoryId}.jpg`);

  await sendUiPhoto(ctx, photo, {
    caption,
    reply_markup: itemsKeyboard(categoryId, mode, cart),
  });
}

/** @param {SessionData} session */
function buildConfirmText(session) {
  const slot = timeSlots.find((s) => s.id === session.timeId);
  return [
    "Проверьте заказ:",
    "",
    `${session.surname} ${session.name}`,
    slot?.label || session.timeId,
    "",
    formatCart(session.cart),
    "",
    cartSummaryLine(session.cart),
  ].join("\n");
}

function buildOrderMessage(ctx) {
  const s = ctx.session;
  const slot = timeSlots.find((t) => t.id === s.timeId);
  const from = ctx.from;
  const username = from?.username ? `@${from.username}` : "без username";
  return [
    "🆕 Новый заказ - IT TOP Buffet",
    "",
    `👤 ${s.surname} ${s.name}`,
    `📱 ${username} (id: ${from?.id})`,
    `🕐 ${slot?.label || s.timeId}`,
    "",
    formatCart(s.cart),
    "",
    `💰 Итого: ${cartTotal(s.cart)}₽`,
  ].join("\n");
}

bot.catch((err) => {
  console.error("Bot error:", err.error ?? err);
});

bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} запущен`);
    console.log(
      `Админы: ${adminUsernames.map((u) => "@" + u).join(", ") || "(не заданы)"}`,
    );
  },
});
