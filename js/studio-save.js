import { assertStudioPng } from './studio.js';

export function studioSaveMode(env = globalThis) {
  const cap = env.Capacitor;
  if (!cap?.isNativePlatform?.()) return 'browser';
  if (cap.isPluginAvailable && !cap.isPluginAvailable('StudioSave')) return 'unavailable';
  return cap.Plugins?.StudioSave?.saveImage ? 'native' : 'unavailable';
}

export async function saveStudioImage(blob, env = globalThis) {
  await assertStudioPng(blob);
  const cap = env.Capacitor;
  if (cap?.isNativePlatform?.()) {
    const saver = cap.Plugins?.StudioSave;
    if (studioSaveMode(env) === 'unavailable') throw new Error('This app build cannot save Studio images yet. Saving needs a newer app build.');
    if (blob.size > 16 * 1024 * 1024) throw new Error('This image is too large to save. Try a plain backdrop.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    let result;
    try { result = await saver.saveImage({ base64: env.btoa(binary) }); }
    catch (error) {
      if (error.code === 'UNIMPLEMENTED') throw new Error('This app build cannot save Studio images yet. Saving needs a newer app build.');
      throw error;
    }
    if (result?.cancelled) return { status: 'cancelled' };
    if (result?.saved !== true) throw new Error('The image was not saved.');
    return { status: 'saved' };
  }
  const url = env.URL.createObjectURL(blob);
  const a = env.document.createElement('a');
  a.href = url; a.download = 'boneheadz-studio.png';
  try {
    env.document.body.appendChild(a); a.click();
  } finally {
    a.remove();
    // Browsers may read the Blob after click returns. Never revoke immediately.
    env.setTimeout(() => env.URL.revokeObjectURL(url), 60000);
  }
  // A download request has no success acknowledgement. Do not claim a disk write.
  return { status: 'download-requested' };
}
