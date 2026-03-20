import {
  Client,
  EmbedBuilder,
  TextChannel,
  Message,
  MessageReaction,
} from "discord.js";
import { ReactionTrackerMapping } from "./ReactionTrackerManager";

/**
 * Key: botMessageId, Value: NodeJS.Timeout
 * Used for debouncing updates to the same tracker message to save API calls
 */
const updateQueue = new Map<string, NodeJS.Timeout>();

/**
 * Debounces a tracker update to avoid hitting rate limits.
 */
export function debounceUpdateReactionTracker(
  client: Client,
  mapping: ReactionTrackerMapping,
  watchedMessage: Message,
  delayMs = 1500,
) {
  if (!mapping?.botMessageId) return;
  const key = mapping.botMessageId;

  if (updateQueue.has(key)) {
    clearTimeout(updateQueue.get(key)!);
  }

  // Use the message's client as fallback if the passed one is invalid
  const activeClient = client || watchedMessage.client;

  const timeout = setTimeout(async () => {
    updateQueue.delete(key);
    try {
      await performUpdate(activeClient, mapping, watchedMessage);
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
  client: Client,
  mapping: ReactionTrackerMapping,
  watchedMessage: Message,
) {
  const logPrefix = `[ReactionTracker][Msg:${mapping.watchedMessageId}]`;

  try {
    // 1. Resolve Active Client
    // We prioritize the passed client, then the message's client.
    const activeClient = client || watchedMessage.client;

    // 2. Readiness Guard
    // If the client is not yet ready (e.g. during startup or reconnection),
    // we skip the update. This is non-critical and prevents "undefined" errors.
    if (!activeClient || !activeClient.isReady()) {
      return; // Skip silently as requested to keep logs clean
    }

    // 3. Channels Manager Guard
    // In rare cases (startup/reconnect), the channels manager might be briefly undefined
    if (!activeClient.channels) {
      // Log the specific warning the user reported if we hit this, though isReady() should prevent it
      console.warn(`${logPrefix} Client or channels manager is undefined - Skipping update (non-critical)`);
      return;
    }

    // 4. Fetch Bot Channel
    const botChannel = await activeClient.channels
      .fetch(mapping.botMessageChannelId)
      .catch(() => null);

    if (!botChannel || !botChannel.isTextBased()) {
      return; // Safe skip if channel is missing or not text-based
    }

    const textChannel = botChannel as TextChannel;

    // 5. Fetch Bot Tracker Message
    let botMessage: Message;
    try {
      botMessage = await textChannel.messages.fetch(mapping.botMessageId);
    } catch {
      return; // Safe skip if message was deleted
    }

    // 6. Ensure Watched Message is latest
    if (watchedMessage.partial) {
      try {
        await watchedMessage.fetch();
      } catch {
        return; // Safe skip if watched message is gone
      }
    }

    // 7. Find Target Reaction
    let emojiReaction = watchedMessage.reactions.cache.find(
      (r) =>
        r.emoji.id === mapping.emojiIdOrName ||
        r.emoji.name === mapping.emojiIdOrName,
    );

    // 8. Handle Partial Reaction
    if (emojiReaction?.partial) {
      try {
        emojiReaction = await emojiReaction.fetch();
      } catch {
        // Continue with what we have or skip if count is essential
      }
    }

    let usersList: string[] = [];
    let realCount = 0;

    // 9. Process Users if reaction exists
    if (emojiReaction && emojiReaction.users) {
      try {
        // Fetch up to 100 users to stay beneath API and Embed limits
        const users = await emojiReaction.users.fetch({ limit: 100 });
        usersList = users.filter((u) => !u.bot).map((u) => `<@${u.id}>`);

        realCount = emojiReaction.count - (emojiReaction.me ? 1 : 0);
      } catch (e) {
        console.warn(
          `${logPrefix} Could not fetch users for reaction:`,
          (e as Error).message,
        );
      }
    }

    // 10. Construct Embed
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

    // 11. Update the message
    await botMessage.edit({ content: "", embeds: [embed] });
  } catch (error) {
    console.error(`${logPrefix} Unexpected update error:`, error);
  }
}
