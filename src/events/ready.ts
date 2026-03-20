import { Events, ActivityType, PresenceUpdateStatus } from "discord.js";
import { ExtendedClient, defineEvent } from "../types";

const event = defineEvent({
  name: Events.ClientReady,
  once: true,
  execute(readyClient, _client: ExtendedClient) {
    const client = readyClient as ExtendedClient;
    console.log(`✅ Logged in as ${client.user?.tag}`);

    // Set initial status to idle (not in any voice channel)
    client.user?.setPresence({
      status: PresenceUpdateStatus.Idle,
      activities: [
        {
          name: "เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊",
          type: ActivityType.Listening,
        },
      ],
    });
  },
});

export default event;
