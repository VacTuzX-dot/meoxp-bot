import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  createQueue,
  getPlayer,
  isLavalinkReady,
  getAvailableNode,
} from "../lib/ShoukakuManager";
import googleTTS from "google-tts-api";

const command: Command = {
  name: "say",
  aliases: ["tts", "speak"],
  description: "Text-to-Speech (Thai default, use -e for English)",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const member = message.member;
    if (!member?.voice.channel) {
      message.reply("You must be in a voice channel.");
      return;
    }

    if (args.length === 0) {
      message.reply("Usage: `!!say <text>` or `!!say -e <text>` for English");
      return;
    }

    // Check for language flag
    let lang = "th"; // Default Thai
    let text = args.join(" ");

    if (args[0] === "-e" || args[0] === "--en") {
      lang = "en";
      text = args.slice(1).join(" ");
    } else if (args[0] === "-t" || args[0] === "--th") {
      lang = "th";
      text = args.slice(1).join(" ");
    }

    if (!text) {
      message.reply("Please provide text to speak.");
      return;
    }

    // Limit text length
    if (text.length > 200) {
      message.reply("Text too long. Maximum 200 characters.");
      return;
    }

    // Check Lavalink
    if (!isLavalinkReady(client)) {
      message.reply("Lavalink is not ready.");
      return;
    }

    const guildId = message.guild!.id;
    const voiceChannelId = member.voice.channel.id;

    // Initialize queue if not exists
    if (!client.queues.has(guildId)) {
      client.queues.set(guildId, createQueue());
    }

    const queue = client.queues.get(guildId)!;
    queue.textChannelId = message.channel.id;
    queue.voiceChannelId = voiceChannelId;

    try {
      // Get TTS URL from Google
      const ttsUrl = googleTTS.getAudioUrl(text, {
        lang: lang,
        slow: false,
        host: "https://translate.google.com",
      });

      // Get or create player
      if (!queue.player) {
        const player = await getPlayer(client, guildId, voiceChannelId);
        if (!player) {
          message.reply("Failed to join voice channel.");
          return;
        }
        queue.player = player;
      }

      // Get node for REST API
      const node = getAvailableNode(client);
      if (!node) {
        message.reply("No Lavalink node available.");
        return;
      }

      // Resolve the TTS URL through Lavalink
      const result = await node.rest.resolve(ttsUrl);

      if (
        !result ||
        result.loadType === "error" ||
        result.loadType === "empty"
      ) {
        message.reply("Failed to load TTS audio.");
        return;
      }

      const track =
        result.loadType === "track" ? result.data : (result.data as any)[0];

      if (!track) {
        message.reply("Failed to process TTS audio.");
        return;
      }

      // Play the TTS
      await queue.player.playTrack({ track: { encoded: track.encoded } });

      const langName = lang === "th" ? "Thai" : "English";
      message.reply(`Speaking (${langName}): "${text}"`);
    } catch (error) {
      console.error("[TTS] Error:", error);
      message.reply(`TTS Error: ${(error as Error).message}`);
    }
  },
};

export default command;
