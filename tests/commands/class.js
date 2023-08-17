import {SlashCommandBuilder} from "discord.js";
import {SlashCommand} from "../../template.js";

export default class MyCommand extends SlashCommand {
    build = new SlashCommandBuilder()
        .setName("hey")
        .setDescription("made in a class!");

    async execute(interaction) {
        await interaction.reply("Hello, world!");
    };
};