package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "external-bridge-websocket"
	#project: "default"
	#display: {
		name:        "External Bridge - WebSockets"
		description: "Monitoring dashboard for External Bridge WebSocket component showing connection status, message metrics, and performance"
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
								name:        "Connection Status"
								description: "WebSocket connection status (1=connected, 0=disconnected)"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "decimal"
									thresholds: {
										defaultColor: "red"
										steps: [
											{value: 1, color: "green"},
										]
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
												query: "external_bridge_websocket_websocket_connection_status"
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
								name:        "Active Subscriptions"
								description: "Number of active WebSocket subscriptions"
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
												query: "external_bridge_websocket_websocket_active_subscriptions"
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
								name:        "Connection Uptime"
								description: "WebSocket connection uptime in seconds"
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
												query: "external_bridge_websocket_websocket_connection_uptime_seconds"
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
								name:        "Time Since Last Message"
								description: "Seconds since last received message"
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
												query: "time() - max(external_bridge_websocket_websocket_last_message_timestamp_seconds)"
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
				#title: "Message Metrics"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Message Rate"
								description: "Rate of WebSocket messages received per second by stream type and status"
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
												query: "sum by (platform, stream_type, status) (rate(external_bridge_websocket_websocket_messages_received_total[1m]))"
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
								description: "Percentage of successfully processed messages"
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
												query: "100 * (sum(rate(external_bridge_websocket_websocket_messages_received_total{status=\"success\"}[1m])) / sum(rate(external_bridge_websocket_websocket_messages_received_total[1m])))"
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
								name:        "Messages by Stream Type"
								description: "Message rate grouped by stream type"
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
												query: "sum by (stream_type) (rate(external_bridge_websocket_websocket_messages_received_total[1m]))"
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
								name:        "Validation Errors"
								description: "Rate of message validation errors by stream type"
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
												query: "sum by (platform, stream_type) (rate(external_bridge_websocket_websocket_validation_errors_total[1m]))"
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
								name:        "Message Processing Duration (p50, p95, p99)"
								description: "Message processing latency percentiles by stream type"
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
												query:            "histogram_quantile(0.50, sum by (stream_type, le) (rate(external_bridge_websocket_websocket_message_processing_duration_seconds_bucket[1m])))"
												seriesNameFormat: "p50 - {{stream_type}}"
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
												query:            "histogram_quantile(0.95, sum by (stream_type, le) (rate(external_bridge_websocket_websocket_message_processing_duration_seconds_bucket[1m])))"
												seriesNameFormat: "p95 - {{stream_type}}"
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
												query:            "histogram_quantile(0.99, sum by (stream_type, le) (rate(external_bridge_websocket_websocket_message_processing_duration_seconds_bucket[1m])))"
												seriesNameFormat: "p99 - {{stream_type}}"
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
								description: "Rate of message processing errors per second by stream type"
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
												query: "sum by (platform, stream_type) (rate(external_bridge_websocket_websocket_messages_received_total{status=\"error\"}[1m]))"
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
								name:        "Reconnection Attempts"
								description: "Rate of WebSocket reconnection attempts"
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
												query: "sum by (platform) (rate(external_bridge_websocket_websocket_reconnection_attempts_total[5m]))"
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
								name:        "Connection Status History"
								description: "WebSocket connection status over time"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: {
										min: 0
										max: 1
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
												query: "external_bridge_websocket_websocket_connection_status"
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
				#title: "Last Message Timestamps"
				#cols:  1
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Last Message by Stream Type"
								description: "Timestamp of last received message for each stream type"
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
												query: "time() - external_bridge_websocket_websocket_last_message_timestamp_seconds"
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

