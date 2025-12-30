import factory from "@rdfjs/data-model";
import type {
  Bindings,
  DatasetCore,
  Quad_Object,
  Quad_Predicate,
  Quad_Subject,
  Term,
} from "@rdfjs/types";
import type { OurQuad } from "../ResourceFetcher.ts";
import datasetFactory from "@rdfjs/dataset";
import { rdf } from "../helpers/namespaces.ts";

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

  const lists: Map<string, { subject: Term; predicate: Term; items: Term[] }> = new Map();

  for (const binding of bindings) {
    for (let depth = 0; depth <= highestNode; depth++) {
      const subject = binding.get(`node_${depth}`);
      const predicate = binding.get(`predicate_${depth + 1}`);
      const reverse_predicate = binding.get(`reverse_predicate_${depth + 1}`);
      const object = binding.get(`node_${depth + 1}`);
      const listObject = binding.get(`node_list_${depth + 1}`);

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

      if (subject && predicate && listObject) {
        const listKey = `${subject.value}|${predicate.value}`;
        if (!lists.has(listKey)) {
          lists.set(listKey, { subject, predicate, items: [] });
        }
        lists.get(listKey)!.items.push(listObject);
      }
    }
  }

  // Now convert lists to quads
  for (const listData of lists.values()) {
    const { subject, predicate, items } = listData;

    if (items.length === 0) continue;

    // Create RDF list structure
    const firstListNode = factory.blankNode();
    let currentListNode: Term = firstListNode;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const nextListNode =
        i === items.length - 1 ? rdf.nil : factory.blankNode();

      // rdf:first triple
      store.add(
        factory.quad(
          currentListNode as Quad_Subject,
          rdf.first as Quad_Predicate,
          item as Quad_Object
        ) as OurQuad
      );

      // rdf:rest triple
      store.add(
        factory.quad(
          currentListNode as Quad_Subject,
          rdf.rest as Quad_Predicate,
          nextListNode as Quad_Object
        ) as OurQuad
      );

      currentListNode = nextListNode;
    }

    // Finally, link the list to the subject via the predicate
    store.add(
      factory.quad(
        subject as Quad_Subject,
        predicate as Quad_Predicate,
        firstListNode as Quad_Object
      ) as OurQuad
    );
  }

  return store;
};
