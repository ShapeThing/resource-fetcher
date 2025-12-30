import { assertEquals } from "@std/assert";
import { Branch } from "../core/Branch.ts";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import { rf } from "../helpers/namespaces.ts";
import { QueryEngine } from "@comunica/query-sparql";
import dataFactory from '@rdfjs/data-model'

const resourceFetcher = new ResourceFetcher({ resourceIri: rf("resource"), engine: new QueryEngine() });

Deno.test("single path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    type: 'data',
    resourceFetcher,
    path: [
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("toBe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("toBe"),
    },
  ]);
});

Deno.test("alternative path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    type: 'data',
    resourceFetcher,
    path: [
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("toBe"), rf("orNotToBe"), rf("maybe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("orNotToBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe"),
    },
  ]);
});

Deno.test("sequence path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("toBe")],
      },
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("toBe2")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("toBe"),
      predicate_2: rf("toBe2"),
    },
  ]);
});

Deno.test(
  "sequence path segment and a alternative path segment toQueryPatterns",
  () => {
    const branch = new Branch({
      depth: 0,
      resourceFetcher,
      type: 'data',
      path: [
        {
          quantifier: "one",
          start: "subject",
          end: "object",
          predicates: [rf("base")],
        },
        {
          quantifier: "one",
          start: "subject",
          end: "object",
          predicates: [rf("toBe"), rf("orNotToBe"), rf("maybe")],
        },
      ],
    });

    const patterns = branch.toQueryPatterns();
    assertEquals(patterns, [
      {
        node_0: rf("resource"),
        predicate_1: rf("base"),
        predicate_2: rf("toBe"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("base"),
        predicate_2: rf("orNotToBe"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("base"),
        predicate_2: rf("maybe"),
      },
    ]);
  }
);

Deno.test("reverse path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "one",
        start: "object",
        end: "subject",
        predicates: [rf("toBe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      reverse_predicate_1: rf("toBe"),
    },
  ]);
});

Deno.test("reverse path segment inside a sequence toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("workedAt")],
      },
      {
        quantifier: "one",
        start: "object",
        end: "subject",
        predicates: [rf("residesInCountry")],
      },
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("hasPopulation")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("workedAt"),
      reverse_predicate_2: rf("residesInCountry"),
      predicate_3: rf("hasPopulation"),
    },
  ]);
});

Deno.test("oneOrMore path segment with a counter of 0 toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "oneOrMore",
        start: "subject",
        end: "object",
        predicates: [rf("rest")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
    },
  ]);
});

Deno.test(
  "sequence and oneOrMore path segment with a counter of 0 toQueryPatterns",
  () => {
    const branch = new Branch({
      depth: 0,
      resourceFetcher,
      type: 'data',
      path: [
        {
          quantifier: "one",
          start: "subject",
          end: "object",
          predicates: [rf("toBe")],
        },
        {
          quantifier: "oneOrMore",
          start: "subject",
          end: "object",
          predicates: [rf("rest")],
        },
      ],
    });

    const patterns = branch.toQueryPatterns();
    assertEquals(patterns, [
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
        predicate_4: rf("rest"),
      },
    ]);
  }
);

Deno.test(
  "sequence and oneOrMore path segment with a counter of 1 toQueryPatterns",
  () => {
    const branch = new Branch({
      depth: 0,
      queryCounter: 1,
      type: 'data',
      resourceFetcher,
      path: [
        {
          quantifier: "one",
          start: "subject",
          end: "object",
          predicates: [rf("toBe")],
        },
        {
          quantifier: "oneOrMore",
          start: "subject",
          end: "object",
          predicates: [rf("rest")],
        },
      ],
    });

    const patterns = branch.toQueryPatterns();
    assertEquals(patterns, [
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
        predicate_4: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
        predicate_4: rf("rest"),
        predicate_5: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
        predicate_4: rf("rest"),
        predicate_5: rf("rest"),
        predicate_6: rf("rest"),
      },
      {
        node_0: rf("resource"),
        predicate_1: rf("toBe"),
        predicate_2: rf("rest"),
        predicate_3: rf("rest"),
        predicate_4: rf("rest"),
        predicate_5: rf("rest"),
        predicate_6: rf("rest"),
        predicate_7: rf("rest"),
      },
    ]);
  }
);

