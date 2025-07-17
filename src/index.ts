#!/usr/bin/env node

import RecAPI from "@services/rec-api.js";
import * as userAuthSaver from "@services/rec-user-auth-saver.js";
import * as panDavAuthSaver from "@services/pan-dav-auth-saver.js";
import { createPanDavClient, PanDavAuth } from "@services/pan-dav-api.js";
import RecCli from "@services/rec-cli.js";
import { Command } from "commander";
import inquirer from "inquirer";
import { exit } from "process";
import { createRequire } from "module";

const program = new Command();
const version = createRequire(import.meta.url)("../package.json").version;

program
    .name("reccli-ts")
    .description("This is a command line interface for the Rec Cloud Service")
    .version(version);

program
    .command("login")
    .option("-a, --account <account>", "student ID")
    .option("-d, --default", "set this account as the default account")
    .description("login to Rec Cloud Service using student ID and password")
    .action(async (options) => {
        try {
            console.log("Welcome to Rec Cloud Service CLI!");

            const account = options.account ?? (await inquirer.prompt([
                {
                    type: "input",
                    name: "account",
                    message: "Enter your student ID:",
                },
            ])).account;

            const password = (await inquirer.prompt([
                {
                    type: "password",
                    name: "password",
                    message: "Enter your password:",
                    mask: "*", // mask the password with "*"
                },
            ])).password;

            const isDefault = options.default ?? false;

            console.log(`Logging in with account: ${account}`);

            const api = new RecAPI(undefined, (userAuth) => {
                userAuthSaver.setUserAuth(isDefault ? undefined : account, userAuth);
                console.log("Your token has been successfully saved.");
            });

            await api.login(account, password);

        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error: ${error.message}`);
            } else {
                console.error(`Error: ${error}`);
            }
        }
    });

program
    .command("webdav-login")
    .option("-a, --account <account>", "account")
    .option("-d, --default", "set this account as the default account")
    .description("login to Pan Webdav Service using account and password")
    .action(async (options) => {
        try {
            console.log("Welcome to Pan WebDav Service Login!");

            const account = options.account ?? (await inquirer.prompt([
                {
                    type: "input",
                    name: "account",
                    message: "Enter your Pan Webdav account:",
                },
            ])).account;

            const password = (await inquirer.prompt([
                {
                    type: "password",
                    name: "password",
                    message: "Enter your Pan Webdav password:",
                    mask: "*", // mask the password with "*"
                },
            ])).password;

            const isDefault = options.default ?? false;

            console.log(`Logging in with account: ${account}`);

            const panDavAuth: PanDavAuth = {
                username: account,
                password: password,
            };

            const client = createPanDavClient(panDavAuth);
            try {
                // Verify WebDav credentials by checking if the root directory exists
                await client.exists("/");
                console.log("WebDav credentials verified successfully.");

            } catch (webdavError) {
                console.error("WebDav credentials verification failed:", webdavError);
                return;
            }

            // Save WebDav credentials if verification succeeds
            panDavAuthSaver.setPanDavAuth(isDefault ? undefined : account, panDavAuth);
            console.log("Your WebDav credentials have been successfully saved.");
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error: ${error.message}`);
            } else {
                console.error(`Error: ${error}`);
            }
        }
    });



program
    .command("run")
    .option("-a, --account <account>", "student ID")
    .option("-p, --pan-dav-account <pandav>", "Pan WebDav account")
    .option("-c, --commands <command...>", "commands to run")
    .description("run the Rec Cloud Service CLI")
    .action(async (options) => {
        const account = options.account;
        const panDavAccount = options.panDavAccount;
        const lines: string[] = options.commands;

        const userAuth = userAuthSaver.getUserAuth(account);
        const api = new RecAPI(userAuth, (userAuth) => {
            userAuthSaver.setUserAuth(account, userAuth);
        });

        const panDavAuth = panDavAuthSaver.getPanDavAuth(panDavAccount);
        const client = panDavAuth ? createPanDavClient(panDavAuth) : undefined;

        // non-interactive mode
        if (lines) {
            const cli = new RecCli(api, client, true);
            // Run the commands and exit
            for (const line of lines) {
                await cli.parseLine(line, true);
            }
            exit(0);
        }

        const cli = new RecCli(api, client);
        cli.run();
    });

program.parse(process.argv);