"""Tests for HTTP server module."""

from fastapi.testclient import TestClient
from pydantic import Field

from service_framework import DefaultEnv, create_diagnostic_context, create_metrics_context
from service_framework.http_server import (
    HealthCheckResult,
    HttpServerConfig,
    create_http_server,
)
from service_framework.metrics_context import MetricsConfig


class HttpServerTestEnv(DefaultEnv):
    PORT: int = Field(default=8080)
    PROCESS_NAME: str = Field(default="test-service")


class MockProcessContext:
    def __init__(self):
        self._shutting_down = False
        self._shutdown_callbacks = []

    def is_shutting_down(self) -> bool:
        return self._shutting_down

    def set_shutting_down(self, value: bool) -> None:
        self._shutting_down = value

    def register_shutdown_callback(self, callback) -> None:
        self._shutdown_callbacks.append(callback)

    def shutdown(self) -> None:
        pass

    def restart(self) -> None:
        pass


class MockServiceContext:
    def __init__(self, env: HttpServerTestEnv | None = None):
        self.env = env or HttpServerTestEnv()
        self.diagnostic = create_diagnostic_context(self.env)
        self.process = MockProcessContext()
        metrics_config = MetricsConfig(env_context=self.env)
        self.metrics_context = create_metrics_context(metrics_config)


class TestHttpServerHealthCheck:
    def test_health_check_returns_healthy_status_when_no_checks_configured(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert data["components"] == []

    def test_health_check_returns_unhealthy_when_shutting_down(self):
        context = MockServiceContext()
        context.process.set_shutting_down(True)
        server = create_http_server(context)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"

    def test_health_check_executes_configured_health_checks(self):
        context = MockServiceContext()

        async def mock_health_check() -> HealthCheckResult:
            return HealthCheckResult(component="database", is_healthy=True)

        config = HttpServerConfig(health_checks=[mock_health_check])
        server = create_http_server(context, config)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert len(data["components"]) == 1
        assert data["components"][0]["component"] == "database"
        assert data["components"][0]["isHealthy"] is True

    def test_health_check_returns_unhealthy_when_component_fails(self):
        context = MockServiceContext()

        async def failing_health_check() -> HealthCheckResult:
            return HealthCheckResult(component="cache", is_healthy=False)

        config = HttpServerConfig(health_checks=[failing_health_check])
        server = create_http_server(context, config)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert len(data["components"]) == 1
        assert data["components"][0]["component"] == "cache"
        assert data["components"][0]["isHealthy"] is False

    def test_health_check_with_multiple_components(self):
        context = MockServiceContext()

        async def database_check() -> HealthCheckResult:
            return HealthCheckResult(component="database", is_healthy=True)

        async def cache_check() -> HealthCheckResult:
            return HealthCheckResult(component="cache", is_healthy=True)

        config = HttpServerConfig(health_checks=[database_check, cache_check])
        server = create_http_server(context, config)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert len(data["components"]) == 2

    def test_health_check_fails_if_any_component_unhealthy(self):
        context = MockServiceContext()

        async def healthy_check() -> HealthCheckResult:
            return HealthCheckResult(component="database", is_healthy=True)

        async def unhealthy_check() -> HealthCheckResult:
            return HealthCheckResult(component="cache", is_healthy=False)

        config = HttpServerConfig(health_checks=[healthy_check, unhealthy_check])
        server = create_http_server(context, config)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert len(data["components"]) == 2

    def test_health_check_handles_exceptions_in_health_checks(self):
        context = MockServiceContext()

        async def failing_check() -> HealthCheckResult:
            raise RuntimeError("Health check failed")

        config = HttpServerConfig(health_checks=[failing_check])
        server = create_http_server(context, config)
        client = TestClient(server.app)

        response = client.get("/health")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"

    def test_health_check_includes_correlation_id_in_response_headers(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        response = client.get("/health")

        assert "x-correlation-id" in response.headers
        assert response.headers["x-correlation-id"].startswith("req-")

    def test_health_check_uses_provided_correlation_id(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        custom_correlation_id = "custom-correlation-123"
        response = client.get("/health", headers={"x-correlation-id": custom_correlation_id})

        assert response.headers["x-correlation-id"] == custom_correlation_id


class TestHttpServerMetrics:
    def test_metrics_endpoint_returns_prometheus_format(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        response = client.get("/metrics")

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]

    def test_metrics_endpoint_includes_http_request_metrics(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        client.get("/health")
        client.get("/health")

        response = client.get("/metrics")
        metrics_text = response.text

        assert "test_service_http_requests_total" in metrics_text
        assert "test_service_http_request_duration_seconds" in metrics_text

    def test_http_requests_are_counted(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        client.get("/health")
        client.get("/health")
        client.get("/health")

        response = client.get("/metrics")
        metrics_text = response.text

        assert 'method="GET"' in metrics_text
        assert 'route="/health"' in metrics_text
        assert 'status_code="200"' in metrics_text

    def test_http_request_duration_is_tracked(self):
        context = MockServiceContext()
        server = create_http_server(context)
        client = TestClient(server.app)

        client.get("/health")

        response = client.get("/metrics")
        metrics_text = response.text

        assert "test_service_http_request_duration_seconds_sum" in metrics_text
        assert "test_service_http_request_duration_seconds_bucket" in metrics_text
