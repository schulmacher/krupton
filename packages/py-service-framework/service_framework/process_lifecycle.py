import asyncio
import inspect
import signal
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeAlias, TypeVar, cast

from pydantic import BaseModel

from .diagnostics import DiagnosticContext, create_diagnostic_context
from .environment import DefaultEnv, create_env_context

# Type variables
T = TypeVar("T", bound=BaseModel)

# Type aliases
ShutdownCallback: TypeAlias = Callable[[], None | Awaitable[None]]


@dataclass
class ShutdownConfiguration:
    """Configuration for shutdown behavior."""

    callback_timeout: float = 10.0  # seconds
    total_timeout: float = 30.0  # seconds


@dataclass
class ProcessLifecycleConfig:
    """Configuration for process lifecycle."""

    shutdown_configuration: ShutdownConfiguration | None = None


@dataclass
class ProcessLifecycleContext:
    """Functional context object for process lifecycle."""

    id: int
    register_shutdown_callback: Callable[[ShutdownCallback], None]
    is_shutting_down: Callable[[], bool]
    restart: Callable[[], Awaitable[None]]
    shutdown: Callable[[], Awaitable[None]]


ProcessStartFn: TypeAlias = Callable[
    [ProcessLifecycleContext, DefaultEnv],
    Awaitable[DiagnosticContext],
]

DEFAULT_SHUTDOWN_CONFIGURATION = ShutdownConfiguration(
    callback_timeout=10.0,
    total_timeout=30.0,
)


# ---------------------------------------------------------------------------
# Main lifecycle runner
# ---------------------------------------------------------------------------


async def start_process_lifecycle(
    start_fn: ProcessStartFn,
    env_model_class: type[T] | None = None,
    config: ProcessLifecycleConfig | None = None,
) -> None:
    """
    Start the process lifecycle with the given start function.

    This handles graceful shutdown and restart semantics, similar to Node's
    `createProcessLifecycle`, but functional and async.

    Args:
        start_fn: Async function that initializes and runs the process.
        env_model_class: Optional Pydantic model class for environment configuration.
        config: Optional lifecycle configuration.
    """
    shutdown_cfg = (
        config.shutdown_configuration
        if config and config.shutdown_configuration
        else DEFAULT_SHUTDOWN_CONFIGURATION
    )

    env_context = create_env_context(env_model_class)
    diagnostic_context = cast(DiagnosticContext, create_diagnostic_context(env_context))

    shutdown_event = asyncio.Event()
    restart_event = asyncio.Event()
    ctx_counter = 0

    async def handle_signal(sig: int):
        diagnostic_context.logger.info(
            f"⚡ Received {signal.Signals(sig).name}, initiating shutdown..."
        )
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(handle_signal(s)))

    async def run_once() -> None:
        """Run one full lifecycle iteration."""
        nonlocal ctx_counter
        ctx_counter += 1
        ctx_id = ctx_counter
        shutting_down = asyncio.Event()
        shutdown_callbacks: list[ShutdownCallback] = []

        async def finalize() -> None:
            if shutting_down.is_set():
                return
            shutting_down.set()
            diagnostic_context.logger.info(f"🛑 Finalizing context #{ctx_id}...")
            for cb in reversed(shutdown_callbacks):
                try:
                    result = cb()
                    if inspect.isawaitable(result):
                        await asyncio.wait_for(result, timeout=shutdown_cfg.callback_timeout)
                except Exception as e:
                    diagnostic_context.logger.error(f"⚠️ Shutdown callback failed: {e}")

        async def restart() -> None:
            diagnostic_context.logger.info(f"♻️ Restart requested by context #{ctx_id}")
            await finalize()
            restart_event.set()

        async def shutdown() -> None:
            diagnostic_context.logger.info(f"🧩 Shutdown requested by context #{ctx_id}")
            shutdown_event.set()
            await finalize()

        def register_shutdown_callback(cb: ShutdownCallback) -> None:
            shutdown_callbacks.append(cb)

        def is_shutting_down() -> bool:
            return shutting_down.is_set()

        ctx = ProcessLifecycleContext(
            id=ctx_id,
            register_shutdown_callback=register_shutdown_callback,
            is_shutting_down=is_shutting_down,
            restart=restart,
            shutdown=shutdown,
        )

        diagnostic_context.logger.info(f"🚀 Starting process context #{ctx_id}")
        try:
            result = start_fn(ctx, env_context)
            if inspect.isawaitable(result):
                await result
        finally:
            await finalize()

    # ------------------------------------------------------------------
    # Main suspendable loop — no busy polling
    # ------------------------------------------------------------------
    while not shutdown_event.is_set():
        try:
            await asyncio.wait_for(run_once(), timeout=None)
        except asyncio.CancelledError:
            break
        except Exception as e:
            diagnostic_context.logger.fatal(f"💥 Unhandled error in process lifecycle: {e}")

        restart_task = asyncio.create_task(restart_event.wait())
        shutdown_task = asyncio.create_task(shutdown_event.wait())

        done, pending = await asyncio.wait(
            [restart_task, shutdown_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel remaining tasks to prevent “coroutine was never awaited” warnings
        for task in pending:
            task.cancel()

        if shutdown_task in done:
            diagnostic_context.logger.info("🧩 Global shutdown complete.")
            break
        if restart_task in done:
            diagnostic_context.logger.info("♻️ Restarting process...")
            restart_event.clear()

    diagnostic_context.logger.info("✅ Process lifecycle stopped cleanly.")
