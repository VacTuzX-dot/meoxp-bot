import {
  Client,
  EmbedBuilder,
  TextChannel,
  Message,
} from "discord.js";
import { ReactionTrackerMapping, reactionTrackerManager } from "./ReactionTrackerManager";

/**
 * Key: botMessageId, Value: NodeJS.Timeout
 * Used for debouncing updates to the same tracker message to save API calls
 */
const updateQueue = new Map<string, NodeJS.Timeout>();

/**
 * Type guard to check if an object is a valid Discord Client at runtime.
 */
function isValidClient(client: any): client is Client {
  return (
    client &&
    typeof client.isReady === "function" &&
    typeof client.channels?.fetch === "function"
  );
}

/**
 * Debounces a tracker update to avoid hitting rate limits.
 */
export function debounceUpdateReactionTracker(
  client: Client | null | undefined,
  botMessageId: string,
  botMessageChannelId: string,
  delayMs = 1500,
) {
  if (!botMessageId) return;
  const key = botMessageId;

  if (updateQueue.has(key)) {
    clearTimeout(updateQueue.get(key)!);
  }

  const timeout = setTimeout(async () => {
    updateQueue.delete(key);
    try {
      await performUpdate(client, botMessageId, botMessageChannelId);
    } catch (error) {
      console.error(
        `[ReactionTracker] Fatal error in debounce timeout for ${key}:`,
        error,
      );
    }
  }, delayMs);

  updateQueue.set(key, timeout);
}

/**
 * Performs the actual update of the tracker message.
 */
async function performUpdate(
  client: Client | null | undefined,
  botMessageId: string,
  botMessageChannelId: string,
) {
  const logPrefix = `[ReactionTracker][BotMsg:${botMessageId}]`;

  try {
    // 1. Resolve and Validate Active Client
    if (!client || !isValidClient(client) || !client.isReady()) {
      return; 
    }

    if (!client.channels) {
      return;
    }

    // 2. Fetch all mappings for this bot message
    const mappings = reactionTrackerManager.getMappingsByBotMessageId(botMessageId);
    if (mappings.length === 0) {
      return; // No tracers left for this message
    }

    // 3. Fetch Bot Channel
    const botChannel = await client.channels
      .fetch(botMessageChannelId)
      .catch(() => null);

    if (!botChannel || !botChannel.isTextBased()) {
      return; 
    }

    const textChannel = botChannel as TextChannel;

    // 4. Fetch Bot Tracker Message
    let botMessage: Message;
    try {
      botMessage = await textChannel.messages.fetch(botMessageId);
    } catch {
      return; // Safe skip if message was deleted
    }

    const embeds: EmbedBuilder[] = [];

    // 5. Process each mapping to build embeds
    for (const mapping of mappings) {
      try {
        // Fetch watched channel
        const watchedChannel = await client.channels.fetch(mapping.channelId).catch(() => null);
        if (!watchedChannel || !watchedChannel.isTextBased()) continue;

        const watchedTextChannel = watchedChannel as TextChannel;
        const watchedMessage = await watchedTextChannel.messages.fetch(mapping.watchedMessageId).catch(() => null);

        if (!watchedMessage) {
          // If message is deleted, we could show a warning/error in the embed or just skip
          const errorEmbed = new EmbedBuilder()
            .setTitle(`คนที่กด ?`)
            .setColor("Red")
            .setDescription(`⚠️ ไม่พบข้อความต้นทาง (\`${mapping.watchedMessageId}\`)`);
          embeds.push(errorEmbed);
          continue;
        }

        // Find Target Reaction
        if (!watchedMessage.reactions) continue;

        let emojiReaction = watchedMessage.reactions.cache.find(
          (r) =>
            r.emoji.id === mapping.emojiIdOrName ||
            r.emoji.name === mapping.emojiIdOrName,
        );

        if (emojiReaction?.partial) {
          try {
            emojiReaction = await emojiReaction.fetch();
          } catch { }
        }

        let usersList: string[] = [];
        let realCount = 0;

        if (emojiReaction && emojiReaction.users) {
          try {
            const users = await emojiReaction.users.fetch({ limit: 100 });
            usersList = users.filter((u) => !u.bot).map((u) => `<@${u.id}>`);
            realCount = emojiReaction.count - (emojiReaction.me ? 1 : 0);
          } catch (e) {
            console.warn(`${logPrefix} Could not fetch users for reaction ${mapping.emojiIdOrName}:`, (e as Error).message);
          }
        }

        const displayEmoji =
          mapping.emojiIdOrName.length > 15
            ? `<:emoji:${mapping.emojiIdOrName}>`
            : mapping.emojiIdOrName;

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
          let desc = displayUsers
            .map((mention, idx) => `**${idx + 1}.** ${mention}`)
            .join("\n");

          if (usersList.length > MAX_DISPLAY || realCount > MAX_DISPLAY) {
            const remaining = Math.max(0, countToDisplay - MAX_DISPLAY);
            if (remaining > 0) {
              desc += `\n\n...และเพื่อนคนอื่นๆ อีก ${remaining} คน (แสดงผลสูงสุด ${MAX_DISPLAY} คน)`;
            }
          }

          if (desc.length > 4000) {
            desc = desc.substring(0, 4000) + "...";
          }
          embed.setDescription(desc);
        }
        embeds.push(embed);
      } catch (err) {
        console.error(`${logPrefix} Error processing mapping for emoji ${mapping.emojiIdOrName}:`, err);
      }
    }

    // 6. Update the message with all embeds
    if (embeds.length > 0) {
      await botMessage.edit({ content: "", embeds: embeds });
    }
  } catch (error) {
    console.error(`${logPrefix} Unexpected update error:`, error);
  }
}
