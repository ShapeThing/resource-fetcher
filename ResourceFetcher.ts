import type { QueryEngine } from "npm:@comunica/query-sparql";
import type { QuerySourceUnidentified } from "npm:@comunica/types";
import factory from "npm:@rdfjs/data-model";
import datasetFactory from "npm:@rdfjs/dataset";
import TermSet from "npm:@rdfjs/term-set";
import type {
  DatasetCore,
  Quad_Object,
  Quad_Predicate,
  Quad_Subject,
} from "npm:@rdfjs/types";
import grapoi from "npm:grapoi";
import type Grapoi from "./Grapoi.ts";
import { allShapeProperties } from "./helpers/allShapeProperties.ts";
import { branchToMermaid } from "./helpers/branchToMermaid.ts";
import { context, queryPrefixes, sh } from "./helpers/namespaces.ts";
import parsePath, { PathSegment } from "./helpers/parsePath.ts";

type Options = {
  subject: Quad_Subject;
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  shapesPointer?: Grapoi;
  debug?: true;
};

export type Branch = {
  pathSegment: PathSegment;
  children: Branch[];
  depth: number;
  propertyPointer?: Grapoi;
  parent?: Branch;
  processed?: boolean;
};

export class ResourceFetcher {
  public subject: Quad_Subject;
  #engine: QueryEngine;
  #branches: Branch[] = [];
  #sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  #shapesPointer?: Grapoi;
  #store: DatasetCore = datasetFactory.dataset();
  #pointer: Grapoi;
  #latestQuery: string = "";

  constructor(options: Options) {
    this.subject = options.subject;
    this.#engine = options.engine;
    this.#sources = options.sources;
    this.#shapesPointer = options.shapesPointer;
    this.#pointer = grapoi({
      dataset: this.#store,
      factory,
      term: this.subject,
    });
  }

  get #engineOptions() {
    return {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: "http://example.org/",
    };
  }

  async *execute() {
    await this.#initialFetch();
    yield {
      mermaid: this.toMermaid(),
      query: this.#latestQuery,
    };
  }

  async executeQuery(query: string) {
    const response = await this.#engine.queryBindings(
      `${queryPrefixes}\n${query}`,
      this.#engineOptions
    );
    this.#latestQuery = query;
    const bindings = await response.toArray();

    const store = datasetFactory.dataset();

    const keys: Set<string> = new Set();
    for (const binding of bindings) {
      const bindingKeys = [...binding.keys()].map((variable) => variable.value);
      for (const bindingKey of bindingKeys) keys.add(bindingKey);
    }

    const highestNode = Math.max(
      ...[...keys]
        .filter((key) => key.startsWith("node"))
        .map((key) => parseInt(key.substring(4)))
    );

    for (const binding of bindings) {
      for (let depth = 0; depth <= highestNode; depth++) {
        const subjectVariable = `node${depth}`;
        const predicateVariable = `predicate${depth}`;
        const objectVariable = `node${depth + 1}`;
        const subject = binding.get(subjectVariable);
        const predicate = binding.get(predicateVariable);
        const object = binding.get(objectVariable);
        if (subject && predicate && object) {
          const quad = factory.quad(
            subject as Quad_Subject,
            predicate as Quad_Predicate,
            object as Quad_Object
          );
          store.add(quad);
        }
      }
    }

    return [...store];
  }

  async #initialFetch() {
    const initialQuery = `select * WHERE {
        GRAPH ?g {
          VALUES (?node0 ?predicate1) { (<${this.subject.value}> rdf:type) }
          ?node0 ?predicate0 ?node1 .
          OPTIONAL {
            ?node1 ?predicate1 ?node2 .
          }
        }
      }`;
    const quads = await this.executeQuery(initialQuery);

    const shapePredicates = this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer)
          .out(sh("path"))
          .terms.filter((term) => term.termType === "NamedNode")
      : [];

    const filteredQuads = quads.filter(
      (quad) =>
        !shapePredicates.some((predicate) => quad.predicate.equals(predicate))
    );

    const uniquePredicates = new TermSet(
      filteredQuads.map((quad) => quad.predicate)
    );
    const quadBranches = [...uniquePredicates.values()].map((predicate) => ({
      pathSegment: [
        {
          predicates: [predicate],
          start: "subject" as const,
          end: "object" as const,
          quantifier: "one" as const,
        },
      ],
      children: [],
      depth: 0,
    }));

    const shapeBranches = this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer)
          .hasOut(sh("path"))
          .map((propertyPointer: Grapoi) => ({
            pathSegment: parsePath(propertyPointer.out(sh("path"))),
            propertyPointer,
            children: [],
            depth: 0,
          }))
      : [];

    const temporaryPointer: Grapoi = grapoi({
      dataset: datasetFactory.dataset(quads),
      factory,
      term: this.subject,
    });

    this.#branches = [...quadBranches, ...shapeBranches];
    for (const branch of this.#branches) {
      const branchPointer = temporaryPointer.executeAll(branch.pathSegment);
      const branchLeafTerms = branchPointer.terms;

      // Close a branch if there are no results.
      // For now we process property paths in their full length,
      // No leaf terms means empty for now.
      if (!branchLeafTerms.length) branch.processed = true;
      // Close a branch if all results are Literals.
      else if (branchLeafTerms.every((term) => term.termType === "Literal")) {
        const quads = [...branchPointer.quads()];
        for (const quad of quads) this.#store.add(quad);
        branch.processed = true;
      }

      // For NamedNodes we need to determine if there are shapes that require further fetching.
      // The fact that this property has a shape means we should fetch further.
      // In this moment we will expand the shape.
      if (branch.propertyPointer) {
        const nestedProperties = allShapeProperties(branch.propertyPointer)
          .hasOut(sh("path"))
          .map((propertyPointer: Grapoi) => {
            return {
              pathSegment: parsePath(propertyPointer.out(sh("path"))),
              propertyPointer,
              children: [],
              depth: branch.depth + 1,
            };
          });

        branch.children.push(...nestedProperties);
      }

      // If the leaf terms contains any BlankNodes do not save any results
      // (for now also literals that do not conform to the property path)
      // We do not need to add a new branch, the initial fetch only gets one layer deep.
      // The next fetch will execute this path again plus one additional layer.
    }
  }

  toMermaid() {
    let chart = `---\nconfig:\n  layout: dagre\n---\nflowchart LR\n\n`;
    chart += this.#branches
      .map((branch) =>
        branchToMermaid(branch, this.#pointer, context, this.subject.value)
      )
      .join("");
    return chart;
  }
}
