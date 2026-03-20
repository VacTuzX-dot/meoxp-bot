import {
  Client,
  EmbedBuilder,
  TextChannel,
  Message,
} from "discord.js";
import { ReactionTrackerMapping, reactionTrackerManager } from "./ReactionTrackerManager";

/**
 * Key: botMessageId, Value: NodeJS.Timeout
 */
const updateQueue = new Map<string, NodeJS.Timeout>();

/**
 * Type guard for Discord Client with required managers.
 */
function isValidClient(client: any): client is Client {
  return (
    client &&
    typeof client.isReady === "function" &&
    client.channels &&
    typeof client.channels.fetch === "function"
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

  if (updateQueue.has(botMessageId)) {
    clearTimeout(updateQueue.get(botMessageId)!);
  }

  const timeout = setTimeout(async () => {
    updateQueue.delete(botMessageId);
    try {
      await performUpdate(client, botMessageId, botMessageChannelId);
    } catch (error) {
      console.error(
        `[ReactionTracker][BotMsg:${botMessageId}] Fatal error in debounce timeout:`,
        error,
      );
    }
  }, delayMs);

  updateQueue.set(botMessageId, timeout);
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
    if (!client || !isValidClient(client)) {
      return; 
    }
    
    // Ensure client is ready before proceeding with Discord interactions
    if (!client.isReady()) {
      return;
    }

    // 2. Fetch all mappings for this bot message
    const mappings = reactionTrackerManager.getMappingsByBotMessageId(botMessageId);
    if (!mappings || mappings.length === 0) {
      return;
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
    } catch (err) {
      return; // Safe skip if message was deleted
    }

    const embeds: EmbedBuilder[] = [];

    // 5. Process each mapping to build embeds
    for (const mapping of mappings) {
      try {
        const watchedChannel = await client.channels.fetch(mapping.channelId).catch(() => null);
        if (!watchedChannel || !watchedChannel.isTextBased()) continue;

        const watchedTextChannel = watchedChannel as TextChannel;
        const watchedMessage = await watchedTextChannel.messages.fetch(mapping.watchedMessageId).catch(() => null);

        if (!watchedMessage) {
          const errorEmbed = new EmbedBuilder()
            .setTitle(`คนที่กด ?`)
            .setColor("Red")
            .setDescription(`⚠️ ไม่พบข้อความต้นทาง (\`${mapping.watchedMessageId}\`)`);
          embeds.push(errorEmbed);
          continue;
        }

        // Find Target Reaction using resolve() for better reliability
        let emojiReaction = watchedMessage.reactions.resolve(mapping.emojiIdOrName);

        if (emojiReaction?.partial) {
          try {
            emojiReaction = await emojiReaction.fetch();
          } catch (e) {
            console.warn(`${logPrefix} Partial reaction fetch failed for ${mapping.emojiIdOrName}`);
          }
        }

        let usersList: string[] = [];
        let realCount = 0;

        if (emojiReaction) {
          try {
            // Fetch users (up to 100)
            const users = await emojiReaction.users.fetch({ limit: 100 });
            usersList = [...users.values()]
              .filter((u) => !u.bot)
              .map((u) => `<@${u.id}>`);
            
            // Re-fetch reaction to get latest count after potential user fetch
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

          if (desc.length > 4050) {
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
    if (embeds && embeds.length > 0) {
      try {
        await botMessage.edit({ content: "", embeds });
      } catch (e) {
        console.error(`${logPrefix} Failed to edit bot message with updated tracker:`, e);
      }
    } else {
      console.warn(`${logPrefix} No valid embeds constructed, skipping update.`);
    }
  } catch (error) {
    console.error(`${logPrefix} Unexpected update error:`, error);
  }
}

