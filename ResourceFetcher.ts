import { Quad_Subject } from "@rdfjs/types";

export class ResourceFetcher {

    #resourceIri: Quad_Subject;
    #recursionStepMultiplier: number;

    constructor({ resourceIri, recursionStepMultiplier = 3 }: { resourceIri: Quad_Subject, recursionStepMultiplier?: number }) {
        this.#resourceIri = resourceIri;
        this.#recursionStepMultiplier = recursionStepMultiplier;
    }

    get resourceIri(): Quad_Subject {
        return this.#resourceIri;
    }

    get recursionStepMultiplier(): number {
        return this.#recursionStepMultiplier;
    }

    async execute () {

    }

    async * step () {

    }
}