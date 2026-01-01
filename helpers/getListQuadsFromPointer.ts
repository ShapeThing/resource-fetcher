import { DatasetCore, Quad, Quad_Subject, Term } from "@rdfjs/types";
import Grapoi from "./Grapoi.ts";
import { rdf } from "./namespaces.ts";

export const getListQuadsFromPointer = (pointer: Grapoi): Quad[] => {
  const dataset: DatasetCore | null = pointer.ptrs[0]?.dataset;
  if (!dataset) return [];
  const listQuads: Quad[] = [];

  for (const firstListSubject of pointer.terms) {
    let currentNode: Term = firstListSubject;

    while (currentNode && !currentNode.equals(rdf("nil"))) {
      // Get the value at rdf:first
      const [firstQuad] = dataset.match(
        currentNode as Quad_Subject,
        rdf("first"),
        null
      );
      const [restQuad] = dataset.match(
        currentNode as Quad_Subject,
        rdf("rest"),
        null
      );

      if (firstQuad && restQuad) {
        listQuads.push(firstQuad, restQuad);
      }

      // Move to the next node via rdf:rest
      const nextNode =
        !restQuad?.object || restQuad.object?.equals(rdf("nil"))
          ? null
          : restQuad.object;
      if (!nextNode) break;
      currentNode = nextNode;
    }
  }

  return listQuads;
};
