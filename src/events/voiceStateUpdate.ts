import {
  Events,
  VoiceState,
  ActivityType,
  PresenceUpdateStatus,
} from "discord.js";
import { ExtendedClient, Event } from "../types";
import { destroyPlayer } from "../lib/ShoukakuManager";

// Store timeout IDs per guild
const leaveTimeouts = new Map<string, NodeJS.Timeout>();

// Helper to update bot presence
function updateBotPresence(client: ExtendedClient, inVoice: boolean): void {
  client.user?.setPresence({
    status: inVoice
      ? PresenceUpdateStatus.DoNotDisturb
      : PresenceUpdateStatus.Idle,
    activities: [
      {
        name: inVoice ? "🎵 กำลังเล่นเพลง~" : "เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊",
        type: ActivityType.Listening,
      },
    ],
  });
}

const event: Event = {
  name: Events.VoiceStateUpdate,
  execute(oldState: VoiceState, newState: VoiceState, client: ExtendedClient) {
    const botMember = oldState.guild.members.me || newState.guild.members.me;

    // Bot joined a voice channel
    if (
      newState.member?.id === client.user?.id &&
      newState.channelId &&
      !oldState.channelId
    ) {
      console.log("[VOICE] Bot joined voice channel");
      updateBotPresence(client, true);
    }

    // Bot left a voice channel (was disconnected by someone or left)
    if (
      oldState.member?.id === client.user?.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      console.log("[VOICE] Bot left voice channel - clearing queue");
      updateBotPresence(client, false);

      // Clear the queue when bot is disconnected
      destroyPlayer(client, oldState.guild.id);

      // Clear any leave timeouts
      if (leaveTimeouts.has(oldState.guild.id)) {
        clearTimeout(leaveTimeouts.get(oldState.guild.id));
        leaveTimeouts.delete(oldState.guild.id);
      }
    }

    // Check if bot is in a voice channel
    const botVoiceChannel = botMember?.voice?.channel;
    if (!botVoiceChannel) return;

    // Check if someone left the bot's voice channel
    if (oldState.channelId === botVoiceChannel.id) {
      // Count members in the channel (excluding bots)
      const membersInChannel = botVoiceChannel.members.filter(
        (member) => !member.user.bot
      ).size;

      if (membersInChannel === 0) {
        // Check if queue is in persistent mode (joined via !!join)
        const queue = client.queues.get(oldState.guild.id);
        if (queue?.persistent) {
          console.log("[VOICE] Persistent mode - not leaving");
          return;
        }

        // No one left in the channel, start 5 second countdown
        console.log("[VOICE] No users in channel, starting 5s countdown...");

        // Clear any existing timeout
        if (leaveTimeouts.has(oldState.guild.id)) {
          clearTimeout(leaveTimeouts.get(oldState.guild.id));
        }

        // Set new timeout
        const timeout = setTimeout(() => {
          const currentChannel = oldState.guild.members.me?.voice?.channel;
          if (currentChannel) {
            const currentMembers = currentChannel.members.filter(
              (member) => !member.user.bot
            ).size;

            if (currentMembers === 0) {
              console.log("[VOICE] Channel still empty, leaving...");
              destroyPlayer(client, oldState.guild.id);
            }
          }
          leaveTimeouts.delete(oldState.guild.id);
        }, 5000);

        leaveTimeouts.set(oldState.guild.id, timeout);
      }
    }

    // If someone joined the bot's channel, cancel the leave timeout
    if (
      newState.channelId === botVoiceChannel.id &&
      !newState.member?.user.bot
    ) {
      if (leaveTimeouts.has(newState.guild.id)) {
        console.log("[VOICE] User joined, cancelling leave countdown");
        clearTimeout(leaveTimeouts.get(newState.guild.id));
        leaveTimeouts.delete(newState.guild.id);
      }
    }
  },
};

export default event;
