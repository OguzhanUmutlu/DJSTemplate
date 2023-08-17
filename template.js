import {
    ChatInputCommandInteraction,
    Client,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Guild,
    SlashCommandBuilder
} from "discord.js";
import {ApplicationCommandOptionType, GatewayIntentBits} from "discord-api-types/v10";
import {config} from "dotenv";
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from "fs";
import {basename, dirname, join, parse as parsePath} from "path";
import {pathToFileURL} from "url";
import Printer from "fancy-printer";
import ts from "typescript";
import {inspect} from "util";
import {randomUUID} from "crypto";

Printer.makeGlobal();
config();
// printer.options.disabledTags.push("debug");

const expect = (...fns) => {
    fns.forEach(i => {
        const r = i();
        i = i.toString();
        if (!i.startsWith("()")) throw new Error("Expect function expects arrow functions as input.");
        if (!r) throw new Error("Assertion failed: " + i.substring(i.indexOf("=>") + 2).trim());
    });
};

const _doOnce = new Set;
export const command = (...r) => r;
// noinspection JSValidateTypes, JSDeprecatedSymbols
export const event = (...r) => r;
const _vr = new Map;
export const vr = _vr;
export const doOnce = (n, cb) => {
    n = require("util").inspect(n, false, 20, false);
    if (_doOnce.has(n)) return;
    _doOnce.add(n);
    cb();
};

function validExtension(file) {
    return file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs") ||
        file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts");
}

Guild.prototype.sendCommands = async function () {
    /** @var {Bot} */
    const bot = this.client;
    if (!(bot instanceof Bot)) return false;
    await this.commands.fetch({cache: true});
    const pk = bot.getSlashCommands()
        .map(i => [i.file, typeof i.build === "function" ? i.build(this) : i.build])
        .filter(i => i[0] && i[1]);
    let obj = {};
    for (const p of pk.sort((a, b) => [a[1].name, b[1].name].sort().indexOf(a[1].name) * 2 - 1)) {
        obj[p[0]] = p[1].toJSON();
    }
    let old = bot.__guildPackets[this.id];
    if (old && typeof old === "string") old = bot.__guildPackets[old];
    const objJ = JSON.stringify(obj);
    if (JSON.stringify(old) === objJ) return;
    for (const id in bot.__guildPackets) {
        if (JSON.stringify(bot.__guildPackets[id]) === objJ) {
            obj = id;
            break;
        }
    }
    bot.__guildPackets[this.id] = obj;
    bot.__guildPacketsNeedUpdate = true;
    const r = await this.commands.set(pk.map(i => i[1])).catch(e => e);
    printer.debug("Updated slash commands for the guild " + this.id);
    if (r instanceof Error) {
        printer.warn("Couldn't send the guild packet to the guild: " + this.id);
        printer.error(r);
    }
    return !(r instanceof Error);
};
let fId = 0;

const cwdClear = pt => {
    if (pt.startsWith(process.cwd())) return "." + pt.substring(process.cwd().length).replaceAll("\\", "/");
    return pt.replaceAll("\\", "/");
};

