package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "internal-bridge-transformers"
	#project: "default"
	#display: {
		name:        "Internal Bridge - Transformers"
		description: "Monitoring dashboard for Internal Bridge transformers components showing throughput"
	}
	#duration:        "1h"
	#refreshInterval: "30s"

	#panelGroups: panelGroupsBuilder & {
		#input: [
			{
				#title: "Performance Metrics"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Throughput platform x type"
								description: "Throughput per data type and platform"
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
												query: "sum by (platform, type) (rate(internal_bridge_transformer_transformation_throughput[30s]))"
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
								name:        "Throughput platform x symbol"
								description: "Throughput per symbol and platform"
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
												query: "sum by (platform, symbol) (rate(internal_bridge_transformer_transformation_throughput[30s]))"
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
								name:        "Throughput platform"
								description: "Throughput platform"
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
												query: "sum by (platform) (rate(internal_bridge_transformer_transformation_throughput[30s]))"
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
								name:        "Throughput full"
								description: "Throughput"
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
												query: "sum(rate(internal_bridge_transformer_transformation_throughput[30s]))"
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
