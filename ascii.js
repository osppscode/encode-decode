// ASCII encode and decode (7-bit)

// 7-bit ASCII encode: returns array of 7-char "0/1" strings per character
export function ascii7BitsForText(text) {
  return [...text].map(ch =>
    ch.charCodeAt(0).toString(2).padStart(7, "0").slice(-7)
  );
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
