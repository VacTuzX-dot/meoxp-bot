import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import { getPlayer, isLavalinkReady } from "../lib/MoodenglinkManager";
import * as googleTTS from "google-tts-api";

const command: Command = {
  name: "say",
  aliases: ["tts", "speak"],
  description: "Text-to-Speech ภาษาไทย",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient,
  ): Promise<void> {
    const member = message.member;
    if (!member?.voice.channel) {
      message.reply("🎤 นายท่านต้องเข้าห้องเสียงก่อนนะคะ~");
      return;
    }

    if (args.length === 0) {
      message.reply(
        "💬 กรุณาพิมพ์ข้อความที่ต้องการให้หนูพูดนะคะนายท่าน~ เช่น `!!say สวัสดี`",
      );
      return;
    }

    const text = args.join(" ");

    if (text.length > 200) {
      message.reply("📝 ข้อความยาวเกินไปค่ะนายท่าน สูงสุด 200 ตัวอักษรนะคะ~");
      return;
    }

    if (!isLavalinkReady(client)) {
      message.reply("⏳ กรุณารอสักครู่นะคะนายท่าน หนูกำลังเตรียมตัว~ 🔧");
      return;
    }

    const guildId = message.guild!.id;
    const voiceChannelId = member.voice.channel.id;

    try {
      const ttsUrl = googleTTS.getAudioUrl(text, {
        lang: "th",
        slow: false,
        host: "https://translate.google.com",
      });

      const player = await getPlayer(
        client,
        guildId,
        voiceChannelId,
        message.channel.id,
      );
      if (!player) {
        message.reply("😢 หนูเข้าห้องไม่ได้ค่ะนายท่าน~");
        return;
      }

      const result = await client.manager.search(ttsUrl);

      if (
        result.loadType === "error" ||
        result.loadType === "empty" ||
        result.tracks.length === 0
      ) {
        message.reply("❌ ไม่สามารถโหลดเสียงได้ค่ะนายท่าน~");
        return;
      }

      await player.play({ track: result.tracks[0] });

      const reply = await message.reply(`🗣️ "${text}"`);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error("[TTS] Error:", error);
      message.reply(`❌ เกิดข้อผิดพลาดค่ะนายท่าน: ${(error as Error).message}`);
    }
  },
};

export default command;
