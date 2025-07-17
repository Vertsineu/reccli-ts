import RecAPI, { FileType } from "@services/rec-api.js";
import RecFileSystem from "@services/rec-file-system.js";
import readline, { CompleterResult, Interface } from "readline";
import { exit } from "process";
import { resolveFullPath, resolveRecFullPath } from "@utils/path-resolver.js";
import { TableFormatter } from "@utils/table-formatter.js";
import { byteToSize } from "@utils/byte-to-size.js";
import fs from "fs";
import { RecFileCache } from "@services/rec-file-cache.js";
import { Readable, Writable } from "stream";
import { parseShellCommand, escapeToShell, unescapeFromShell } from "@utils/shell-parser.js";
import { PanDavClient } from "./pan-dav-api.js";
import PanDavFileSystem from "./pan-dav-file-system.js";

type Command = {
    desc: string,
    usage: string,
    args: number
}

type CompletionResult = {
    prefix: string,
    suffix: string,
    completions: string[]
}

const commands: { [key: string]: Command } = {
    ls: {
        desc: "list files and folders in the given folder, default is current folder",
        usage: "ls [folder]",
        args: 1
    },
    lsp: {
        desc: "list files and folders in plain format in the given folder, default is current folder",
        usage: "lsp [folder]",
        args: 1
    },
    lsw: {
        desc: "list files and folders in the given folder in pan dav",
        usage: "lsw <folder>",
        args: 1
    },
    cd: {
        desc: "change current folder to the given folder, default is root folder",
        usage: "cd [folder]",
        args: 1
    },
    cdw: {
        desc: "change current folder to the given folder in pan dav, default is root folder",
        usage: "cdw [folder]",
        args: 1
    },
    cp: {
        desc: "copy file or folder to another folder in the same cloud or group",
        usage: "cp <file|folder> <folder>",
        args: 2
    },
    cpw: {
        desc: "copy file or folder to another folder in pan dav",
        usage: "cpw <file|folder> <folder>",
        args: 2
    },
    mv: {
        desc: "move file or folder to another folder in the same cloud or group",
        usage: "mv <file|folder> <folder>",
        args: 2
    },
    mvw: {
        desc: "move file or folder to another folder in pan dav",
        usage: "mvp <file|folder> <folder>",
        args: 2
    },
    rm: {
        desc: "remove file or folder in the cloud or group",
        usage: "rm <file|folder>",
        args: 1
    },
    rmw: {
        desc: "remove file or folder in pan dav",
        usage: "rm <file|folder>",
        args: 1
    },
    mkdir: {
        desc: "create a new folder",
        usage: "mkdir <folder>",
        args: 1
    },
    mkdirw: {
        desc: "create a new folder in pan dav",
        usage: "mkdirw <folder>",
        args: 1
    },
    rmdir: {
        desc: "remove the folder",
        usage: "rmdir <folder>",
        args: 1
    },
    rmdirw: {
        desc: "remove the folder in pan dav",
        usage: "rmdirw <folder>",
        args: 1
    },
    unwrap: {
        desc: "unwrap a folder, move all files and folders in the folder to the parent folder",
        usage: "unwrap <folder>",
        args: 1
    },
    unwrapw: {
        desc: "unwrap a folder in pan dav, move all files and folders in the folder to the parent folder",
        usage: "unwrapw <folder>",
        args: 1
    },
    recycle: {
        desc: "move file or folder from cloud to recycle bin",
        usage: "recycle <file|folder>",
        args: 1
    },
    restore: {
        desc: "restore file or folder in recycle bin to a folder in the cloud",
        usage: "restore /recycle/<file|folder> <folder>",
        args: 2
    },
    rename: {
        desc: "rename file or folder",
        usage: "rename <file|folder> <name>",
        args: 2
    },
    renamew: {
        desc: "rename file or folder in pan dav",
        usage: "renamew <file|folder> <name>",
        args: 2
    },
    upload: {
        desc: "upload file or folder from disk to cloud",
        usage: "upload <file|folder> <folder>",
        args: 2
    },
    download: {
        desc: "download file or folder from cloud to disk",
        usage: "download <file|folder> <folder>",
        args: 2
    },
    transfer: {
        desc: "transfer file or folder from rec to pan",
        usage: "transfer <file|folder> <folder>",
        args: 2
    },
    save: {
        desc: "save file or folder from group to cloud",
        usage: "save <file|folder> <folder>",
        args: 2
    },
    whoami: {
        desc: "display information about the current user",
        usage: "whoami",
        args: 0
    },
    groups: {
        desc: "display information about the groups the current user is in",
        usage: "groups",
        args: 0
    },
    df: {
        desc: "display cloud and group disk usage",
        usage: "df",
        args: 0
    },
    du: {
        desc: "display disk usage of a file or folder",
        usage: "du [file|folder]",
        args: 1
    },
    duw: {
        desc: "display disk usage of a file or folder in pan dav",
        usage: "duw [file|folder]",
        args: 1
    },
    help: {
        desc: "display help information",
        usage: "help [command]",
        args: 1
    },
    clear: {
        desc: "clear the screen",
        usage: "clear",
        args: 0
    },
    exit: {
        desc: "exit the program",
        usage: "exit",
        args: 0
    },
}

