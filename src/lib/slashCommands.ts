import {
  ChatInputCommandInteraction,
  Client,
  Message,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { ExtendedClient } from "../types";
import { autoRoleManager } from "./AutoRoleManager";
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
  }
}
