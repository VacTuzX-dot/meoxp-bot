import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  createQueue,
  getPlayer,
  isLavalinkReady,
  getAvailableNode,
} from "../lib/ShoukakuManager";
import * as googleTTS from "google-tts-api";

const command: Command = {
  name: "saye",
  aliases: ["ttse", "speake"],
  description: "Text-to-Speech in English",
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
      message.reply("Usage: `!!saye <text>`");
      return;
    }

    const text = args.join(" ");

    if (text.length > 200) {
      message.reply("Text too long. Maximum 200 characters.");
      return;
    }

    if (!isLavalinkReady(client)) {
      message.reply("Lavalink is not ready.");
      return;
    }

    const guildId = message.guild!.id;
    const voiceChannelId = member.voice.channel.id;

    if (!client.queues.has(guildId)) {
      client.queues.set(guildId, createQueue());
    }

    const queue = client.queues.get(guildId)!;
    queue.textChannelId = message.channel.id;
    queue.voiceChannelId = voiceChannelId;

    try {
      const ttsUrl = googleTTS.getAudioUrl(text, {
        lang: "en",
        slow: false,
        host: "https://translate.google.com",
      });

      if (!queue.player) {
        const player = await getPlayer(client, guildId, voiceChannelId);
        if (!player) {
          message.reply("Failed to join voice channel.");
          return;
        }
        queue.player = player;
      }

      const node = getAvailableNode(client);
      if (!node) {
        message.reply("No Lavalink node available.");
        return;
      }

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

      await queue.player.playTrack({ track: { encoded: track.encoded } });
      message.reply(`Speaking (English): "${text}"`);
    } catch (error) {
      console.error("[TTS] Error:", error);
      message.reply(`TTS Error: ${(error as Error).message}`);
    }
  },
};

export default command;
