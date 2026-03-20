import { Events, MessageReaction, User, PartialMessageReaction, PartialUser, Message } from "discord.js";
import { Event, ExtendedClient } from "../types";
import { reactionRoleManager } from "../lib/ReactionRoleManager";
import { reactionTrackerManager } from "../lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "../lib/reactionTrackerUpdater";

const event: Event = {
  name: Events.MessageReactionAdd,
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

    const trackerMapping = reactionTrackerManager.getMapping(reaction.message.id, emojiIdOrName);
    if (trackerMapping && trackerMapping.guildId === reaction.message.guild.id) {
      debounceUpdateReactionTracker(client, trackerMapping, reaction.message as Message);
    }
    // ------------------------------

    const mapping = reactionRoleManager.getMapping(reaction.message.id, emojiIdOrName);
    if (!mapping) return;

    if (mapping.guildId !== reaction.message.guild.id) return;

    try {
      const role = await reaction.message.guild.roles.fetch(mapping.roleId);
      if (!role) {
        console.log(`[ReactionRole] Role ${mapping.roleId} not found in guild ${mapping.guildId}.`);
        return;
      }

      const member = await reaction.message.guild.members.fetch(user.id);
      if (!member) return;

      if (member.roles.cache.has(role.id)) return;

      await member.roles.add(role);
      console.log(`✅ [ReactionRole] Assigned role ${role.name} to user ${user.username}.`);
      
    } catch (error: any) {
      console.error(`❌ [ReactionRole] Failed to assign role ${mapping.roleId} to user ${user.username}: ${error.message}`);
    }
  },
};

export default event;
