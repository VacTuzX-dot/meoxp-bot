import { Events, GuildMember, PermissionsBitField } from "discord.js";
import { ExtendedClient, defineEvent } from "../types";
import { autoRoleManager } from "../lib/AutoRoleManager";

const event = defineEvent({
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember, _client: ExtendedClient) {
    const config = autoRoleManager.getConfig(member.guild.id);
    if (!config) return;

    const role = await member.guild.roles.fetch(config.roleId);
    if (!role) {
      console.log(
        `[AutoRole] Role ${config.roleId} not found in guild ${member.guild.id}.`,
      );
      return;
    }

    const botMember = member.guild.members.me;
    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      console.log(
        `[AutoRole] Missing Manage Roles permission in guild ${member.guild.id}.`,
      );
      return;
    }

    if (botMember.roles.highest.position <= role.position) {
      console.log(
        `[AutoRole] Bot role is too low to assign ${role.id} in guild ${member.guild.id}.`,
      );
      return;
    }

    if (member.roles.cache.has(role.id)) return;

    try {
      await member.roles.add(role);
      console.log(
        `✅ [AutoRole] Assigned role ${role.name} to ${member.user.tag}.`,
      );
    } catch (error) {
      console.error(
        `[AutoRole] Failed to assign role ${role.id} to ${member.user.tag}:`,
        error,
      );
    }
  },
});

export default event;
