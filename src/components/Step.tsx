import type { StepResults } from "../../lib/ResourceFetcher"

type Props = {
    step: StepResults
}

export default function Step({ step }: Props) {
    return (
        <div>
            <pre>{step.query}</pre>
            <pre>{step.dataset.toString()}</pre>
        </div>
    )
}