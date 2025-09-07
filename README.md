# Resource Fetcher

## How to develop

- Install deno: `curl -fsSL https://deno.land/install.sh | sh`
- Run the tests: `deno test -A --watch --unstable-raw-imports`

## The algorithm

Initialization
1. Generate a tree structure from the given shapes

One step with $depth
2. Generate a query for the tree structure for $depth level(s) deep
3. Execute the query
    for each branch
        and for each quad:
    - The quad object is a literal, keep it
    - The quad object is a blank node, remember to keep fetching, discard the current quad.
    - The quad object is a named node and if the current shape requires it,
        - start a nested ResourceFetcher