// Prompts, spec 6.4.
// Fix is proven, verbatim from the Dell script tests. Explain and
// Insert are PROPOSED and UNTESTED — they are labelled as such in
// code comments and in the README, and must not be presented as measured.
export const FIX_PROMPT =
  'Fix this code. Output ONLY the fixed code, no explanation, no markdown fences. Preserve the function name and signature, and do not change unrelated logic.';

// PROPOSED, UNTESTED: Explain prompt. Measure before shipping as proven.
export const EXPLAIN_PROMPT =
  'Explain this code in plain language. Say what it does, what each part is for, and any bug or risk you can see. Do not change the code.';

// PROPOSED, UNTESTED: Insert prompt. Measure before shipping as proven.
// Phase 1 Insert writes at the cursor and does NOT read the code after
// the cursor. API-level fill-in-the-middle is Phase 2 only, and must
// never be called "true FIM" without that qualifier.
export function insertPrompt(instruction: string, fileName: string): string {
  return `Write new code for this request, for the file ${fileName}. Output ONLY the code, no explanation, no markdown fences.\n\nRequest: ${instruction}`;
}

export const CHECKS_PASSED_WARNING =
  'Checks passed, but that isn’t proof it’s correct. Try the function on 2 or 3 inputs before you rely on it.';

export const INSERT_FOOTNOTE =
  'Inserting writes new code at the cursor. It doesn’t read the code after the cursor yet; that comes with API-level fill-in-the-middle in Phase 2.';
