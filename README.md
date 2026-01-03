![Logo](https://storybook-shacl-renderer.shapething.com/logo.svg)

# Resource Fetcher

A SHACL-guided RDF resource fetcher that retrieves all triples belonging to a specific IRI from RDF data sources, handling the complexities of blank nodes and nested data structures. It follows the concept of the Concise Bounded Description (CBD) and it extends it with SHACL.

## The Problem

**Blank nodes from different SPARQL queries get different identifiers**, making it impossible to merge results that reference the same logical blank node. When working with RDF data, information about a single resource is often scattered across multiple triples and may involve blank nodes that can't be reliably matched across separate queries.

## Solution

When we encounter a blank node object, we don't save that triple immediately. Instead, we track the predicate path that leads to the blank node and expand it in subsequent queries. This creates a "trail" of predicate paths that need to be followed.

The fetcher builds progressively longer SPARQL queries that follow these predicate paths from the original subject through all intermediate nodes to fetch the complete blank node structures in single queries. This preserves blank node identity because all related triples are retrieved together in one query result, avoiding the identity collision problem that occurs when blank nodes are fetched
across separate queries.

## Usage

```typescript
import { ResourceFetcher } from '@shapething/resource-fetcher'
import { QueryEngine } from '@comunica/query-sparql'
import { namedNode } from '@rdfjs/data-model'

const fetcher = new ResourceFetcher({
  subject: namedNode('http://example.org/person/john'),
  engine: new QueryEngine(), // Comunica
  sources: ['https://example.org/data.ttl'], // Comunica compatible sources.
  shapes: myShapesDataset, // Optional
  furtherShapes: furtherShapes // Optional
})

const result = await fetcher.execute()
```

## License

GPL-3.0-only
