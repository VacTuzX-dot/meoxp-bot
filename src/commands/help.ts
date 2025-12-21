import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { ExtendedClient, Command } from "../types";

const categories: Record<
  string,
  { title: string; description: string; fields?: any[] }
> = {
  home: {
    title: "🎀 เมนูช่วยเหลือค่ะนายท่าน",
    description:
      "ยินดีต้อนรับค่ะ~ เลือกหมวดหมู่จากเมนูด้านล่างเพื่อดูคำสั่งนะคะ 💕",
  },
  music: {
    title: "🎵 คำสั่งเพลง",
    description: "คำสั่งสำหรับเล่นเพลงค่ะนายท่าน~",
    fields: [
      { name: "!!play <ชื่อ/URL>", value: "เปิดเพลง 🎶", inline: true },
      { name: "!!skip", value: "ข้ามเพลง ⏭️", inline: true },
      { name: "!!stop", value: "หยุดชั่วคราว ⏸️", inline: true },
      { name: "!!resume", value: "เล่นต่อ ▶️", inline: true },
      { name: "!!queue", value: "ดู Queue 📋", inline: true },
      { name: "!!np", value: "เพลงที่เล่นอยู่ 🎵", inline: true },
      { name: "!!loop", value: "เปิด/ปิด Loop 🔁", inline: true },
      { name: "!!shuffle", value: "สับ Queue 🔀", inline: true },
      { name: "!!clear", value: "ล้าง Queue 🗑️", inline: true },
      { name: "!!join", value: "เข้าห้อง (รออยู่) 🎙️", inline: true },
      { name: "!!leave", value: "ออกจากห้อง 👋", inline: true },
      { name: "!!panel", value: "แผงควบคุม 🎛️", inline: true },
    ],
  },
  tts: {
    title: "🗣️ คำสั่ง TTS",
    description: "คำสั่งให้หนูพูดค่ะนายท่าน~",
    fields: [
      { name: "!!say <ข้อความ>", value: "พูดภาษาไทย 🇹🇭", inline: true },
      { name: "!!saye <text>", value: "พูดภาษาอังกฤษ 🇬🇧", inline: true },
    ],
  },
  admin: {
    title: "⚙️ คำสั่ง Admin",
    description: "คำสั่งสำหรับ Admin ค่ะนายท่าน~ (เฉพาะผู้ดูแล)",
    fields: [
      { name: "!!purge <จำนวน>", value: "ลบข้อความ 🗑️", inline: true },
      { name: "!!status", value: "สถานะบอท 📊", inline: true },
    ],
  },
};

const command: Command = {
  name: "help",
  aliases: ["h", "?"],
  description: "Show help menu",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder("🔍 เลือกหมวดหมู่...")
        .addOptions([
          { label: "🏠 หน้าแรก", value: "home" },
          { label: "🎵 เพลง", value: "music" },
          { label: "🗣️ TTS", value: "tts" },
          { label: "⚙️ Admin", value: "admin" },
        ])
    );

    const createEmbed = (category: string) => {
      const data = categories[category] || categories.home;
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setColor(0xff69b4)
        .setFooter({ text: "💕 พร้อมรับใช้นายท่านค่ะ~ | Prefix: !!" });

      if (data.fields) {
        embed.addFields(data.fields);
      }

      return embed;
    };

    const reply = await message.reply({
      embeds: [createEmbed("home")],
      components: [row],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000,
    });

    collector.on(
      "collect",
      async (interaction: StringSelectMenuInteraction) => {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            content: "❌ นี่ไม่ใช่เมนูของนายท่านนะคะ~",
            ephemeral: true,
          });
          return;
        }

        const category = interaction.values[0];
        await interaction.update({ embeds: [createEmbed(category)] });
      }
    );

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;
