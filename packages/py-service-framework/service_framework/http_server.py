"""HTTP server implementation using FastAPI.

Provides a production-ready HTTP server with:
- Request/response logging with correlation IDs
- Health check endpoints
- Metrics endpoint (placeholder)
- Graceful shutdown handling
- Integration with service context
"""

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

from .diagnostics import DiagnosticContext
from .metrics_context import MetricsContext
from .process_lifecycle import ProcessLifecycleContext


class HttpServerEnv(Protocol):
    PORT: int
    NODE_ENV: str


TEnv = TypeVar("TEnv", bound=HttpServerEnv)


@dataclass
class HealthCheckResult:
    component: str
    is_healthy: bool


HealthCheckFn = Callable[[], Awaitable[HealthCheckResult]]


@dataclass
class HttpServerConfig:
    health_checks: list[HealthCheckFn] | None = None


class ServiceContext(Protocol, Generic[TEnv]):
    env: TEnv
    diagnostic: DiagnosticContext
    process: ProcessLifecycleContext
    metrics_context: MetricsContext


class HttpServer(Generic[TEnv]):
    def __init__(
        self, context: ServiceContext[TEnv], config: HttpServerConfig | None = None
    ) -> None:
        self.context = context
        self.config = config or HttpServerConfig()
        self.app = FastAPI(title=context.env.NODE_ENV, generate_unique_id_function=lambda _: "")

        self.http_requests_total = context.metrics_context.create_counter(
            name="http_requests_total",
            help="Total number of HTTP requests",
            label_names=["method", "route", "status_code"],
        )

        self.http_request_duration = context.metrics_context.create_histogram(
            name="http_request_duration_seconds",
            help="Duration of HTTP requests in seconds",
            label_names=["method", "route"],
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
        )

        self._setup_middleware()
        self._setup_routes()
        self._setup_shutdown()

    def _setup_middleware(self) -> None:
        @self.app.middleware("http")
        async def add_correlation_id_and_logging(
            request: Request, call_next: Callable[[Request], Awaitable[Response]]
        ) -> Response:
            correlation_id = (
                request.headers.get("x-correlation-id")
                or self.context.diagnostic.correlation_id_generator.generate_root_id()
            )
            child_diagnostic = self.context.diagnostic.get_child_diagnostic_context(
                scope_id=correlation_id
            )

            request.state.correlation_id = correlation_id
            request.state.diagnostic = child_diagnostic
            request.state.start_time = time.time()

            child_diagnostic.logger.info(
                "Request received",
                {"method": request.method, "url": str(request.url)},
            )

            response = await call_next(request)

            duration_seconds = time.time() - request.state.start_time
            duration_ms = duration_seconds * 1000

            child_diagnostic.logger.info(
                "Request completed",
                {
                    "method": request.method,
                    "url": str(request.url),
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
            )

            route = str(request.url.path)
            self.http_requests_total.labels(
                method=request.method,
                route=route,
                status_code=str(response.status_code),
            ).inc()

            self.http_request_duration.labels(
                method=request.method,
                route=route,
            ).observe(duration_seconds)

            response.headers["x-correlation-id"] = correlation_id

            return response

    def _setup_routes(self) -> None:
        @self.app.get("/health")
        async def health_check(request: Request) -> JSONResponse:
            health: dict[str, Any] = {
                "status": "healthy",
                "timestamp": time.time(),
                "components": [],
            }

            if self.context.process.is_shutting_down():
                return JSONResponse(
                    status_code=503,
                    content={**health, "status": "unhealthy"},
                )

            if self.config.health_checks:
                try:
                    check_results = [await check() for check in self.config.health_checks]
                    health["components"] = [
                        {"component": result.component, "isHealthy": result.is_healthy}
                        for result in check_results
                    ]

                    all_healthy = all(result.is_healthy for result in check_results)

                    if not all_healthy:
                        unhealthy_components = [
                            result.component for result in check_results if not result.is_healthy
                        ]

                        request.state.diagnostic.logger.warn(
                            "Health check failed",
                            {
                                "unhealthy_components": unhealthy_components,
                                "results": [
                                    {"component": r.component, "is_healthy": r.is_healthy}
                                    for r in check_results
                                ],
                            },
                        )
                        return JSONResponse(
                            status_code=503,
                            content={**health, "status": "unhealthy"},
                        )
                except Exception as error:
                    request.state.diagnostic.logger.error(error, "Health check error")
                    return JSONResponse(
                        status_code=503,
                        content={**health, "status": "unhealthy"},
                    )

            return JSONResponse(content=health)

        @self.app.get("/metrics")
        async def metrics() -> PlainTextResponse:
            from prometheus_client import CONTENT_TYPE_LATEST

            metrics_output = self.context.metrics_context.get_metrics_as_string()
            return PlainTextResponse(
                content=metrics_output,
                media_type=CONTENT_TYPE_LATEST,
            )

    def _setup_shutdown(self) -> None:
        self.context.process.register_shutdown_callback(self._shutdown)

    async def _shutdown(self) -> None:
        self.context.diagnostic.logger.info("HTTP server shutting down")

    async def start_server(self) -> None:
        import uvicorn

        config = uvicorn.Config(
            self.app,
            host="0.0.0.0",
            port=self.context.env.PORT,
            log_config=None,
            access_log=False,
        )
        server = uvicorn.Server(config)

        self.context.diagnostic.logger.info(
            "Server starting",
            {
                "port": self.context.env.PORT,
                "environment": self.context.env.NODE_ENV,
            },
        )

        await server.serve()


def create_http_server(
    context: ServiceContext[TEnv], config: HttpServerConfig | None = None
) -> HttpServer[TEnv]:
    return HttpServer(context, config)
