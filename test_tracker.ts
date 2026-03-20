import {
  Client,
  Collection,
  GatewayIntentBits,
  MessageReactionEventDetails,
} from "discord.js";

import rrnameCommand from "./src/commands/rrname";
import messageReactionAddEvent from "./src/events/messageReactionAdd";
import messageReactionRemoveEvent from "./src/events/messageReactionRemove";
import { reactionRoleManager } from "./src/lib/ReactionRoleManager";
import { reactionTrackerManager } from "./src/lib/ReactionTrackerManager";
import { debounceUpdateReactionTracker } from "./src/lib/reactionTrackerUpdater";
import { ExtendedClient } from "./src/types";

type ConsoleKind = "error" | "log" | "warn";

interface TestResult {
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  fixApplied?: string;
}

interface MockUser {
  bot: boolean;
  fetch(): Promise<MockUser>;
  id: string;
  partial: boolean;
  username: string;
}

interface MockReactionBucket {
  reaction: {
    count: number;
    fetch(): Promise<MockReactionBucket["reaction"]>;
    me: boolean;
    partial: boolean;
    users: {
      fetch(options?: { limit?: number }): Promise<Collection<string, MockUser>>;
    };
  };
  setUsers(users: MockUser[]): void;
}

interface MockMessageRecord {
  edit?(payload: { content?: string; embeds?: Array<{ toJSON(): unknown }> }): Promise<MockMessageRecord>;
  fetch?(): Promise<MockMessageRecord>;
  guild?: MockGuild;
  id: string;
  partial: boolean;
  react?(emoji: string): Promise<void>;
  reactions?: {
    resolve(emojiIdOrName: string): MockReactionBucket["reaction"] | null;
  };
}

interface MockTextChannel {
  id: string;
  isTextBased(): true;
  messages: {
    fetch(id: string): Promise<MockMessageRecord>;
  };
  send?(payload: { embeds: unknown[] }): Promise<MockMessageRecord>;
}

interface MockGuild {
  id: string;
  members: {
    fetch(id: string): Promise<MockGuildMember | null>;
    me: {
      permissions: {
        has(permission: bigint): boolean;
      };
      roles: {
        highest: {
          position: number;
        };
      };
    };
  };
  name: string;
  roles: {
    cache: Collection<string, MockRole>;
    fetch(id: string): Promise<MockRole | null>;
  };
}

interface MockGuildMember {
  roles: {
    add(role: MockRole): Promise<void>;
    cache: Collection<string, MockRole>;
  };
}

interface MockRole {
  id: string;
  name: string;
  position: number;
}

interface TestEnvironment {
  botMessageId: string;
  botMessagePayloads: Array<{ content?: string; embeds?: Array<{ description?: string; footer?: { text?: string }; title?: string }> }>;
  botTextChannel: MockTextChannel;
  channelMap: Map<string, MockTextChannel>;
  client: ExtendedClient;
  createdMessageIds: string[];
  guild: MockGuild;
  reactions: Record<string, MockReactionBucket>;
  roleAssignments: string[];
  setClientReady(ready: boolean): void;
  watchedMessage: MockMessageRecord & { client: ExtendedClient; guild: MockGuild };
  watchedTextChannel: MockTextChannel;
}

const details = {
  burst: false,
  type: 0,
} as MessageReactionEventDetails;

const originalConsole = {
  error: console.error,
  log: console.log,
  warn: console.warn,
};

const capturedConsole: Record<ConsoleKind, string[]> = {
  error: [],
  log: [],
  warn: [],
};

