const { ActivityType, Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity("เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊", {
      type: ActivityType.Listening,
    });
  },
};
