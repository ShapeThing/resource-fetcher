import { RdfStore } from 'rdf-stores'
import { QueryEngine } from '@comunica/query-sparql'
import type { NamedNode, Quad } from '@rdfjs/types'

export type SourceType = { type: 'sparql'; value: string } | { type: 'file'; value: string; filename?: string }
export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean }

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
      query: 'SELECT * WHERE { ?s ?p ?o1 }'
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

// For local development so that tests always run after changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}