import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.on(Events.MessageReactionAdd, (...args) => {
  console.log("Arguments length:", args.length);
  args.forEach((arg, i) => {
    console.log(`Arg[${i}] type:`, typeof arg);
    console.log(`Arg[${i}] keys:`, Object.keys(arg || {}).slice(0, 5));
  });
  process.exit(0);
});

client.login(process.env.TOKEN);