class RecCli {
    private rfs: RecFileSystem;
    private rfc: RecFileCache = new RecFileCache();
    private rl: Interface;

    private client?: PanDavClient;
    private pfs?: PanDavFileSystem;

    private interrupted = false;
    private interruptCount = 0;

    private running = false;

    constructor(api: RecAPI, client?: PanDavClient, nonInteractive?: boolean) {
        this.rfs = new RecFileSystem(api);
        this.rl = readline.createInterface({
            // if nonInteractive, use a readable stream that does nothing
            input: nonInteractive ? new Readable({ read() { } }) : process.stdin,
            output: nonInteractive ? new Writable({ write() { } }) : process.stdout,
            prompt: "/[/]> ",
            completer: (line, callback) => this.completer(line, callback),
            terminal: true
        });
        this.rl.on("line", (line) => this.parseLine(line));
        this.rl.on("SIGINT", () => this.interrupt());
        this.rl.on("close", () => exit(0));
        this.client = client;
        this.pfs = client ? new PanDavFileSystem(client) : undefined;
    }

    public run(): void {
        this.rl.prompt();
    }

    private async parseCommand(cmd: string, args: string[]): Promise<void> {
        // if cmd is undefined, return
        if (!cmd) return;

        // if not in commands, throw error
        if (!(cmd in commands)) {
            throw new Error(`Unknown command: ${cmd}`);
        }

        // switch case to handle different commands
        switch (cmd) {
            case "ls": {
                const src = args[0] ?? ".";
                const ls = await this.rfs.ls(src);
                if (!ls.stat) {
                    throw new Error(`ls: ${ls.msg}`);
                }
                // name size download upload creator lastModified
                const formatter = new TableFormatter([
                    { name: "name", width: 40 },
                    { name: "type", width: 8 },
                    { name: "size", width: 10 },
                    { name: "download", width: 10 },
                    { name: "upload", width: 10 },
                    { name: "creator", width: 10 },
                    { name: "lastModified", width: 20 }
                ]);
                const data = ls.data.map((f) => ({
                    name: { value: f.name, color: f.type === "folder" ? "blue" : "green" },
                    type: { value: f.type },
                    size: { value: byteToSize(f.size) },
                    download: { value: f.role.download },
                    upload: { value: f.role.upload },
                    creator: { value: f.creator },
                    lastModified: { value: f.lastModified }
                }));
                console.log(formatter.formatTable(data));
                // update cache
                this.rfc.updateCacheFolder(resolveRecFullPath(this.rfs, src), ls.data.map(f => ({
                    name: f.name,
                    type: f.type,
                    children: undefined
                })));
                break;
            }
            case "lsp": {
                const src = args[0] ?? ".";
                const ls = await this.rfs.ls(src);
                if (!ls.stat) {
                    throw new Error(`ls: ${ls.msg}`);
                }
                ls.data.forEach((f) => {
                    console.log(f.name + (f.type === "folder" ? "/" : ""));
                });
                // update cache
                this.rfc.updateCacheFolder(resolveRecFullPath(this.rfs, src), ls.data.map(f => ({
                    name: f.name,
                    type: f.type,
                    children: undefined
                })));
                break;
            }
            case "lsw": {
                const src = args[0] ?? ".";
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const ls = await this.pfs.ls(src);
                if (!ls.stat) {
                    throw new Error(`lsw: ${ls.msg}`);
                }
                // name size download upload creator lastModified
                const formatter = new TableFormatter([
                    { name: "name", width: 40 },
                    { name: "type", width: 8 },
                    { name: "size", width: 10 },
                    { name: "download", width: 10 },
                    { name: "upload", width: 10 },
                    { name: "creator", width: 10 },
                    { name: "lastModified", width: 20 }
                ]);
                const data = ls.data.map((f) => ({
                    name: { value: f.basename, color: f.type === "folder" ? "blue" : "green" },
                    type: { value: f.type === "folder" ? "folder" : "file" },
                    size: { value: byteToSize(f.size) },
                    download: { value: null },
                    upload: { value: null },
                    creator: { value: null },
                    lastModified: { value: f.lastmod }
                }));
                console.log(formatter.formatTable(data));
                break;
            }
            case "cd": {
                const path = args[0] ?? "/";
                const cd = await this.rfs.cd(path);
                if (!cd.stat) {
                    throw new Error(`cd: ${cd.msg}`);
                }
                break;
            }
            case "cdw": {
                const folder = args[0] ?? "/";
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const cdw = await this.pfs.cd(folder);
                if (!cdw.stat) {
                    throw new Error(`cdw: ${cdw.msg}`);
                }
                break;
            }
            case "cp": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const cp = await this.rfs.cp(src, dst);
                if (!cp.stat) {
                    throw new Error(`cp: ${cp.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "cpw": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const cp = await this.pfs.cp(src, dst);
                if (!cp.stat) {
                    throw new Error(`cpw: ${cp.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "mv": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const mv = await this.rfs.mv(src, dst);
                if (!mv.stat) {
                    throw new Error(`mv: ${mv.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, src), false);
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "mvw": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const mv = await this.pfs.mv(src, dst);
                if (!mv.stat) {
                    throw new Error(`mvw: ${mv.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, src), false);
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "rm": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const rm = await this.rfs.rm(path);
                if (!rm.stat) {
                    throw new Error(`rm: ${rm.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "rmw": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const rm = await this.pfs.rm(path);
                if (!rm.stat) {
                    throw new Error(`rmw: ${rm.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "mkdir": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const mkdir = await this.rfs.mkdir(path);
                if (!mkdir.stat) {
                    throw new Error(`mkdir: ${mkdir.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "mkdirw": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const mkdir = await this.pfs.mkdir(path);
                if (!mkdir.stat) {
                    throw new Error(`mkdirw: ${mkdir.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "rmdir": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const rmdir = await this.rfs.rm(path);
                if (!rmdir.stat) {
                    throw new Error(`rmdir: ${rmdir.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "rmdirw": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const rmdir = await this.pfs.rm(path);
                if (!rmdir.stat) {
                    throw new Error(`rmdirw: ${rmdir.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "unwrap": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const unwrap = await this.rfs.unwrap(path);
                if (!unwrap.stat) {
                    throw new Error(`unwrap: ${unwrap.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "unwrapw": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const unwrap = await this.pfs.unwrap(path);
                if (!unwrap.stat) {
                    throw new Error(`unwrapw: ${unwrap.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                break;
            }
            case "recycle": {
                const path = args[0];
                if (!path) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const recycle = await this.rfs.recycle(path);
                if (!recycle.stat) {
                    throw new Error(`recycle: ${recycle.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, path), false);
                this.rfc.clearCache(resolveRecFullPath(this.rfs, "/recycle"), true);
                break;
            }
            case "restore": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const restore = await this.rfs.restore(src, dst);
                if (!restore.stat) {
                    throw new Error(`restore: ${restore.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, src), false);
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "rename": {
                const src = args[0];
                const name = args[1];
                if (!src || !name) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const rename = await this.rfs.rename(src, name);
                if (!rename.stat) {
                    throw new Error(`rename: ${rename.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, src), false);
                break;
            }
            case "renamew": {
                const src = args[0];
                const name = args[1];
                if (!src || !name) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const rename = await this.pfs.rename(src, name);
                if (!rename.stat) {
                    throw new Error(`renamew: ${rename.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, src), false);
                break;
            }
            case "upload": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const upload = await this.rfs.upload(resolveFullPath(src), dst);
                if (!upload.stat) {
                    throw new Error(`upload: ${upload.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "download": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const download = await this.rfs.download(src, resolveFullPath(dst));
                if (!download.stat) {
                    throw new Error(`download: ${download.msg}`);
                }
                break;
            }
            case "transfer": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                if (!this.client) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const transfer = await this.rfs.transfer(src, dst, this.client);
                if (!transfer.stat) {
                    throw new Error(`transfer: ${transfer.msg}`);
                }
                break;
            }
            case "save": {
                const src = args[0];
                const dst = args[1];
                if (!src || !dst) {
                    throw new Error(`Usage: ${commands[cmd].usage}`);
                }
                const save = await this.rfs.save(src, dst);
                if (!save.stat) {
                    throw new Error(`save: ${save.msg}`);
                }
                this.rfc.clearCache(resolveRecFullPath(this.rfs, dst), true);
                break;
            }
            case "whoami": {
                const user = await this.rfs.whoami();
                if (!user.stat) {
                    throw new Error(`whoami: ${user.msg}`);
                }
                console.log(`Gid: ${user.data.gid}`);
                console.log(`User: ${user.data.name}`);
                console.log(`Email: ${user.data.email}`);
                break;
            }
            case "groups": {
                const groups = await this.rfs.groups();
                if (!groups.stat) {
                    throw new Error(`groups: ${groups.msg}`);
                }
                // 分别输出所有 group 的详细信息
                groups.data.forEach((group) => {
                    console.log(`Number: ${group.number}`);
                    console.log(`Name: ${group.name}`);
                    console.log(`Owner: ${group.owner}`);
                    console.log(`Members: ${group.members}`);
                    console.log(`Create time: ${group.createTime}`);
                    console.log();
                });
                break;
            }
            case "df": {
                const df = await this.rfs.df();
                if (!df.stat) {
                    throw new Error(`df: ${df.msg}`);
                }
                console.log(`User disk usage: ${byteToSize(df.data.user.usedBytes)} / ${byteToSize(df.data.user.totalBytes)}`);
                console.log(`Group disk usage: ${byteToSize(df.data.group.usedBytes)} / ${byteToSize(df.data.group.totalBytes)}`);
                break;
            }
            case "du": {
                const path = args[0] ?? ".";
                const du = await this.rfs.du(path);
                if (!du.stat) {
                    throw new Error(`du: ${du.msg}`);
                }
                console.log(`${byteToSize(du.data)}    ${path}`);
                break;
            }
            case "duw": {
                const path = args[0] ?? ".";
                if (!this.pfs) {
                    throw new Error("Please first login to Pan WebDav with 'webdav-login' command.");
                }
                const du = await this.pfs.du(path);
                if (!du.stat) {
                    throw new Error(`duw: ${du.msg}`);
                }
                console.log(`${byteToSize(du.data)}    ${path}`);
                break;
            }
            case "help": {
                const cmd = args[0];
                if (cmd) {
                    if (cmd in commands) {
                        const info = commands[cmd];
                        console.log(`${cmd}:`);
                        console.log(`  Description: ${info.desc}`);
                        console.log(`  Usage: ${info.usage}`);
                        console.log(`  Arguments: ${info.args}\n`);
                    }
                } else {
                    console.log("Available commands:\n");
                    for (const [cmd, info] of Object.entries(commands)) {
                        console.log(`${cmd}:`);
                        console.log(`  Description: ${info.desc}`);
                        console.log(`  Usage: ${info.usage}`);
                        console.log(`  Arguments: ${info.args}\n`);
                    }
                }
                break;
            }
            case "clear": {
                console.clear();
                break;
            }
            case "exit": {
                exit(0);
            }
            default: {
                throw new Error(`Unknown command: ${cmd}`);
            }
        }
    }

    public async parseLine(line: string, nonInteractive?: boolean): Promise<void> {
        // 1. handle interrupt
        // interrupted and line is empty
        if (this.interrupted) {
            if (!line) {
                // double Ctrl+C to exit
                if (++this.interruptCount > 1) {
                    exit(0);
                }

                // prompt the user on how to exit
                console.log("(To exit, press Ctrl+C again or Ctrl+D or type 'exit')");
            } else // reset interrupt count
                this.interruptCount = 0;
        } else { // reset interrupt count
            this.interruptCount = 0;
            // 2. parse command and handle error
            // if there is any command running, then ignore the input
            if (this.running) return;
            try {
                // begin running
                this.running = true;
                const [cmd, ...args] = parseShellCommand(line);
                await this.parseCommand(cmd, args);
            } catch (err) {
                console.log(String(err));
            } finally {
                // end running
                this.running = false;
            }
        }

        // 3. update prompt
        if (nonInteractive || this.running) return;
        const pwd = this.rfs.pwd();
        const cwd = pwd.stat ? pwd.data : "/";
        if (!this.pfs) {
            this.rl.setPrompt(cwd + "> ");
        } else {
            const pwdw = this.pfs.pwd();
            const cwdw = pwdw.stat ? pwdw.data : "/";
            this.rl.setPrompt(`${cwd}[${cwdw}]> `);
        }
        this.rl.prompt();
    }

    private interrupt(): void {
        // set interrupted flag
        this.interrupted = true;

        // new line to skip the current line
        this.rl.write("\n");
        // clear the current line
        readline.clearLine(process.stdout, 0);
        // move cursor to the beginning of the line
        readline.cursorTo(process.stdout, 0);

        // reset interrupted flag
        this.interrupted = false;

        // prompt again
        if (this.running) return;
        this.rl.prompt();
    }

    private getCommandCompletions(cmd: string): string[] {
        return Object.keys(commands).filter(c => c.startsWith(cmd) && c !== cmd);
    }

    // arg is the last argument, may be empty or incomplete
    // type is "rfs" or "fs", "rfs" means the path is in the rec file system, "fs" means the path is in the local file system, "pfs" means the path is in the pan dav file system
    private async getPathCompletions(arg: string, type: "rfs" | "fs" | "pfs"): Promise<string[]> {
        try {
            // support space in file name
            arg = unescapeFromShell(arg);
            // get the directory path and file prefix
            const dirPath = arg.slice(0, arg.lastIndexOf("/") + 1) ?? "./";
            const filePrefix = arg.slice(arg.lastIndexOf("/") + 1) ?? "";

            // define the file type
            type File = {
                name: string,
                type: FileType
            }

            if (type === "rfs") {
                // find result in cache no recursion here
                const cachePath = resolveRecFullPath(this.rfs, dirPath);
                const cache = this.rfc.listCacheFolder(cachePath);

                let files: File[];

                if (cache)
                    files = cache;
                else {
                    const ls = await this.rfs.ls(dirPath);

                    if (!ls.stat) {
                        return [];
                    }

                    // update cache
                    this.rfc.updateCacheFolder(cachePath, ls.data.map(f => ({
                        name: f.name,
                        type: f.type,
                        // children must be undefined, because we need children to find whether it's an empty folder or a folder not cached
                        children: undefined
                    })));

                    files = ls.data;
                }

                return files.map(f => f.name + (f.type === "folder" ? "/" : ""))
                    .filter(f => f.startsWith(filePrefix) && f !== filePrefix)
                    .map(f => dirPath + f)
                    // support space in file name
                    .map(f => escapeToShell(f));
            } else if (type === "fs") {
                // resolve the path
                const path = resolveFullPath(dirPath);
                const files: File[] = [];

                const entries = fs.readdirSync(path, { withFileTypes: true });

                // iterate over the entries to get the files and directories
                for (const entry of entries) {
                    if (entry.isFile()) {
                        files.push({ name: entry.name, type: "file" });
                    } else if (entry.isDirectory()) {
                        files.push({ name: entry.name, type: "folder" });
                    }
                }

                // show hidden files if the prefix starts with "."
                const showHidden = filePrefix.startsWith(".");

                // filter the files based on the prefix
                return files.map(f => f.name + (f.type === "folder" ? "/" : ""))
                    .filter(f => f.startsWith(filePrefix) && f !== filePrefix)
                    .filter(f => showHidden || !f.startsWith("."))
                    .map(f => dirPath + f)
                    // support space in file name
                    .map(f => escapeToShell(f));
            } else if (type === "pfs") {
                // if no client, return empty completions
                if (!this.client) {
                    return [];
                }

                // no need to check path, because only absolute path is supported
                const files: File[] = [];
                const pwd = this.pfs!.pwd();
                const cwd = pwd.stat ? pwd.data : "/";
                const path = cwd.endsWith("/") ? cwd + dirPath : cwd + "/" + dirPath;
                const directoryContents = await this.client.getDirectoryContents(path);
                const entries = "data" in directoryContents ? directoryContents.data : directoryContents;

                // iterate over the entries to get the files and directories
                for (const entry of entries) {
                    if (entry.type === "file") {
                        files.push({ name: entry.basename, type: "file" });
                    } else if (entry.type === "directory") {
                        files.push({ name: entry.basename, type: "folder" });
                    }
                }

                // show hidden files if the prefix starts with "."
                const showHidden = filePrefix.startsWith(".");

                // filter the files based on the prefix
                return files.map(f => f.name + (f.type === "folder" ? "/" : ""))
                    .filter(f => f.startsWith(filePrefix) && f !== filePrefix)
                    .filter(f => showHidden || !f.startsWith("."))
                    .map(f => dirPath + f)
                    // support space in file name
                    .map(f => escapeToShell(f));
            }
        } catch (err) {
            // if error, return empty completions
            return [];
        }
        return [];
    }

    private async getCompletionResult(line: string): Promise<CompletionResult> {
        const emptyResult = {
            prefix: line,
            suffix: "",
            completions: []
        };

        // 1. first parse the command
        const [cmd, ...args] = parseShellCommand(line);

        // last arg with possible space
        const lastArgOriginal = escapeToShell(args[args.length - 1] ?? "");

        const isLastCharSpace = line[line.length - 1] === " " && line[line.length - 2] !== "\\";
        // if the last char is space, then the prefix is the whole line
        // otherwise, the prefix is the line without the last argument
        const prefix = isLastCharSpace ? line : line.slice(0, line.lastIndexOf(lastArgOriginal));
        // if the last char is space, then the suffix is empty
        // otherwise, the suffix is the last argument
        const suffix = isLastCharSpace ? "" : lastArgOriginal;
        // args length, if the last char is space, then add 1
        const len = args.length + (isLastCharSpace ? 1 : 0);

        // if len is 0, it's command completion
        if (len === 0) {
            return {
                prefix: "",
                suffix: cmd,
                completions: this.getCommandCompletions(cmd)
            };
        }

        // 3. given that the command is valid, find the possible completions
        switch (cmd) {
            // len === 1 and only directory
            case "ls":
            case "lsp":
            case "cd":
            case "mkdir":
            case "rmdir":
            case "unwrap":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: (await this.getPathCompletions(suffix, "rfs")).filter(c => c.endsWith("/"))
                        };
                    }
                    break;
                }
            case "lsw":
            case "cdw":
            case "mkdirw":
            case "rmdirw":
            case "unwrapw":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: (await this.getPathCompletions(suffix, "pfs")).filter(c => c.endsWith("/"))
                        };
                    }
                    break;
                }
            // len === 1 and file or directory
            case "rm":
            case "recycle":
            case "rename":
            case "du":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: await this.getPathCompletions(suffix, "rfs")
                        };
                    }
                    break;
                }
            case "rmw":
            case "renamew":
            case "duw":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: await this.getPathCompletions(suffix, "pfs")
                        };
                    }
                    break;
                }
            // len === 1 and file or directory
            // len === 2 and only directory
            case "cp":
            case "mv":
            case "restore":
            case "save":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: await this.getPathCompletions(suffix, "rfs")
                        };
                    } else if (len === 2) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: (await this.getPathCompletions(suffix, "rfs")).filter(c => c.endsWith("/"))
                        };
                    }
                    break;
                }
            case "cpw":
            case "mvw":
                {
                    if (len === 1) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: await this.getPathCompletions(suffix, "pfs")
                        };
                    } else if (len === 2) {
                        return {
                            prefix: prefix,
                            suffix: suffix,
                            completions: (await this.getPathCompletions(suffix, "pfs")).filter(c => c.endsWith("/"))
                        };
                    }
                    break;
                }
            // len === 1 and file in local fs
            // len === 2 and only directory
            case "upload": {
                if (len === 1) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: await this.getPathCompletions(suffix, "fs")
                    };
                } else if (len === 2) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: (await this.getPathCompletions(suffix, "rfs")).filter(c => c.endsWith("/"))
                    };
                }
                break;
            }
            // len === 1 and file or directory
            // len === 2 and only directory in local fs
            case "download": {
                if (len === 1) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: await this.getPathCompletions(suffix, "rfs")
                    };
                } else if (len === 2) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: (await this.getPathCompletions(suffix, "fs")).filter(c => c.endsWith("/"))
                    };
                }
                break;
            }
            // len === 1 and file or directory
            // len === 2 and only directory in pan dav fs
            case "transfer": {
                if (len === 1) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: await this.getPathCompletions(suffix, "rfs")
                    };
                } else if (len === 2) {
                    return {
                        prefix: prefix,
                        suffix: suffix,
                        completions: (await this.getPathCompletions(suffix, "pfs")).filter(c => c.endsWith("/"))
                    };
                }
                break;
            }
            // len === 1 and cmd
            case "help": {
                return {
                    prefix: prefix,
                    suffix: suffix,
                    completions: this.getCommandCompletions(suffix)
                }
            }
            // len === 0
            case "whoami":
            case "groups":
            case "df":
            case "exit":
            default: {
                // if the command is not handled, return empty completions
                return emptyResult;
            }
        }

        // if no completions, return empty completions
        return emptyResult;
    }

    private completer(line: string, callback: (err?: null | Error, result?: CompleterResult) => void): void {
        (async () => {
            try {

                const { prefix, suffix, completions } = await this.getCompletionResult(line);

                if (completions.length === 0)
                    // if no completions, return the line
                    return callback(null, [completions, line]);

                // find the common prefix
                const commonPrefix = completions.reduce((prev, curr) => {
                    let i = 0;
                    while (i < prev.length && i < curr.length && prev[i] === curr[i]) {
                        i++;
                    }
                    return prev.slice(0, i);
                }, completions[0]);

                if (commonPrefix.length === 0)
                    // if common prefix is empty, return the completions
                    callback(null, [completions, line]);
                else if (suffix === commonPrefix)
                    // if common prefix is the same as the suffix, return the completions without the common prefix
                    callback(null, [completions.map(c => c.slice(commonPrefix.length)), line]);
                else
                    // if common prefix is not empty, return the completions with the common prefix
                    callback(null, [completions.map(c => prefix + c), line]);

            } catch (error) {
                if (error instanceof Error) {
                    callback(error);
                } else {
                    callback(new Error(String(error)));
                }
            }
        })();
    }

}

export default RecCli;