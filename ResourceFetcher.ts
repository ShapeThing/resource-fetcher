import { Quad_Subject } from "@rdfjs/types";

export class ResourceFetcher {

    #resourceIri: Quad_Subject;

    constructor({ resourceIri }: { resourceIri: Quad_Subject }) {
        this.#resourceIri = resourceIri;
    }

    get resourceIri(): Quad_Subject {
        return this.#resourceIri;
    }
}