# RDF Resource Fetcher

A smart RDF data fetcher that retrieves all information "belonging" to a specific resource from RDF data sources, handling the complexities of blank nodes and nested data structures.

## What it does

**Main Goal**: Given a subject (like a person or organization), fetch ALL the data connected to it, even when that data is spread across multiple "hops" in the RDF graph.

## The Problem it Solves

When working with RDF data, information about a single resource is often scattered across multiple triples and may involve blank nodes (anonymous objects). Standard SPARQL queries might only fetch direct properties, missing important nested information or failing to properly handle blank nodes that can't be reliably matched across separate queries.

## How it Works

### The Process

1. **Start with a subject** - like `<http://example.org/person/john>`
2. **Query for direct properties** - find triples like:
   - `john hasName "John Smith"`
   - `john hasAddress _:blank123`
3. **Handle blank nodes specially** - When a property points to a blank node, it needs special treatment because blank nodes from different queries can't be reliably matched
4. **Recursively fetch deeper data** - For each blank node found, make a new query that follows the complete path from the original subject
5. **Combine everything** - Merge all the fetched data into one complete dataset

### Key Innovation: Blank Node Handling

The tricky part is **blank nodes** - these are anonymous objects in RDF that don't have permanent identifiers. This fetcher solves the blank node problem by:

- **Detecting blank leaf nodes**: Identifying when a query result contains blank nodes that aren't referenced elsewhere
- **Path-based querying**: Making follow-up queries that trace the complete path from the original subject through all predicates
- **Recursive resolution**: Building up a complete picture by recursively fetching nested data

## Example

Instead of getting incomplete data like:
```turtle
<person:john> <hasAddress> _:blank1 .
```

The fetcher will retrieve the complete address information:
```turtle
<person:john> <hasAddress> _:addr1 .
_:addr1 <hasStreet> "123 Main St" .
_:addr1 <hasCity> "Springfield" .
_:addr1 <hasZip> "12345" .
```

## Usage

```typescript
import { getResource } from '@shapething/resource-fetcher';
import { QueryEngine } from '@comunica/query-sparql';
import { namedNode } from '@rdfjs/data-model';

const engine = new QueryEngine();
const sources = ['https://example.org/data.ttl'];
const subject = namedNode('http://example.org/person/john');

const completeResource = await getResource({
  subject,
  engine,
  sources
});

// completeResource now contains all triples belonging to the subject
```

## Technical Details

- **Recursive Architecture**: Uses recursive calls to handle nested blank nodes
- **SPARQL CONSTRUCT Queries**: Generates dynamic CONSTRUCT queries based on predicate paths
- **N3 Store Integration**: Uses N3 Store for efficient RDF data manipulation
- **Comunica Integration**: Built on top of Comunica's federated query engine

## Dependencies

- `@rdfjs/types` - RDF/JS type definitions
- `@comunica/query-sparql` - SPARQL query engine
- `@comunica/types` - Comunica type definitions  
- `n3` - RDF store and utilities

## License

GPL-3.0-only
