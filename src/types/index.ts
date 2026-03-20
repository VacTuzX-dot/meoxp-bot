import { Client, ClientEvents, Collection, Message } from "discord.js";
import { Shoukaku, Player } from "shoukaku";

// Extended Discord Client with Shoukaku
export interface ExtendedClient extends Client {
  shoukaku: Shoukaku;
  commands: Collection<string, Command>;
  aliases: Collection<string, string>;
  queues: Map<string, Queue>;
  io?: any;
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

export type EventArgs<K extends keyof ClientEvents> = [
  ...ClientEvents[K],
  ExtendedClient,
];

// Event interface - the last argument is always the ExtendedClient
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: EventArgs<K>) => Promise<void> | void;
}

export interface AnyEvent {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
}

export function defineEvent<K extends keyof ClientEvents>(event: Event<K>): AnyEvent {
  return event as unknown as AnyEvent;
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
