import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

export interface ReactionTrackerMapping {
  guildId: string;
  channelId: string;
  watchedMessageId: string;
  emojiIdOrName: string;
  botMessageChannelId: string;
  botMessageId: string;
}

export class ReactionTrackerManager {
  private filePath: string;
  public mappings: ReactionTrackerMapping[] = [];

  constructor() {
    this.filePath = join(__dirname, "../../data/reactionTrackers.json");
    this.init();
  }

  private init() {
    const dataDir = join(__dirname, "../../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    if (existsSync(this.filePath)) {
      try {
        const data = readFileSync(this.filePath, "utf-8");
        this.mappings = JSON.parse(data);
        console.log(`✅ Loaded ${this.mappings.length} reaction trackers.`);
      } catch (error) {
        console.error("❌ Failed to load reaction trackers JSON", error);
        this.mappings = [];
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.mappings, null, 2), "utf-8");
    } catch (error) {
      console.error("❌ Failed to save reaction trackers JSON", error);
    }
  }

  public addMapping(mapping: ReactionTrackerMapping): boolean {
    const exists = this.mappings.findIndex(
      (m) => m.watchedMessageId === mapping.watchedMessageId && m.emojiIdOrName === mapping.emojiIdOrName
    );

    if (exists !== -1) {
      this.mappings[exists] = mapping;
    } else {
      this.mappings.push(mapping);
    }
    
    this.save();
    return true;
  }

  public removeMapping(watchedMessageId: string, emojiIdOrName: string): boolean {
    const initialLength = this.mappings.length;
    this.mappings = this.mappings.filter(
      (m) => !(m.watchedMessageId === watchedMessageId && m.emojiIdOrName === emojiIdOrName)
    );
    
    if (this.mappings.length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  public getMapping(watchedMessageId: string, emojiIdOrName: string): ReactionTrackerMapping | undefined {
    return this.mappings.find((m) => m.watchedMessageId === watchedMessageId && m.emojiIdOrName === emojiIdOrName);
  }

  public getGuildMappings(guildId: string): ReactionTrackerMapping[] {
    return this.mappings.filter((m) => m.guildId === guildId);
  }
}

export const reactionTrackerManager = new ReactionTrackerManager();
