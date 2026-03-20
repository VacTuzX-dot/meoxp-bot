import { Message, PermissionsBitField, EmbedBuilder } from "discord.js";
import { Command, ExtendedClient } from "../types";
import { reactionTrackerManager } from "../lib/ReactionTrackerManager";
import { reactionRoleManager } from "../lib/ReactionRoleManager";
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
        "`!!rrname setup <messageId> <emoji> [@role]` (บอทจะสร้างข้อความสำหรับแสดงผลให้ใหม่)\n" +
        "`!!rrname add <messageId> <emoji> <botMessageId> [@role]` (เชื่อมกับข้อความของบอทที่เจาะจง)\n" +
        "`!!rrname remove <messageId> <emoji>`\n" +
        "`!!rrname list`"
      );
      return;
    }

    if (action === "setup" || action === "add") {
      const watchedMessageId = args[1];
      const emojiArg = args[2];
      const botMessageId = action === "add" ? args[3] : undefined;
      const roleArg = action === "add" ? args[4] : args[3];

      if (!watchedMessageId || !emojiArg) {
         message.reply(`❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: \`!!rrname ${action} <messageId> <emoji>${action === 'add' ? ' <botMessageId>' : ''} [@role]\``);
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

      // --- Validation: Role Mapping ---
      let targetRole: any = null;
      if (roleArg) {
        const roleIdMatch = roleArg.match(/<@&(\d+)>/);
        const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;
        targetRole = message.guild.roles.cache.get(roleId);
        
        if (!targetRole) {
          message.reply("❌ ไม่พบยศดังกล่าว (โปรดตรวจสอบอีกครั้งหรือใช้วิธี Mention) !");
          return;
        }

        // Hierarchy check
        const botMember = message.guild.members.me;
        if (botMember) {
          if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            message.reply("❌ บอทไม่มีสิทธิ์ Manage Roles กรุณาให้สิทธิ์แก่บอทในเซิร์ฟเวอร์ก่อนใช้งาน!");
            return;
          }
          if (botMember.roles.highest.position <= targetRole.position) {
            message.reply("❌ ไม่สามารถจ่ายยศนี้ได้ เนื่องจากยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศเป้าหมาย");
            return;
          }
        }
      }

      // Check for existing role mapping if none provided
      const existingRoleMapping = reactionRoleManager.getMapping(watchedMessageId, parsedEmoji);
      if (!targetRole && !existingRoleMapping) {
        message.reply(
          `❌ ไม่พบการตั้งค่า Role สำหรับอีโมจิ ${emojiArg} บนข้อความนี้!\n` +
          `ระบบ Tracker จำเป็นต้องมี Role Mapping ควบคู่กันไปเพื่อความชัดเจน\n` +
          `วิธีแก้ไข:\n` +
          `1. ใส่ยศในคำสั่งนี้: \`!!rrname ${action} ${watchedMessageId} ${emojiArg}${action === 'add' ? ' ' + botMessageId : ''} <@role>\`\n` +
          `2. ตั้งค่า Reaction Role ก่อน: \`!!rr add ${watchedMessageId} ${emojiArg} <@role>\``
        );
        return;
      }
      // -------------------------------

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
      } else if (targetBotMessageId) {
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

      // If role was provided, save it to ReactionRoleManager first
      if (targetRole) {
        await reactionRoleManager.addMapping({
          guildId: message.guild.id,
          channelId: message.channel.id,
          messageId: watchedMessageId,
          emojiIdOrName: parsedEmoji,
          roleId: targetRole.id
        });
      }

      const success = await reactionTrackerManager.addMapping({
        guildId: message.guild.id,
        channelId: message.channel.id,
        watchedMessageId: watchedMessageId,
        emojiIdOrName: parsedEmoji,
        botMessageChannelId: message.channel.id,
        botMessageId: targetBotMessageId!
      });
      
      if (success) {
        const roleMention = targetRole ? `<@&${targetRole.id}>` : `<@&${existingRoleMapping?.roleId}>`;
        message.reply(`✅ ติดตั้งระบบ Reaction Tracker สำเร็จ!\n• ข้อความ: \`${watchedMessageId}\`\n• อีโมจิ: ${emojiArg}\n• ยศที่จ่าย: ${roleMention}\n• ข้อความบอท: \`${targetBotMessageId}\``);
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
        message.reply(`✅ นำการตั้งค่า Reaction Tracker สำหรับอีโมจิ ${emojiArg} ที่มีกับข้อความ ${watchedMessageId} ออกเรียบร้อยแล้ว (อัปเดต NoSQL แล้ว)\n*หมายเหตุ: ระบบยังคงเก็บการจ่ายยศไว้ หากต้องการลบยศด้วยให้ใช้ \`!!rr remove <messageId> <emoji>\`*`);
      } else {
        message.reply("❌ ไม่พบการตั้งค่า Reaction Tracker นี้");
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
            const rrMapping = reactionRoleManager.getMapping(m.watchedMessageId, m.emojiIdOrName);
            const roleStr = rrMapping ? `<@&${rrMapping.roleId}>` : "⚠️ No Role Found";
            return `**${i + 1}.** MSG: \`${m.watchedMessageId}\` • Emoji: ${displayEmoji} ➡️ Role: ${roleStr}\n╰ Bot MSG: \`${m.botMessageId}\``;
          }).join("\n")
        );
      
      message.reply({ embeds: [embed] });
    }
  },
};

export default command;
