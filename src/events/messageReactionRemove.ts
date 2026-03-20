import {
  Events,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
  MessageReactionEventDetails,
} from "discord.js";
import { ExtendedClient, defineEvent } from "../types";
import { reactionTrackerManager } from "../lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "../lib/reactionTrackerUpdater";

const event = defineEvent({
  name: Events.MessageReactionRemove,
  async execute(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    _details: MessageReactionEventDetails,
    _client: ExtendedClient,
  ) {
    console.log(`\n[Debug #1/#2] [Stage: reaction event registration & raw reactionRemove firing] Event received for message ID: ${reaction.message.id}`);

    if (reaction.partial) {
      console.log(`[Debug #3] [Stage: partial fetch path] Reaction is partial. Fetching...`);
      try {
        await reaction.fetch();
      } catch (error) {
        console.error("❌ Something went wrong when fetching the reaction:", error);
        return;
      }
    }

    if (reaction.message.partial) {
       try {
         console.log(`[Debug #3] [Stage: partial fetch path] Message is partial. Fetching...`);
         await reaction.message.fetch();
       } catch (error) {
         console.error("[Debug #3] ❌ Something went wrong when fetching the message:", error);
         return;
       }
    }

    if (user.partial) {
      try {
        await user.fetch();
      } catch (error) {
        console.error("❌ Something went wrong when fetching the user:", error);
        return;
      }
    }

    if (user.bot) return;
    if (!reaction.message.guild) return;

    const emojiIdOrName = reaction.emoji.id || reaction.emoji.name;
    console.log(`[Debug #4] [Stage: emoji/message matching] Extracted emoji: ${emojiIdOrName} for message: ${reaction.message.id}`);
    if (!emojiIdOrName) return;

    // --- REACTION TRACKER CHECK (ONLY) ---
    // We explicitly SKIP ReactionRole logic here because the user requested that roles should NOT be removed on unreact.
    console.log(`[Debug #5] [Stage: tracker config lookup] Looking up config for msg: ${reaction.message.id}, emoji: ${emojiIdOrName}`);
    const trackerMapping = reactionTrackerManager.getMapping(reaction.message.id, emojiIdOrName);
    if (trackerMapping) {
      console.log(`[Debug #5] [Stage: tracker config lookup] Match found! Guild: ${trackerMapping.guildId}`);
      if (trackerMapping.guildId === reaction.message.guild.id) {
        const trackerClient = reaction.message.client;
        console.log(`[Debug #6] [Stage: debounce scheduling] Scheduling debounce update for botMsgID: ${trackerMapping.botMessageId}`);
        debounceUpdateReactionTracker(
          trackerClient,
          trackerMapping.botMessageId,
          trackerMapping.botMessageChannelId,
        );
      } else {
         console.log(`[Debug #5] Guild mismatch: expected ${trackerMapping.guildId}, got ${reaction.message.guild.id}`);
      }
    } else {
      console.log(`[Debug #5] [Stage: tracker config lookup] No match found.`);
    }
  },
});

export default event;
