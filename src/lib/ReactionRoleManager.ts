import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import Datastore from "@seald-io/nedb";

export interface ReactionRoleMapping {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiIdOrName: string; 
  roleId: string;
}

export class ReactionRoleManager {
  private db: Datastore;
  public mappings: ReactionRoleMapping[] = [];

  constructor() {
    const dataDir = join(__dirname, "../../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Datastore({
      filename: join(dataDir, "reactionRoles.db"),
      autoload: true,
    });
  }

  public async init() {
    return new Promise<void>((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: ReactionRoleMapping[]) => {
        if (err) {
          console.error("❌ Failed to load reaction roles from NoSQL:", err);
          return reject(err);
        }
        this.mappings = docs;
        console.log(`✅ Loaded ${this.mappings.length} reaction roles from NoSQL.`);
        resolve();
      });
    });
  }

  public async addMapping(mapping: ReactionRoleMapping): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.update(
        { messageId: mapping.messageId, emojiIdOrName: mapping.emojiIdOrName },
        mapping,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("❌ Failed to save reaction role to NoSQL:", err);
            return resolve(false);
          }
          
          const index = this.mappings.findIndex(
            (m) => m.messageId === mapping.messageId && m.emojiIdOrName === mapping.emojiIdOrName
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

  public async removeMapping(messageId: string, emojiIdOrName: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.remove(
        { messageId, emojiIdOrName },
        {},
        (err, numRemoved) => {
          if (err) {
            console.error("❌ Failed to remove reaction role from NoSQL:", err);
            return resolve(false);
          }
          if (numRemoved > 0) {
            this.mappings = this.mappings.filter(
              (m) => !(m.messageId === messageId && m.emojiIdOrName === emojiIdOrName)
            );
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  }

  public getMapping(messageId: string, emojiIdOrName: string): ReactionRoleMapping | undefined {
    return this.mappings.find((m) => m.messageId === messageId && m.emojiIdOrName === emojiIdOrName);
  }

  public getGuildMappings(guildId: string): ReactionRoleMapping[] {
    return this.mappings.filter((m) => m.guildId === guildId);
  }
}

export const reactionRoleManager = new ReactionRoleManager();
