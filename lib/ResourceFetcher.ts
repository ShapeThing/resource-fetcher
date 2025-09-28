import { RdfStore } from 'rdf-stores'
import { QueryEngine } from '@comunica/query-sparql'
import type { NamedNode } from '@rdfjs/types'

export type SourceType = { type: 'sparql'; value: string } | { type: 'file'; value: string, filename?: string }

export type Options = {
  subject: NamedNode
  sources: SourceType[]
  shapes?: SourceType[]
  engine: QueryEngine
}

export class ResourceFetcher {
  #options: Options

  constructor(options: Options) {
    this.#options = options
  }

  async *execute(): AsyncGenerator<StepResults> {
    console.log(this.#options)

    yield {
      dataset: RdfStore.createDefault(),
      query: 'SELECT * WHERE { ?s ?p ?o }'
    }

    yield {
      dataset: RdfStore.createDefault(),
      query: 'SELECT * WHERE { ?s1 ?p1 ?o }'
    }
  }
}

export type StepResults = {
  dataset: RdfStore
  query: string
}
