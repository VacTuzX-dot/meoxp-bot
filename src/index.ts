import { Client, GatewayIntentBits, Collection, Partials } from "discord.js";
import { join } from "path";
import { readdirSync } from "fs";
import "dotenv/config";

import { ExtendedClient, Command, Event } from "./types";
import { createShoukaku } from "./lib/ShoukakuManager";

// Create Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
}) as ExtendedClient;

// Initialize collections
client.commands = new Collection<string, Command>();
client.queues = new Map();

// Initialize Shoukaku (Lavalink)
client.shoukaku = createShoukaku(client);

// Aliases collection
const aliases = new Collection<string, string>();

// Load Commands
const loadCommands = (): void => {
  const commandsPath = join(__dirname, "commands");

  try {
    const commandFiles = readdirSync(commandsPath).filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".js")) &&
        !file.endsWith(".d.ts")
    );

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command: Command = require(filePath).default || require(filePath);

      if (command.name) {
        client.commands.set(command.name, command);
        console.log(`✅ Command loaded: ${command.name}`);

        if (command.aliases && Array.isArray(command.aliases)) {
          command.aliases.forEach((alias) => aliases.set(alias, command.name));
        }
      }
    }

    // Store aliases on client for access in messageCreate
    (client as any).aliases = aliases;
  } catch (error) {
    console.error("Error loading commands:", error);
  }
};

// Load Events
const loadEvents = (): void => {
  const eventsPath = join(__dirname, "events");

  try {
    const eventFiles = readdirSync(eventsPath).filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".js")) &&
        !file.endsWith(".d.ts")
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const event: Event = require(filePath).default || require(filePath);

      if (event.name) {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`✅ Event loaded: ${event.name}`);
      }
    }
  } catch (error) {
    console.error("Error loading events:", error);
  }
};

// Start
(async () => {
  loadCommands();
  loadEvents();

  if (!process.env.TOKEN) {
    console.error("❌ Error: TOKEN not found in .env");
    process.exit(1);
  }

  console.log("🚀 Starting bot...");
  await client.login(process.env.TOKEN);
})();
