// reset = '\x1b[0m' , reset to default color
const reset = '\x1b[0m';
// colors with their codes
const colors: {[key: string]: number} = {
    black: 30,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
    white: 37,
};

export type Color = keyof typeof colors;

export function color(text: string, color: keyof typeof colors): string {
    return `\x1b[${colors[color]}m${text}${reset}`;
}
