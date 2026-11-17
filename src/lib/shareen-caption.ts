/** Recognize reserved caption entries, including pasted indentation and alternate keycaps. */
export function readShareEnCaptionLine(line:string):{position:number;summary:string}|undefined {
 const match=line.trim().match(/^(?:([0-9])\uFE0F?\u20E3|🔟)\s*(.*)$/u);
 return match?{position:match[1]===undefined?10:Number(match[1]),summary:match[2].trim()}:undefined;
}
