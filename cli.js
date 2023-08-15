import Bot, {Terminal} from "./template.js";
import {existsSync, readFileSync, writeFileSync} from "fs";

if (!existsSync(".env")) writeFileSync(".env", `TOKEN=`);

if (!process.env.TOKEN) {
    printer.info("No discord bot token was found in the %c.env%c file\nEither put the token into the %c.env%c file or enter in your token.",
        "color: green", "color: blue", "color: green", "color: blue");
    printer.options.newLine = false;
    printer.warn("Do you wish to enter the token here? (Y/n) ");
    const selection = await printer.readLine();
    if (selection.toString() !== "y") {
        printer.cursorUp();
        process.exit();
    }
    printer.warn("Token: ");
    printer.options.newLine = true;
    const token = await printer.readLine();
    printer.clear();
    writeFileSync(".env", readFileSync(".env", "utf8")
        .split("\n")
        .map(i => i.trim().startsWith("TOKEN=") ? "TOKEN=" + token : i)
        .join("\n")
    );
    process.env.TOKEN = token;
}

printer.makeLoggerFile(); // it shouldn't log the token ^
const bot = Bot.create();
try {
    await bot.login();
} catch (e) {
    printer.error(e.message);
    process.exit();
}
await bot.waitReady();
await bot.registerCommands();
await bot.registerEvents();
await bot.startWatcher();
// bot.checkTypeScriptConfig();
printer.info("Bot is ready to go!");
const terminal = new Terminal(bot);
terminal.listen();