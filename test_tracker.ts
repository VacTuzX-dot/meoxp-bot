import { Client, EmbedBuilder, TextChannel, Message } from "discord.js";
import { reactionTrackerManager } from "./src/lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "./src/lib/reactionTrackerUpdater";

// Mocking Discord.js classes for logic testing
class MockChannel {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  isTextBased() {
    return true;
  }
  messages = {
    fetch: async (id: string) => new MockMessage(id, this.id),
  };
}

class MockMessage {
  id: string;
  channelId: string;
  reactions = {
    cache: new Map(),
    resolve: (id: string) => null, // simulate not found for this mock
  };
  constructor(id: string, channelId: string) {
    this.id = id;
    this.channelId = channelId;
  }
  async edit(data: any) {
    console.log(
      `✅ [MOCK] Message ${this.id} edited with ${data.embeds?.length} embeds`,
    );
    return this;
  }
}

class MockClient {
  isReady() {
    return true;
  }
  channels = {
    fetch: async (id: string) => new MockChannel(id),
  };
}

async function runTest() {
  console.log("🚀 Starting Reaction Tracker Logic Simulation...");

  const client = new MockClient() as any as Client;
  const botMsgId = "bot-msg-999";
  const botChanId = "chan-bot-888";

  // 1. Manually populate mappings for the simulation
  (reactionTrackerManager as any).mappings = [
    {
      guildId: "guild-1",
      channelId: "watched-chan-1",
      watchedMessageId: "watched-msg-1",
      emojiIdOrName: "🔥",
      botMessageChannelId: botChanId,
      botMessageId: botMsgId,
    },
  ];

  console.log(`[TEST] Triggering debounce update for BotMsg:${botMsgId}...`);
  // Use delay 0 for instant test
  debounceUpdateReactionTracker(client, botMsgId, botChanId, 0);

  // Wait a bit for the async performUpdate to finish
  await new Promise((r) => setTimeout(r, 200));
  console.log("🏁 Simulation Complete.");
}

runTest().catch(console.error);
