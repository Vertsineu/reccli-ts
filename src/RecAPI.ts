import axios, { AxiosRequestConfig, HttpStatusCode } from "axios";
import crypto from "crypto";
import fs, { Stats } from "fs";
import path from "path";

type ResponseType<T> = {
    status_code: number,
    message: string,
    entity: T
}
type RequestConfig = AxiosRequestConfig & {
    token?: boolean
};

type UserAuth = {
    gid: string,
    username: string,
    name: string,
    authToken: string,
    refreshToken: string
}

type IdUrlDictType = {
    // id with download url
    [key: string]: string
}

type ActionType = "recycle" | "delete" | "restore" | "move" | "copy";

type IdTypePairType = {
    id: string,
    type: "file" | "folder"
}

type FileType = {
    id: string, // number
    parent_id: string, // parent_number
    type: "file" | "folder" // type
    name: string, // name
    ext: string, // file_ext
    star: boolean, // is_star
    lock: boolean, // is_lock
    mtime: string, // last_update_time
    size: number, // bytes
    creater: string, // creater_user_real_name
}

type EntityType = {
    getTempTicket: {
        tempticket: string,
        expires: string
    },
    loginMsgEncrypt: {
        msg_encrypt: string
        user_id: string,
        user_token_id: number
    },
    refreshMsgEncrypt: {
        msg_encrypt: string
    },
    loginMsgServer: {
        x_auth_token: string,
        authtoken_expire_time: string,
        refresh_token: string,
        refreshtoken_expire_time: string,
        gid: string,
        username: string,
        name: string,
        avatar: string,
        email: string,
        system_time: string,
        storage: string
    },
    refreshMsgServer: {
        x_auth_token: string,
        refresh_token: string,
        authtoken_expire_time: string,
        refreshtoken_expire_time: string,
        system_time: string
    },
    listById: {
        total: number,
        datas: [
            {
                creater_user_number: string,
                creater_user_real_name: string,
                creater_user_avatar: string,
                number: string,
                parent_number: string,
                disk_type: string,
                is_history: boolean,
                name: string,
                type: "file" | "folder",
                file_ext: string,
                file_type: string,
                bytes: number | '', // string when type is folder and it's empty
                hash: string,
                transcode_status: string,
                is_star: boolean,
                is_lock: boolean,
                lock_reason: string,
                share_count: number,
                last_update_date: string,
                parent_path_number: string,
                review_status: string,
                version: number
            }
        ]
    },
    getDownloadUrlByIds: {
        // id with download url
        [key: string]: string
    },
    uploadByFolderId: {
        upload_params: [
            [
                {
                    key: string, // "binary"
                    request_type: string, // "body"
                    value: string // ""
                },
                {
                    key: string, // "url"
                    request_type: string, // "url"
                    value: string // url to upload
                },
                {
                    key: string, // "method"
                    request_type: string, // "method"
                    value: string // "PUT"
                }
            ]
        ],
        upload_chunk_size: string,
        upload_token: string,
        file_number: number | '',
        file_id: number | '',
        version: 0
    },
    getUserInfo: {
        user_type: number,
        user_group_id: number,
        user_number: string,
        gid: string,
        username: string,
        name: string,
        email: string,
        mobile: string,
        profile: string,
        gender: number,
        avatar: string,
        total_space: string,
        used_space: string,
        user_file_count: number,
        user_share_count: number,
        user_group_count: number,
        is_backup_file: boolean
    }
}

function pad(m: Buffer): Buffer {
    const paddingLength = 32 - (m.length % 32);
    const padding = Buffer.alloc(paddingLength, paddingLength);
    return Buffer.concat([m, padding]);
}

function unpad(m: Buffer): Buffer {
    const paddingLength = m[m.length - 1];
    return m.subarray(0, m.length - paddingLength);
}

class RecAPI {
    private readonly baseUrl: string = "https://recapi.ustc.edu.cn/api/v2";
    private readonly aesKey = Buffer.from("Z1pNbFZmMmVqd2wwVmlHNA==", "base64").toString("utf-8");
    private readonly signatureToken = "VZPDF6HxKyh0hhqFqY2Tk6udzlambRgK";
    private readonly clientID = "d5485a8c-fecb-11e9-b690-005056b70c02";

