const { exec } = require("child_process");

module.exports = {
  name: "cmd",
  aliases: ["shell", "exec"],
  description: "Run shell command",
  async execute(message, args, client) {
    if (message.author.id !== process.env.OWNER_ID) {
      return message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
    }

    const command = args.join(" ");
    if (!command) return message.reply("❌ Please provide a command.");

    const msg = await message.reply(`💻 Running: \`${command}\`...`);

    exec(command, (error, stdout, stderr) => {
      let output = stdout || stderr || "No output";
      if (output.length > 1900) output = output.substring(0, 1900) + "...";

      if (error) {
        msg.edit(`❌ Error:\n\`\`\`bash\n${output}\n\`\`\``);
      } else {
        msg.edit(`✅ Output:\n\`\`\`bash\n${output}\n\`\`\``);
      }
    });
  },
};
