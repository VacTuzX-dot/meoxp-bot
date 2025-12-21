const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

// Help categories data
const categories = {
  home: {
    emoji: "🏠",
    title: "📚 เมนูช่วยเหลือ",
    description: "เลือกหมวดหมู่จากเมนูด้านล่างค่ะ~",
    fields: [
      { name: "🎵 Music", value: "คำสั่งเกี่ยวกับเพลง", inline: true },
      { name: "🛠️ Admin", value: "คำสั่งสำหรับแอดมิน", inline: true },
      { name: "📋 General", value: "คำสั่งทั่วไป", inline: true },
    ],
  },
  music: {
    emoji: "🎵",
    title: "🎵 Music Commands",
    description: "คำสั่งเกี่ยวกับเพลงทั้งหมด",
    fields: [
      {
        name: "`!!play <url/search>`",
        value: "▸ เล่นเพลงจาก YouTube",
        inline: false,
      },
      { name: "`!!skip`", value: "▸ ข้ามไปเพลงถัดไป", inline: true },
      { name: "`!!stop`", value: "▸ หยุดและออกจากห้อง", inline: true },
      { name: "`!!queue`", value: "▸ ดูรายการเพลงใน Queue", inline: true },
      { name: "`!!nowplaying`", value: "▸ ดูเพลงที่กำลังเล่น", inline: true },
      { name: "`!!loop`", value: "▸ เปลี่ยนโหมด Loop", inline: true },
    ],
  },
  admin: {
    emoji: "🛠️",
    title: "🛠️ Admin Commands",
    description: "คำสั่งสำหรับแอดมิน (ต้องมีสิทธิ์)",
    fields: [
      {
        name: "`!!purge <จำนวน>`",
        value: "▸ ลบข้อความ (1-100)",
        inline: false,
      },
      { name: "`!!server`", value: "▸ ดูสถานะเซิร์ฟเวอร์", inline: true },
      { name: "`!!cmd <command>`", value: "▸ รันคำสั่ง (Owner)", inline: true },
    ],
  },
  general: {
    emoji: "📋",
    title: "📋 General Commands",
    description: "คำสั่งทั่วไป",
    fields: [{ name: "`!!help`", value: "▸ แสดงเมนูนี้", inline: true }],
  },
};

function createEmbed(category) {
  const data = categories[category];
  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description)
    .setColor(0xff69b4)
    .setFooter({ text: "Prefix: !! | เลือกหมวดหมู่จากเมนูด้านล่าง 🩷" });

  if (data.fields) {
    embed.addFields(data.fields);
  }

  return embed;
}

function createComponents(currentCategory) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("help_category")
    .setPlaceholder("🔍 เลือกหมวดหมู่...")
    .addOptions([
      {
        label: "หน้าหลัก",
        description: "กลับไปหน้าหลัก",
        emoji: "🏠",
        value: "home",
        default: currentCategory === "home",
      },
      {
        label: "Music",
        description: "คำสั่งเกี่ยวกับเพลง",
        emoji: "🎵",
        value: "music",
        default: currentCategory === "music",
      },
      {
        label: "Admin",
        description: "คำสั่งสำหรับแอดมิน",
        emoji: "🛠️",
        value: "admin",
        default: currentCategory === "admin",
      },
      {
        label: "General",
        description: "คำสั่งทั่วไป",
        emoji: "📋",
        value: "general",
        default: currentCategory === "general",
      },
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_home")
      .setEmoji("🏠")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("help_music")
      .setEmoji("🎵")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("help_admin")
      .setEmoji("🛠️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("help_close")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
  );

  return [new ActionRowBuilder().addComponents(selectMenu), buttons];
}

module.exports = {
  name: "help",
  aliases: ["h", "commands", "menu"],
  description: "แสดงเมนูช่วยเหลือ",
  async execute(message, args, client) {
    const embed = createEmbed("home");
    const components = createComponents("home");

    const helpMessage = await message.channel.send({
      embeds: [embed],
      components: components,
    });

    // Create collector for interactions
    const collector = helpMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 120000, // 2 minutes
    });

    collector.on("collect", async (interaction) => {
      let category = "home";

      if (interaction.customId === "help_category") {
        category = interaction.values[0];
      } else if (interaction.customId.startsWith("help_")) {
        const action = interaction.customId.replace("help_", "");
        if (action === "close") {
          await helpMessage.delete().catch(() => {});
          collector.stop();
          return;
        }
        category = action;
      }

      await interaction.update({
        embeds: [createEmbed(category)],
        components: createComponents(category),
      });
    });

    collector.on("end", async () => {
      // Disable components after timeout
      try {
        const disabledComponents = components.map((row) => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach((c) => c.setDisabled(true));
          return newRow;
        });
        await helpMessage.edit({ components: disabledComponents });
      } catch (e) {
        // Message might be deleted
      }
    });
  },
};
