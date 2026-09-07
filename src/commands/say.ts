import type { Message } from "discord.js";
import type { ExtendedClient, Command } from "../types";
import { isLavalinkReady } from "../lib/MoodenglinkManager";
import { ttsManager, MAX_TTS_TEXT_LENGTH } from "../lib/TtsManager";

export async function handleSayCommand(
  message: Message,
  args: string[],
  client: ExtendedClient,
  explicitVoice: string,
  exampleText: string
): Promise<void> {
  const member = message.member;
  if (!member?.voice.channel) {
    message.reply("🎤 นายท่านต้องเข้าห้องเสียงก่อนนะคะ~");
    return;
  }

  if (args.length === 0) {
    message.reply(
      `💬 กรุณาพิมพ์ข้อความที่ต้องการให้หนูพูดนะคะนายท่าน~ เช่น \`${exampleText}\``
    );
    return;
  }

  const text = args.join(" ");

  if (text.length > MAX_TTS_TEXT_LENGTH) {
    message.reply(`📝 ข้อความยาวเกินไปค่ะนายท่าน สูงสุด ${MAX_TTS_TEXT_LENGTH} ตัวอักษรนะคะ~`);
    return;
  }

  if (!isLavalinkReady(client)) {
    message.reply("⏳ กรุณารอสักครู่นะคะนายท่าน หนูกำลังเตรียมตัว~ 🔧");
    return;
  }

  const guildId = message.guild!.id;
  const voiceChannelId = member.voice.channel.id;

  try {
    const res = await ttsManager.enqueue(client, {
      guildId,
      voiceChannelId,
      textChannelId: message.channel.id,
      userId: message.author.id,
      text,
      explicitVoice,
    });

    if (!res.success) {
      message.reply(`❌ ${res.reason || "ไม่สามารถพูดข้อความได้ค่ะนายท่าน~"}`);
      return;
    }

    const reply = await message.reply(`🗣️ "${text}"`);
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[TTS] request failed: ${errorName}`);
    message.reply("❌ เกิดข้อผิดพลาดในการสร้างเสียงค่ะนายท่าน~");
  }
}

const command: Command = {
  name: "say",
  aliases: ["speak", "sayth"],
  description: "Text-to-Speech ภาษาไทย",
  execute: (message, args, client) =>
    handleSayCommand(message, args, client, "th", "!!say สวัสดี"),
};

export default command;
