import { Fragment, useEffect, useMemo, useState } from 'react'
import Configuration from './components/Configuration'
import Step from './components/Step'
import { ResourceFetcher, type Options, type SourceType, type StepResults } from '../lib/ResourceFetcher'
import { QueryEngine } from '@comunica/query-sparql'
import { DataFactory } from 'rdf-data-factory'
import { write } from '@jeswr/pretty-turtle'
import tests from './tests'
import { useLocalStorage } from '@uidotdev/usehooks'
import { prefixes } from '../lib/helpers/namespaces'
import intro from '../README.md?raw'
import Markdown from 'react-markdown'
import type { NamedNode } from '@rdfjs/types'
const df = new DataFactory()

type SerializedOptions = {
  subject: string
  sources: SourceType[]
  shapes?: SourceType
}

export type Run = {
  name: string
  done?: true
  steps: (StepResults & { turtle: string })[]
  test?: {
    name: string
    input: {
      subject: NamedNode
      sources: SourceType[]
      shapes?: SourceType
    }
    output: string
  }
  conforms?: boolean
  startTime?: number
  endTime?: number
}

let initHasRun = false

const EMPTY_RUNS: Run[] = [{ name: 'Configuration', steps: [] }]

export default function App() {
  const savedConfiguration: SerializedOptions | undefined = localStorage.getItem('configuration')
    ? JSON.parse(localStorage.getItem('configuration')!)
    : undefined

  const defaultConfig: Options = {
    subject:
      savedConfiguration && savedConfiguration.subject
        ? df.namedNode(savedConfiguration.subject)
        : df.namedNode('http://example.org/resource'),
    sources: savedConfiguration && savedConfiguration.sources ? savedConfiguration.sources : [],
    shapes: savedConfiguration && savedConfiguration.shapes ? savedConfiguration.shapes : undefined,
    engine: new QueryEngine()
  }

  const [runs, setRuns] = useState<Run[]>([])
  const [runType, setRunType] = useLocalStorage<'configuration' | 'all-tests'>('runType', 'all-tests')

  useEffect(() => {
    if (runType === 'all-tests' && !initHasRun) {
      initHasRun = true
      setRuns([])
      runAllTests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [configuration, setConfiguration] = useState<Options>(defaultConfig)
  useEffect(() => {
    localStorage.setItem(
      'configuration',
      JSON.stringify(configuration, (key, value) => {
        if (key === 'engine') return undefined
        if (key === 'subject') return value.value
        return value
      })
    )
  }, [configuration])

  const { iterator } = useMemo(() => {
    const fetcher = new ResourceFetcher(configuration)
    return {
      fetcher,
      iterator: fetcher.execute()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuration, runType])

  const runAllTests = async () => {
    setRuns([])
    for (const test of tests) {
      const startTime = Date.now()
      setRuns(runs => [...runs, { name: test.name, steps: [], test, startTime }])
      const fetcher = new ResourceFetcher({
        subject: test.input.subject,
        sources: test.input.sources,
        shapes: test.input.shapes,
        engine: new QueryEngine()
      })
      const iterator = fetcher.execute()
      let result = await iterator.next()
      while (!result.done) {
        const step = result.value
        const turtle = await write([...step.dataset], {
          prefixes
        })
        setRuns(runs => {
          const newRuns = [...runs]
          newRuns[newRuns.length - 1] = {
            ...newRuns[newRuns.length - 1],
            steps: [...newRuns[newRuns.length - 1].steps, { ...step, turtle }]
          }
          return newRuns
        })
        result = await iterator.next()
      }

      const endTime = Date.now()
      setRuns(runs => {
        const newRuns = [...runs]
        const lastStep = newRuns[newRuns.length - 1].steps.at(-1)!

        if (test.output.trim() !== lastStep.turtle.trim()) {
          console.log(test.output.trim())
          console.log('-----')
          console.log(lastStep.turtle.trim())
        }

        newRuns[newRuns.length - 1] = {
          ...newRuns[newRuns.length - 1],
          done: true,
          endTime,
          conforms: test.output ? test.output.trim() === lastStep.turtle.trim() : undefined
        }
        return newRuns
      })
    }
  }

  const nextStep = () => {
    iterator.next().then(async result => {
      if (!result.done) {
        const turtle = await write([...result.value.dataset], {
          prefixes
        })
        setRuns(runs => {
          const newRuns = [...(runs.length ? runs : EMPTY_RUNS)]
          newRuns[newRuns.length - 1] = {
            ...newRuns[newRuns.length - 1],
            steps: [...newRuns[newRuns.length - 1].steps, { ...result.value, turtle }]
          }
          return newRuns
        })
      } else {
        setRuns(runs => {
          const newRuns = [...runs]
          newRuns[newRuns.length - 1] = { ...newRuns[newRuns.length - 1], done: true }
          return newRuns
        })
      }
    })
  }

  return (
    <>
      <header>
        <Markdown>{intro.split('## The Problem')[0]}</Markdown>
      </header>
      <div className="accordion">
        <div className="accordion-item">
          <h2 className="accordion-header">
            <label>
              <input
                type="radio"
                value={'all-tests'}
                checked={runType === 'all-tests'}
                onChange={() => {
                  setRunType('all-tests')
                  runAllTests()
                }}
                name="run-type"
              />
              Run all tests
            </label>
            {/* <label>
              <input
                type="radio"
                value={'configuration'}
                checked={runType === 'configuration'}
                onChange={() => {
                  setRuns(EMPTY_RUNS)
                  setRunType('configuration')
                }}
                name="run-type"
              />
              Playground
            </label> */}
          </h2>
          {runType === 'all-tests' ? null : (
            <>
              <Configuration {...{ configuration, setConfiguration }} />
              <div className="actions">
                <button disabled={runs.at(-1)?.done} onClick={nextStep}>
                  Next
                </button>
              </div>
            </>
          )}
        </div>
        {runs.map((run, runIndex) => {
          const status = run.done && 'conforms' in run ? (run.conforms ? 'successful' : 'failed') : ''

          const shapes =
            run.test?.input?.shapes?.value && run.test?.input?.shapes?.value?.length > 2
              ? run.test?.input?.shapes?.value
              : undefined

          return (
            <Fragment key={runIndex}>
              {run.steps.length ? (
                <details
                  open={!run.conforms}
                  key={runIndex + '-' + runIndex}
                  className={`accordion-item status-${status || 'unknown'}`}
                >
                  <summary className="accordion-header" key={runIndex}>
                    {status === 'successful' ? '✓' : status === 'failed' ? '✗' : null} {run.name}
                    <span className="test-info">
                      {run.steps.length > 0 && (
                        <span className="step-count"> {run.steps.length} step{run.steps.length !== 1 ? 's' : ''}</span>
                      )}
                      {run.startTime && run.endTime && (
                        <span className="execution-time"> ({run.endTime - run.startTime}ms on an in-memory dataset)</span>
                      )}
                    </span>
                  </summary>

                  {shapes ? (
                    <div>
                      <h3>These SHACL shapes are used to guide the fetching</h3>
                      <pre>{shapes}</pre>
                    </div>
                  ) : null}

                  {run.steps.map((step, stepIndex) => (
                    <div key={runIndex + '-' + stepIndex} className="">
                      <h5 className="step-title">Step {stepIndex + 1}</h5>
                      <Step key={`${runIndex}-${stepIndex}`} run={run} step={step} depth={stepIndex + 1} />
                    </div>
                  ))}
                </details>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
