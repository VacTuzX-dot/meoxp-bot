import type { Command } from "../types";
import { handleSayCommand } from "./say";

const command: Command = {
  name: "saye",
  aliases: ["ttse", "speake"],
  description: "Text-to-Speech ภาษาอังกฤษ",
  execute: (message, args, client) =>
    handleSayCommand(message, args, client, "en", "!!saye Hello"),
};

export default command;

