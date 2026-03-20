import { Message, PermissionsBitField, EmbedBuilder } from "discord.js";
import { Command, ExtendedClient } from "../types";
import { reactionTrackerManager } from "../lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "../lib/reactionTrackerUpdater";

function parseEmoji(emojiStr: string): string {
  const customMatch = emojiStr.match(/<a?:.+?:(\d+)>/);
  if (customMatch) return customMatch[1];
  return emojiStr;
}

const command: Command = {
  name: "rrname",
  description: "ระบบ Real-time Reaction Tracker (ดูคนกดอิโมจิ)",
  execute: async (message: Message, args: string[], client: ExtendedClient) => {
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
      message.reply("❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ");
      return;
    }

    if (!message.guild || !message.channel) return;
    if (!message.channel.isTextBased()) return;

    const action = args[0]?.toLowerCase();

    if (!action || !["setup", "add", "remove", "list"].includes(action)) {
      message.reply(
        "❌ กรุณาระบุรูปคำสั่งให้ถูกต้อง:\n" +
        "`!!rrname setup <messageId> <emoji>` (บอทจะสร้างข้อความสำหรับแสดงผลให้ใหม่)\n" +
        "`!!rrname add <messageId> <emoji> <botMessageId>` (เชื่อมกับข้อความของบอทที่เจาะจง)\n" +
        "`!!rrname remove <messageId> <emoji>`\n" +
        "`!!rrname list`"
      );
      return;
    }

    if (action === "setup" || action === "add") {
      const watchedMessageId = args[1];
      const emojiArg = args[2];
      const botMessageId = args[3];

      if (!watchedMessageId || !emojiArg) {
         message.reply(`❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: \`!!rrname ${action} <messageId> <emoji>${action === 'add' ? ' <botMessageId>' : ''}\``);
         return;
      }

      if (action === "add" && !botMessageId) {
         message.reply("❌ ข้อมูลไม่ครบถ้วน! กรุณาระบุ message ID ของเป้าหมาย (botMessageId)");
         return;
      }

      let watchedMessage;
      try {
        watchedMessage = await message.channel.messages.fetch(watchedMessageId);
      } catch (err) {
         message.reply("❌ ไม่พบข้อความดังกล่าวในห้องแชทนี้ (Watched Message Not Found)");
         return;
      }

      const parsedEmoji = parseEmoji(emojiArg);
      const displayEmoji = parsedEmoji.length > 15 ? `<:emoji:${parsedEmoji}>` : parsedEmoji;

      let targetBotMessageId = botMessageId;

      if (action === "setup") {
        const initialEmbed = new EmbedBuilder()
          .setTitle(`คนที่กด ${displayEmoji}`)
          .setColor("Green")
          .setDescription("ระบบกำลังเตรียมความพร้อม...")
          .setFooter({ text: "Total count: 0" });
          
        const textChannel = message.channel as any;
        const botMsg = await textChannel.send({ embeds: [initialEmbed] });
        targetBotMessageId = botMsg.id;
      } else {
        try {
          await message.channel.messages.fetch(targetBotMessageId);
        } catch (err) {
          message.reply("❌ ไม่พบข้อความบอทเป้าหมาย (targetBotMessageId Not Found)");
          return;
        }
      }

      // Auto-react to the watched message
      try {
        await watchedMessage.react(parsedEmoji);
      } catch (err) {
        console.error("❌ Failed to auto-react to watched message:", err);
      }

      const success = await reactionTrackerManager.addMapping({
        guildId: message.guild.id,
        channelId: message.channel.id,
        watchedMessageId: watchedMessageId,
        emojiIdOrName: parsedEmoji,
        botMessageChannelId: message.channel.id,
        botMessageId: targetBotMessageId
      });
      
      if (success) {
        message.reply(`✅ ติดตั้งระบบ Reaction Tracker สำเร็จ! ให้บอทติดตามข้อความ ${watchedMessageId} ด้วยอีโมจิ ${emojiArg} (บันทึกข้อมูลลง NoSQL แล้ว)`);
      } else {
        message.reply("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง NoSQL ค่ะ");
      }
      
      // Update immediately
      const mapping = reactionTrackerManager.getMapping(watchedMessageId, parsedEmoji);
      if (mapping) {
        debounceUpdateReactionTracker(client as any, mapping, watchedMessage, 0); // instant update
      }

    } else if (action === "remove") {
      const watchedMessageId = args[1];
      const emojiArg = args[2];

      if (!watchedMessageId || !emojiArg) {
         message.reply("❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: `!!rrname remove <messageId> <emoji>`");
         return;
      }

      const parsedEmoji = parseEmoji(emojiArg);
      const success = await reactionTrackerManager.removeMapping(watchedMessageId, parsedEmoji);

      if (success) {
        message.reply(`✅ นำการตั้งค่าสำหรับอีโมจิ ${emojiArg} ที่มีกับข้อความ ${watchedMessageId} ออกเรียบร้อยแล้ว (อัปเดต NoSQL แล้ว)`);
      } else {
        message.reply("❌ ไม่พบการตั้งค่านี้ (หรืออาจจะถูกลบไปแล้ว)");
      }
    } else if (action === "list") {
      const mappings = reactionTrackerManager.getGuildMappings(message.guild.id);

      if (mappings.length === 0) {
        message.reply("ℹ️ ห้องนี้ยังไม่มีการตั้งค่า Reaction Tracker ค่ะ");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Reaction Tracker of ${message.guild.name}`)
        .setColor("Green")
        .setDescription(
          mappings.map((m, i) => {
            const displayEmoji = m.emojiIdOrName.length > 15 ? `<:emoji:${m.emojiIdOrName}>` : m.emojiIdOrName;
            return `**${i + 1}.** Watched MSG: \`${m.watchedMessageId}\` • Emoji: ${displayEmoji} ➡️ Update MSG: \`${m.botMessageId}\``;
          }).join("\n")
        );
      
      message.reply({ embeds: [embed] });
    }
  },
};

export default command;
