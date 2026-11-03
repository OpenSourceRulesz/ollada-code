// Pure panel-state and model-button logic, testable without VS Code.
//
// 0.1.4 dogfood fix: Chat used to be hidden until every Setup step
// passed. Chat is now always visible; Setup is a collapsible section at
// the top of the same panel. It starts open while something still needs
// doing (not serving) and starts collapsed once serve is reachable. The
// Setup checks themselves are unchanged — moved, not deleted.
import { isRedLabel } from './fitLabels';
import type { FitLabel } from './fitLabels';

export function setupOpenByDefault(serving: boolean): boolean {
  return !serving;
}

export function showDownloadButton(label: FitLabel, downloaded: boolean): boolean {
  if (downloaded) { return false; }
  if (isRedLabel(label)) { return false; }
  if (label === 'Unknown') { return false; }
  return true;
}
