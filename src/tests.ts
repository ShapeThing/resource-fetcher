import { DataFactory } from 'rdf-data-factory'

const df = new DataFactory()
const modules = import.meta.glob('../public/test/*/iri.txt')
const testNames = new Set(Object.entries(modules).map(([path]) => path.split('/')[3]))

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
    const subject = await fetch(`/test/${name}/iri.txt`).then(res => res.text()).then(m => df.namedNode(m.trim()))
    const source = await fetch(`/test/${name}/input.ttl`).then(res => res.text()).then(m => m.trim())
    const output = await fetch(`/test/${name}/output.ttl`).then(res => res.text()).then(m => m.trim())

    let shape = ''
    try {
      shape = await fetch(`/test/${name}/shape.ttl`).then(res => res.text()).then(m => m.trim())
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
