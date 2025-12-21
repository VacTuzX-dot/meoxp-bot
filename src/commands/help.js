const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    aliases: ['h', 'commands'],
    description: 'แสดงรายการคำสั่งทั้งหมด',
    execute(message, args, client) {
        const embed = new EmbedBuilder()
            .setTitle('📚 รายการคำสั่งทั้งหมด')
            .setColor(0xFF69B4)
            .setDescription('Prefix: `!!`')
            .addFields(
                {
                    name: '🎵 Music',
                    value: [
                        '`!!play <url/search>` - เล่นเพลง',
                        '`!!skip` - ข้ามเพลง',
                        '`!!stop` - หยุดและออกจากห้อง',
                        '`!!queue` - ดู Queue',
                        '`!!nowplaying` - เพลงที่กำลังเล่น',
                        '`!!loop` - เปลี่ยนโหมด Loop',
                    ].join('\n')
                },
                {
                    name: '🛠️ Admin',
                    value: [
                        '`!!purge <จำนวน>` - ลบข้อความ',
                        '`!!server` - สถานะเซิร์ฟเวอร์',
                        '`!!cmd <command>` - รันคำสั่ง (Owner)',
                    ].join('\n')
                }
            )
            .setFooter({ text: 'พิมพ์ !!help เพื่อดูคำสั่งนะคะ~ 💕' });

        message.channel.send({ embeds: [embed] });
    }
};
