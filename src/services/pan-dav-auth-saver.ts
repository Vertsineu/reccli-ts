import fs from "fs"
import crypto from 'crypto';
import { homedir } from "os";
import { PanDavAuth } from "@services/pan-dav-api.js"

const dirPath = `${homedir()}/.reccli-ts`;
const defaultPath = dirPath + "/pandav-default";

function getFileName(account: string): string {
    return crypto.createHash('sha256').update(account).digest('hex') + '-pandav';
}

// read pan-dav auth from file "~/.reccli-ts"
function getPanDavAuth(account: string | undefined): PanDavAuth | undefined {
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    if (!fs.existsSync(path)) return undefined;
    const panDavAuth = JSON.parse(Buffer.from(fs.readFileSync(path, 'utf8'), 'base64').toString());
    return panDavAuth;
}

function setPanDavAuth(account: string | undefined, panDavAuth: PanDavAuth) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    // save username and password for webdav authentication
    fs.writeFileSync(path, Buffer.from(JSON.stringify(panDavAuth)).toString('base64'));
}

function deletePanDavAuth(account: string | undefined): boolean {
    const path = account ? `${dirPath}/${getFileName(account)}` : defaultPath;
    if (!fs.existsSync(path)) return false;
    fs.unlinkSync(path);
    return true;
}

export { getPanDavAuth, setPanDavAuth, deletePanDavAuth }
