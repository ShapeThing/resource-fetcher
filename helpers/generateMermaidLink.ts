import pako from "npm:pako";

function jsStringToByte(data: string) {
  return new TextEncoder().encode(data);
}

function jsBtoa(data: Uint8Array) {
  let binary = "";
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function generateMermaidLink(
  graphMarkdown: string,
  editMode: "view" | "edit" = "view"
) {
  const jGraph = {
    code: graphMarkdown,
    mermaid: { theme: "default" },
  };

  const byteStr = jsStringToByte(JSON.stringify(jGraph));
  const deflated = pako.deflate(byteStr);
  const dEncode = jsBtoa(deflated);

  const link =
    `http://mermaid.live/${editMode ? "edit" : "view"}#pako:` +
    dEncode.replace("+", "-").replace("/", "_");

  return link;
}
