import { QueryEngine } from "@comunica/query-sparql";
import { Bindings } from "@comunica/utils-bindings-factory";
import factory from '@rdfjs/data-model'
import type { Quad, Term } from "@rdfjs/types";

const serializedSource = (value: string) => ({
    type: "serialized",
    value,
    mediaType: "text/turtle",
    baseIRI: "http://example.org/",
});

export const createQueryBindingsComunica = async (input: string) => {
    const engine = new QueryEngine();
    return async (query: string) => {
        const result = await engine.queryBindings(query, {
            sources: [serializedSource(input)],
            unionDefaultGraph: true,
            baseIRI: "http://example.org/",
        });
        return result.toArray();
    }
}

export const createQueryBindingsSpeedy = async (input: string) => {
    const { newEngine } = await import('npm:@triplydb/speedy-memory')
    const { parse, Store } = await import('npm:@triplydb/data-factory')

    const quads = parse(input, {
        baseIri: "http://example.org/",
    });
    const store = new Store(quads.map((quad: Quad) => factory.quad(quad.subject,
        quad.predicate,
        quad.object,
        factory.namedNode('urn:input'),
    )))
    const engine = newEngine(store);
    return async (query: string) => {
        const results = await engine.query(query, {
            queryType: 'select'
        });
        const bindings = await results.toArray()
        /** @ts-ignore */
        return bindings.map((binding: Bindings<Term>) => {
            /** @ts-ignore */
            return new Bindings(factory, new Map(Object.entries(binding)))
        });
    };
}