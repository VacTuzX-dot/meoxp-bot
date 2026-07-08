import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";
import { getPlayer, isLavalinkReady } from "../lib/MoodenglinkManager";

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
      message.reply("❌ นายท่านต้องเข้าห้องเสียงก่อนนะคะ~ 🎤");
      return;
    }

    const guildId = message.guild!.id;
    const voiceChannelId = member.voice.channel.id;

    const botVoiceChannel = message.guild?.members.me?.voice.channel;
    if (botVoiceChannel?.id === voiceChannelId) {
      message.reply("✨ หนูอยู่ในห้องนี้รอนายท่านอยู่แล้วค่ะ~ 💕");
      return;
    }

    if (!isLavalinkReady(client)) {
      message.reply("⏳ กรุณารอสักครู่นะคะนายท่าน หนูกำลังเตรียมตัว~ 🔧");
      return;
    }

    const player = await getPlayer(
      client,
      guildId,
      voiceChannelId,
      message.channel.id
    );
    if (!player) {
      message.reply("😢 ขอโทษนะคะนายท่าน หนูเข้าห้องไม่ได้ค่ะ~");
      return;
    }

    player.set("persistent", true); // joined via !!join, no auto-leave

    const embed = new EmbedBuilder()
      .setTitle("🎀 หนูมาแล้วค่ะนายท่าน~")
      .setDescription(
        `เข้าห้อง **${member.voice.channel.name}** เรียบร้อยค่ะ ✨`
      )
      .setColor(0xff69b4)
      .addFields(
        {
          name: "📌 โหมด",
          value: "หนูจะรอนายท่านจนกว่าจะสั่ง `!!leave` ค่ะ",
          inline: false,
        },
        {
          name: "💡 คำแนะนำ",
          value: "ใช้ `!!play` เพื่อเปิดเพลง หรือ `!!leave` เพื่อให้หนูออกค่ะ",
          inline: false,
        }
      )
      .setFooter({ text: "💕 พร้อมรับใช้นายท่านค่ะ~" });

    message.reply({ embeds: [embed] });
  },
};

export default command;
