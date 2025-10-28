package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "external-bridge-fetcher"
	#project: "default"
	#display: {
		name:        "External Bridge - Fetcher"
		description: "Monitoring dashboard for External Bridge Fetcher component showing fetch requests, duration, active symbols, and error metrics"
	}
	#duration:        "1h"
	#refreshInterval: "30s"

	#panelGroups: panelGroupsBuilder & {
		#input: [
			{
				#title: "Overview"
				#cols:  4
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Active Symbols"
								description: "Number of actively monitored symbols"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "decimal"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "external_bridge_fetcher_active_symbols"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Total Fetches"
								description: "Total number of fetch operations completed"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "decimal"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "external_bridge_fetcher_total_fetches"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Time Since Last Fetch"
								description: "Seconds since last successful fetch"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "seconds"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "time() - external_bridge_fetcher_last_fetch_timestamp_seconds"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Total Errors"
								description: "Total number of fetch errors encountered"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "decimal"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "external_bridge_fetcher_total_errors"
											}
										}
									}
								},
							]
						}
					},
				]
			},
			{
				#title: "Request Metrics"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Fetch Request Rate"
								description: "Rate of fetch requests per second by platform, endpoint, and status"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "sum by (platform, endpoint, status) (rate(external_bridge_fetcher_fetch_requests_total[1m]))"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Success Rate"
								description: "Percentage of successful fetch requests"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: {
										format: unit: "percent"
										min:    0
										max:    100
									}
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "100 * (sum(rate(external_bridge_fetcher_fetch_requests_total{status=\"success\"}[1m])) / sum(rate(external_bridge_fetcher_fetch_requests_total[1m])))"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Requests by Platform"
								description: "Request rate grouped by platform"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "sum by (platform) (rate(external_bridge_fetcher_fetch_requests_total[1m]))"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Requests by Endpoint"
								description: "Request rate grouped by endpoint"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "sum by (endpoint) (rate(external_bridge_fetcher_fetch_requests_total[1m]))"
											}
										}
									}
								},
							]
						}
					},
				]
			},
			{
				#title: "Performance Metrics"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Fetch Duration (p50, p95, p99)"
								description: "Fetch operation latency percentiles by platform and endpoint"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "seconds"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query:            "histogram_quantile(0.50, rate(external_bridge_fetcher_fetch_duration_seconds_bucket[1m]))"
												seriesNameFormat: "p50 - {{platform}} - {{endpoint}}"
											}
										}
									}
								},
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query:            "histogram_quantile(0.95, rate(external_bridge_fetcher_fetch_duration_seconds_bucket[1m]))"
												seriesNameFormat: "p95 - {{platform}} - {{endpoint}}"
											}
										}
									}
								},
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query:            "histogram_quantile(0.99, rate(external_bridge_fetcher_fetch_duration_seconds_bucket[1m]))"
												seriesNameFormat: "p99 - {{platform}} - {{endpoint}}"
											}
										}
									}
								},
							]
						}
					},
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Error Rate"
								description: "Rate of fetch errors per second by platform and endpoint"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
								}
							}
							queries: [
								{
									kind: "TimeSeriesQuery"
									spec: {
										plugin: {
											kind: "PrometheusTimeSeriesQuery"
											spec: {
												datasource: {
													kind: "PrometheusDatasource"
													name: "victoriametrics"
												}
												query: "sum by (platform, endpoint) (rate(external_bridge_fetcher_fetch_requests_total{status=\"error\"}[1m]))"
											}
										}
									}
								},
							]
						}
					},
				]
			},
		]
	}
}
