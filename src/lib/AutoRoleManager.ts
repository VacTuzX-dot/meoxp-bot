import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import Datastore from "@seald-io/nedb";

export interface AutoRoleConfig {
  guildId: string;
  roleId: string;
}

export class AutoRoleManager {
  private db: Datastore;
  public configs: AutoRoleConfig[] = [];

  constructor() {
    const dataDir = join(__dirname, "../../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Datastore({
      filename: join(dataDir, "autoRoles.db"),
      autoload: true,
    });
  }

  public async init() {
    return new Promise<void>((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: AutoRoleConfig[]) => {
        if (err) {
          console.error("❌ Failed to load auto roles from NoSQL:", err);
          return reject(err);
        }

        this.configs = docs;
        console.log(`✅ Loaded ${this.configs.length} auto roles from NoSQL.`);
        resolve();
      });
    });
  }

  public async setConfig(config: AutoRoleConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.update(
        { guildId: config.guildId },
        config,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("❌ Failed to save auto role to NoSQL:", err);
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
          console.error("❌ Failed to remove auto role from NoSQL:", err);
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

  public getConfig(guildId: string): AutoRoleConfig | undefined {
    return this.configs.find((item) => item.guildId === guildId);
  }
}

export const autoRoleManager = new AutoRoleManager();
