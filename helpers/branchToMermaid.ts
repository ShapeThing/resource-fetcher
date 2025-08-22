import type { JsonLdContextNormalized } from "npm:jsonld-context-parser";
import Grapoi from "../Grapoi.ts";
import { Branch } from "../ResourceFetcher.ts";

export const branchToMermaid = (
  branch: Branch,
  pointer: Grapoi,
  context: JsonLdContextNormalized,
  subject: string = self.crypto.randomUUID(),
  object: string = self.crypto.randomUUID()
) => {
  let output = "";
  const pathSegment = branch.pathSegment;

  const partIdentifiers = new Map<number, string>();
  partIdentifiers.set(0, subject);
  partIdentifiers.set(pathSegment.length, object);
  for (let i = 1; i < pathSegment.length; i++)
    partIdentifiers.set(i, self.crypto.randomUUID());

  for (const [i, part] of pathSegment.entries()) {
    const partSubject = partIdentifiers.get(i)!;
    const partObject = partIdentifiers.get(i + 1)!;

    const quads = [...pointer.executeAll(pathSegment.slice(0, i + 1)).quads()];

    for (const predicate of part.predicates) {
      const predicateId = self.crypto.randomUUID();
      const compactedIri = context.compactIri(predicate.value);
      const label = compactedIri
        .replace(/http:/g, "http:‎")
        .replace(/https:/g, "https:‎")
        .replace(/www/g, "www‎");

      const triple = [
        partSubject,
        "-->",
        `${predicateId}("${label}")`,
        "-->",
        `${partObject}("${quads.length}")`,
      ];

      // Reverse the triple if the path starts with "object"
      if (part.start === "object") triple.reverse();

      output += triple.join(" ") + "\n";
    }
  }

  for (const child of branch.children) {
    output += branchToMermaid(
      child,
      pointer,
      context,
      // Grab the last object
      partIdentifiers.get(pathSegment.length)!
    );
  }

  return output;
};
