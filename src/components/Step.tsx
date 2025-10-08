import type { Run } from '../App'

type Props = {
  step: Run['steps'][number]
}

export default function Step({ step }: Props) {
  return (
    <div className="step">
      <details open>
        <summary>Query</summary>
        <pre className="query">{step.query}</pre>
      </details>
      <details open>
        <summary>Results</summary>
        <pre className="results">{step.turtle}</pre>
      </details>
      <details>
        <summary>Branches</summary>
        <pre className="branches">{JSON.stringify(step.branches, null, 2)}</pre>
      </details>
    </div>
  )
}