export default class Bot extends Client {
    #readyPromise;
    #slashCommands = {};
    #eventHandlers = {};
    #watching = false;
    __guildPackets = {};
    __guildPacketsNeedUpdate = false;
    eventWatchers = new Set;
    commandWatchers = new Set;
    typescriptConfig = existsSync("tsconfig.json") ? JSON.parse(readFileSync("tsconfig.json", "utf8")) : {
        compilerOptions: {
            target: "es2022",
            lib: ["es2022"],
            module: "es2022",
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            strict: true,
            skipLibCheck: true,
            moduleResolution: "Node"
        }
    };
    #eventOpts = [
        "event",
        this.#eventHandlers,
        (event, path) => {
            const old = this.#eventHandlers[path];
            if (old) this.off(old[0], old[1]);
            const eN = event.name;
            event = event.default;
            const h = this.#eventHandlers[path] = typeof event[0] === "string" ? event : [eN || parsePath(path).name, event[0]];
            h.push(event.once ? "once" : "on");
            this[h[2]](h[0], h[1]);
            this.eventWatchers.add(dirname(path));
        },
        ([name, callback]) => this.off(name, callback)
    ];
    #commandOpts = [
        "command",
        this.#slashCommands,
        (command, path) => {
            command = {...command};
            const def = command.default;
            if (Array.isArray(def)) {
                if (def.length === 1) {
                    command = {...command, default: def[0]};
                } else if (def.length >= 2) {
                    command = {...command, build: def[0], default: def[1]};
                } else throw new Error("Invalid command construction.");
            } else if (typeof def === "function" && def.prototype && def.prototype.constructor === def) {
                const cmd = new def(this);
                command = {...command, build: cmd.build, default: cmd.execute};
            } else if (def instanceof Command) {
                command = {...command, build: def.build, default: def.execute};
            }
            if (!(command.build instanceof SlashCommandBuilder) && !(command.build instanceof ContextMenuCommandBuilder))
                throw "Couldn't find the builder.";
            if (typeof command.default !== "function" && typeof command.default !== "object")
                throw "Couldn't find the executor.";
            command.file = path;
            this.#slashCommands[path] = command;
            this.commandWatchers.add(dirname(path));
        },
        r => r
    ];

    constructor(options = {}) {
        if (typeof options !== "object") options = {};
        if (!options.intents) options.intents = Object.values(GatewayIntentBits).filter(Number);
        options.token = options.token || (process.env.TOKEN || "").trim();
        const tk = options.token;
        delete options.token;
        super(options);
        this.#readyPromise = new Promise(r => this.once("ready", r));
        this.token = tk;
        /** @param {ChatInputCommandInteraction | ContextMenuCommandInteraction} interaction */
        const InteractionHandler = async interaction => {
            if (interaction instanceof ChatInputCommandInteraction || interaction instanceof ContextMenuCommandInteraction) {
                const cmd = this.getSlashCommands().find(i => this.__guildPackets[interaction.guildId][i.file].name === interaction.commandName);
                if (cmd) {
                    const build = this.__guildPackets[interaction.guildId][cmd.file];
                    try {
                        if (interaction instanceof ChatInputCommandInteraction) {
                            const group = interaction.options.getSubcommandGroup(false);
                            const sub = interaction.options.getSubcommand(false);
                            let args = this.#handleArguments(interaction.options.data);
                            if (group) args = args[group];
                            if (sub) args = args[sub];
                            if (typeof cmd.default === "function") {
                                await cmd.default(interaction, args, group, sub);
                            } else if (typeof cmd.default === "object") {
                                if (group) {
                                    if (typeof cmd.default[group] === "object" && typeof cmd.default[group][sub] === "function") {
                                        cmd.default[group][sub](interaction, args, group, sub);
                                    }
                                } else {
                                    if (typeof cmd.default[sub] === "function") {
                                        cmd.default[sub](interaction, args, group, sub);
                                    }
                                }
                            }
                        } else if (interaction instanceof ContextMenuCommandInteraction) {
                            cmd.default(interaction, ...interaction.options.data.map(i => i[i.name]));
                        }
                    } catch (e) {
                        printer.error("An error occurred while running the command: " + build.name + ", by: " + interaction.user.id);
                        printer.error(e);
                        try {
                            await interaction.reply({
                                content: "An error occurred while running this command.",
                                ephemeral: true
                            });
                        } finally {
                        }
                    }
                }
            }
        }
        this.on("interactionCreate", InteractionHandler);
        if (!existsSync("./_pk_")) writeFileSync("./_pk_", "{}");
        else this.__guildPackets = JSON.parse(readFileSync("./_pk_", "utf8"));
        setInterval(() => {
            if (this.__guildPacketsNeedUpdate) this.#saveGuildPackets();
        }, 100);
    };

    static create(options = {}) {
        return new Bot(options);
    };

    #__arg__sub = (data, args) => this.#handleArguments(data.options, args[data.name] = {});

    #__arg__normal = (data, args) => args[data.name] = data.value;

    #argumentHandler = {
        [ApplicationCommandOptionType.Subcommand]: this.#__arg__sub,
        [ApplicationCommandOptionType.SubcommandGroup]: this.#__arg__sub,
        [ApplicationCommandOptionType.String]: this.#__arg__normal,
        [ApplicationCommandOptionType.Integer]: this.#__arg__normal,
        [ApplicationCommandOptionType.Boolean]: this.#__arg__normal,
        [ApplicationCommandOptionType.Number]: this.#__arg__normal,
        [ApplicationCommandOptionType.User]: (data, args) => args[data.name] = data.member,
        [ApplicationCommandOptionType.Channel]: (data, args) => args[data.name] = data.channel,
        [ApplicationCommandOptionType.Role]: (data, args) => args[data.name] = data.role,
        [ApplicationCommandOptionType.Mentionable]: (data, args) => args[data.name] = data.role || data.member,
        [ApplicationCommandOptionType.Attachment]: (data, args) => args[data.name] = data.attachment
    };

    #handleArguments(data, args = {}) {
        for (const dat of data) this.#argumentHandler[dat.type](dat, args);
        return args;
    };

    #saveGuildPackets() {
        writeFileSync("./_pk_", JSON.stringify(this.__guildPackets));
        this.__guildPacketsNeedUpdate = false;
    };

    async waitReady() {
        await this.#readyPromise;
    };

    checkTypeScriptConfig() {
        if (!existsSync("tsconfig.json"))
            writeFileSync("tsconfig.json", JSON.stringify(this.typescriptConfig, null, 2));
    }

    /*** @returns {any[]} */
    getSlashCommands() {
        return Object.values(this.#slashCommands);
    };

    getSlashCommandsFor(guildId) {
        return this.getSlashCommands().map(cmd => ({
            build: this.__guildPackets[guildId][cmd.file],
            default: cmd.default,
            file: cmd.file
        }));
    };

    async broadcastCommands() {
        for (const guild of this.guilds.cache.toJSON()) await guild.sendCommands();
    };

    async #register(path, pseudoFile, type, prv, addCb, broadcastCommands = false) {
        if (!validExtension(path) || basename(path).startsWith("_")) return false;
        let r;
        let p2;
        let hasErr = false;
        try {
            p2 = path;
            if (pseudoFile) {
                p2 = join(dirname(path), "_" + (fId++) + basename(path));
                const auto = "/** THIS FILE IS AUTO GENERATED, YOU CAN DELETE THIS FILE **/ ";
                if (p2.endsWith(".ts") || p2.endsWith(".cts") || p2.endsWith(".mts")) {
                    p2 = p2.substring(0, p2.length - 2) + "js";
                    writeFileSync(p2, auto +
                        ts.transpileModule(readFileSync(path).toString(), {
                            compilerOptions: {
                                target: ts.ScriptTarget.ES2020,
                                module: ts.ModuleKind.ES2022
                            }
                        }).outputText
                    );
                } else writeFileSync(p2, auto + readFileSync(path, "utf8"));
                r = await import(pathToFileURL(p2));
            } else r = await import(pathToFileURL(p2));
            addCb(r, path);
        } catch (e) {
            printer.warn("Couldn't handle the " + type + " file: " + path);
            printer.error(e);
            hasErr = true;
        }
        if (p2 && existsSync(p2)) rmSync(p2);
        if (broadcastCommands && !hasErr) await this.broadcastCommands();
        return hasErr ? 1 : true;
    };

    async #registerAll(folder, pseudoFile, type, prv, addCb, rmCb, broadcastCommands = false) {
        folder = join(folder);
        if (!existsSync(folder)) mkdirSync(folder);
        const files = readdirSync(folder);
        for (const file in prv) {
            const p = join(folder, file);
            if (file.startsWith(folder) && !files.includes(p)) {
                rmCb(prv[p]);
                delete prv[p];
            }
        }
        let hasErr = false;
        for (const file of files) {
            if (await this.#register(join(folder, file), pseudoFile, type, prv, addCb, false) === 1) hasErr = true;
        }
        if (broadcastCommands && !hasErr) await this.broadcastCommands();
        this[type + "Watchers"].add(folder);
    };

    async registerEvent(path, pseudoFile = true) {
        await this.#register(path, pseudoFile, ...this.#eventOpts);
    };

    async registerCommand(path, pseudoFile = true, broadcastCommands = true) {
        await this.#register(path, pseudoFile, ...this.#commandOpts, broadcastCommands);
    };

    async registerEvents(folder = join(process.cwd(), "events"), pseudoFile = true) {
        await this.#registerAll(folder, pseudoFile, ...this.#eventOpts);
    };

    async registerCommands(folder = join(process.cwd(), "commands"), pseudoFile = true, broadcastCommands = true) {
        await this.#registerAll(folder, pseudoFile, ...this.#commandOpts, broadcastCommands);
    };

    startWatcher(pseudoFile = true) {
        expect(() => !this.#watching);
        const cache = {};
        const loop = async () => {
            if (!this.#watching) return;
            const d = a => a
                .map(i => readdirSync(i)
                    .filter(i => validExtension(i) && !i.startsWith("_"))
                    .map(f => join(i, f))
                ).flat();
            const events = d([...this.eventWatchers]);
            const commands = d([...this.commandWatchers]);
            for (const fl in this.#eventHandlers) {
                if (!events.includes(fl)) {
                    printer.debug("Event deleted: " + fl);
                    this.#eventOpts[3](this.#eventHandlers[fl]);
                    delete this.#eventHandlers[fl];
                }
            }
            for (const fl in this.#slashCommands) {
                if (!commands.includes(fl)) {
                    printer.debug("Command deleted: " + cwdClear(fl));
                    this.#commandOpts[3](this.#slashCommands[fl]);
                    delete this.#slashCommands[fl];
                }
            }
            for (const fl of events) {
                try {
                    const c = cache[fl];
                    const stats = statSync(fl);
                    if (c === stats.mtimeMs) continue;
                    cache[fl] = stats.mtimeMs;
                    if (!c && this.#eventHandlers[fl]) continue;
                    printer.debug("Event " + (this.#eventHandlers[fl] ? "updated" : "created") + ": " + cwdClear(fl));
                    await this.registerEvent(fl, pseudoFile);
                } finally {
                }
            }
            let update = false;
            for (const fl of commands) {
                try {
                    const c = cache[fl];
                    const stats = statSync(fl);
                    if (c === stats.mtimeMs) continue;
                    cache[fl] = stats.mtimeMs;
                    if (!c && this.#slashCommands[fl]) continue;
                    printer.debug("Command " + (this.#slashCommands[fl] ? "updated" : "created") + ": " + cwdClear(fl));
                    await this.registerCommand(fl, pseudoFile, false);
                    update = true;
                } finally {
                }
            }
            if (update) await this.broadcastCommands();
            setTimeout(loop, 100);
        };
        this.#watching = true;
        loop().then(r => r);
    };

    stopWatcher() {
        expect(() => this.#watching);
        this.#watching = false;
    };

    async login(token) {
        const r = await super.login(token).then(() => true).catch(e => e);
        if (r instanceof Error) {
            let err;
            switch (r.code) {
                case "TokenInvalid":
                    err = "Invalid token!";
                    break;
                case "ENOTFOUND":
                    err = "Is discord down?\n" +
                        "https://discordstatus.com\n" +
                        "https://downdetector.com/status/discord";
                    break;
                case "DisallowedIntents":
                    err = printer.substitute(
                        "Some intents you have activated for the bot are not permitted.",
                        "\nBe sure to enable %cPrivileged Gateway Intents%c in the page:%c https://discord.com/developers/applications",
                        "color: magenta", "color: red", "color: magenta"
                    );
                    break;
                case "ECONNRESET":
                    err = "Connection has been reset.";
                    break;
                default:
                    err = "Failed to log in to Discord! Error code: " + r.code;
            }
            throw new Error(err);
        }
        return token;
    };
}

export class Terminal {
    #commands = {};
    #aliases = {};

    constructor(client, stdin = process.stdin) {
        this.client = client;
        this.stdin = stdin;
        let firstEval = true;
        const evl = async (code, rn) => {
            if (firstEval) printer.notice("Using the evaluation function can be risky! Please do not use this command on production! The results from the evaluations won't be saved to anywhere for protection.");
            firstEval = false;
            while (code.endsWith("^")) {
                code = code.substring(0, code.length - 1);
                this.stdin.resume();
                process.stdout.write("... ");
                code += "\n" + await new Promise(r => {
                    this.stdin.once("data", line => {
                        line = line.toString().trim();
                        r(line);
                    });
                });
                this.stdin.pause();
            }
            try {
                process.stdout.write(inspect(await rn(code), false, 5, true));
            } catch (e) {
                process.stdout.write(e.toString());
            }
            process.stdout.write("\n");
        };
        this.registerCommand("help", () => {
            printer.info("Commands: " + Object.keys(this.#commands).join(", "));
        });
        this.registerCommand("clear", () => printer.clear(), ["cls"]);
        this.registerCommand("reload", async () => {
            const t = Date.now();
            const d = a => a
                .map(i => readdirSync(i)
                    .filter(i => validExtension(i) && !i.startsWith("_"))
                    .map(f => join(i, f))
                ).flat();
            const events = d([...client.eventWatchers]);
            const commands = d([...client.commandWatchers]);
            for (const fl of events) {
                await client.registerEvent(fl, true);
            }
            for (const fl of commands) {
                await client.registerCommand(fl, true, false);
            }
            await client.broadcastCommands();
            printer.info("Events and commands have been reloaded. (%c" + (Date.now() - t) + "ms%c)", "color: orange", "color: blue");
        });
        this.registerCommand("eval", async args => {
            await evl(args.join(" "), code => Function("client", code)(client));
        });
        this.registerCommand("ret", async args => this.dispatchCommand("eval return " + args.join(" ")));
        this.registerCommand("asy", async args => this.dispatchCommand(`eval return (async()=>{${args.join(" ")}})()`));
        this.registerCommand("mdl", async args => {
            const file = join(process.cwd(), "delete_me_" + randomUUID() + ".js");
            await evl(args.join(" "), code => {
                writeFileSync(file, code);
                return import(pathToFileURL(file));
            });
            rmSync(file);
        });
    };

    listen() {
        this.stdin.resume();
        let resolved = true;
        this.stdin.on("data", async line => {
            line = line.toString().trim();
            if (!resolved) return;
            resolved = false;
            this.stdin.pause();
            await this.dispatchCommand(line);
            resolved = true;
            this.stdin.resume();
        });
    };

    registerCommand(name, executor, aliases = []) {
        name = name.toLowerCase();
        this.#commands[name] = executor;
        aliases.forEach(i => this.#aliases[i.toLowerCase()] = name);
    };

    unregisterCommand(name) {
        name = name.toLowerCase();
        delete this.#commands[name];
        for (const k in this.#aliases) {
            if (this.#aliases[k] === name) delete this.#aliases[k];
        }
    };

    getCommand(name) {
        return this.#commands[name] || this.#commands[this.#aliases[name]];
    };

    async dispatchCommand(line) {
        if (!line) return;
        const args = line.split(" ");
        const name = args[0].toLowerCase();
        const cmd = this.getCommand(name);
        if (typeof cmd === "function") {
            await cmd(args.slice(1));
        } else printer.error("Command not found: " + name);
    };
}

class Command {
    #client;

    constructor(client) {
        this.#client = client;
    };

    execute() {
    };
}

export class SlashCommand extends Command {
}

export class ContextMenuCommand extends Command {
}