function formatConsoleArg(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function startConsoleCapture(): void {
  (["error", "log", "warn"] as ConsoleKind[]).forEach((kind) => {
    console[kind] = (...args: unknown[]) => {
      capturedConsole[kind].push(args.map(formatConsoleArg).join(" "));
    };
  });
}

function stopConsoleCapture(): void {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

function clearCapturedConsole(): void {
  (["error", "log", "warn"] as ConsoleKind[]).forEach((kind) => {
    capturedConsole[kind].length = 0;
  });
}

function logsContain(kind: ConsoleKind, needle: string): boolean {
  return capturedConsole[kind].some((entry) => entry.includes(needle));
}

function createUser(id: string, username: string): MockUser {
  return {
    bot: false,
    async fetch() {
      return this;
    },
    id,
    partial: false,
    username,
  };
}

function createReactionBucket(initialUsers: MockUser[]): MockReactionBucket {
  const state = {
    users: [...initialUsers],
  };

  const reaction = {
    get count() {
      return state.users.length;
    },
    async fetch() {
      return reaction;
    },
    me: false,
    partial: false,
    users: {
      async fetch() {
        const users = new Collection<string, MockUser>();
        for (const user of state.users) {
          users.set(user.id, user);
        }
        return users;
      },
    },
  };

  return {
    reaction,
    setUsers(users: MockUser[]) {
      state.users = [...users];
    },
  };
}

function createMockChannel(id: string): MockTextChannel {
  const messages = new Map<string, MockMessageRecord>();

  return {
    id,
    isTextBased() {
      return true;
    },
    messages: {
      async fetch(messageId: string) {
        const message = messages.get(messageId);
        if (!message) {
          throw new Error(`Message ${messageId} not found in channel ${id}`);
        }
        return message;
      },
    },
    async send(payload: { embeds: unknown[] }) {
      const messageId = `generated-${messages.size + 1}`;
      const createdMessage: MockMessageRecord = {
        async edit(nextPayload) {
          void nextPayload;
          return createdMessage;
        },
        id: messageId,
        partial: false,
      };
      void payload;
      messages.set(messageId, createdMessage);
      return createdMessage;
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createExtendedClient(): {
  addChannel(channel: MockTextChannel): void;
  client: ExtendedClient;
  setClientReady(ready: boolean): void;
} {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
  }) as ExtendedClient;

  client.commands = new Collection();
  client.aliases = new Collection();
  client.queues = new Map();
  client.shoukaku = {} as never;

  const channels = new Map<string, MockTextChannel>();
  let ready = true;

  Object.defineProperty(client, "isReady", {
    configurable: true,
    value: () => ready,
  });

  Object.defineProperty(client.channels, "fetch", {
    configurable: true,
    value: async (id: string) => channels.get(id) ?? null,
  });

  return {
    addChannel(channel: MockTextChannel) {
      channels.set(channel.id, channel);
    },
    client,
    setClientReady(nextReady: boolean) {
      ready = nextReady;
    },
  };
}

function createEnvironment(): TestEnvironment {
  const watchedChannelId = "watched-channel-1";
  const botChannelId = "bot-channel-1";
  const watchedMessageId = "watched-message-1";
  const botMessageId = "bot-message-1";
  const roleId = "role-1";

  const alice = createUser("user-1", "alice");
  const bob = createUser("user-2", "bob");
  const charlie = createUser("user-3", "charlie");

  const fireReaction = createReactionBucket([alice]);
  const starReaction = createReactionBucket([bob]);

  const { addChannel, client, setClientReady } = createExtendedClient();
  const watchedTextChannel = createMockChannel(watchedChannelId);
  const botTextChannel = createMockChannel(botChannelId);
  const roleAssignments: string[] = [];
  const botMessagePayloads: Array<{ content?: string; embeds?: Array<{ description?: string; footer?: { text?: string }; title?: string }> }> = [];
  const createdMessageIds: string[] = [];

  const role: MockRole = {
    id: roleId,
    name: "Member",
    position: 5,
  };

  const guildMember: MockGuildMember = {
    roles: {
      async add(nextRole: MockRole) {
        roleAssignments.push(nextRole.id);
        guildMember.roles.cache.set(nextRole.id, nextRole);
      },
      cache: new Collection(),
    },
  };

  const guild: MockGuild = {
    id: "guild-1",
    members: {
      async fetch() {
        return guildMember;
      },
      me: {
        permissions: {
          has() {
            return true;
          },
        },
        roles: {
          highest: {
            position: 10,
          },
        },
      },
    },
    name: "Tracker Test Guild",
    roles: {
      cache: new Collection([[role.id, role]]),
      async fetch(id: string) {
        return guild.roles.cache.get(id) ?? null;
      },
    },
  };

  const watchedMessage: MockMessageRecord & {
    client: ExtendedClient;
    guild: MockGuild;
  } = {
    async fetch() {
      return watchedMessage;
    },
    client,
    guild,
    id: watchedMessageId,
    partial: false,
    async react() {
      return;
    },
    reactions: {
      resolve(emojiIdOrName: string) {
        return (
          {
            "🔥": fireReaction.reaction,
            "⭐": starReaction.reaction,
          }[emojiIdOrName] ?? null
        );
      },
    },
  };

  const botMessage: MockMessageRecord = {
    async edit(payload) {
      botMessagePayloads.push({
        content: payload.content,
        embeds: payload.embeds?.map((embed) => embed.toJSON() as { description?: string; footer?: { text?: string }; title?: string }),
      });
      return botMessage;
    },
    id: botMessageId,
    partial: false,
  };

  const watchedChannelMessages = new Map<string, MockMessageRecord>([
    [watchedMessageId, watchedMessage],
  ]);
  const botChannelMessages = new Map<string, MockMessageRecord>([
    [botMessageId, botMessage],
  ]);

  watchedTextChannel.messages.fetch = async (messageId: string) => {
    const message = watchedChannelMessages.get(messageId);
    if (!message) {
      throw new Error(`Missing watched message ${messageId}`);
    }
    return message;
  };

  botTextChannel.messages.fetch = async (messageId: string) => {
    const message = botChannelMessages.get(messageId);
    if (!message) {
      throw new Error(`Missing bot message ${messageId}`);
    }
    return message;
  };

  watchedTextChannel.send = async ({ embeds }) => {
    const messageId = `generated-bot-message-${createdMessageIds.length + 1}`;
    createdMessageIds.push(messageId);

    const createdMessage: MockMessageRecord = {
      async edit(payload) {
        botMessagePayloads.push({
          content: payload.content,
          embeds: payload.embeds?.map((embed) => embed.toJSON() as { description?: string; footer?: { text?: string }; title?: string }),
        });
        return createdMessage;
      },
      id: messageId,
      partial: false,
    };

    void embeds;
    watchedChannelMessages.set(messageId, createdMessage);
    return createdMessage;
  };

  addChannel(watchedTextChannel);
  addChannel(botTextChannel);

  return {
    botMessageId,
    botMessagePayloads,
    botTextChannel,
    channelMap: new Map([
      [watchedTextChannel.id, watchedTextChannel],
      [botTextChannel.id, botTextChannel],
    ]),
    client,
    createdMessageIds,
    guild,
    reactions: {
      "⭐": starReaction,
      "🔥": fireReaction,
    },
    roleAssignments,
    setClientReady,
    watchedMessage,
    watchedTextChannel,
  };
}

function getLatestEmbedTitles(environment: TestEnvironment): string[] {
  const latestPayload = environment.botMessagePayloads.at(-1);
  return latestPayload?.embeds?.map((embed) => embed.title ?? "") ?? [];
}

function getLatestEmbedDescriptions(environment: TestEnvironment): string[] {
  const latestPayload = environment.botMessagePayloads.at(-1);
  return latestPayload?.embeds?.map((embed) => embed.description ?? "") ?? [];
}

async function testReactionAddAndRoleFlow(results: TestResult[]): Promise<void> {
  const environment = createEnvironment();
  const charlie = createUser("user-3", "charlie");

  reactionTrackerManager.mappings = [
    {
      botMessageChannelId: environment.botTextChannel.id,
      botMessageId: environment.botMessageId,
      channelId: environment.watchedTextChannel.id,
      emojiIdOrName: "🔥",
      guildId: environment.guild.id,
      watchedMessageId: environment.watchedMessage.id,
    },
    {
      botMessageChannelId: environment.botTextChannel.id,
      botMessageId: environment.botMessageId,
      channelId: environment.watchedTextChannel.id,
      emojiIdOrName: "⭐",
      guildId: environment.guild.id,
      watchedMessageId: environment.watchedMessage.id,
    },
  ];

  reactionRoleManager.mappings = [
    {
      channelId: environment.watchedTextChannel.id,
      emojiIdOrName: "🔥",
      guildId: environment.guild.id,
      messageId: environment.watchedMessage.id,
      roleId: "role-1",
    },
  ];

  environment.reactions["🔥"].setUsers([createUser("user-1", "alice"), charlie]);

  const reactionEvent = {
    async fetch() {
      return reactionEvent;
    },
    emoji: {
      id: null,
      name: "🔥",
    },
    message: environment.watchedMessage,
    partial: false,
  };

  await messageReactionAddEvent.execute(
    reactionEvent,
    charlie,
    details,
    environment.client,
  );

  await wait(1700);

  const latestTitles = getLatestEmbedTitles(environment);
  const latestDescriptions = getLatestEmbedDescriptions(environment).join(" | ");
  const latestPayload = environment.botMessagePayloads.at(-1);
  const invalidClientWarning = logsContain("warn", "debounceUpdateReactionTracker called with invalid client");

  results.push({
    scenario: "reactionAdd event fires",
    expected: "The add handler should execute for the watched message.",
    actual: logsContain("log", "[Stage: reaction event registration & raw reactionAdd firing]")
      ? "The add handler emitted the stage-1 event log."
      : "The add handler stage-1 event log was missing.",
    passed: logsContain("log", "[Stage: reaction event registration & raw reactionAdd firing]"),
  });

  results.push({
    scenario: "config lookup matches",
    expected: "Tracker config lookup should find the configured mapping.",
    actual: logsContain("log", "[Stage: tracker config lookup] Match found!")
      ? "The handler found the tracker mapping and logged the match."
      : "The tracker mapping match log was missing.",
    passed: logsContain("log", "[Stage: tracker config lookup] Match found!"),
  });

  results.push({
    scenario: "debounceUpdateReactionTracker receives a valid Discord client",
    expected: "The debounce function should accept the client and avoid the invalid-client skip path.",
    actual: invalidClientWarning
      ? "The invalid-client warning was emitted for a valid add event."
      : "No invalid-client warning was emitted for the valid add event.",
    passed: !invalidClientWarning,
  });

  results.push({
    scenario: "debounce callback executes",
    expected: "The scheduled debounce callback should run after the reaction add.",
    actual: logsContain("log", "[Stage: debounce callback execution]")
      ? "The debounce callback log was emitted."
      : "The debounce callback log was missing.",
    passed: logsContain("log", "[Stage: debounce callback execution]"),
  });

  results.push({
    scenario: "performUpdate receives a valid Discord client",
    expected: "performUpdate should reach the valid-and-ready client path.",
    actual: logsContain("log", "Client is valid and ready.")
      ? "performUpdate accepted the client and continued."
      : "performUpdate never logged a valid-and-ready client.",
    passed:
      logsContain("log", "Client is valid and ready.") &&
      !logsContain("warn", "[Debug #9] [Stage: client validity check] Invalid client!"),
  });

  results.push({
    scenario: "bot message updates successfully",
    expected: "The tracker bot message should be edited with fresh embeds.",
    actual: latestPayload
      ? `The tracker bot message was edited with ${latestPayload.embeds?.length ?? 0} embed(s).`
      : "No tracker message edit payload was recorded.",
    passed:
      Boolean(latestPayload) &&
      logsContain("log", "Bot message edit success!"),
  });

  results.push({
    scenario: "multi-emoji shared botMsgID still works",
    expected: "A shared tracker bot message should include both configured emoji sections.",
    actual: latestTitles.length > 0
      ? `Rendered embed titles: ${latestTitles.join(", ")}.`
      : "No embed titles were recorded on the shared tracker message.",
    passed:
      latestTitles.length === 2 &&
      latestTitles.some((title) => title.includes("🔥")) &&
      latestTitles.some((title) => title.includes("⭐")),
  });

  results.push({
    scenario: "old emoji sections remain visible",
    expected: "Updating one emoji should preserve the other emoji section on the shared bot message.",
    actual: latestDescriptions
      ? `Latest embed descriptions: ${latestDescriptions}.`
      : "No embed descriptions were recorded.",
    passed:
      latestTitles.some((title) => title.includes("🔥")) &&
      latestTitles.some((title) => title.includes("⭐")),
  });

  results.push({
    scenario: "reaction-role still works",
    expected: "The add handler should still assign the configured reaction role.",
    actual: environment.roleAssignments.length > 0
      ? `Assigned role IDs: ${environment.roleAssignments.join(", ")}.`
      : "No role assignment was recorded.",
    passed: environment.roleAssignments.includes("role-1"),
  });
}

async function testReactionRemoveFlow(results: TestResult[]): Promise<void> {
  const environment = createEnvironment();
  const charlie = createUser("user-3", "charlie");

  reactionTrackerManager.mappings = [
    {
      botMessageChannelId: environment.botTextChannel.id,
      botMessageId: environment.botMessageId,
      channelId: environment.watchedTextChannel.id,
      emojiIdOrName: "🔥",
      guildId: environment.guild.id,
      watchedMessageId: environment.watchedMessage.id,
    },
    {
      botMessageChannelId: environment.botTextChannel.id,
      botMessageId: environment.botMessageId,
      channelId: environment.watchedTextChannel.id,
      emojiIdOrName: "⭐",
      guildId: environment.guild.id,
      watchedMessageId: environment.watchedMessage.id,
    },
  ];

  reactionRoleManager.mappings = [];

  environment.reactions["🔥"].setUsers([createUser("user-1", "alice")]);
  environment.reactions["⭐"].setUsers([createUser("user-2", "bob")]);

  const reactionEvent = {
    async fetch() {
      return reactionEvent;
    },
    emoji: {
      id: null,
      name: "🔥",
    },
    message: environment.watchedMessage,
    partial: false,
  };

  await messageReactionRemoveEvent.execute(
    reactionEvent,
    charlie,
    details,
    environment.client,
  );

  await wait(1700);

  const latestPayload = environment.botMessagePayloads.at(-1);
  const latestTitles = getLatestEmbedTitles(environment);

  results.push({
    scenario: "reactionRemove also updates",
    expected: "Removing a reaction should trigger a tracker refresh and edit the bot message.",
    actual: latestPayload
      ? `The remove flow edited the tracker message with ${latestPayload.embeds?.length ?? 0} embed(s).`
      : "The remove flow did not edit the tracker message.",
    passed:
      Boolean(latestPayload) &&
      logsContain("log", "[Stage: reaction event registration & raw reactionRemove firing]") &&
      logsContain("log", "Bot message edit success!"),
  });

  results.push({
    scenario: "no remaining invalid-client path exists",
    expected: "Valid add/remove tracker flows should not hit the invalid-client guard anymore.",
    actual: logsContain("warn", "debounceUpdateReactionTracker called with invalid client")
      ? "A valid flow still emitted the invalid-client warning."
      : "Neither valid add nor valid remove emitted the invalid-client warning.",
    passed: !logsContain("warn", "debounceUpdateReactionTracker called with invalid client"),
  });

  results.push({
    scenario: "reactionRemove preserves shared tracker sections",
    expected: "A remove update should still render both shared bot-message sections.",
    actual: latestTitles.length > 0
      ? `Rendered titles after remove: ${latestTitles.join(", ")}.`
      : "No titles were rendered after remove.",
    passed:
      latestTitles.length === 2 &&
      latestTitles.some((title) => title.includes("🔥")) &&
      latestTitles.some((title) => title.includes("⭐")),
    fixApplied: "No additional fix needed after the client-flow fix.",
  });
}

async function testReconnectAndRestartFlow(results: TestResult[]): Promise<void> {
  const reconnectEnvironment = createEnvironment();

  reactionTrackerManager.mappings = [
    {
      botMessageChannelId: reconnectEnvironment.botTextChannel.id,
      botMessageId: reconnectEnvironment.botMessageId,
      channelId: reconnectEnvironment.watchedTextChannel.id,
      emojiIdOrName: "🔥",
      guildId: reconnectEnvironment.guild.id,
      watchedMessageId: reconnectEnvironment.watchedMessage.id,
    },
  ];

  reactionRoleManager.mappings = [];

  reconnectEnvironment.setClientReady(false);
  debounceUpdateReactionTracker(
    reconnectEnvironment.client,
    reconnectEnvironment.botMessageId,
    reconnectEnvironment.botTextChannel.id,
    50,
  );

  await wait(10);
  reconnectEnvironment.setClientReady(true);
  await wait(120);

  const reconnectUpdated = reconnectEnvironment.botMessagePayloads.length > 0;

  const restartEnvironment = createEnvironment();
  reactionTrackerManager.mappings = [
    {
      botMessageChannelId: restartEnvironment.botTextChannel.id,
      botMessageId: restartEnvironment.botMessageId,
      channelId: restartEnvironment.watchedTextChannel.id,
      emojiIdOrName: "🔥",
      guildId: restartEnvironment.guild.id,
      watchedMessageId: restartEnvironment.watchedMessage.id,
    },
  ];

  debounceUpdateReactionTracker(
    restartEnvironment.client,
    restartEnvironment.botMessageId,
    restartEnvironment.botTextChannel.id,
    0,
  );

  await wait(50);

  results.push({
    scenario: "restart/reconnect still works",
    expected: "Queued updates should survive a readiness transition and a fresh post-restart client instance.",
    actual:
      `Reconnect update ran: ${reconnectUpdated}. Fresh-client update ran: ${restartEnvironment.botMessagePayloads.length > 0}.`,
    passed:
      reconnectUpdated &&
      restartEnvironment.botMessagePayloads.length > 0,
  });
}

async function testRrnameCaller(results: TestResult[]): Promise<void> {
  const environment = createEnvironment();
  const replies: string[] = [];

  const originalTrackerAddMapping = reactionTrackerManager.addMapping.bind(reactionTrackerManager);
  const originalRoleAddMapping = reactionRoleManager.addMapping.bind(reactionRoleManager);

  reactionTrackerManager.mappings = [];
  reactionRoleManager.mappings = [];

  reactionTrackerManager.addMapping = async (mapping) => {
    const existingIndex = reactionTrackerManager.mappings.findIndex(
      (entry) =>
        entry.watchedMessageId === mapping.watchedMessageId &&
        entry.emojiIdOrName === mapping.emojiIdOrName,
    );

    if (existingIndex === -1) {
      reactionTrackerManager.mappings.push(mapping);
    } else {
      reactionTrackerManager.mappings[existingIndex] = mapping;
    }

    return true;
  };

  reactionRoleManager.addMapping = async (mapping) => {
    const existingIndex = reactionRoleManager.mappings.findIndex(
      (entry) =>
        entry.messageId === mapping.messageId &&
        entry.emojiIdOrName === mapping.emojiIdOrName,
    );

    if (existingIndex === -1) {
      reactionRoleManager.mappings.push(mapping);
    } else {
      reactionRoleManager.mappings[existingIndex] = mapping;
    }

    return true;
  };

  try {
    const existingBotMessage = await environment.watchedTextChannel.send!({
      embeds: [],
    });

    const commandMessage = {
      channel: environment.watchedTextChannel,
      guild: environment.guild,
      member: {
        permissions: {
          has() {
            return true;
          },
        },
      },
      async reply(message: string) {
        replies.push(message);
        return;
      },
    };

    await rrnameCommand.execute(
      commandMessage,
      [ "add", environment.watchedMessage.id, "🔥", existingBotMessage.id, "role-1" ],
      environment.client,
    );

    await wait(50);
  } finally {
    reactionTrackerManager.addMapping = originalTrackerAddMapping;
    reactionRoleManager.addMapping = originalRoleAddMapping;
  }

  results.push({
    scenario: "rrname immediate update caller passes a valid client",
    expected: "The command caller should still trigger an immediate tracker update with the real command client.",
    actual:
      `Replies recorded: ${replies.length}. Seeded bot messages: ${environment.createdMessageIds.length}. Tracker edits: ${environment.botMessagePayloads.length}. Replies: ${replies.join(" | ")}.`,
    passed:
      replies.some((reply) => reply.includes("ติดตั้งระบบ Reaction Tracker สำเร็จ")) &&
      environment.createdMessageIds.length === 1 &&
      environment.botMessagePayloads.length > 0 &&
      !logsContain("warn", "debounceUpdateReactionTracker called with invalid client"),
  });
}

async function testInvalidClientGuard(results: TestResult[]): Promise<void> {
  reactionTrackerManager.mappings = [];
  reactionRoleManager.mappings = [];

  debounceUpdateReactionTracker(
    { burst: false, type: 0 } as unknown as Client,
    "bot-message-invalid",
    "bot-channel-invalid",
    0,
  );

  await wait(20);

  const invalidWarning = capturedConsole.warn.find((entry) =>
    entry.includes("debounceUpdateReactionTracker called with invalid client"),
  );

  results.push({
    scenario: "invalid client guard logs safely and skips",
    expected: "A non-client object should be logged safely and skipped without crashing.",
    actual: invalidWarning ?? "The invalid-client warning did not fire.",
    passed:
      Boolean(invalidWarning) &&
      invalidWarning.includes("looksLikeReactionEventDetails"),
  });
}

async function runTests(): Promise<void> {
  const results: TestResult[] = [];

  startConsoleCapture();

  try {
    clearCapturedConsole();
    await testReactionAddAndRoleFlow(results);

    clearCapturedConsole();
    await testReactionRemoveFlow(results);

    clearCapturedConsole();
    await testReconnectAndRestartFlow(results);

    clearCapturedConsole();
    await testRrnameCaller(results);

    clearCapturedConsole();
    await testInvalidClientGuard(results);
  } finally {
    stopConsoleCapture();
  }

  const failed = results.filter((result) => !result.passed);

  originalConsole.log(JSON.stringify({
    failedCount: failed.length,
    results,
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

runTests().catch((error) => {
  stopConsoleCapture();
  originalConsole.error(error);
  process.exitCode = 1;
});
