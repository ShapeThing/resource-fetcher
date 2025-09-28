import { useEffect, useMemo, useState } from 'react'
import Configuration from './components/Configuration'
import Step from './components/Step'
import { ResourceFetcher, type Options, type SourceType, type StepResults } from '../lib/ResourceFetcher'
import { QueryEngine } from '@comunica/query-sparql'
import { DataFactory } from 'rdf-data-factory';
const df = new DataFactory();

const configurationIsComplete = (config: Options) => {
  return config.sources.length > 0 && config.sources[0]?.value.length > 0 && config.subject.value.length > 0
}

type SerializedOptions = {
  subject: string
  sources: SourceType[]
  shapes?: SourceType[]
}

export default function App() {
  const [steps, setSteps] = useState<StepResults[]>([])

  const savedConfiguration: SerializedOptions | undefined = localStorage.getItem('configuration') ? JSON.parse(localStorage.getItem('configuration')!) : undefined

  const defaultConfig: Options = {
    subject: savedConfiguration && savedConfiguration.subject ? df.namedNode(savedConfiguration.subject) : df.namedNode('http://example.org/resource'),
    sources: savedConfiguration && savedConfiguration.sources ? savedConfiguration.sources : [],
    shapes: savedConfiguration && savedConfiguration.shapes ? savedConfiguration.shapes : [],
    engine: new QueryEngine()
  }

  const [configuration, setConfiguration] = useState<Options>(defaultConfig)

  useEffect(() => {
    localStorage.setItem('configuration', JSON.stringify(configuration, (key, value) => {
      if (key === 'engine') return undefined
      if (key === 'subject') return value.value
      return value
    }))
  }, [configuration])

  const [done, setDone] = useState(false)

  const { iterator } = useMemo(() => {
    const fetcher = new ResourceFetcher(configuration)
    setSteps([])
    return {
      fetcher,
      iterator: fetcher.execute()
    }
  }, [configuration])

  const isConfigComplete = configurationIsComplete(configuration)
  const nextIsDisabled = !isConfigComplete || done

  return (
    <>
      <h1>Resource fetcher</h1>
      <div className="accordion">
        <div className='accordion-item'>
          <h2 className='accordion-header'>Configuration</h2>
          <Configuration {...{ configuration, setConfiguration }} />
        </div>
        {steps.map((step, index) => (
          <div key={index} className='accordion-item'>
            <h2 className='accordion-header'>Step {index + 1}</h2>
            <Step step={step} />
          </div>
        ))}
      </div>
      <div className='actions'>
        <button disabled={nextIsDisabled} onClick={() => {
          iterator.next().then(result => {
            if (!result.done) {
              setSteps(steps.concat([result.value]))
            } else {
              setDone(true)
            }
          })
        }}>Next</button>
      </div>
    </>
  )
}
