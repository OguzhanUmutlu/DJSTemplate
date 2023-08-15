import {SlashCommandBuilder} from "discord.js";
import {command} from "../../template.js";

export default command(
    new SlashCommandBuilder()
        .setName("test3")
        .setDescription("Test3 command")
        .addSubcommandGroup(input => input
            .setName("group")
            .setDescription("group sub command")
            .addSubcommand(input => input
                .setName("sub")
                .setDescription("sub command")
                .addIntegerOption(option => option
                    .setName("integer")
                    .setDescription("give an integer")
                    .setRequired(true)
                )
            )
        )
        .addSubcommand(input => input
            .setName("sub")
            .setDescription("sub command")
            .addIntegerOption(option => option
                .setName("integer2")
                .setDescription("give an integer")
                .setRequired(true)
            )
        ),
    {
        group: {
            sub: async (interaction, args) => {
                await interaction.reply("You entered this integer: " + args.integer);
            }
        },
        sub: async (interaction, args) => {
            await interaction.reply("You entered this integer: " + args.integer2);
        }
    }
);