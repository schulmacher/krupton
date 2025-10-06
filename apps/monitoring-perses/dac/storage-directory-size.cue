package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "storage-directory-size"
	#project: "default"
	#display: {
		name:        "Storage - Directory Size"
		description: "Monitoring dashboard for storage directory metrics showing file count, size, and last update time"
	}
	#duration:        "1h"
	#refreshInterval: "30s"

	#panelGroups: panelGroupsBuilder & {
		#input: [
			{
				#title: "Overview"
				#cols:  3
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Total Storage Size"
								description: "Total storage consumption across all directories"
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
												query: "sum(mds_storage_storage_size_bytes)"
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
								name:        "Total File Count"
								description: "Total number of files across all directories"
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
												query: "sum(mds_storage_storage_file_count)"
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
								name:        "Most Recent Update"
								description: "Time since most recent directory update"
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
												query: "time() - max(mds_storage_storage_directory_last_updated_seconds)"
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
				#title: "Storage Size by Directory"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Directory Size"
								description: "Storage size per directory over time"
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
												query:            "mds_storage_storage_size_bytes"
												seriesNameFormat: "{{directory}}"
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
								name:        "Directory Size (Top 5)"
								description: "Top 5 directories by storage size"
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
												query:            "topk(5, mds_storage_storage_size_bytes)"
												seriesNameFormat: "{{directory}}"
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
				#title: "File Count by Directory"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "File Count"
								description: "Number of files per directory over time"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "decimal"
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
												query:            "mds_storage_storage_file_count"
												seriesNameFormat: "{{directory}}"
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
								name:        "File Count (Top 5)"
								description: "Top 5 directories by file count"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "decimal"
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
												query:            "topk(5, mds_storage_storage_file_count)"
												seriesNameFormat: "{{directory}}"
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
				#title: "Last Update Times"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Time Since Last Update"
								description: "Seconds since last update per directory"
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
												query:            "time() - mds_storage_storage_directory_last_updated_seconds"
												seriesNameFormat: "{{directory}}"
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
								name:        "Last Update Timestamp"
								description: "Unix timestamp of last update per directory (seconds since epoch)"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: {
										format: unit: "decimal"
										label: "Unix Timestamp (seconds)"
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
												query:            "mds_storage_storage_directory_last_updated_seconds"
												seriesNameFormat: "{{directory}}"
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
				#title: "Storage Growth"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Storage Growth Rate"
								description: "Rate of storage size increase per directory (bytes/sec)"
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
												query:            "rate(mds_storage_storage_size_bytes[5m])"
												seriesNameFormat: "{{directory}}"
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
								name:        "File Count Growth Rate"
								description: "Rate of file count increase per directory (files/sec)"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "decimal"
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
												query:            "rate(mds_storage_storage_file_count[5m])"
												seriesNameFormat: "{{directory}}"
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

