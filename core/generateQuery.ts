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
  
  // For isList predicates, we need to map them to regular predicate variable names
  const variables = keys.map((key) => {
    if (key.includes("isList")) {
      // Extract the number and create the predicate variable name
      const match = key.match(/predicate_isList_(\d+)/);
      if (match) {
        return `?predicate_${match[1]}`;
      }
    }
    return `?${key}`;
  }).join(" ");

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
      const values = keys
        .map((key) => serializeTerm(pattern[key]))
        .join(" ");
      return `(${values})`;
    })
    .join("\n        ");

  return `VALUES (${variables}) {\n        ${rows}\n      }`;
};

const generateTriplePatterns = (pattern: QueryPattern): string => {
  const keys = Object.keys(pattern);
  const triples: string[] = [];

  let nodeCounter = 0;
  let isLastNodeList = false;

  // If only node_0 exists (no predicates), start with a default triple pattern
  if (keys.length === 1 && keys[0] === "node_0") {
    triples.push(`?node_0 ?predicate_1 ?node_1.`);
    nodeCounter = 1;
    isLastNodeList = false;
  } else {
    // Process all predicate keys
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = pattern[key];

      if (key.includes("isList")) {
        // Extract the predicate number
        const match = key.match(/predicate_isList_(\d+)/);
        if (match) {
          const predicateNum = match[1];
          const predicateVar = `?predicate_${predicateNum}`;
          
          const previousItemIsList = keys[i - 1]?.includes('isList');
          const currentNode = nodeCounter === 0 ? `?node_0` : `?node_${previousItemIsList ? 'list_' : ''}${nodeCounter}`;
          const nextNode = `?node_${nodeCounter + 1}`;
          const listNode = `?node_list_${nodeCounter + 2}`;
          
          // First add the predicate itself as a normal triple pattern
          triples.push(`${currentNode} ${predicateVar} ${nextNode}.`);
          // Then add the list traversal pattern
          triples.push(`${nextNode} <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest>*/<http://www.w3.org/1999/02/22-rdf-syntax-ns#first> ${listNode}.`);
          nodeCounter += 2; // Increment by 2: one for intermediate node, one for list node
          isLastNodeList = true;
        }
      } else if (key.startsWith("predicate_")) {
        const previousItemIsList = keys[i - 1]?.includes('isList');
        const currentNode = `?node_${previousItemIsList ? 'list_' : ''}${nodeCounter}`;
        const nextNode = `?node_${nodeCounter + 1}`;
        triples.push(`${currentNode} ?${key} ${nextNode}.`);
        nodeCounter++;
        isLastNodeList = false;
      } else if (key.startsWith("reverse_predicate_")) {
        const previousItemIsList = keys[i - 1]?.includes('isList');
        const currentNode = `?node_${previousItemIsList ? 'list_' : ''}${nodeCounter}`;
        const nextNode = `?node_${nodeCounter + 1}`;
        triples.push(`${nextNode} ?${key} ${currentNode}.`);
        nodeCounter++;
        isLastNodeList = false;
      }
    }
  }

  // Overfetch one level: add one more triple pattern
  const overfetchNode = `?node_${isLastNodeList ? 'list_' : ''}${nodeCounter}`;
  const overfetchNextNode = `?node_${nodeCounter + 1}`;
  const overfetchPredicate = `?predicate_${nodeCounter + 1}`;
  triples.push(`${overfetchNode} ${overfetchPredicate} ${overfetchNextNode}.`);

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

    // Split triple patterns into required and optional (overfetch)
    const patternLines = triplePatterns.split("\n      ");
    const requiredPatterns = patternLines.slice(0, -1).join("\n      ");
    const overfetchPattern = patternLines[patternLines.length - 1];

    const block = `    {
      ${valuesClause}
      ${requiredPatterns}
      OPTIONAL { ${overfetchPattern} }
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
