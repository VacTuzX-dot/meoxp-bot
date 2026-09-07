import type { Command } from "../types";
import { handleSayCommand } from "./say";

const command: Command = {
  name: "sayc",
  aliases: ["sayzh", "ttszh", "speakc"],
  description: "Text-to-Speech ภาษาจีน",
  execute: (message, args, client) =>
    handleSayCommand(message, args, client, "zh-CN", "!!sayc 你好"),
};

export default command;
