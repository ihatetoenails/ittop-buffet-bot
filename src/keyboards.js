import { InlineKeyboard, Keyboard } from "grammy";
import {
  cartCount,
  cartTotal,
  categories,
  findItem,
  numEmoji,
  timeSlots,
} from "./menu.js";

export function mainKeyboard() {
  return new Keyboard()
    .text("🍽 Меню")
    .text("🛒 Заказ")
    .resized()
    .persistent();
}

export function cancelKeyboard() {
  return new Keyboard().text("❌ Отмена").resized().persistent();
}

/**
 * @param {"view" | "order"} mode
 * @param {Record<string, number>} [cart]
 */
export function categoriesKeyboard(mode, cart = {}) {
  const kb = new InlineKeyboard();
  for (const [id, category] of Object.entries(categories)) {
    kb.text(category.title, `${mode}:cat:${id}`).row();
  }
  if (mode === "order") {
    kb.text(cartButtonLabel(cart), "order:cart").row();
    kb.text("🕐 К выбору времени", "order:done");
  }
  return kb;
}

/**
 * @param {string} categoryId
 * @param {"view" | "order"} mode
 * @param {Record<string, number>} [cart]
 */
export function itemsKeyboard(categoryId, mode, cart = {}) {
  const category = categories[categoryId];
  const kb = new InlineKeyboard();

  category.items.forEach((item, index) => {
    const qty = cart[item.id] || 0;
    const mark = mode === "order" && qty > 0 ? ` x${qty}` : "";
    kb.text(
      `${numEmoji(index)} ${item.short} - ${item.price}₽${mark}`,
      `${mode}:item:${item.id}`,
    ).row();
  });

  kb.text("◀️ Разделы", `${mode}:cats`);
  if (mode === "order") {
    kb.row().text(cartButtonLabel(cart), "order:cart");
    kb.row().text("🕐 К выбору времени", "order:done");
  }
  return kb;
}

/** @param {Record<string, number>} cart */
export function cartKeyboard(cart) {
  const kb = new InlineKeyboard();
  for (const [itemId, qty] of Object.entries(cart)) {
    const item = findItem(itemId);
    if (!item) continue;
    kb.text(`➖ ${item.short} x${qty}`, `order:dec:${itemId}`).row();
  }
  kb.text("➕ Ещё блюда", "order:cats").row();
  kb.text("🕐 К выбору времени", "order:done").row();
  kb.text("🗑 Очистить", "order:clear");
  return kb;
}

export function timeSlotsKeyboard() {
  const kb = new InlineKeyboard();
  timeSlots.forEach((slot, index) => {
    kb.text(`🕐 ${numEmoji(index)} ${slot.label}`, `order:time:${slot.id}`).row();
  });
  kb.text("◀️ К меню", "order:cats");
  return kb;
}

export function confirmKeyboard() {
  return new InlineKeyboard()
    .text("✅ Подтвердить", "order:confirm")
    .text("❌ Отмена", "order:cancel");
}

/** @param {Record<string, number>} cart */
export function cartButtonLabel(cart) {
  const count = cartCount(cart);
  const total = cartTotal(cart);
  if (!count) return "🧺 Корзина - пусто";
  return `🧺 Корзина - ${count} - ${total}₽`;
}

/** @param {Record<string, number>} cart */
export function cartSummaryLine(cart) {
  const count = cartCount(cart);
  const total = cartTotal(cart);
  if (!count) return "🧺 Корзина - пусто";
  return `🧺 Корзина - ${count} поз. - ${total}₽`;
}
