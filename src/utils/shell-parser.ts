// parse a shell command line into an array of arguments
// do not support in quote, but always use escape character
export function parseShellCommand(command: string): string[] {
    const result: string[] = [];
    let current = "";
    let escape = false;
    for (const c of command) {
        if (escape) {
            current += c;
            escape = false;
        } else {
            if (c === "\\") {
                escape = true;
            } else if (c === " ") {
                if (current !== "") {
                    result.push(current);
                    current = "";
                }
            } else {
                current += c;
            }
        }
    }
    if (current !== "") {
        result.push(current);
    }
    return result;
}

export function unescapeFromShell(path: string): string {
    return path.replace(/\\(.)/g, "$1");
}

// for convenience, we only escape space and backslash
export function escapeToShell(path: string): string {
    return path.replace(/([\\ ])/g, "\\$1");
}