    private userAuth!: UserAuth;
    private refreshed: boolean = false;

    constructor() {

    }

    private async request<T = object>(config: RequestConfig): Promise<ResponseType<T>> {
        // add baseUrl to config
        config.baseURL = this.baseUrl;
        const hasToken = config.token === undefined || config.token;

        // if needs token, then add token to header
        if (hasToken) {
            if (!this.userAuth) throw new Error('User not authenticated');
            if (!config.headers) config.headers = {};
            config.headers['X-auth-token'] = this.userAuth.authToken;
        }

        let res = await axios(config).catch(err => err.response);
        if (res.status !== HttpStatusCode.Ok) 
            throw new Error(`Request failed with status ${res.status} ${res.statusText}`);
        res = res.data;

        // check token expired (401)
        if (hasToken && res.status_code === HttpStatusCode.Unauthorized) {
            // console.log("Token expired, refreshing token...");
            await this.refreshToken();
            res = await this.request(config);
        }

        return res;
    }

    private async getTempTicket(): Promise<string> {
        const res = await this.request<EntityType["getTempTicket"]>({
            method: "GET",
            url: "/client/tempticket",
            params: {
                clientid: this.clientID
            },
            token: false
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get tempticket: ${res.message}`);
        }

        return res.entity.tempticket;
    }

    private aesEncrypt(data: string): string {
        const iv = Buffer.from(this.aesKey).reverse();
        const cipher = crypto.createCipheriv('aes-128-cbc', this.aesKey, iv);

        const size = Buffer.alloc(4);
        size.writeUInt32BE(data.length, 0);  // Write the length of data in big-endian order

        const payload = Buffer.concat([size, Buffer.from(data, 'utf-8')]);
        const paddedPayload = pad(payload); // Add padding

        const encrypted = Buffer.from(cipher.update(paddedPayload));

        return Buffer.from(encrypted).toString("base64");
    }

    private aesDecrypt(data: string, headerStrip: boolean = true): string {
        const iv = Buffer.from(this.aesKey).reverse();
        const cipher = crypto.createDecipheriv('aes-128-cbc', this.aesKey, iv);
        let raw = Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.update(Buffer.alloc(16))]);
        raw = unpad(raw);

        if (headerStrip) {
            return raw.subarray(16).toString('utf-8');
        } else {
            return raw.toString('utf-8');
        }
    }

    private serializeDict(dic: { [key: string]: string }): string {
        return Object.keys(dic)
            .sort()
            .map(key => `${key}=${dic[key]}`)
            .join('&');
    }

    private async refreshToken(): Promise<void> {
        const res = await this.request<EntityType["refreshMsgEncrypt"]>({
            method: "POST",
            url: "/user/refresh/token",
            data: {
                clientid: this.clientID,
                refresh_token: this.userAuth.refreshToken
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to refresh token: ${res.message}`);
        }

        const msg_server: EntityType["refreshMsgServer"] = JSON.parse(this.aesDecrypt(res.entity.msg_encrypt, false));

        this.userAuth.authToken = msg_server.x_auth_token;
        this.userAuth.refreshToken = msg_server.refresh_token;
        this.refreshed = true;
    }

