import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { goldPriceManager } from "./GoldPriceManager";

interface GoldPriceData {
  buy: number;
  sell: number;
  date: string;
  time: string;
}

interface MtsGoldApiEntry {
  date: string;
  time: string;
  bhtBuy: string;
  bhtSell: string;
  barBuy: string;
  barSell: string;
  comment: string;
}

interface MtsGoldApiResponse {
  Stat: number;
  DS: MtsGoldApiEntry[];
}

// สมาคมค้าทองคำ — reference price used by MTS Gold
const GOLD_API_URL = "https://www.goldtraders.or.th/UpdateGoldTraders.aspx";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

let lastPrice: GoldPriceData | null = null;
let initialized = false;
let pollTimer: NodeJS.Timeout | null = null;

async function fetchGoldPrice(): Promise<GoldPriceData | null> {
  try {
    const res = await fetch(GOLD_API_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as MtsGoldApiResponse;
    if (data.Stat !== 1 || !data.DS?.length) return null;

    const entry = data.DS[0];
    const buy = parseInt(entry.bhtBuy, 10);
    const sell = parseInt(entry.bhtSell, 10);
    if (isNaN(buy) || isNaN(sell)) return null;

    return { buy, sell, date: entry.date, time: entry.time };
  } catch (err) {
    console.error("[GoldPriceFetcher] fetch error:", err);
    return null;
  }
}

async function notifyGuilds(
  client: Client,
  price: GoldPriceData,
  prev: GoldPriceData,
) {
  const configs = goldPriceManager.getAllConfigs();
  if (!configs.length) return;

  const diff = price.buy - prev.buy;
  const direction =
    diff > 0 ? "📈 ราคาขึ้น" : diff < 0 ? "📉 ราคาลง" : "➡️ ราคาคงที่";
  const changeStr =
    diff !== 0
      ? ` (${diff > 0 ? "+" : ""}${diff.toLocaleString("th-TH")} บาท)`
      : "";

  const embed = new EmbedBuilder()
    .setColor(diff > 0 ? 0xf1c40f : diff < 0 ? 0xe74c3c : 0x95a5a6)
    .setTitle(`${direction} ทองคำ 96.5%${changeStr}`)
    .addFields(
      {
        name: "💰 ราคาซื้อ (บาทละ)",
        value: `**${price.buy.toLocaleString("th-TH")}** บาท`,
        inline: true,
      },
      {
        name: "💸 ราคาขาย (บาทละ)",
        value: `**${price.sell.toLocaleString("th-TH")}** บาท`,
        inline: true,
      },
      {
        name: "🕐 อัปเดตเมื่อ",
        value: `${price.date} เวลา ${price.time} น.`,
        inline: false,
      },
    )
    .setFooter({ text: "ข้อมูลอ้างอิงจาก MTS Gold / สมาคมค้าทองคำ" })
    .setTimestamp();

  for (const config of configs) {
    try {
      const channel = await client.channels
        .fetch(config.channelId)
        .catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) continue;

      const content = config.roleId ? `<@&${config.roleId}>` : undefined;
      await channel.send({ content, embeds: [embed] });
    } catch (err) {
      console.error(
        `[GoldPriceFetcher] Failed to send to guild ${config.guildId}:`,
        err,
      );
    }
  }
}

async function pollGoldPrice(client: Client) {
  const price = await fetchGoldPrice();
  if (!price) return;

  if (!initialized) {
    lastPrice = price;
    initialized = true;
    console.log(
      `[GoldPriceFetcher] Baseline set — buy: ${price.buy}, sell: ${price.sell}`,
    );
    return;
  }

  const hasChanged =
    !lastPrice ||
    price.buy !== lastPrice.buy ||
    price.sell !== lastPrice.sell;

  if (hasChanged && lastPrice) {
    await notifyGuilds(client, price, lastPrice);
    lastPrice = price;
  }
}

export function startGoldPricePoller(client: Client) {
  if (pollTimer) return;
  pollGoldPrice(client);
  pollTimer = setInterval(() => pollGoldPrice(client), POLL_INTERVAL_MS);
  console.log("✅ Gold price poller started (interval: 5 min)");
}

export function stopGoldPricePoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export { fetchGoldPrice, GoldPriceData };
