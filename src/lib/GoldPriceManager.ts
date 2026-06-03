import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import Datastore from "@seald-io/nedb";

export interface GoldPriceConfig {
  guildId: string;
  channelId: string;
  roleId?: string;
}

export class GoldPriceManager {
  private db: Datastore;
  public configs: GoldPriceConfig[] = [];

  constructor() {
    const dataDir = join(__dirname, "../../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Datastore({
      filename: join(dataDir, "goldPrice.db"),
      autoload: true,
    });
  }

  public async init() {
    return new Promise<void>((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: GoldPriceConfig[]) => {
        if (err) {
          console.error("❌ Failed to load gold price configs:", err);
          return reject(err);
        }
        this.configs = docs;
        console.log(`✅ Loaded ${this.configs.length} gold price config(s).`);
        resolve();
      });
    });
  }

  public async setConfig(config: GoldPriceConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.update(
        { guildId: config.guildId },
        config,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("❌ Failed to save gold price config:", err);
            return resolve(false);
          }
          const index = this.configs.findIndex(
            (item) => item.guildId === config.guildId,
          );
          if (index !== -1) {
            this.configs[index] = config;
          } else {
            this.configs.push(config);
          }
          resolve(true);
        },
      );
    });
  }

  public async removeConfig(guildId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.remove({ guildId }, {}, (err, numRemoved) => {
        if (err) {
          console.error("❌ Failed to remove gold price config:", err);
          return resolve(false);
        }
        if (numRemoved > 0) {
          this.configs = this.configs.filter(
            (item) => item.guildId !== guildId,
          );
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  public getConfig(guildId: string): GoldPriceConfig | undefined {
    return this.configs.find((item) => item.guildId === guildId);
  }

  public getAllConfigs(): GoldPriceConfig[] {
    return this.configs;
  }
}

export const goldPriceManager = new GoldPriceManager();
