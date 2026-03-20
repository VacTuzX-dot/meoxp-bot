import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import Datastore from "@seald-io/nedb";

export interface ReactionTrackerMapping {
  guildId: string;
  channelId: string;
  watchedMessageId: string;
  emojiIdOrName: string;
  botMessageChannelId: string;
  botMessageId: string;
}

export class ReactionTrackerManager {
  private db: Datastore;
  public mappings: ReactionTrackerMapping[] = [];

  constructor() {
    const dataDir = join(__dirname, "../../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Datastore({
      filename: join(dataDir, "reactionTrackers.db"),
      autoload: true,
    });
  }

  public async init() {
    return new Promise<void>((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: ReactionTrackerMapping[]) => {
        if (err) {
          console.error("❌ Failed to load reaction trackers from NoSQL:", err);
          return reject(err);
        }
        this.mappings = docs;
        console.log(`✅ Loaded ${this.mappings.length} reaction trackers from NoSQL.`);
        resolve();
      });
    });
  }

  public async addMapping(mapping: ReactionTrackerMapping): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.update(
        { watchedMessageId: mapping.watchedMessageId, emojiIdOrName: mapping.emojiIdOrName },
        mapping,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("❌ Failed to save reaction tracker to NoSQL:", err);
            return resolve(false);
          }
          const index = this.mappings.findIndex(
            (m) => m.watchedMessageId === mapping.watchedMessageId && m.emojiIdOrName === mapping.emojiIdOrName
          );

          if (index !== -1) {
            this.mappings[index] = mapping;
          } else {
            this.mappings.push(mapping);
          }
          resolve(true);
        }
      );
    });
  }

  public async removeMapping(watchedMessageId: string, emojiIdOrName: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.remove(
        { watchedMessageId, emojiIdOrName },
        {},
        (err, numRemoved) => {
          if (err) {
            console.error("❌ Failed to remove reaction tracker from NoSQL:", err);
            return resolve(false);
          }
          if (numRemoved > 0) {
            this.mappings = this.mappings.filter(
              (m) => !(m.watchedMessageId === watchedMessageId && m.emojiIdOrName === emojiIdOrName)
            );
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  }

  public getMapping(watchedMessageId: string, emojiIdOrName: string): ReactionTrackerMapping | undefined {
    return this.mappings.find((m) => m.watchedMessageId === watchedMessageId && m.emojiIdOrName === emojiIdOrName);
  }

  public getGuildMappings(guildId: string): ReactionTrackerMapping[] {
    return this.mappings.filter((m) => m.guildId === guildId);
  }

  public getMappingsByBotMessageId(botMessageId: string): ReactionTrackerMapping[] {
    return this.mappings.filter((m) => m.botMessageId === botMessageId);
  }
}

export const reactionTrackerManager = new ReactionTrackerManager();
