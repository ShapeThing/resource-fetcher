import { RdfStore } from "rdf-stores";
import { DataFactory } from 'rdf-data-factory'

const df = new DataFactory()

export default [
  {
    name: 'Basic SPARQL source',
    input: {
      subject: df.namedNode('http://example.org/resource'),
      sources: [
        { type: 'sparql' as const, value: 'http://example.org/sparql' }
      ],
      shapes: []
    },
    expected: {
      dataset: RdfStore.createDefault(),
      query: 'SELECT * WHERE { ?s ?p ?o }'
    }
  },
    {
    name: 'Basic SPARQL source 2',
    input: {
      subject: df.namedNode('http://example.org/resource'),
      sources: [
        { type: 'sparql' as const, value: 'http://example.org/sparql' }
      ],
      shapes: []
    },
    expected: {
      dataset: RdfStore.createDefault(),
      query: 'SELECT * WHERE { ?s ?p ?o }'
    }
  }
]