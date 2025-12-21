const {
  Client,
  GatewayIntentBits,
  Collection,
  Partials,
} = require("discord.js");
const { join } = require("path");
const { readdirSync } = require("fs");
require("dotenv").config();

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
});

// Collections
client.commands = new Collection();
client.aliases = new Collection();

// Load Commands
const commandsPath = join(__dirname, "src", "commands");
// Create directory if not exists (in case) - actually we should assume structure exists or create it
// We will create it via tool calls.

// Recursive function to load commands? Or just flat for now based on plan.
// Plan said src/commands/ so we will assume flat for simplicity or categorized folders.
// Let's support simple struct first.

const loadCommands = () => {
  try {
    const commandFiles = readdirSync(commandsPath).filter((file) =>
      file.endsWith(".js")
    );

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = require(filePath);

      if (command.name) {
        client.commands.set(command.name, command);
        console.log(`✅ Command loaded: ${command.name}`);

        if (command.aliases && Array.isArray(command.aliases)) {
          command.aliases.forEach((alias) =>
            client.aliases.set(alias, command.name)
          );
        }
      }
    }
  } catch (error) {
    console.error("Error loading commands:", error);
  }
};

// Load Events
const eventsPath = join(__dirname, "src", "events");
const loadEvents = () => {
  try {
    const eventFiles = readdirSync(eventsPath).filter((file) =>
      file.endsWith(".js")
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const event = require(filePath);

      if (event.name) {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }
      }
    }
  } catch (error) {
    console.error("Error loading events:", error);
  }
};

// Start
(async () => {
  await loadCommands();
  await loadEvents();

  if (!process.env.TOKEN) {
    console.error("❌ Error: TOKEN not found in .env");
    process.exit(1);
  }

  client.login(process.env.TOKEN);
})();
