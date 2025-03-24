import axios from "axios";
import fs from "fs";
import { Stream } from "stream";

export async function downloadFile(url: string, dest: string) {
    const response = await axios<Stream>({
        method: 'GET',
        url: url,
        responseType: 'stream', // set response type as 'stream'
    });

    const writer = fs.createWriteStream(dest);

    return new Promise<void>((resolve, reject) => {
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
    })
    
}