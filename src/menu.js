import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const menuDir = path.join(__dirname, "..", "assets", "menu");

/** @typedef {{ id: string, name: string, short: string, price: number }} MenuItem */

/** @type {Record<string, { title: string, photo: string, items: MenuItem[] }>} */
export const categories = {
  breakfast: {
    title: "Завтраки",
    photo: path.join(menuDir, "breakfast.jpg"),
    items: [
      { id: "oatmeal", name: "Каша овсяная на кокосовом молоке", short: "Каша овсяная", price: 190 },
      { id: "eggs", name: "Яичница с баварскими сосисками", short: "Яичница с сосисками", price: 260 },
      { id: "syrniki", name: "Сырники классические", short: "Сырники", price: 240 },
    ],
  },
  hot: {
    title: "Горячие блюда и супы",
    photo: path.join(menuDir, "hot.jpg"),
    items: [
      { id: "caesar_roll", name: "Цезарь ролл", short: "Цезарь ролл", price: 270 },
      { id: "sandwich_chicken", name: "Сэндвич с курицей", short: "Сэндвич курица", price: 360 },
      { id: "sandwich_beef", name: "Сэндвич с говядиной", short: "Сэндвич говядина", price: 390 },
      { id: "sandwich_ham", name: "Сэндвич с ветчиной", short: "Сэндвич ветчина", price: 340 },
      { id: "burger_beef", name: "Бургер с говядиной", short: "Бургер", price: 410 },
      { id: "hotdog", name: "Хот-дог «Студенческий»", short: "Хот-дог", price: 260 },
      { id: "mash_sausages", name: "Пюре с баварскими сосисками и «Коул слоу»", short: "Пюре с сосисками", price: 230 },
      { id: "soup_chicken", name: "Суп куриный", short: "Суп куриный", price: 230 },
      { id: "tom_yum", name: "Том ям с морепродуктами", short: "Том ям", price: 690 },
    ],
  },
  salads: {
    title: "Салаты",
    photo: path.join(menuDir, "salads.jpg"),
    items: [
      { id: "caesar_chicken", name: "Цезарь с курицей", short: "Цезарь курица", price: 330 },
      { id: "caesar_shrimp", name: "Цезарь с креветками", short: "Цезарь креветки", price: 380 },
      { id: "coleslaw", name: "Коул слоу", short: "Коул слоу", price: 210 },
    ],
  },
  snacks: {
    title: "Снеки и соусы",
    photo: path.join(menuDir, "snacks.jpg"),
    items: [
      { id: "fries", name: "Картофель фри", short: "Картофель фри", price: 180 },
      { id: "wedges", name: "Картофель по-деревенски", short: "По-деревенски", price: 180 },
      { id: "cheese_balls", name: "Сырные шарики", short: "Сырные шарики", price: 240 },
      { id: "strips", name: "Стрипсы куриные", short: "Стрипсы", price: 290 },
      { id: "sauce_cheese", name: "Соус сырный", short: "Соус сырный", price: 40 },
      { id: "sauce_ketchup", name: "Соус кетчуп", short: "Кетчуп", price: 40 },
      { id: "sauce_garlic", name: "Соус чесночный", short: "Чесночный", price: 40 },
      { id: "sauce_bbq", name: "Соус барбекю", short: "Барбекю", price: 40 },
      { id: "sauce_chili", name: "Соус сладкий чили", short: "Сладкий чили", price: 40 },
    ],
  },
};

export const timeSlots = [
  { id: "0950", label: "09:50-10:00 - после 1 пары" },
  { id: "1120", label: "11:20-11:50 - после 2 пары" },
  { id: "1310", label: "13:10-13:20 - после 3 пары" },
  { id: "1440", label: "14:40-15:00 - после 4 пары" },
  { id: "1620", label: "после 16:20 - после 5 пары" },
];

const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

/** @param {number} index 0-based */
export function numEmoji(index) {
  return NUM[index] || `${index + 1}.`;
}

/** @returns {MenuItem | undefined} */
export function findItem(itemId) {
  for (const category of Object.values(categories)) {
    const item = category.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return undefined;
}

/** @param {Record<string, number>} cart */
export function cartTotal(cart) {
  let total = 0;
  for (const [itemId, qty] of Object.entries(cart)) {
    const item = findItem(itemId);
    if (item) total += item.price * qty;
  }
  return total;
}

/** @param {Record<string, number>} cart */
export function cartCount(cart) {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

/** @param {Record<string, number>} cart */
export function formatCart(cart) {
  const lines = [];
  for (const [itemId, qty] of Object.entries(cart)) {
    const item = findItem(itemId);
    if (!item) continue;
    lines.push(`- ${item.name} x ${qty} - ${item.price * qty}₽`);
  }
  return lines.length ? lines.join("\n") : "корзина пуста";
}