    public async login(username: string, password: string) {
        const tempticket = await this.getTempTicket();
        const loginInfo = {
            username: username,
            password: password,
            device_type: "PC",
            client_terminal_type: "client",
            type: "nusoap"
        };
        const str = "A".repeat(12) + JSON.stringify(loginInfo).replace(/:/g, ": ").replace(/,/g, ", ");
        const encryptedStr = this.aesEncrypt(str);
        let sign = this.signatureToken + this.serializeDict({
            tempticket: tempticket,
            msg_encrypt: Buffer.from(encryptedStr).toString("utf-8")
        });
        const hash = crypto.createHash('md5');
        sign = hash.update(sign).digest('hex').toUpperCase();

        const res = await this.request<EntityType["loginMsgEncrypt"]>({
            method: "POST",
            url: "/user/login",
            params: {
                tempticket: tempticket,
                sign: sign
            },
            data: {
                msg_encrypt: Buffer.from(encryptedStr).toString("utf-8")
            },
            token: false
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to login: ${res.message}`);
        }

        const msg_server: EntityType["loginMsgServer"] = JSON.parse(this.aesDecrypt(res.entity.msg_encrypt));
        this.userAuth = {
            gid: msg_server.gid,
            username: msg_server.username,
            name: msg_server.name,
            authToken: msg_server.x_auth_token,
            refreshToken: msg_server.refresh_token
        };
        this.refreshed = true;
    }

    public async listById(id: string, disk_type: string = "cloud"): Promise<FileType[]> {
        const res = await this.request<EntityType['listById']>({
            method: "GET",
            url: `/folder/content/${id}`,
            params: {
                "is_rec": "false",
                "category": "all",
                "disk_type": disk_type,
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to list by id: ${res.message}`);
        }

        return res.entity.datas.map(data => ({
                id: data.number,
                parent_id: data.parent_number,
                type: data.type,
                name: data.name,
                ext: data.file_ext,
                star: data.is_star,
                lock: data.is_lock,
                mtime: data.last_update_date,
                size: Number(data.bytes),
                creater: data.creater_user_real_name
            })
        );
        
    }

    public async getDownloadUrlByIds(ids: string[]): Promise<IdUrlDictType> {
        const res = await this.request<EntityType["getDownloadUrlByIds"]>({
            method: "POST",
            url: "/download",
            data: {
                files_list: ids
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get download url by id: ${res.message}`);
        }

        return res.entity;
    }

    public async uploadByFolderId(folderId: string, file_path: string): Promise<void> {
        let fileStat: Stats;
        try {
            fileStat = fs.statSync(file_path);
            if (fileStat.isDirectory()) {
                throw new Error("Cannot upload a directory");
            }
        } catch (err) {
            throw err;
        }
        
        // 1. request for upload token and url
        const res = await this.request<EntityType["uploadByFolderId"]>({
            method: "GET",
            url: `/file/${folderId}`,
            params: {
                file_name: path.basename(file_path),
                byte: fileStat.size,
                storage: "moss",
                disk_type: "cloud"
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to upload by folder id: ${res.message}`);
        }

        const uploadToken = res.entity.upload_token;
        const uploadChunkSize = Number(res.entity.upload_chunk_size);
        
        // 2 upload file
        const fileStream = fs.createReadStream(file_path, { highWaterMark: uploadChunkSize });
        let idx = 0;
        for await (const chunk of fileStream) {
            const uploadParams = res.entity.upload_params[idx++];
            if (!uploadParams) break;
            console.log(`Uploading chunk ${idx - 1}`);

            const uploadUrl = uploadParams[1].value;
            const uploadMethod = uploadParams[2].value;

            await this.request({
                method: uploadMethod,
                url: uploadUrl,
                data: chunk,
            })
        }
        // 3. upload complete
        const res2 = await this.request({
            method: "POST",
            url: "/file/complete",
            data: {
                upload_token: uploadToken
            }
        });

        if (res2.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to upload by folder id: ${res2.message}`);
        }

        console.log("Upload complete");
    }

    public async operationByIdType(action: ActionType, src: IdTypePairType[], destId: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/operationFileOrFolder",
            data: {
                action: action,
                disk_type: "cloud",
                files_list: src.map(item => ({
                                number: item.id,
                                type: item.type
                            })),
                number: destId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to operation by id: ${res.message}`);
        }
    }

    public async renameByIdType(dest: IdTypePairType, name: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/rename",
            data: {
                name: name,
                number: dest.id,
                type: dest.type
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to rename by id: ${res.message}`);
        }
    }

    public async renameByIdExt(dest: IdTypePairType, name: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/rename_ext",
            data: {
                name: name,
                number: dest.id
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to rename by id: ${res.message}`);
        }
    }

    public async mkdirByFolderIds(folderId: string, names: string[]): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/folder/tree",
            data: {
                disk_type: "cloud",
                number: folderId,
                paramslist: names
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to mkdir by folder id: ${res.message}`);
        }
    }

    public async getUserInfo(): Promise<EntityType["getUserInfo"]> {
        return (await this.request<EntityType["getUserInfo"]>({
            method: "GET",
            url: "/userinfo"
        })).entity;
    }

}

export default RecAPI;