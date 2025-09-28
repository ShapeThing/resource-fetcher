import { useEffect, useMemo, useState } from 'react'
import Configuration from './components/Configuration'
import Step from './components/Step'
import { ResourceFetcher, type Options, type SourceType, type StepResults } from '../lib/ResourceFetcher'
import { QueryEngine } from '@comunica/query-sparql'
import { DataFactory } from 'rdf-data-factory'
import tests from './tests'
import { write } from '@jeswr/pretty-turtle'

const df = new DataFactory()

const configurationIsComplete = (config: Options) => {
  return config.sources.length > 0 && config.sources[0]?.value.length > 0 && config.subject.value.length > 0
}

type SerializedOptions = {
  subject: string
  sources: SourceType[]
  shapes?: SourceType[]
}

export type MaterializedStepResults = StepResults & { turtle: string }

export default function App() {
  const [steps, setSteps] = useState<MaterializedStepResults[]>([])

  const savedConfiguration: SerializedOptions | undefined = localStorage.getItem('configuration')
    ? JSON.parse(localStorage.getItem('configuration')!)
    : undefined

  const defaultConfig: Options = {
    subject:
      savedConfiguration && savedConfiguration.subject
        ? df.namedNode(savedConfiguration.subject)
        : df.namedNode('http://example.org/resource'),
    sources: savedConfiguration && savedConfiguration.sources ? savedConfiguration.sources : [],
    shapes: savedConfiguration && savedConfiguration.shapes ? savedConfiguration.shapes : [],
    engine: new QueryEngine()
  }

  const [configuration, setConfiguration] = useState<Options>(defaultConfig)
  const [runType, setRunType] = useState<'configuration' | 'tests'>('configuration')

  useEffect(() => {
    localStorage.setItem(
      'configuration',
      JSON.stringify(configuration, (key, value) => {
        if (key === 'engine') return undefined
        if (key === 'subject') return value.value
        return value
      })
    )
  }, [configuration, runType])

  const [done, setDone] = useState(false)
  const [testIndex, setTestIndex] = useState(-1)

  const { iterator } = useMemo(() => {
    const fetcher = new ResourceFetcher(
      runType === 'configuration' ? configuration : { ...tests[testIndex]?.input, engine: new QueryEngine() }
    )
    setSteps([])
    setDone(false)
    return {
      fetcher,
      iterator: fetcher.execute()
    }
  }, [configuration, runType, testIndex])

  const isConfigComplete = configurationIsComplete(configuration)
  const nextIsDisabled = done || (runType === 'tests' && testIndex === -1 ? true : !isConfigComplete)

  return (
    <>
      <h1>Resource fetcher</h1>
      <div className="accordion">
        <div className="accordion-item">
          <h2 className="accordion-header">
            <label>
              <input
                type="radio"
                checked={runType === 'configuration'}
                onChange={() => setRunType('configuration')}
                name="run-type"
                value="configuration"
              />
              Configuration
            </label>
            <label>
              <input
                type="radio"
                checked={runType === 'tests'}
                onChange={() => setRunType('tests')}
                name="run-type"
                value="tests"
              />
              Tests
            </label>

            {runType === 'tests' && (
              <select
                value={testIndex}
                onChange={e => {
                  setTestIndex(Number(e.target.value))
                }}
              >
                <option disabled value="-1">
                  - Select a test -
                </option>
                {tests.map((test, index) => (
                  <option key={index} value={index}>
                    Test {index + 1}: {test.name}
                  </option>
                ))}
              </select>
            )}
          </h2>
          {runType === 'configuration' && <Configuration {...{ configuration, setConfiguration }} />}

          <div className="actions">
            <button
              disabled={nextIsDisabled}
              onClick={() => {
                iterator.next().then(async result => {
                  if (!result.done) {
                    setSteps(steps.concat([{ ...result.value, turtle: await write(result.value.dataset.getQuads()) }]))
                  } else {
                    setDone(true)
                  }
                })
              }}
            >
              Next
            </button>
          </div>
        </div>
        {steps.map((step, index) => (
          <div key={index} className="accordion-item">
            <h2 className="accordion-header">Step {index + 1}</h2>
            <Step step={step} />
          </div>
        ))}
      </div>
    </>
  )
}
