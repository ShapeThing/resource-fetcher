import { Quad_Subject } from "@rdfjs/types";

// Generate cartesian product of all predicate combinations
export const cartesianProduct = (arrays: Quad_Subject[][]): Quad_Subject[][] => {
  if (arrays.length === 0) return [[]];
  if (arrays.length === 1) return arrays[0].map((item) => [item]);

  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);

  return first.flatMap((item) =>
    restProduct.map((restItems) => [item, ...restItems])
  );
};
