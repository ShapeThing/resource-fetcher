import type { MaterializedStepResults } from "../App"

type Props = {
    step: MaterializedStepResults
}

export default function Step({ step }: Props) {
    return (
        <div>
            <pre>{step.query}</pre>
            <pre>{step.turtle}</pre>
        </div>
    )
}