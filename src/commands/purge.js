module.exports = {
    name: 'purge',
    aliases: ['clean', 'del'],
    description: 'Bulk delete messages',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageMessages') && message.author.id !== process.env.OWNER_ID) {
            return message.reply('⛔ คุณไม่มีสิทธิ์ใช้คำสั่งนี้นะคะ~');
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
             return message.reply('❌ กรุณาระบุจำนวน 1-100 นะคะ~');
        }

        try {
            const deleted = await message.channel.bulkDelete(amount + 1, true); // +1 to delete the command itself
            const reply = await message.channel.send(`🗑️ ลบไป **${deleted.size - 1}** ข้อความแล้วค่ะ~ ✨`);
            setTimeout(() => reply.delete().catch(() => {}), 3000);
        } catch (error) {
            console.error(error);
            message.reply('❌ ไม่สามารถลบข้อความได้ค่ะ (อาจจะเก่าเกิน 14 วัน) 🥺');
        }
    }
};
