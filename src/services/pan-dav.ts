import { createClient, WebDAVClient, FileStat } from "webdav";

const baseUrl = "https://pan.ustc.edu.cn/seafdav/";

export type PanDavAuth = {
    username: string;
    password: string;
}

export interface PanDavClient extends WebDAVClient {
    panDavAuth: PanDavAuth;
    getPanDavAuth: () => PanDavAuth;
}

export function createPanDavClient(auth: PanDavAuth): PanDavClient {
    const client = createClient(baseUrl, {
        username: auth.username,
        password: auth.password
    }) as PanDavClient;
    // for worker
    client.panDavAuth = auth;
    client.getPanDavAuth = () => auth;
    return client;
}