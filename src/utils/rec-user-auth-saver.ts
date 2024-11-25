import fs from "fs"
import { homedir } from "os";
import { UserAuth } from "./rec-api"

const dirPath = `${homedir()}/.reccli-ts`;

// read user auth from file "~/.reccli-ts"
function getUserAuth(account: string): UserAuth | undefined {
    const path = `${dirPath}/${account}`;
    if (!fs.existsSync(path)) return undefined;
    const userAuth = JSON.parse(fs.readFileSync(path, 'utf8'));
    return userAuth;
}

function setUserAuth(account: string, userAuth: UserAuth) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    const path = `${dirPath}/${account}`;
    fs.writeFileSync(path, JSON.stringify(userAuth));
}

function deleteUserAuth(account: string): boolean {
    const path = `${dirPath}/${account}`;
    if (!fs.existsSync(path)) return false;
    fs.unlinkSync(path);
    return true;
}

export { getUserAuth, setUserAuth, deleteUserAuth }