Deno.test("oneOrMore path segment with recursionStepMultiplier of 2", () => {
  const customResourceFetcher = new ResourceFetcher({
    resourceIri: rf("resource"),
    recursionStepMultiplier: 2,
    engine: new QueryEngine(),
  });

  const branch = new Branch({
    depth: 0,
    type: 'data',
    resourceFetcher: customResourceFetcher,
    path: [
      {
        quantifier: "oneOrMore",
        start: "subject",
        end: "object",
        predicates: [rf("rest")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
    },
  ]);
});

Deno.test("zeroOrMore path segment with a counter of 0 toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "zeroOrMore",
        start: "subject",
        end: "object",
        predicates: [rf("rest")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
    },
  ]);
});

Deno.test("zeroOrMore path segment with a counter of 1 toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    queryCounter: 1,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "zeroOrMore",
        start: "subject",
        end: "object",
        predicates: [rf("rest")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
      predicate_4: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
      predicate_4: rf("rest"),
      predicate_5: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
      predicate_4: rf("rest"),
      predicate_5: rf("rest"),
      predicate_6: rf("rest"),
    },
  ]);
});

Deno.test("zeroOrOne path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "zeroOrOne",
        start: "subject",
        end: "object",
        predicates: [rf("maybe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe"),
    },
  ]);
});

Deno.test("double zeroOrOne path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "zeroOrOne",
        start: "subject",
        end: "object",
        predicates: [rf("maybe")],
      },
      {
        quantifier: "zeroOrOne",
        start: "subject",
        end: "object",
        predicates: [rf("maybe2")],
      },
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("toBe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe2"),
      predicate_2: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe"),
      predicate_2: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe"),
      predicate_2: rf("maybe2"),
      predicate_3: rf("toBe"),
    },
  ]);
});

Deno.test("reversed zeroOrOne path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    type: 'data',
    resourceFetcher,
    path: [
      {
        quantifier: "zeroOrOne",
        start: "object",
        end: "subject",
        predicates: [rf("maybe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
    },
    {
      node_0: rf("resource"),
      reverse_predicate_1: rf("maybe"),
    },
  ]);
});

Deno.test("nested branches with each a simple Path toQueryPatterns", () => {
  const rootBranch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    path: [
      {
        quantifier: "one",
        start: "subject",
        end: "object",
        predicates: [rf("a")],
      },
    ],
  });

  const a = dataFactory.blankNode()

  const addedBranches = rootBranch.createChildBranchesByDataQuads([dataFactory.quad(rf("b1"), rf("b1"), a), dataFactory.quad(a, rf("b1"), dataFactory.blankNode())]);
  rootBranch.createChildBranchesByDataQuads([dataFactory.quad(rf("b2"), rf("b2"), a), dataFactory.quad(a, rf("b2"), dataFactory.blankNode())]);
  addedBranches[0].createChildBranchesByDataQuads([dataFactory.quad(rf("c1"), rf("c1"), a), dataFactory.quad(a, rf("c1"), dataFactory.blankNode())]);

  const patterns = rootBranch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
      predicate_1: rf("a"),
      predicate_2: rf("b1"),
      predicate_3: rf("c1"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("a"),
      predicate_2: rf("b2"),
    },
  ]);
});

Deno.test("zeroOrOne path segment with isList toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
    type: 'data',
    isList: true,
    path: [
      {
        quantifier: "zeroOrOne",
        start: "subject",
        end: "object",
        predicates: [rf("maybe")],
      },
    ],
  });

  const patterns = branch.toQueryPatterns();
  assertEquals(patterns, [
    {
      node_0: rf("resource"),
    },
    {
      node_0: rf("resource"),
      predicate_isList_1: rf("maybe"),
    },
  ]);
});
