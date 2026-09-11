import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Canvas and font loaders require decoded native paths, not URL pathnames.
export function studioArtPath(src, root) {
  return fileURLToPath(pathToFileURL(resolve(fileURLToPath(root), src)));
}
