export const FILE_LIMIT = 64 * 1024 * 1024

export function assertProjectPath(path: string) {
  const parts = path.split('/')
  if (!path || /[\\:\x00-\x1f\x7f]/.test(path) || parts.some(p => !p || p === '.' || p === '..'
    || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error('porting-path-invalid')
  }
  return path
}
