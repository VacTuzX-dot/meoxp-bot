import { Client, EmbedBuilder, TextChannel, Message } from "discord.js";
import { reactionTrackerManager, ReactionTrackerMapping } from "./ReactionTrackerManager";

// Key: botMessageId, Value: NodeJS.Timeout
const updateQueue = new Map<string, NodeJS.Timeout>();

export function debounceUpdateReactionTracker(
  client: Client,
  mapping: ReactionTrackerMapping,
  watchedMessage: Message,
  delayMs = 1500
) {
  const key = mapping.botMessageId;

  if (updateQueue.has(key)) {
    clearTimeout(updateQueue.get(key)!);
  }

  const timeout = setTimeout(async () => {
    updateQueue.delete(key);
    await performUpdate(client, mapping, watchedMessage);
  }, delayMs);

  updateQueue.set(key, timeout);
}

async function performUpdate(client: Client, mapping: ReactionTrackerMapping, watchedMessage: Message) {
  try {
    const botChannel = await client.channels.fetch(mapping.botMessageChannelId) as TextChannel;
    if (!botChannel || !botChannel.isTextBased()) return;

    let botMessage: Message;
    try {
      botMessage = await botChannel.messages.fetch(mapping.botMessageId);
    } catch {
      console.log(`[ReactionTracker] Bot message ${mapping.botMessageId} not found. Clean up mapping.`);
      return; 
    }

    const emojiReaction = watchedMessage.reactions.cache.find(
      (r) => (r.emoji.id === mapping.emojiIdOrName || r.emoji.name === mapping.emojiIdOrName)
    );

    let usersList: string[] = [];
    let realCount = 0;
    
    if (emojiReaction) {
      // Fetch up to 100 users to stay beneath API and Embed limits
      const users = await emojiReaction.users.fetch({ limit: 100 });
      usersList = users
        .filter((u) => !u.bot)
        .map((u) => `<@${u.id}>`);
      
      realCount = emojiReaction.count - (emojiReaction.me ? 1 : 0);
    }

    const displayEmoji = mapping.emojiIdOrName.length > 15 ? `<:emoji:${mapping.emojiIdOrName}>` : mapping.emojiIdOrName;
    
    // Safely enforce realistic max display count
    const MAX_DISPLAY = 80;
    const countToDisplay = Math.max(usersList.length, realCount);

    const embed = new EmbedBuilder()
      .setTitle(`คนที่กด ${displayEmoji}`)
      .setColor("Green")
      .setFooter({ text: `Total count: ${countToDisplay}` });

    if (usersList.length === 0) {
      embed.setDescription("ยังไม่มีคนกดอิโมจินี้เลย 🥺");
    } else {
      const displayUsers = usersList.slice(0, MAX_DISPLAY);
      let desc = displayUsers.map((mention, idx) => `**${idx + 1}.** ${mention}`).join("\n");
      
      if (usersList.length > MAX_DISPLAY || realCount > MAX_DISPLAY) {
        const remaining = Math.max(0, countToDisplay - MAX_DISPLAY);
        if (remaining > 0) {
           desc += `\n\n...และตัวเป้งอีก ${remaining} คน (แสดงผลสูงสุด ${MAX_DISPLAY} คน)`;
        }
      }

      // Max desc length is 4096. We slice at ~4000 just in case it's extremely long mentions.
      if (desc.length > 4000) {
        desc = desc.substring(0, 4000) + "...";
      }

      embed.setDescription(desc);
    }

    await botMessage.edit({ content: "", embeds: [embed] });
  } catch (error) {
    console.error("❌ [ReactionTracker] Update error:", error);
  }
}
