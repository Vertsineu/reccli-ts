import { PanDavClient } from "@services/pan-dav.js";
import axios from "axios";
import fs from "fs";
import { Readable, Stream } from "stream";

export async function downloadFile(url: string, dest: string) {
    const response = await axios<Stream>({
        method: 'GET',
        url: url,
        responseType: 'stream', // set response type as 'stream'
    });

    const writer = fs.createWriteStream(dest, {
        highWaterMark: 1024 * 1024, // 1MB buffer size
    });

    return new Promise<void>((resolve, reject) => {
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
    })
}

export async function downloadToWebDav(url: string, dest: string, client: PanDavClient) {
    const response = await axios<Readable>({
        method: 'GET',
        url: url,
        responseType: 'stream', // set response type as 'stream'
    });

    const stream = response.data;

    return client.putFileContents(dest, stream);
}