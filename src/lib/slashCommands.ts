import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Message,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { ExtendedClient } from "../types";
import { autoRoleManager } from "./AutoRoleManager";
import { goldPriceManager } from "./GoldPriceManager";
import { fetchGoldPrice } from "./GoldPriceFetcher";
import {
  attachHelpCollector,
  createHelpEmbed,
  createHelpRow,
} from "./helpMenu";

export function getSlashCommandDefinitions() {
  return [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Open the help menu"),
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Configure auto role for new members")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Set the auto role for new members")
          .addRoleOption((option) =>
            option
              .setName("role")
              .setDescription("Role to assign automatically")
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("Remove auto role"),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("Show current auto role"),
      ),
    new SlashCommandBuilder()
      .setName("setupgold")
      .setDescription("ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% เมื่อราคาเปลี่ยนแปลง")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("ตั้งค่าช่องทางรับแจ้งเตือนราคาทอง")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("ช่องที่จะส่งการแจ้งเตือนราคาทอง")
              .setRequired(true),
          )
          .addRoleOption((option) =>
            option
              .setName("role")
              .setDescription("ยศที่จะถูก mention เมื่อราคาเปลี่ยน (optional)")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("ยกเลิกการแจ้งเตือนราคาทอง"),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("ดูการตั้งค่าแจ้งเตือนราคาทองปัจจุบัน"),
      ),
  ];
}

export async function registerSlashCommands(client: Client) {
  if (!client.application) return;

  const commands = getSlashCommandDefinitions().map((command) =>
    command.toJSON(),
  );

  const guildId = process.env.GUILD_ID;

  if (guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await guild.commands.set(commands);
      return;
    }
  }

  await client.application.commands.set(commands);
}

async function sendHelpMenu(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [createHelpEmbed("home")],
    components: [createHelpRow()],
  });

  const reply = (await interaction.fetchReply()) as Message<boolean>;
  attachHelpCollector(reply, interaction.user.id);
}

async function handleAutoRoleSlash(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
  ) {
    await interaction.reply({
      content: "❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "remove") {
    const success = await autoRoleManager.removeConfig(interaction.guild.id);

    await interaction.reply({
      content: success
        ? "✅ ปิด Auto Role เรียบร้อยแล้วค่ะ"
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า Auto Role ไว้",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "list") {
    const config = autoRoleManager.getConfig(interaction.guild.id);

    await interaction.reply({
      content: config
        ? `📌 Auto Role ปัจจุบัน: <@&${config.roleId}>`
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่มีการตั้งค่า Auto Role เลยค่ะ",
      ephemeral: true,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);

  const botMember = interaction.guild.members.me;
  if (botMember) {
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.reply({
        content:
          "❌ บอทไม่มีสิทธิ์ Manage Roles กรุณาให้สิทธิ์แก่บอทในเซิร์ฟเวอร์ก่อนใช้งาน!",
        ephemeral: true,
      });
      return;
    }

    if (botMember.roles.highest.position <= role.position) {
      await interaction.reply({
        content:
          "❌ ไม่สามารถจ่ายยศนี้ได้ เนื่องจากยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศเป้าหมาย",
        ephemeral: true,
      });
      return;
    }
  }

  const success = await autoRoleManager.setConfig({
    guildId: interaction.guild.id,
    roleId: role.id,
  });

  await interaction.reply({
    content: success
      ? `✅ ตั้งค่า Auto Role สำเร็จแล้วค่ะ สมาชิกใหม่จะได้รับยศ <@&${role.id}> อัตโนมัติ`
      : "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง NoSQL ค่ะ",
    ephemeral: true,
  });
}

async function handleGoldSetupSlash(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guild) return;

  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
  ) {
    await interaction.reply({
      content: "❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "remove") {
    const success = await goldPriceManager.removeConfig(interaction.guild.id);
    await interaction.reply({
      content: success
        ? "✅ ยกเลิกการแจ้งเตือนราคาทองเรียบร้อยแล้วค่ะ"
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองไว้",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "status") {
    const config = goldPriceManager.getConfig(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        content: "ℹ️ ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองในเซิร์ฟเวอร์นี้ค่ะ\nใช้ `/setupgold set` เพื่อตั้งค่า",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const price = await fetchGoldPrice();
    const priceText = price
      ? `\n\n💰 ราคาปัจจุบัน (96.5%): ซื้อ **${price.buy.toLocaleString("th-TH")}** / ขาย **${price.sell.toLocaleString("th-TH")}** บาท`
      : "";

    const roleText = config.roleId
      ? `\n📢 Mention: ${config.roleId === "everyone" ? "@everyone" : `<@&${config.roleId}>`}`
      : "";
    await interaction.editReply({
      content:
        `📌 ช่องแจ้งเตือน: <#${config.channelId}>${roleText}${priceText}`,
    });
    return;
  }

  // subcommand === "set"
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role");

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "❌ กรุณาเลือกช่องข้อความ (Text Channel) เท่านั้นค่ะ",
      ephemeral: true,
    });
    return;
  }

  const success = await goldPriceManager.setConfig({
    guildId: interaction.guild.id,
    channelId: channel.id,
    ...(role ? { roleId: role.id } : {}),
  });

  const roleText = role ? ` และจะ mention <@&${role.id}>` : "";
  await interaction.reply({
    content: success
      ? `✅ ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% สำเร็จค่ะ\nจะส่งการแจ้งเตือนไปที่ <#${channel.id}>${roleText} เมื่อราคาเปลี่ยนแปลง`
      : "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ",
    ephemeral: true,
  });
}

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  _client: ExtendedClient,
) {
  if (interaction.commandName === "help") {
    await sendHelpMenu(interaction);
    return;
  }

  if (interaction.commandName === "setup") {
    await handleAutoRoleSlash(interaction);
    return;
  }

  if (interaction.commandName === "setupgold") {
    await handleGoldSetupSlash(interaction);
  }
}
