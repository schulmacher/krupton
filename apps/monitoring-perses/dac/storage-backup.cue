package mydac

import (
	dashboardBuilder "github.com/perses/perses/cue/dac-utils/dashboard@v0"
	panelGroupsBuilder "github.com/perses/perses/cue/dac-utils/panelgroups@v0"
)

dashboardBuilder & {
	#name:    "storage-backup"
	#project: "default"
	#display: {
		name:        "Storage - Backup"
		description: "Monitoring dashboard for storage backup metrics showing backup size and timing"
	}
	#duration:        "24h"
	#refreshInterval: "1m"

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
								name:        "Total Backup Size"
								description: "Total size of all backup archives"
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
												query: "mds_storage_storage_backup_size_bytes"
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
								name:        "Time Since Last Backup"
								description: "Time elapsed since the most recent backup"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "hours"
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
												query: "(time() - mds_storage_storage_backup_last_timestamp_seconds) / 3600"
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
								name:        "Backup Success Rate"
								description: "Ratio of successful backups to total backup attempts"
							}
							plugin: {
								kind: "StatChart"
								spec: {
									calculation: "last"
									format: unit: "percent-decimal"
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
												query: "mds_storage_storage_backup_successes_total / (mds_storage_storage_backup_successes_total + mds_storage_storage_backup_failures_total)"
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
				#title: "Backup Size Trends"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Backup Size Over Time"
								description: "Total backup archive size over time"
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
												query:            "mds_storage_storage_backup_size_bytes"
												seriesNameFormat: "Total Size"
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
								name:        "Backup Size Growth Rate"
								description: "Rate of backup size increase (bytes/sec)"
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
												query:            "rate(mds_storage_storage_backup_size_bytes[5m])"
												seriesNameFormat: "Growth Rate"
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
				#title: "Backup Timeline"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Backup Activity Timeline"
								description: "Timeline showing when backups occur (X-axis shows actual dates/times)"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: {
										format: unit: "decimal"
										label: "Backup Count"
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
												query:            "changes(mds_storage_storage_backup_successes_total[1h])"
												seriesNameFormat: "Backups"
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
								name:        "Backup Age Over Time"
								description: "How old the most recent backup is at each point in time"
							}
							plugin: {
								kind: "TimeSeriesChart"
								spec: {
									legend: position: "bottom"
									yAxis: format: unit: "hours"
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
												query:            "(time() - mds_storage_storage_backup_last_timestamp_seconds) / 3600"
												seriesNameFormat: "Backup Age (hours)"
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
				#title: "Backup Operations"
				#cols:  2
				#panels: [
					{
						kind: "Panel"
						spec: {
							display: {
								name:        "Backup Operations Total"
								description: "Total number of successful backup operations"
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
												query:            "mds_storage_storage_backup_successes_total"
												seriesNameFormat: "Successful"
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
								name:        "Backup Failures Total"
								description: "Total number of failed backup operations"
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
												query:            "mds_storage_storage_backup_failures_total"
												seriesNameFormat: "Failed"
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


