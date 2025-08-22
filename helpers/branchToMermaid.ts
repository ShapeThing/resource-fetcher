import Grapoi from "../Grapoi.ts";
import { Branch } from "../ResourceFetcher.ts";

export const branchToMermaid = (
  branch: Branch,
  pointer: Grapoi,
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
      const localName = predicate.value.split(/\/|#/g).pop();

      const triple = [
        `${partSubject}(" ")`,
        "-->",
        `${predicateId}("${localName}")`,
        "-->",
        `${partObject}("${quads.length}")`,
      ];

      // Reverse the triple if the path starts with "object"
      if (part.start === "object") triple.reverse();

      output += triple.join(" ") + "\n";
    }
  }

  return output;
};
