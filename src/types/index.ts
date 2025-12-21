import { Client, Message, Collection } from "discord.js";
import { Shoukaku, Player } from "shoukaku";

// Extended Discord Client with Shoukaku
export interface ExtendedClient extends Client {
  shoukaku: Shoukaku;
  commands: Collection<string, Command>;
  queues: Map<string, Queue>;
}

// Command interface
export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (
    message: Message,
    args: string[],
    client: ExtendedClient
  ) => Promise<void> | void;
}

// Event interface
export interface Event {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => void;
}

// Song interface
export interface Song {
  title: string;
  url: string;
  duration: number;
  durationInfo: string;
  thumbnail: string | null;
  requester: string;
  uploader: string;
  identifier: string;
}

// Queue interface
export interface Queue {
  songs: Song[];
  player: Player | null;
  textChannelId: string | null;
  voiceChannelId: string | null;
  loopMode: number; // 0: off, 1: single, 2: queue
  nowPlaying: Song | null;
  nowPlayingMessage: Message | null;
  persistent: boolean; // true = joined via !!join, no auto-leave
}

// Lavalink Node configuration
export interface LavalinkNode {
  name: string;
  url: string;
  auth: string;
  secure?: boolean;
}
