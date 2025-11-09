// ASCII encode and decode (7-bit)

// Convert text → "0100101 ..." bitstring
export function asciiEncode(text) {
  return text
    .split("")
    .map(char => char.charCodeAt(0).toString(2).padStart(7, "0"))
    .join(" ");
}

// Convert "0100101 ..." → text
export function asciiDecode(bitstring) {
  return bitstring
    .trim()
    .split(/\s+/)
    .map(bits => String.fromCharCode(parseInt(bits, 2)))
    .join("");
}

console.log("ascii.js loaded");
