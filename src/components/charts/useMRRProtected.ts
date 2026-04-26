import { useEffect, useState } from "react";

export function useMRRProtected() {
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        fetch("/api/dashboard/mrr-protected")
            .then(r => r.json())
            .then(setData);
    }, []);

    return {
        labels: data.map(d => d.name),
        values: data.map(d => d.mrr),
    };
}