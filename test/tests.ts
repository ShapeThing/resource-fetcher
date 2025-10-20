import { DataFactory } from 'rdf-data-factory'

const df = new DataFactory()
const modules = import.meta.glob('./**/*')
const testNames = new Set(Object.entries(modules).map(([path]) => path.split('/')[1]))

const serializedSource = (value: string) => ({
  type: 'serialized',
  value,
  mediaType: 'text/turtle',
  baseIRI: 'http://example.org/'
})

const filtered = [...testNames].some((testName) => testName.endsWith('.only')) ? [...testNames].filter((testName) => testName.endsWith('.only')) : [...testNames]
const filteredTestNames = filtered.filter((testName) => !testName.endsWith('.skip'))

export default await Promise.all(
  filteredTestNames.map(async (name: string) => {
    const subject = await import(`./${name}/iri.txt?raw`).then(m => df.namedNode(m.default.trim()))
    const source = await import(`./${name}/input.ttl?raw`).then(m => m.default.trim())
    const output = await import(`./${name}/output.ttl?raw`).then(m => m.default.trim())

    let shape = ''
    try {
      shape = await import(`./${name}/shape.ttl?raw`).then(m => m.default.trim())
    } catch {
      /* */
    }

    return {
      name: name.replace('.only', '').replace('.skip', ''),
      input: {
        subject,
        sources: [serializedSource(source)],
        shapes: shape ? serializedSource(shape) : undefined
      },
      output
    }
  })
)
