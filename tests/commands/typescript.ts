import {SlashCommandBuilder} from "discord.js";
import {command} from "../../template.js";

export default command(
    new SlashCommandBuilder()
        .setName("test4")
        .setDescription("Test command"),

    async interaction => {
        await interaction.reply("Hello, world!");
    }
);