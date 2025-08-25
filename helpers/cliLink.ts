export const cliLink = (url: URL | string, label: string) => {
  return `\x1b]8;;${url.toString()}\x07${label}\x1b]8;;\x07`
}
