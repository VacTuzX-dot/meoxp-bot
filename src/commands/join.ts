import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  createQueue,
  getPlayer,
  isLavalinkReady,
} from "../lib/ShoukakuManager";

const command: Command = {
  name: "join",
  aliases: ["j", "connect"],
  description: "Join voice channel and stay until !!leave",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const member = message.member;
    if (!member?.voice.channel) {
      message.reply("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤");
      return;
    }

    const guildId = message.guild!.id;
    const voiceChannelId = member.voice.channel.id;

    // Check if already in this channel
    const botVoiceChannel = message.guild?.members.me?.voice.channel;
    if (botVoiceChannel?.id === voiceChannelId) {
      message.reply("✅ อยู่ในห้องนี้อยู่แล้วค่ะ~");
      return;
    }

    // Check Lavalink
    if (!isLavalinkReady(client)) {
      message.reply("❌ Lavalink ยังไม่พร้อมค่ะ กรุณารอสักครู่~");
      return;
    }

    // Initialize queue if not exists
    if (!client.queues.has(guildId)) {
      client.queues.set(guildId, createQueue());
    }

    const queue = client.queues.get(guildId)!;
    queue.voiceChannelId = voiceChannelId;
    queue.textChannelId = message.channel.id;
    queue.persistent = true; // Set persistent mode - no auto-leave

    // Join voice channel
    const player = await getPlayer(client, guildId, voiceChannelId);
    if (!player) {
      message.reply("❌ ไม่สามารถเข้าห้องได้ค่ะ 🥺");
      return;
    }

    queue.player = player;

    const embed = new EmbedBuilder()
      .setTitle("🎙️ เข้าห้องแล้วค่ะ~")
      .setDescription(`เข้าห้อง **${member.voice.channel.name}** แล้วค่ะ`)
      .setColor(0x00ff88)
      .addFields(
        {
          name: "📌 โหมด",
          value: "**Persistent** - อยู่จนกว่าจะสั่ง `!!leave`",
          inline: false,
        },
        {
          name: "💡 Tip",
          value: "ใช้ `!!play` เพื่อเล่นเพลง หรือ `!!leave` เพื่อออก",
          inline: false,
        }
      )
      .setFooter({ text: "💕 พร้อมให้บริการค่ะ~" });

    message.reply({ embeds: [embed] });
  },
};

export default command;
