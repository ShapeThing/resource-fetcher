import { Parser, Store } from "n3";
import grapoi from "grapoi";
import factory from "@rdfjs/data-model";

const parser = new Parser({
  baseIRI: "https://example.org/",
  format: "text/turtle",
});
const input = await Deno.readTextFile(
  `${import.meta.url
    .replace("file://", "")
    .replace("/settings.ts", "")}/input.ttl`
);

const quads = parser.parse(input);
const store = new Store(quads);

const shapesPointer = grapoi({
  dataset: store,
  factory,
  term: factory.namedNode("http://ontology.shapething.com/app#GenericView"),
});

export default {
  shapesPointer,
};
