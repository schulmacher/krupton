package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "nodejs-process"
	#project: "default"
	#display: {
		name:        "Node.js Process Metrics"
		description: "System and runtime metrics for Node.js processes from prom-client"
	}
	#duration:        "1h"
	#refreshInterval: "30s"

	#variables: [
		{
			kind: "TextVariable"
			spec: {
				name:  "job"
				value: "mds"
				display: {
					name:        "Job"
					description: "Prometheus job name filter (partial match, leave empty for all)"
					hidden:      false
				}
			}
		},
	]

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
								name:        "CPU Usage Rate"
								description: "CPU seconds per second (user + system)"
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
												query: "rate(process_cpu_seconds_total{job=~\".*${job}.*\"}[1m])"
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
								name:        "Resident Memory"
								description: "Physical memory used by the process"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "bytes"
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
												query: "process_resident_memory_bytes{job=~\".*${job}.*\"}"
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
								name:        "Heap Used"
								description: "Heap memory currently in use"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "bytes"
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
												query: "nodejs_heap_size_used_bytes{job=~\".*${job}.*\"}"
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
								name:        "Event Loop Lag (p99)"
								description: "99th percentile event loop lag"
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
												query: "nodejs_eventloop_lag_p99_seconds{job=~\".*${job}.*\"}"
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
				#title: "CPU & Memory"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "CPU Time"
								description: "CPU time breakdown (user vs system)"
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
												query:            "rate(process_cpu_user_seconds_total{job=~\".*${job}.*\"}[1m])"
												seriesNameFormat: "User CPU"
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
												query:            "rate(process_cpu_system_seconds_total{job=~\".*${job}.*\"}[1m])"
												seriesNameFormat: "System CPU"
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
								name:        "Memory Usage"
								description: "Resident and virtual memory over time"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "bytes"
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
												query:            "process_resident_memory_bytes{job=~\".*${job}.*\"}"
												seriesNameFormat: "Resident Memory"
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
												query:            "process_virtual_memory_bytes{job=~\".*${job}.*\"}"
												seriesNameFormat: "Virtual Memory"
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
				#title: "Heap Memory"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Heap Size"
								description: "Total and used heap size"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "bytes"
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
												query:            "nodejs_heap_size_total_bytes{job=~\".*${job}.*\"}"
												seriesNameFormat: "Total Heap"
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
												query:            "nodejs_heap_size_used_bytes{job=~\".*${job}.*\"}"
												seriesNameFormat: "Used Heap"
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
								name:        "Heap Utilization"
								description: "Percentage of heap being used"
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
												query: "100 * (nodejs_heap_size_used_bytes{job=~\".*${job}.*\"} / nodejs_heap_size_total_bytes{job=~\".*${job}.*\"})"
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
								name:        "External Memory"
								description: "Memory used by C++ objects bound to JavaScript"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "bytes"
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
												query: "nodejs_external_memory_bytes{job=~\".*${job}.*\"}"
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
								name:        "Heap Space Usage"
								description: "Heap space breakdown by type"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "bytes"
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
												query: "nodejs_heap_space_size_used_bytes{job=~\".*${job}.*\"}"
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
				#title: "Event Loop"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Event Loop Lag"
								description: "Event loop lag statistics"
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
												query:            "nodejs_eventloop_lag_mean_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "Mean"
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
												query:            "nodejs_eventloop_lag_min_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "Min"
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
												query:            "nodejs_eventloop_lag_max_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "Max"
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
								name:        "Event Loop Lag Percentiles"
								description: "Event loop lag p50, p90, p99"
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
												query:            "nodejs_eventloop_lag_p50_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "p50"
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
												query:            "nodejs_eventloop_lag_p90_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "p90"
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
												query:            "nodejs_eventloop_lag_p99_seconds{job=~\".*${job}.*\"}"
												seriesNameFormat: "p99"
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
				#title: "System Resources"
				#cols:  3
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "File Descriptors"
								description: "Open file descriptors"
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
												query:            "process_open_fds{job=~\".*${job}.*\"}"
												seriesNameFormat: "Open FDs"
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
												query:            "process_max_fds{job=~\".*${job}.*\"}"
												seriesNameFormat: "Max FDs"
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
								name:        "Active Handles"
								description: "Number of active libuv handles"
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
												query: "nodejs_active_handles_total{job=~\".*${job}.*\"}"
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
								name:        "Active Requests"
								description: "Number of active libuv requests"
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
												query: "nodejs_active_requests_total{job=~\".*${job}.*\"}"
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
