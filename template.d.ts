import {
    ChatInputCommandInteraction,
    Client,
    ClientEvents,
    ClientOptions,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Guild,
    Message,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    User
} from "discord.js";
import {ReadStream} from "tty";

type DoBot<T, K extends boolean = true> = T & {
    client: Bot<K>
};
type NewClientOptions = ClientOptions & {
    token: string
};
type SlashExecutorFunction = (interaction: DoBot<ChatInputCommandInteraction>, args: Record<string, any>, group?: string, sub?: string) => any;
type SlashExecutor =
    SlashExecutorFunction |
    Record<string, SlashExecutorFunction> |
    Record<string, Record<string, SlashExecutorFunction>>;

type ContextMenuExecutor = (interaction: DoBot<ContextMenuCommandInteraction>, interacted: User | Message) => any;

declare module "discord.js" {
    // @ts-ignore
    export class Guild extends Guild {
        sendCommands(): Promise<void>;
    }

    // @ts-ignore
    export {Bot as Client};

    // @ts-ignore
    export abstract class Base {
        // @ts-ignore
        public constructor(client: Bot<true>);

        public readonly client: Bot<true>;

        public toJSON(...props: Record<string, boolean | string>[]): unknown;

        public valueOf(): string;
    }
}

export function command(build: ContextMenuCommandBuilder | ((guild: Guild) => ContextMenuCommandBuilder), command: ContextMenuExecutor): any;
export function command(build: SlashBuilder | ((guild: Guild) => SlashBuilder), command: SlashExecutor): any;
export function command(command: ContextMenuExecutor | SlashExecutor): any;

export function event<T extends keyof ClientEvents>(name: T, callback: (...args: ClientEvents[T]) => any): any;
export function event<T extends keyof ClientEvents>(name: T): any;

export const vr: Map<any, any>;

export function doOnce(key: any, value: any): any;

type SlashBuilder =
    SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder;


export default class Bot<Ready extends boolean = boolean> extends Client<Ready> {
    constructor(options?: Partial<NewClientOptions>);

    static create(options?: Partial<NewClientOptions>): Bot;

    waitReady(): Promise<void> | any;

    broadcastCommands(): Promise<void> | any;

    getCommands(): ({
        default: SlashExecutor,
        build: SlashBuilder | ((guild: Guild) => SlashBuilder),
        file: string
    } | {
        default: ContextMenuExecutor,
        build: ContextMenuCommandBuilder | ((guild: Guild) => ContextMenuCommandBuilder),
        file: string
    })[];

    getCommandsFor(guild: Guild): ({
        default: SlashExecutor,
        build: SlashBuilder,
        file: string
    } | {
        default: ContextMenuExecutor,
        build: ContextMenuCommandBuilder,
        file: string
    })[];

    registerEvent(path: string, pseudoFile?: boolean): Promise<void> | any;

    registerCommand(path: string, pseudoFile?: boolean, broadcastCommands?: boolean): Promise<void> | any;

    registerEvents(folder?: string, pseudoFile?: boolean): Promise<void> | any;

    registerCommands(folder?: string, pseudoFile?: boolean, broadcastCommands?: boolean): Promise<void> | any;

    startWatcher(pseudoFile?: boolean): void;

    stopWatcher(): void;
}

export class Terminal {
    client: Bot;
    stdin: ReadStream & {
        fd: 0;
    };

    constructor(client: Bot, stdin?: ReadStream & {
        fd: 0;
    });

    listen(): void;

    registerCommand(name: string, executor: (args: string[]) => any, aliases?: string[]): void;

    unregisterCommand(name: string): void;

    getCommand(name: string): (args: string[]) => any;

    dispatchCommand(name: string, args: string[]): Promise<void>;
}