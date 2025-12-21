const { Events, ActivityType, PresenceUpdateStatus } = require("discord.js");
const { getVoiceConnection } = require("@discordjs/voice");

// Store timeout IDs per guild
const leaveTimeouts = new Map();

// Helper to update bot presence
function updateBotPresence(client, inVoice) {
  client.user.setPresence({
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

module.exports = {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState, client) {
    // Check if bot joined or left a voice channel
    const botMember = oldState.guild.members.me || newState.guild.members.me;

    // Bot joined a voice channel
    if (
      newState.member?.id === client.user.id &&
      newState.channelId &&
      !oldState.channelId
    ) {
      console.log("[VOICE] Bot joined voice channel");
      updateBotPresence(client, true);
    }

    // Bot left a voice channel (was disconnected by someone or left)
    if (
      oldState.member?.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      console.log("[VOICE] Bot left voice channel - clearing queue");
      updateBotPresence(client, false);

      // Clear the queue when bot is disconnected
      const queue = client.queues?.get(oldState.guild.id);
      if (queue) {
        queue.songs = [];
        queue.nowPlaying = null;
        if (queue.player) {
          queue.player.stop();
        }
        client.queues.delete(oldState.guild.id);
      }

      // Clear any leave timeouts
      if (leaveTimeouts.has(oldState.guild.id)) {
        clearTimeout(leaveTimeouts.get(oldState.guild.id));
        leaveTimeouts.delete(oldState.guild.id);
      }
    }

    // Get the bot's voice connection for this guild
    const connection = getVoiceConnection(oldState.guild.id);
    if (!connection) return;

    // Get the voice channel the bot is in
    const botVoiceChannel = botMember?.voice?.channel;
    if (!botVoiceChannel) return;

    // Check if someone left the bot's voice channel
    if (oldState.channelId === botVoiceChannel.id) {
      // Count members in the channel (excluding bots)
      const membersInChannel = botVoiceChannel.members.filter(
        (member) => !member.user.bot
      ).size;

      if (membersInChannel === 0) {
        // No one left in the channel, start 5 second countdown
        console.log("[VOICE] No users in channel, starting 5s countdown...");

        // Clear any existing timeout
        if (leaveTimeouts.has(oldState.guild.id)) {
          clearTimeout(leaveTimeouts.get(oldState.guild.id));
        }

        // Set new timeout
        const timeout = setTimeout(() => {
          // Double check the channel is still empty
          const currentChannel = oldState.guild.members.me?.voice?.channel;
          if (currentChannel) {
            const currentMembers = currentChannel.members.filter(
              (member) => !member.user.bot
            ).size;

            if (currentMembers === 0) {
              console.log("[VOICE] Channel still empty, leaving...");
              const queue = client.queues?.get(oldState.guild.id);
              if (queue) {
                queue.songs = [];
                queue.nowPlaying = null;
                if (queue.connection) {
                  queue.connection.destroy();
                }
                client.queues.delete(oldState.guild.id);
              }
              // Status will be updated by the bot leaving event above
            }
          }
          leaveTimeouts.delete(oldState.guild.id);
        }, 5000); // 5 seconds

        leaveTimeouts.set(oldState.guild.id, timeout);
      }
    }

    // If someone joined the bot's channel, cancel the leave timeout
    if (
      newState.channelId === botVoiceChannel.id &&
      !newState.member.user.bot
    ) {
      if (leaveTimeouts.has(newState.guild.id)) {
        console.log("[VOICE] User joined, cancelling leave countdown");
        clearTimeout(leaveTimeouts.get(newState.guild.id));
        leaveTimeouts.delete(newState.guild.id);
      }
    }
  },
};
