import type { QueryPattern } from "./Branch.ts";
import type { Quad_Subject } from "@rdfjs/types";

const serializeTerm = (term: Quad_Subject): string => {
  if (term && typeof term === "object" && "value" in term) {
    return `<${term.value}>`;
  }
  return String(term);
};

const generateValuesClause = (patterns: QueryPattern[]): string => {
  if (patterns.length === 0) return "";

  const keys = Object.keys(patterns[0]).sort();
  const variables = keys.map((key) => `?${key}`).join(" ");

  if (keys.length === 1) {
    // Single variable: no parentheses around values
    const rows = patterns
      .map((pattern) => {
        return serializeTerm(pattern[keys[0]]);
      })
      .join("\n        ");

    return `VALUES ${variables} {\n        ${rows}\n      }`;
  }

  // Multiple variables: use parentheses
  const rows = patterns
    .map((pattern) => {
      const values = keys.map((key) => serializeTerm(pattern[key])).join(" ");
      return `(${values})`;
    })
    .join("\n        ");

  return `VALUES (${variables}) {\n        ${rows}\n      }`;
};

const generateTriplePatterns = (pattern: QueryPattern): string => {
  const keys = Object.keys(pattern).sort();
  const triples: string[] = [];

  // If only node_0 exists (no predicates), add a default triple pattern
  if (keys.length === 1 && keys[0] === "node_0") {
    triples.push(`?node_0 ?predicate_1 ?node_1.`);
    return triples.join("\n      ");
  }

  let nodeCounter = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (key.startsWith("predicate_")) {
      const currentNode = `?node_${nodeCounter}`;
      const nextNode = `?node_${nodeCounter + 1}`;
      triples.push(`${currentNode} ?${key} ${nextNode}.`);
      nodeCounter++;
    } else if (key.startsWith("reverse_predicate_")) {
      const currentNode = `?node_${nodeCounter}`;
      const nextNode = `?node_${nodeCounter + 1}`;
      triples.push(`${nextNode} ?${key} ${currentNode}.`);
      nodeCounter++;
    }
  }

  return triples.join("\n      ");
};

export const generateQuery = (patterns: QueryPattern[]): string => {
  // Group patterns by their keys
  const groupedPatterns = new Map<string, QueryPattern[]>();

  for (const pattern of patterns) {
    const keys = Object.keys(pattern).sort().join(",");
    if (!groupedPatterns.has(keys)) {
      groupedPatterns.set(keys, []);
    }
    groupedPatterns.get(keys)!.push(pattern);
  }

  const unions: string[] = [];

  for (const group of groupedPatterns.values()) {
    const valuesClause = generateValuesClause(group);
    const triplePatterns = generateTriplePatterns(group[0]);

    const block = `    {
      ${valuesClause}
      ${triplePatterns}
    }`;
    unions.push(block);
  }

  const whereClause = unions.join("\n    UNION\n");

  return `SELECT * WHERE {
  GRAPH ?g {
${whereClause}
  }
}`;
};
