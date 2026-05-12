const PROMETHEUS_URL = "http://localhost:9090";

/**
 * Fetch a single instant value for a given Prometheus query.
 */
export async function fetchInstantQuery(query) {
    try {
        const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.status === "success" && data.data.result.length > 0) {
            // value is [timestamp, "value"]
            return parseFloat(data.data.result[0].value[1]);
        }
    } catch (error) {
        console.error("Prometheus query error:", error);
    }
    return 0;
}

/**
 * Fetch timeseries data over a range.
 * @param {string} query The promQL query
 * @param {number} start Start timestamp in seconds
 * @param {number} end End timestamp in seconds
 * @param {number} step Step interval in seconds
 */
export async function fetchRangeQuery(query, start, end, step = 5) {
    try {
        const url = `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === "success" && data.data.result.length > 0) {
            // result is [{ metric: {}, values: [[ts, "val"], ...] }]
            return data.data.result[0].values.map(val => ({
                timestamp: val[0] * 1000, // convert back to ms for JS
                value: parseFloat(val[1])
            }));
        }
    } catch (error) {
        console.error("Prometheus range query error:", error);
    }
    return [];
}
