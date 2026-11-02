// Pure screen-choice and model-button logic, testable without VS Code.
//
// The panel has two screens, Setup and Chat, and only one is visible.
// The rule is: force Setup (the chat screen's Setup button) always wins;
// otherwise Chat wins when serve is running, Setup wins when it is not.
// refreshSetup() implements this by posting 'setup' first, then 'ready'
// (which shows Chat) only when shouldShowChat() is true, so the last
// message — and therefore the visible screen — is always the right one.
import { isRedLabel } from './fitLabels';
import type { FitLabel } from './fitLabels';

export function shouldShowChat(serving: boolean, forceSetup: boolean): boolean {
  if (forceSetup) { return false; }
  return serving;
}

export function showDownloadButton(label: FitLabel, downloaded: boolean): boolean {
  if (downloaded) { return false; }
  if (isRedLabel(label)) { return false; }
  if (label === 'Unknown') { return false; }
  return true;
}
