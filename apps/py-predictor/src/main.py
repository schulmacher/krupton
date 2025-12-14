import asyncio

from service_framework import (
    MetricsConfig,
    ProcessLifecycleContext,
    create_diagnostic_context,
    create_metrics_context,
    start_process_lifecycle,
)

from .context import PredictorContext, PredictorEnv


async def start(
    lifecycle_context: ProcessLifecycleContext, env_context: PredictorEnv
) -> PredictorContext:
    diagnostic_context = create_diagnostic_context(env_context)
    metrics_config = MetricsConfig(env_context=env_context)
    metrics_context = create_metrics_context(metrics_config)

    from .context import PredictorMetrics

    metrics = PredictorMetrics()

    context = PredictorContext(
        env=env_context,
        diagnostic=diagnostic_context,
        process=lifecycle_context,
        metrics_context=metrics_context,
        metrics=metrics,
    )

    context.diagnostic.logger.info(
        "Python Predictor Service Starting",
        {
            "process_name": context.env.PROCESS_NAME,
            "environment": context.env.NODE_ENV,
        },
    )

    def cleanup() -> None:
        context.diagnostic.logger.info("Shutdown callback: Cleaning up...")

    lifecycle_context.register_shutdown_callback(cleanup)

    context.diagnostic.logger.info("Service started successfully!")

    try:
        pass
        # await run_tasks
    except asyncio.CancelledError:
        context.diagnostic.logger.info("Task was cancelled")

    context.diagnostic.logger.info("Service passed out, initiating shutdown!")
    await asyncio.sleep(2)
    await lifecycle_context.shutdown()

    return context


async def main() -> None:
    await start_process_lifecycle(start, PredictorEnv)


if __name__ == "__main__":
    asyncio.run(main())
