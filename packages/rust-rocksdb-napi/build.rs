#[cfg(feature = "node")]
fn main() {
    // Initialize N-API build only for Node builds
    napi_build::setup();
}

#[cfg(not(feature = "node"))]
fn main() {}