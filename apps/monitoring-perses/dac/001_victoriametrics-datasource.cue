package mydac

kind: "GlobalDatasource"
metadata: {
	name: "victoriametrics"
}
spec: {
	default: true
	plugin: {
		kind: "PrometheusDatasource"
		spec: {
			proxy: {
				kind: "HTTPProxy"
				spec: {
					url: "http://localhost:8428"
				}
			}
		}
	}
}

