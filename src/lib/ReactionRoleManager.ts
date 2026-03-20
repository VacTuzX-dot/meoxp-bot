import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

export interface ReactionRoleMapping {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiIdOrName: string; // The ID for custom emoji, or the name (unicode) for default
  roleId: string;
}

export class ReactionRoleManager {
  private filePath: string;
  public mappings: ReactionRoleMapping[] = [];

  constructor() {
    this.filePath = join(__dirname, "../../data/reactionRoles.json");
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
        console.log(`✅ Loaded ${this.mappings.length} reaction roles.`);
      } catch (error) {
        console.error("❌ Failed to load reaction roles JSON", error);
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
      console.error("❌ Failed to save reaction roles JSON", error);
    }
  }

  public addMapping(mapping: ReactionRoleMapping): boolean {
    const exists = this.mappings.findIndex(
      (m) => m.messageId === mapping.messageId && m.emojiIdOrName === mapping.emojiIdOrName
    );

    if (exists !== -1) {
      this.mappings[exists] = mapping; // update target role, effectively overriding duplicate mapping
    } else {
      this.mappings.push(mapping);
    }
    
    this.save();
    return true;
  }

  public removeMapping(messageId: string, emojiIdOrName: string): boolean {
    const initialLength = this.mappings.length;
    this.mappings = this.mappings.filter(
      (m) => !(m.messageId === messageId && m.emojiIdOrName === emojiIdOrName)
    );
    
    if (this.mappings.length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  public getMapping(messageId: string, emojiIdOrName: string): ReactionRoleMapping | undefined {
    return this.mappings.find((m) => m.messageId === messageId && m.emojiIdOrName === emojiIdOrName);
  }

  public getGuildMappings(guildId: string): ReactionRoleMapping[] {
    return this.mappings.filter((m) => m.guildId === guildId);
  }
}

// Export singleton instance
export const reactionRoleManager = new ReactionRoleManager();
