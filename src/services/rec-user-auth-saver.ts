import fs from "fs"
import crypto from 'crypto';
import { homedir } from "os";
import { UserAuth } from "@services/rec-api"

const dirPath = `${homedir()}/.reccli-ts`;

function getFileName(account: string): string {
    return crypto.createHash('sha256').update(account).digest('hex');
}

// read user auth from file "~/.reccli-ts"
function getUserAuth(account: string): UserAuth | undefined {
    const path = `${dirPath}/${getFileName(account)}`;
    if (!fs.existsSync(path)) return undefined;
    const userAuth = JSON.parse(fs.readFileSync(path, 'utf8'));
    return userAuth;
}

function setUserAuth(account: string, userAuth: UserAuth) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    const path = `${dirPath}/${getFileName(account)}`;
    // don't save information that is not necessary
    userAuth.gid = ""; userAuth.name = ""; userAuth.username = "";
    fs.writeFileSync(path, JSON.stringify(userAuth));
}

function deleteUserAuth(account: string): boolean {
    const path = `${dirPath}/${getFileName(account)}`;
    if (!fs.existsSync(path)) return false;
    fs.unlinkSync(path);
    return true;
}

export { getUserAuth, setUserAuth, deleteUserAuth }