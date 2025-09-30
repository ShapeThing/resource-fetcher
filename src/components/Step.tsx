import type { Run } from "../App"

type Props = {
    step: Run['steps'][number]
}

export default function Step({ step }: Props) {
    return (
        <div className="step">
            <h3>Query</h3>
            <pre className="query">{step.query}</pre>
            <h3>Results</h3>
            <pre className="results">{step.turtle}</pre>
        </div>
    )
}