import { Branch } from "../ResourceFetcher.ts";

export const branchToMermaid = (
  branch: Branch,
  subject: string = self.crypto.randomUUID(),
  object: string = self.crypto.randomUUID()
) => {
  let output = "";
  const pathSegment = branch.pathSegment;

  const nodeMap = new Map<number, string>();
  nodeMap.set(0, subject);
  nodeMap.set(pathSegment.length, object);
  for (let i = 1; i < pathSegment.length; i++)
    nodeMap.set(i, self.crypto.randomUUID());

  for (const [i, part] of pathSegment.entries()) {
    const partSubject = nodeMap.get(i)!;
    const partObject = nodeMap.get(i + 1)!;

    for (const predicate of part.predicates) {
      const predicateId = self.crypto.randomUUID();
      const localName = predicate.value.split(/\/|#/g).pop();

      const triple = [
        `${partSubject}(" ")`,
        "-->",
        `${predicateId}("${localName}")`,
        "-->",
        `${partObject}(" ")`,
      ];

      // Reverse the triple if the path starts with "object"
      if (part.start === "object") triple.reverse();

      output += triple.join(" ") + "\n";
    }
  }

  return output;
};
