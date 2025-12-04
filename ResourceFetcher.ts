import { Quad, Quad_Subject } from "@rdfjs/types";
import type { IQueryEngine, QuerySourceUnidentified } from "@comunica/types";
import Grapoi from "./helpers/Grapoi.ts";
import { allShapeSubShapes } from "./helpers/allShapeSubShapes.ts";
import { sh } from "./helpers/namespaces.ts";
import parsePath from "./core/parsePath.ts";
import { Branch, QueryPattern } from "./core/Branch.ts";
import { generateQuery } from "./core/generateQuery.ts";
import { numberedBindingsToQuads } from "./core/numberedBindingsToQuads.ts";

export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean };

export class ResourceFetcher {
  #resourceIri: Quad_Subject;
  #recursionStepMultiplier: number;
  #engine: IQueryEngine;
  #sources: QuerySourceUnidentified[] = [];
  #shapesPointer?: Grapoi;
  #rootBranches: Branch[] = [];

  constructor({
    resourceIri,
    recursionStepMultiplier = 3,
    engine,
    sources = [],
    shapesPointer,
  }: {
    resourceIri: Quad_Subject;
    recursionStepMultiplier?: number;
    engine: IQueryEngine;
    sources?: QuerySourceUnidentified[];
    shapesPointer?: Grapoi;
  }) {
    this.#resourceIri = resourceIri;
    this.#recursionStepMultiplier = recursionStepMultiplier;
    this.#engine = engine;
    this.#sources = sources;
    this.#shapesPointer = shapesPointer;
  }

  get #engineOptions() {
    return {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: "http://example.org/",
    };
  }
  get resourceIri(): Quad_Subject {
    return this.#resourceIri;
  }

  get recursionStepMultiplier(): number {
    return this.#recursionStepMultiplier;
  }

  async execute() {
    const initialQuery = this.#getInitialQuery();
    const response = await this.#engine.queryBindings(
      initialQuery,
      this.#engineOptions
    );
    const bindings = await response.toArray();
    const quads = numberedBindingsToQuads(bindings);
    return quads;
  }

  #getInitialQuery() {
    const queryPatterns = [
      // This pattern does the initial ?s ?p ?o for the resource IRI.
      { node_0: this.#resourceIri } as QueryPattern,
    ];
    if (this.#shapesPointer) {
      const properties = allShapeSubShapes(this.#shapesPointer).out(sh("path"));
      const rootShapeBranchPaths = properties.map((pathPointer: Grapoi) =>
        parsePath(pathPointer)
      );
      this.#rootBranches = rootShapeBranchPaths.map(
        (path) => new Branch({ path, depth: 1, resourceFetcher: this })
      );
      queryPatterns.push(
        ...this.#rootBranches.flatMap((branch) => branch.toQueryPatterns())
      );
    }
    return generateQuery(queryPatterns);
  }

  async *step() {}
}
