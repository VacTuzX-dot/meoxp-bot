import { Events, MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import { Event, ExtendedClient } from "../types";
import { reactionTrackerManager } from "../lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "../lib/reactionTrackerUpdater";

const event: Event = {
  name: Events.MessageReactionRemove,
  async execute(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    client: ExtendedClient
  ) {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error("❌ Something went wrong when fetching the reaction:", error);
        return;
      }
    }

    if (reaction.message.partial) {
       try {
         await reaction.message.fetch();
       } catch (error) {
         console.error("❌ Something went wrong when fetching the message:", error);
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
    if (!emojiIdOrName) return;

    // --- REACTION TRACKER CHECK ---
    const trackerMapping = reactionTrackerManager.getMapping(reaction.message.id, emojiIdOrName);
    if (trackerMapping && trackerMapping.guildId === reaction.message.guild.id) {
      debounceUpdateReactionTracker(client as any, trackerMapping, reaction.message as any);
    }
  },
};

export default event;
