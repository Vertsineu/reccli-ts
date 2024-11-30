import fs from "fs"
import crypto from 'crypto';
import { homedir } from "os";
import { UserAuth } from "@services/rec-api"

const dirPath = `${homedir()}/.reccli-ts`;
const defaultPath = dirPath + "/default";

function getFileName(account: string): string {
    return crypto.createHash('sha256').update(account).digest('hex');
}

// read user auth from file "~/.reccli-ts"
function getUserAuth(account: string | undefined): UserAuth | undefined {
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    if (!fs.existsSync(path)) return undefined;
    const userAuth = JSON.parse(Buffer.from(fs.readFileSync(path, 'utf8'), 'base64').toString());
    return userAuth;
}

function setUserAuth(account: string | undefined, userAuth: UserAuth) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    // don't save information that is not necessary
    userAuth.gid = ""; userAuth.name = ""; userAuth.username = "";
    fs.writeFileSync(path, Buffer.from(JSON.stringify(userAuth)).toString('base64'));
}

function deleteUserAuth(account: string | undefined): boolean {
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    if (!fs.existsSync(path)) return false;
    fs.unlinkSync(path);
    return true;
}

export { getUserAuth, setUserAuth, deleteUserAuth }