import { DatasetCore, NamedNode, Quad, Quad_Subject } from "@rdfjs/types";
import type { IQueryEngine, QuerySourceUnidentified } from "@comunica/types";
import { allShapeSubShapes } from "./helpers/allShapeSubShapes.ts";
import { sh } from "./helpers/namespaces.ts";
import parsePath, { Path } from "./core/parsePath.ts";
import { Branch, QueryPattern } from "./core/Branch.ts";
import { generateQuery } from "./core/generateQuery.ts";
import { numberedBindingsToQuads } from "./core/numberedBindingsToQuads.ts";
import dataFactory from "@rdfjs/data-model";
import Grapoi from "./helpers/Grapoi.ts";
import datasetFactory from "@rdfjs/dataset";

export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean };

export class ResourceFetcher {
  #resourceIri: Quad_Subject;
  #recursionStepMultiplier: number;
  #engine: IQueryEngine;
  #sources: QuerySourceUnidentified[] = [];
  #shapesPointer?: Grapoi;
  #rootBranches: Branch[] = [];
  #accumulatedDataset: DatasetCore<OurQuad>;

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
    this.#accumulatedDataset = datasetFactory.dataset<OurQuad>();
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
    let step = 1;
    const maxSteps = 40; // Safety limit

    let stepQuads = await this.#step1();
    // Accumulate quads from this step
    for (const quad of stepQuads) {
      this.#accumulatedDataset.add(quad);
    }
    this.#processStepResults(this.#accumulatedDataset, step);
    this.#debug();

    while (step < maxSteps && !this.#allBranchesDone()) {
      step++;
      stepQuads = await this.#nextStep(step);
      // Accumulate quads from this step
      for (const quad of stepQuads) {
        this.#accumulatedDataset.add(quad);
      }
      this.#processStepResults(this.#accumulatedDataset, step);
      this.#debug();
    }

    return {
      results: this.#rootBranches.flatMap((branch) => branch.getResults()),
      steps: step,
    };
  }

  #allBranchesDone(): boolean {
    return this.#rootBranches.every((branch) => branch.isDone());
  }

  #processStepResults(quads: DatasetCore, step: number) {
    for (const branch of this.#rootBranches) {
      branch.process(quads, step);
    }
  }

  #debug() {
    console.info(this.#rootBranches.map((branch) => branch.debug()).join("\n"));
  }

  async #step1() {
    // If a shape pointer is provided, extract root shape paths and create branches.
    if (this.#shapesPointer) {
      const properties = allShapeSubShapes(this.#shapesPointer).out(sh("path"));
      const rootShapeBranchPaths = properties.map((pathPointer: Grapoi) =>
        parsePath(pathPointer)
      );
      this.#rootBranches.push(
        ...rootShapeBranchPaths.map(
          (path) => new Branch({ path, depth: 1, resourceFetcher: this })
        )
      );
    }

    const initialQuery = this.#getInitialQuery();
    const response = await this.#engine.queryBindings(
      initialQuery,
      this.#engineOptions
    );

    const bindings = await response.toArray();
    const quads = numberedBindingsToQuads(bindings);

    // Lets create data branches for the first level.
    const firstLevelQuads = [...quads].filter(
      (quad) => quad.subject.value === this.#resourceIri.value
    );
    const firstLevelShapePredicates = this.#rootBranches.flatMap((branch) =>
      branch.getFirstPredicatesInPath()
    );

    const firstLevelDataPredicates = new Set(
      firstLevelQuads
        .map((quad) => quad.predicate.value)
        .filter(
          (predicate) =>
            !firstLevelShapePredicates.some(
              (shapePredicate) => shapePredicate.value === predicate
            )
        )
    );

    const rootDataBranches = [...firstLevelDataPredicates].map((predicate) => {
      const path: Path = [
        {
          predicates: [dataFactory.namedNode(predicate) as NamedNode],
          quantifier: "one",
          start: "subject",
          end: "object",
        },
      ];

      return new Branch({ depth: 1, resourceFetcher: this, path });
    });

    this.#rootBranches.push(...rootDataBranches);
    return quads;
  }

  #getInitialQuery() {
    const queryPatterns = [
      // This pattern does the initial ?s ?p ?o for the resource IRI.
      { node_0: this.#resourceIri } as QueryPattern,
      // If there are shapes, get their patterns too.
      ...this.#rootBranches.flatMap((branch) => branch.toQueryPatterns()),
    ];
    return generateQuery(queryPatterns);
  }

  async #nextStep(step: number) {
    const queryPatterns = this.#rootBranches.flatMap((branch) =>
      branch.toQueryPatterns()
    );
    const query = generateQuery(queryPatterns);
    const response = await this.#engine.queryBindings(
      query,
      this.#engineOptions
    );
    const bindings = await response.toArray();
    const quads = numberedBindingsToQuads(bindings);
    return quads;
  }
}
