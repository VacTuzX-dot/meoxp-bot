import { Events, type Message } from "discord.js";
import { type ExtendedClient, defineEvent } from "../types";
import { ttsManager } from "../lib/TtsManager";

const PREFIX = "!!";

const event = defineEvent({
  name: Events.MessageCreate,
  execute(message: Message, client: ExtendedClient) {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Handle bot commands
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();

      if (!commandName) return;

      // Get command from commands or aliases
      const aliasCommandName = client.aliases.get(commandName);
      const command =
        client.commands.get(commandName) ||
        (aliasCommandName ? client.commands.get(aliasCommandName) : undefined);

      if (!command) return;

      try {
        command.execute(message, args, client);
      } catch (error) {
        console.error("Command error:", error);
        message.reply("❌ เกิดข้อผิดพลาดค่ะ 🥺");
      }
      return;
    }

    // Auto-read TTS for non-command messages
    const guildId = message.guild.id;
    const guildConfig = ttsManager.getGuildConfig(guildId);
    const activeVoiceChannelId = ttsManager.getActiveVoiceChannel(guildId);

    if (
      guildConfig?.boundChannelId === message.channel.id &&
      activeVoiceChannelId
    ) {
      // WHY: Only read messages if sender is in the same voice channel as the bot
      const member = message.member;
      if (member?.voice.channelId === activeVoiceChannelId) {
        ttsManager
          .enqueue(client, {
            guildId,
            voiceChannelId: activeVoiceChannelId,
            textChannelId: message.channel.id,
            userId: message.author.id,
            text: message.content,
          })
          .catch((err) => {
            console.error("[TTS] Auto-read enqueue error:", err);
          });
      }
    }
  },
});

export default event;
