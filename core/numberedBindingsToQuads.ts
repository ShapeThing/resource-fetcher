import factory from "@rdfjs/data-model";
import type {
  Bindings,
  DatasetCore,
  Quad_Object,
  Quad_Predicate,
  Quad_Subject,
} from "@rdfjs/types";
import type { OurQuad } from "../ResourceFetcher.ts";
import datasetFactory from "@rdfjs/dataset";

export const numberedBindingsToQuads = (
  bindings: Bindings[]
): DatasetCore<OurQuad> => {
  const store = datasetFactory.dataset<OurQuad>();
  const keys: Set<string> = new Set();

  for (const binding of bindings) {
    const bindingKeys = [...binding.keys()].map((variable) => variable.value);
    for (const bindingKey of bindingKeys) keys.add(bindingKey);
  }

  const highestNode = Math.max(
    ...[...keys]
      .filter((key) => key.includes("_"))
      .map((key) => parseInt(key.split("_").pop()!))
  );

  for (const binding of bindings) {
    for (let depth = 0; depth <= highestNode; depth++) {
      const subject = binding.get(`node_${depth}`);
      const predicate = binding.get(`predicate_${depth + 1}`);
      const reverse_predicate = binding.get(`reverse_predicate_${depth + 1}`);
      const object = binding.get(`node_${depth + 1}`);

      if (subject && predicate && object) {
        const quad: OurQuad = factory.quad(
          subject as Quad_Subject,
          predicate as Quad_Predicate,
          object as Quad_Object
        );
        // We never reach the highestNode as that is only for the last object.
        if (depth === highestNode - 1) quad.isLeaf = true;
        store.add(quad);
      }

      // If there is no object but there is a reverse object the relationship is a reverse.
      if (subject && reverse_predicate && object) {
        const quad: OurQuad = factory.quad(
          object as Quad_Subject,
          reverse_predicate as Quad_Predicate,
          subject as Quad_Object
        );
        if (depth === highestNode - 1) quad.isLeaf = true;
        quad.isReverse = true;
        store.add(quad);
      }
    }
  }

  return store;
};
