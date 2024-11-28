import axios, { AxiosRequestConfig, HttpStatusCode } from "axios";
import crypto from "crypto";
import fs, { Stats } from "fs";
import path from "path";

export type ActionType = "recycle" | "delete" | "restore" | "move" | "copy";
export type FileType = "file" | "folder";
export type DiskType = "cloud" | "backup" | "recycle";

export type ResponseType<T> = {
    status_code: number,
    message: string,
    entity: T
}
export type RequestConfig = AxiosRequestConfig & {
    token?: boolean
};

export type UserAuth = {
    gid: string,
    username: string,
    name: string,
    authToken: string,
    refreshToken: string
}

export type IdTypePairType = {
    id: string,
    type: FileType
}

export type EntityType = {
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
                disk_type: DiskType,
                is_history: boolean,
                name: string,
                type: FileType,
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
        // md5 fingerprint not matched
        fail: {
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
        // md5 fingerprint matched
        succeed: {
            id: string,
            number: string,
            file_name: string,
            file_ext: string,
            file_size: number,
            version: number,
            file_number: string,
            file_id: string
        }
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
    },
    getSpaceInfo: {
        self_used_space: number,
        self_total_space: number,
        group_total_space: number,
        group_used_space: number
    },
    getGroups: {
        total: number,
        datas: [
            {
                group_number: string,
                group_name: string,
                group_logo: string,
                group_banner: string,
                group_description: string,
                group_created_date: string,
                group_is_public: boolean,
                group_is_open_publish: boolean,
                group_is_auto_audit_mem_add: string,
                group_is_review: string,
                group_review_description: string,
                group_member_identity: string,
                group_member_is_agree_protocol: boolean,
                group_category_number: string,
                group_category_name: string,
                group_creater_number: string,
                group_creater_name: string,
                group_creater_avatar: string,
                group_owner_number: string,
                group_owner_name: string,
                group_owner_avatar: string,
                group_memeber_count: number,
                group_pending_member_count: number,
                group_resource_report_count: number,
                group_file_count: number,
                group_share_file_count: number,
                group_resource_count: number,
                group_topic_count: number
            }
        ]
    },
    getGroupInfoByGroupId: {
        group_number: number,
        group_name: string,
        group_logo: string,
        group_banner: string,
        group_description: string,
        group_category_number: number,
        group_category_name: string,
        group_created_date: string,
        group_creater_number: string,
        group_creater_name: string,
        group_creater_avatar: string,
        group_owner_number: string,
        group_owner_name: string,
        group_owner_avatar: string,
        group_memeber_count: number,
        group_file_count: number,
        group_share_file_count: number,
        group_resource_count: number,
        group_topic_count: number,
        group_pending_member_count: number,
        group_resource_report_count: number,
        group_is_auto_audit_mem_add: boolean,
        group_is_public: boolean,
        group_is_review: string,
        group_review_description: string,
        group_is_open_publish: boolean,
        group_member_identity: string,
        group_member_is_agree_protocol: boolean,
        group_tags_list: [
            {
                tag_number: string,
                tag_name: string
            }
        ]
    },
    getPrivilegeByGroupId: {
        role_info: {
            id: number,
            role_name: string,
            group_id: string,
            role_note: string,
            created_id: string,
            role_type: number,
            created_at: string,
            updated_at: string
        },
        public_operations: [ string ],
        resource_operations: [
            {
                folder_id: string,
                role_type: number
            },
        ]
    },
    findFileFromFirstLevelFolder: EntityType["listById"],
    getFileInfo: {
        file: {
            creater_user_number: string,
            creater_user_real_name: string,
            creater_user_avatar: string,
            number: string,
            parent_number: string,
            disk_type: DiskType,
            is_history: boolean,
            name: string,
            type: FileType,
            file_ext: string,
            file_type: string,
            bytes: number,
            hash: string,
            transcode_status: string,
            is_star: boolean,
            is_lock: boolean,
            lock_reason: string,
            share_count: number,
            last_update_date: string,
            parent_path_number: string,
            review_status: string,
            version_id: string,
            version: number,
            parent_path_name: string,
            folder_count: number,
            folder_file_count: number,
            folder_size: string
        },
        folder: {
            creater_user_number: string,
            creater_user_real_name: string,
            creater_user_avatar: string,
            number: string,
            parent_number: string,
            disk_type: DiskType,
            is_history: boolean,
            name: string,
            type: FileType,
            file_ext: string,
            file_type: string,
            bytes: number,
            hash: string,
            transcode_status: string,
            is_star: boolean,
            is_lock: boolean,
            lock_reason: string,
            share_count: number,
            last_update_date: {
                date: string,
                timezone_type: number,
                timezone: string
            },
            parent_path_number: string,
            review_status: string,
            version_id: string,
            version: number,
            parent_path_name: string,
            folder_count: number,
            folder_file_count: number,
            folder_size: string
        }
    },
    getRoleTypes: [
        {
            label: string,
            value: number
        }
    ],
    searchCopyJobResult: {
        id: number,
        job_id: string,
        run_percent: number,
        source_top_file_nums: number,
        source_top_folder_nums: number,
        source_file_nums: number,
        source_folder_nums: number,
        dest_file_nums: number,
        dest_folder_nums: number,
        dest_top_file_nums: number,
        dest_top_folder_nums: number,
        state: number,
        error_reason: string,
        job_type: number,
        created_at: string,
        updated_at: string,
        share_number: string,
        message: string
    },
    saveToCloud: {
        job_id: string,
        run_percent: number,
        state: number,
        message: string
    }
}

