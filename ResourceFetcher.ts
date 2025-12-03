import { Quad_Subject } from "@rdfjs/types";
import type { IQueryEngine, QuerySourceUnidentified } from '@comunica/types';

export class ResourceFetcher {
  #resourceIri: Quad_Subject;
  #recursionStepMultiplier: number;
  #engine: IQueryEngine;
  #sources: QuerySourceUnidentified[] = [];

  constructor({
    resourceIri,
    recursionStepMultiplier = 3,
    engine,
    sources = [],
  }: {
    resourceIri: Quad_Subject;
    recursionStepMultiplier?: number;
    engine: IQueryEngine;
    sources?: QuerySourceUnidentified[];
  }) {
    this.#resourceIri = resourceIri;
    this.#recursionStepMultiplier = recursionStepMultiplier;
    this.#engine = engine;
    this.#sources = sources;
  }

  get resourceIri(): Quad_Subject {
    return this.#resourceIri;
  }

  get recursionStepMultiplier(): number {
    return this.#recursionStepMultiplier;
  }

  async execute() {}

  async *step() {}
}
