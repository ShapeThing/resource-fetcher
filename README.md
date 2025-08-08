# SHACL-based Concise Bounded Description (CBD) Fetcher

A SHACL-guided RDF resource fetcher that retrieves all triples belonging to a specific IRI from RDF data sources, handling the complexities of blank nodes and nested data structures.

## The Problem

**Blank nodes from different SPARQL queries get different identifiers**, making it impossible to merge results that reference the same logical blank node. When working with RDF data, information about
a single resource is often scattered across multiple triples and may involve blank nodes that can't be reliably matched across separate queries.

## Solution

When we encounter a blank node object, we expand the query pattern to fetch the blank node's content in the same query, preserving blank node identity.

## Features

- **SHACL Shape Integration**: Use SHACL shapes to guide which properties to fetch
- **Predicate Blacklisting**: Skip certain predicates during traversal
- **Maximum Depth Control**: Limit traversal depth

## Example

Instead of getting incomplete data like:

```turtle
<person:john> <hasAddress> _:blank1 .
```

The fetcher retrieves the complete structure:

```turtle
<person:john> <hasAddress> _:addr1 .
_:addr1 <hasStreet> "123 Main St" .
_:addr1 <hasCity> "Springfield" .
_:addr1 <hasZip> "12345" .
```

## Usage

```typescript
import ShaclCbd from '@shapething/fetcher/shacl-cbd'
import { QueryEngine } from '@comunica/query-sparql'
import { namedNode } from '@rdfjs/data-model'

const fetcher = new ShaclCbd({
  subject: namedNode('http://example.org/person/john'),
  engine: new QueryEngine(),
  sources: ['https://example.org/data.ttl'],
  shapes: myShapesDataset, // Optional
  maxDepth: 10, // Optional (default: 20)
  predicateBlackList: [namedNode('http://example.org/skipThis')], // Optional
})

await fetcher.execute()
// Access the complete data via fetcher.store
```

## License

GPL-3.0-only
