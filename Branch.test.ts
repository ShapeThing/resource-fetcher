import { assertEquals } from "@std/assert";
import { Branch } from "./Branch.ts";
import { ResourceFetcher } from "./ResourceFetcher.ts";
import { rf } from "./helpers/namespaces.ts";

const resourceFetcher = new ResourceFetcher({ resourceIri: rf("resource") });

Deno.test("single path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
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
  });

  const branch = new Branch({
    depth: 0,
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

Deno.test("Double zeroOrOne path segment toQueryPatterns", () => {
  const branch = new Branch({
    depth: 0,
    resourceFetcher,
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
      predicate_1: rf("maybe"),
      predicate_2: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe2"),
      predicate_2: rf("toBe"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("maybe2"),
      predicate_2: rf("maybe2"),
      predicate_3: rf("toBe"),
    },
  ]);
});
