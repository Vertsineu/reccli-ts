#!/usr/bin/env node

import RecAPI from "@services/rec-api";
import * as saver from "@services/rec-user-auth-saver";
import RecCli from "@services/rec-cli";
import { Command } from "commander";
import inquirer from "inquirer";
import { version } from "../package.json";
import { exit } from "process";

const program = new Command();

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
                saver.setUserAuth(isDefault ? undefined : account, userAuth);
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
    .command("run")
    .option("-a, --account <account>", "student ID")
    .option("-c, --commands <command...>", "commands to run")
    .description("run the Rec Cloud Service CLI")
    .action(async (options) => {
        const account = options.account;
        const lines: string[] = options.commands;

        const userAuth = saver.getUserAuth(account);
        const api = new RecAPI(userAuth, (userAuth) => {
            saver.setUserAuth(account, userAuth);
        });

        // non-interactive mode
        if (lines) {
            const cli = new RecCli(api, true);
            // Run the commands and exit
            for (const line of lines) {
                await cli.parseLine(line, true);
            }
            exit(0);
        }

        const cli = new RecCli(api);
        cli.run();
    });

program.parse(process.argv);