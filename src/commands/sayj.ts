import type { Command } from "../types";
import { handleSayCommand } from "./say";

const command: Command = {
  name: "sayj",
  aliases: ["sayja", "ttsja", "speakj"],
  description: "Text-to-Speech ภาษาญี่ปุ่น",
  execute: (message, args, client) =>
    handleSayCommand(message, args, client, "ja", "!!sayj こんにちは"),
};

export default command;
