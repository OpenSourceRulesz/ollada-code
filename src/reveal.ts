// Diffusion-style reveal for the panel (0.1.7).
//
// This is presentational. The extension gets the model's answer as one
// piece when generation finishes (stock ollada serve 0.3.4 doesn't stream),
// so while the model works the panel shows masked blocks, and when the
// answer arrives its real words resolve in over about a second: masked
// tokens, wrong guesses, then committed text, the same effect as the
// headline on the website. It is not a recording of how the model
// generated the answer; the panel's info note says so. The final text on
// screen is always exactly the model's answer.
//
// These two functions are injected into the webview as source
// (`const revealOrder = (<fn source>)`), so they must stay self-contained:
// no imports, no outside references.

/** Which token indices commit at each step. Every index appears exactly once; the last step commits whatever is left. */
export function revealOrder(count: number, steps: number, rand: () => number): number[][] {
  const left: number[] = [];
  for (let i = 0; i < count; i++) { left.push(i); }
  const out: number[][] = [];
  for (let s = 1; s <= steps && left.length > 0; s++) {
    const take = s === steps ? left.length : Math.ceil(left.length / (steps - s + 1));
    const now: number[] = [];
    for (let k = 0; k < take; k++) { now.push(left.splice(Math.floor(rand() * left.length), 1)[0]); }
    out.push(now);
  }
  return out;
}

/** A wrong guess with the same shape as the token: letters stay letters, digits stay digits, punctuation stays. */
export function scrambleToken(token: string, rand: () => number): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (const ch of token) {
    if (ch >= 'a' && ch <= 'z') { out += lower[Math.floor(rand() * 26)]; }
    else if (ch >= 'A' && ch <= 'Z') { out += upper[Math.floor(rand() * 26)]; }
    else if (ch >= '0' && ch <= '9') { out += String(Math.floor(rand() * 10)); }
    else { out += ch; }
  }
  return out;
}
