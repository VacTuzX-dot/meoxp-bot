import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  createQueue,
  getPlayer,
  isLavalinkReady,
  getAvailableNode,
} from "../lib/ShoukakuManager";
import * as googleTTS from "google-tts-api";

const command: Command = {
  name: "saye",
  aliases: ["ttse", "speake"],
  description: "Text-to-Speech ภาษาอังกฤษ",
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
        "💬 กรุณาพิมพ์ข้อความที่ต้องการให้หนูพูดนะคะนายท่าน~ เช่น `!!saye Hello`",
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

    if (!client.queues.has(guildId)) {
      client.queues.set(guildId, createQueue());
    }

    const queue = client.queues.get(guildId)!;
    queue.textChannelId = message.channel.id;
    queue.voiceChannelId = voiceChannelId;

    try {
      const ttsUrl = googleTTS.getAudioUrl(text, {
        lang: "en",
        slow: false,
        host: "https://translate.google.com",
      });

      if (!queue.player) {
        const player = await getPlayer(client, guildId, voiceChannelId);
        if (!player) {
          message.reply("😢 หนูเข้าห้องไม่ได้ค่ะนายท่าน~");
          return;
        }
        queue.player = player;
      }

      const node = getAvailableNode(client);
      if (!node) {
        message.reply("⚠️ ระบบไม่พร้อมค่ะนายท่าน กรุณาลองใหม่นะคะ~");
        return;
      }

      const result = await node.rest.resolve(ttsUrl);

      if (
        !result ||
        result.loadType === "error" ||
        result.loadType === "empty"
      ) {
        message.reply("❌ ไม่สามารถโหลดเสียงได้ค่ะนายท่าน~");
        return;
      }

      const track =
        result.loadType === "track" ? result.data : (result.data as any)[0];

      if (!track) {
        message.reply("❌ เกิดข้อผิดพลาดค่ะนายท่าน~");
        return;
      }

      await queue.player.playTrack({ track: { encoded: track.encoded } });

      const reply = await message.reply(`🗣️ "${text}"`);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error("[TTS] Error:", error);
      message.reply(`❌ เกิดข้อผิดพลาดค่ะนายท่าน: ${(error as Error).message}`);
    }
  },
};

export default command;
