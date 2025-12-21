const { ActivityType, Events, PresenceUpdateStatus } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    // Set initial status to idle (not in any voice channel)
    client.user.setPresence({
      status: PresenceUpdateStatus.Idle,
      activities: [
        {
          name: "เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊",
          type: ActivityType.Listening,
        },
      ],
    });
  },
};
