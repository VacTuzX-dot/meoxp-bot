const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,
    execute(message, client) {
        if (message.author.bot) return;
        
        const prefix = '!!'; // Hardcoded specific prefix as per request to match old bot
        
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        try {
            command.execute(message, args, client);
        } catch (error) {
            console.error(error);
            message.reply('❌ มีข้อผิดพลาดในการใช้คำสั่งค่ะ 🥺');
        }
    }
};
