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

const fetchTestFile = async (testName: string, fileName: string) => {
  const response = await fetch(`/test/${testName}/${fileName}`)
  return response.headers.get('content-type') !== 'text/html' ? (await response.text()).trim() : ''
}

export default await Promise.all(
  filteredTestNames.map(async (name: string) => {
    const subject = await fetchTestFile(name, 'iri.txt').then(m => df.namedNode(m))
    const source = await fetchTestFile(name, 'input.ttl')
    const output = await fetchTestFile(name, 'output.ttl')

    let shape = ''
    try {
      shape = await fetchTestFile(name, 'shape.ttl')
    } catch {
      /* */
    }

    let shapeIri = ''
    try {
      shapeIri = await fetch(`/test/${name}/shape-iri.txt`).then(res => {
        return res.headers.get('content-type') !== 'text/html' ? res.text() : ''
      }).then(m => m.trim())
    } catch {
      /* */
    }

    return {
      name: name.replace('.only', '').replace('.skip', ''),
      input: {
        subject,
        sources: [serializedSource(source)],
        shapes: shape ? serializedSource(shape) : undefined,
        shapeIri: shapeIri ? df.namedNode(shapeIri) : undefined
      },
      output
    }
  })
)
