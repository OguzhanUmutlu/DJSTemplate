import {ApplicationCommandType, ContextMenuCommandBuilder} from "discord.js";
import {command} from "../../template.js";

export default command(
    new ContextMenuCommandBuilder()
        .setName("know about this guy")
        .setType(ApplicationCommandType.User), // ApplicationCommandType.User OR ApplicationCommandType.Message
    async (interaction, interacted) => {
        await interaction.reply("The person you clicked is <@" + interacted.id + ">");
    }
);