import factory from 'npm:@rdfjs/data-model'
import datasetFactory from 'npm:@rdfjs/dataset'
import grapoi from 'npm:grapoi'
import { Parser } from 'npm:n3'
import Shape from './shape.ttl' with { type: 'text' }

const parser = new Parser()
const quads = await parser.parse(Shape)

export default {
    shapesPointer: grapoi({ dataset: datasetFactory.dataset(quads), factory, term: factory.namedNode(`${parser._prefixes['']}PersonShape`) })
};
