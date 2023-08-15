import {SlashCommandBuilder} from "discord.js";
import {command} from "../../template.js";

export default command(
    new SlashCommandBuilder()
        .setName("test2")
        .setDescription("Test2 command")
        .addSubcommand(input => input
            .setName("arg")
            .setDescription("sub command")
            .addIntegerOption(option => option.setName("a").setDescription("a a a").setRequired(true))
        ),
    {
        arg: async (interaction, args) => {
            await interaction.reply("You entered this integer: " + args.a);
        }
    }
);