class RecAPI {
    private readonly baseUrl: string = "https://recapi.ustc.edu.cn/api/v2";
    private readonly aesKey = Buffer.from("Z1pNbFZmMmVqd2wwVmlHNA==", "base64").toString("utf-8");
    private readonly signatureToken = "VZPDF6HxKyh0hhqFqY2Tk6udzlambRgK";
    private readonly clientID = "d5485a8c-fecb-11e9-b690-005056b70c02";

    private userAuth!: UserAuth;

    /**
     * Create a RecAPI instance
     * @param initUserAuth initial userAuth 
     * @param refreshedCallback callback when token refreshed
     */
    constructor(
        // init with userAuth
        initUserAuth?: UserAuth,
        // callback when token refreshed
        private refreshedCallback?: (userAuth: UserAuth) => void
    ) {
        if (initUserAuth) this.userAuth = initUserAuth;
    }

    /**
     * Send a request with config
     * @param config request config
     * @returns response data
     */
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
        const paddedPayload = this.pad(payload); // Add padding

        const encrypted = Buffer.from(cipher.update(paddedPayload));

        return Buffer.from(encrypted).toString("base64");
    }

    private aesDecrypt(data: string, headerStrip: boolean = true): string {
        const iv = Buffer.from(this.aesKey).reverse();
        const cipher = crypto.createDecipheriv('aes-128-cbc', this.aesKey, iv);
        let raw = Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.update(Buffer.alloc(16))]);
        raw = this.unpad(raw);

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
        if (this.refreshedCallback) this.refreshedCallback(this.userAuth);
    }

    private pad(m: Buffer): Buffer {
        const paddingLength = 32 - (m.length % 32);
        const padding = Buffer.alloc(paddingLength, paddingLength);
        return Buffer.concat([m, padding]);
    }
    
    private unpad(m: Buffer): Buffer {
        const paddingLength = m[m.length - 1];
        return m.subarray(0, m.length - paddingLength);
    }

    /**
     * Login with username and password, update UserAuth
     * @param username username
     * @param password password
     */
    public async login(username: string, password: string) {
        const tempTicket = await this.getTempTicket();
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
            tempticket: tempTicket,
            msg_encrypt: Buffer.from(encryptedStr).toString("utf-8")
        });
        const hash = crypto.createHash('md5');
        sign = hash.update(sign).digest('hex').toUpperCase();

        const res = await this.request<EntityType["loginMsgEncrypt"]>({
            method: "POST",
            url: "/user/login",
            params: {
                tempticket: tempTicket,
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
        if (this.refreshedCallback) this.refreshedCallback(this.userAuth);
    }

    /**
     * List files under the folder according to the id
     * @param id folder id
     * @param diskType cloud: personal cloud, backup: backup directory, recycle: recycle bin
     * @param groupId group id
     * @returns list of files
     */
    public async listById(id: string, diskType: DiskType, groupId?: string): Promise<EntityType["listById"]> {
        const res = await this.request<EntityType['listById']>({
            method: "GET",
            url: `/folder/content/${id}`,
            params: {
                is_rec: false,
                category: "all",
                disk_type: diskType,
                group_number: groupId,
                offset: 0
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to list by id: ${res.message}`);
        }

        return res.entity;
    }

    /**
     * Get download url by ids
     * @param ids ids of files
     * @param groupId group id
     * @returns dict of id with download url
     */
    public async getDownloadUrlByIds(ids: string[], groupId?: string): Promise<EntityType["getDownloadUrlByIds"]> {
        const res = await this.request<EntityType["getDownloadUrlByIds"]>({
            method: "POST",
            url: "/download",
            data: {
                files_list: ids,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get download url by id: ${res.message}`);
        }

        return res.entity;
    }

    private calcFingerprint(filePath: string): Promise<string> {
        const chunkSize = 64 * 1024 * 1024; // 64MB

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error("Invalid file path or file does not exist.");
        }

        const fileSize = fs.statSync(filePath).size;
        const chunkHashes: string[] = [];

        const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });

        return new Promise<string>((resolve, reject) => {
            readStream
                .on("data", (chunk: Buffer) => {
                    // 对每个块计算 MD5
                    const chunkHash = crypto.createHash("md5").update(chunk).digest("hex");
                    chunkHashes.push(chunkHash);
                })
                .on("end", () => {
                    if (fileSize <= chunkSize) {
                        // 单块文件直接返回整个文件的 MD5
                        resolve(chunkHashes[0]);
                    } else {
                        // 多块文件，合并块哈希后再计算 MD5
                        const concatenatedHashes = Buffer.from(chunkHashes.join(""), "hex");
                        const finalHash = crypto.createHash("md5").update(concatenatedHashes).digest("hex") + "-" + chunkHashes.length;
                        resolve(finalHash);
                    }
                })
                .on("error", (err) => {
                    reject(err);
                });
        });
    }

    /**
     * Upload file to folder by folder id
     * @param folderId folder id
     * @param filePath upload file path
     * @param diskType cloud: personal cloud, backup: backup directory
     * @param groupId group id
     */
    public async uploadByFolderId(folderId: string, filePath: string, diskType: DiskType, groupId?: string): Promise<void> {
        let fileStat: Stats;
        try {
            fileStat = fs.statSync(filePath);
            if (fileStat.isDirectory()) {
                throw new Error("Cannot upload a directory");
            }
        } catch (err) {
            throw err;
        }

        // response differs by status_code
        type ResponseType = {
            status_code: 200
            message: string
            entity: EntityType["uploadByFolderId"]["fail"]
        } | {
            status_code: 201
            message: string
            entity: EntityType["uploadByFolderId"]["succeed"]
        };
        
        // 1. request for upload token and url
        console.log("Calculating fingerprint...");
        const res = await this.request<EntityType["uploadByFolderId"]["fail"] | EntityType["uploadByFolderId"]["succeed"]>({
            method: "GET",
            url: `/file/${folderId}`,
            params: {
                file_name: path.basename(filePath),
                byte: fileStat.size,
                storage: "moss",
                disk_type: diskType,
                group_number: groupId,
                fingerprint: await this.calcFingerprint(filePath)
            }
        }) as ResponseType;

        if (res.status_code === HttpStatusCode.Created) {
            console.log("File already created, skipping upload");
            return;
        }

        console.log("Uploading file...");

        const uploadToken = res.entity.upload_token;
        const uploadChunkSize = Number(res.entity.upload_chunk_size);
        
        // 2 upload file
        const fileStream = fs.createReadStream(filePath, { highWaterMark: uploadChunkSize });
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

    /**
     * Operate files or folders by id
     * @param action move, copy, recycle, delete, restore
     * @param src id and type of source files or folders
     * @param destId destination folder id
     * @param diskType cloud: personal cloud, backup: backup directory, recycle: recycle bin
     * @param groupId group id
     */
    public async operationByIdType(action: ActionType, src: IdTypePairType[], destId: string | undefined, diskType: DiskType, groupId?: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/operationFileOrFolder",
            data: {
                action: action,
                disk_type: diskType,
                files_list: src.map(item => ({
                                number: item.id,
                                type: item.type
                            })),
                number: destId,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to operation by id: ${res.message}`);
        }
    }

    /**
     * rename folders by id and type
     * @param dest destination id and type
     * @param name new name
     * @param groupId group id
     */
    public async renameByIdType(dest: IdTypePairType, name: string, groupId?: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/rename",
            data: {
                name: name,
                number: dest.id,
                type: dest.type,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to rename by id: ${res.message}`);
        }
    }

    /**
     * rename files by id and type
     * @param dest destination id and type
     * @param name new name
     * @param groupId group id
     */
    public async renameByIdExt(dest: IdTypePairType, name: string, groupId?: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/rename_ext",
            data: {
                name: name,
                number: dest.id,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to rename by id: ${res.message}`);
        }
    }

    /**
     * mkdir by folder id
     * @param folderId folder id
     * @param names new folder names
     * @param diskType cloud: personal cloud, backup: backup directory
     * @param groupId group id
     */
    public async mkdirByFolderIds(folderId: string, names: string[], diskType: DiskType, groupId?: string): Promise<void> {
        const res = await this.request({
            method: "POST",
            url: "/folder/tree",
            data: {
                disk_type: diskType,
                number: folderId,
                paramslist: names,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to mkdir by folder id: ${res.message}`);
        }
    }

    /**
     * Get user info
     * @returns user info
     */
    public async getUserInfo(): Promise<EntityType["getUserInfo"]> {
        return (await this.request<EntityType["getUserInfo"]>({
            method: "GET",
            url: "/userinfo"
        })).entity;
    }

    /**
     * Get space info
     * @returns space info
     */
    public async getSpaceInfo(): Promise<EntityType["getSpaceInfo"]> {
        return (await this.request<EntityType["getSpaceInfo"]>({
            method: "POST",
            url: "/group_capacit/get"
        })).entity;
    }

    /**
     * Get groups info
     * @returns groups info
     */
    public async getGroups(): Promise<EntityType["getGroups"]> {
        const res = await this.request<EntityType["getGroups"]>({
            method: "GET",
            url: "/groups"
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get groups: ${res.message}`);
        }

        return res.entity;
    }

    
    /**
     * Get group info by group id
     * @param groupId group id
     * @returns group info
     */
    public async getGroupInfoByGroupId(groupId: string): Promise<EntityType["getGroupInfoByGroupId"]> {
        return (await this.request<EntityType["getGroupInfoByGroupId"]>({
            method: "GET",
            url: `/groupinfo/public/${groupId}`,
        })).entity;
    }
    
    /**
     * Get group privilege by group id
     * @param groupId group id
     * @returns group privilege
     */
    public async getPrivilegeByGroupId(groupId: string): Promise<EntityType["getPrivilegeByGroupId"]> {
        const res = await this.request<EntityType["getPrivilegeByGroupId"]>({
            method: "POST",
            url: `/group_user_role/get_privileges`,
            data: {
                group_id: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get privilege by group id: ${res.message}`);
        }

        return res.entity;
    }

    /**
     * Find file from first level folder in group
     * @param searchName name to search
     * @param firstLevelFolderId first level folder id
     * @param groupId group id
     * @param range time range
     * @returns 
     */
    public async findFileFromFirstLevelFolder(searchName: string, firstLevelFolderId: string, groupId: string, range?: {startTime: string, endTime: string}): Promise<EntityType["findFileFromFirstLevelFolder"]> {
        const res = await this.request<EntityType["findFileFromFirstLevelFolder"]>({
            method: "GET",
            url: `/resource/search`,
            params: {
                is_rec: false,
                category: "file",
                disk_type: "cloud",
                group_number: groupId,
                searchName: searchName,
                offset: 0,
                search_start_time: range?.startTime,
                search_end_time: range?.endTime,
                first_level_folder: firstLevelFolderId,
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to find file from first level folder: ${res.message}`);
        }

        return res.entity;
    }

    /**
     * Get file info by id and type
     * @param dest id and type
     * @param groupId group id
     * @returns file info
     */
    public async getFileInfo(dest: IdTypePairType, groupId?: string): Promise<EntityType["getFileInfo"][typeof dest.type]> {

        const res = await this.request<EntityType["getFileInfo"][typeof dest.type]>({
            method: "GET",
            url: `/fileOrFolder/info/${dest.id}`,
            params: {
                type: dest.type,
                is_path: true,
                group_number: groupId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get file info: ${res.message}`);
        }

        return res.entity;
    }

    /**
     * Get role types
     * @returns role types
     */
    public async getRoleTypes(): Promise<EntityType["getRoleTypes"]> {
        const res = await this.request<EntityType["getRoleTypes"]>({
            method: "POST",
            url: "/group_resource_role/role_types"
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to get role types: ${res.message}`);
        }

        return res.entity;
    }

    private async searchCopyJobResult(jobId: string): Promise<EntityType["searchCopyJobResult"]> {
        const res = await this.request<EntityType["searchCopyJobResult"]>({
            method: "POST",
            url: "/search_copy_job_result",
            data: {
                job_id: jobId
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to search copy job result: ${res.message}`);
        }

        return res.entity;
    }

    /**
     * Save file or folder to cloud folder
     * @param src id and type of source files or folders
     * @param dest destination folder id
     * @param groupId group id
     */
    public async saveToCloud(src: IdTypePairType[], dest: string, groupId: string): Promise<void> {
        const res = await this.request<EntityType["saveToCloud"]>({
            method: "POST",
            url: "/group/resource/savetocloud",
            data: {
                disk_type: "cloud",
                group_number: groupId,
                resources_list: src.map(s => ({
                    group_resource_number: s.id,
                    group_resource_type: s.type
                })),
                target_folder_number: dest
            }
        });

        if (res.status_code !== HttpStatusCode.Ok) {
            throw new Error(`Failed to save to cloud: ${res.message}`);
        }

        const jobId = res.entity.job_id;

        // wait for search copy job result
        let job = await this.searchCopyJobResult(jobId);
        while (job.state !== 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            job = await this.searchCopyJobResult(jobId);
        }

        if (job.state !== 2) {
            throw new Error(`Failed to save to cloud: ${job.message}`);
        }

    }

}

export default RecAPI;