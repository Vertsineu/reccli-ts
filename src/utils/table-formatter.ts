import wcwidth from "wcwidth";
import { color, Color } from "@utils/color-string.js";

export type ColumnName = string;

// column name with config
export type Column = {
    name: string;
    width: number;
};

// cell value with config
export type Cell = {
    value: any;
    color?: Color;
}

export type Row = Record<ColumnName, Cell>;

export class TableFormatter {
    private columns: Column[];
  
    constructor(columns: Column[]) {
        this.columns = columns;
    }
  
    private padString(str: string, length: number): string {
        const ellipsis = "...";
        const ellipsisWidth = wcwidth(ellipsis);  // 计算省略号的宽度
        const strWidth = wcwidth(str);

        // 如果字符串宽度大于目标宽度
        if (strWidth > length) {
            let truncated = "";
            let currentWidth = 0;

            // 保留省略号的空间
            const availableWidth = length - ellipsisWidth;

            // 遍历字符串，逐个字符地计算宽度
            for (let i = 0; i < str.length; i++) {
                const char = str.charAt(i);
                const charWidth = wcwidth(char);

                // 如果当前字符宽度加上现有的宽度超过可用宽度，停止添加
                if (currentWidth + charWidth > availableWidth) {
                    break;
                }

                truncated += char;
                currentWidth += charWidth;
            }

            // 返回截断后的字符串，并加上省略号
            return truncated + ellipsis + " ".repeat(length - ellipsisWidth - currentWidth);
        } else {
            // 如果字符串宽度不超过目标宽度，用空格填充
            return str + " ".repeat(length - strWidth);
        }
    }
  
    private generateHeader(): string {
      return this.columns
        .map((col) => this.padString(col.name, col.width))
        .join(" ");
    }
  
    private generateSeparator(): string {
      return this.columns.map((col) => "-".repeat(col.width)).join(" ");
    }
  
    private formatRow(row: Row): string {
      return this.columns
        .map((col) => {
            const cell = row[col.name];
            const value = this.padString(String(cell.value), col.width);
            return cell.color ? color(value, cell.color) : value;
        })
        .join(" ");
    }
  
    public formatTable(data: Row[]): string {
      const header = this.generateHeader();
      const separator = this.generateSeparator();
      const rows = data.map((row) => this.formatRow(row));
      return [header, separator, ...rows].join("\n");
    }
  }
  